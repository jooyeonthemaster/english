// ============================================================================
// 문항 자산 캠페인 — DB 적재기 (멱등 upsert)
//
//   node scripts/vocab-item-assets/load-db.mjs [--dir packs] [--tag luna-2026-08] [--dry]
//
// 안전 규약:
//  · 테이블(vocab_drill_item_assets)이 없으면 즉시 중단 — DDL은 schema.sql을
//    사용자 승인 후 별도 실행한다(자동 생성 금지).
//  · 게이트-클린 검증: gate-report.json에 critical이 있으면 적재 거부(--force로만 우회).
//  · upsert라 재실행 안전. serve=false 팩도 행은 만든다(서빙이 이유를 알 수 있게).
// ============================================================================
import fs from "fs";
import path from "path";
import { prisma } from "./dossier.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const DIR = opt("dir", "experiments/vocab-item-assets/packs");
const TAG = opt("tag", "luna-2026-08");
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");

// 1) 테이블 존재 확인 — 없으면 DDL 승인 안내 후 중단
const t = await prisma.$queryRawUnsafe(
  `SELECT to_regclass('public.vocab_drill_item_assets')::text AS reg`);
if (!t?.[0]?.reg) {
  console.error("⛔ vocab_drill_item_assets 테이블 없음 — schema.sql을 사용자 승인 후 먼저 실행하라.");
  process.exit(1);
}

// 2) 게이트-클린 확인
const reportFile = path.join(DIR, "gate-report.json");
if (fs.existsSync(reportFile)) {
  const rep = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const crit = (rep.findings ?? []).filter((f) => f.level === "critical").length;
  if (crit > 0 && !FORCE) {
    console.error(`⛔ 게이트 critical ${crit}건 존재 — 적재 거부(사이클을 먼저 완주하라).`);
    process.exit(1);
  }
} else if (!FORCE) {
  console.error("⛔ gate-report.json 없음 — 게이트 미실행 코퍼스는 적재 불가.");
  process.exit(1);
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".pack.json"));
console.log(`적재 대상 ${files.length}팩 → 태그 ${TAG}${DRY ? " (드라이런)" : ""}`);

let rows = 0, servedOff = 0;
for (const f of files) {
  const pack = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const senseRows = [];
  if (pack.serve === false) {
    servedOff++;
    // 서빙 차단은 행이 있어야 작동한다 — 그 표제어의 전 sense에 serve=false 행을
    // 깐다(queue-items buildWithFallback이 이 플래그로 아티팩트를 큐에서 뺀다).
    if (!DRY) {
      const senses = await prisma.vocabDrillSense.findMany({
        where: { lemma: pack.spelling, retiredAt: null },
        select: { id: true },
      });
      for (const s of senses) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO vocab_drill_item_assets
             (sense_id, spelling, display_lemma, serve, serve_reason, content, gate_clean, campaign_tag, loaded_at)
           VALUES ($1, $2, $3, false, $4, '{}'::jsonb, true, $5, now())
           ON CONFLICT (sense_id) DO UPDATE SET
             serve = false, serve_reason = EXCLUDED.serve_reason,
             campaign_tag = EXCLUDED.campaign_tag, loaded_at = now()`,
          s.id, pack.spelling, pack.displayLemma ?? pack.spelling,
          String(pack.serveReason ?? "추출 아티팩트").slice(0, 300), TAG);
        rows++;
      }
    }
    continue;
  }
  for (const v of pack.variants ?? []) for (const s of v.senses ?? []) {
    senseRows.push({
      senseId: s.senseId,
      content: {
        pos: v.pos,
        contextRequired: s.contextRequired ?? false,
        contextReason: s.contextReason ?? null,
        stems: s.stems ?? [],
        meaningChoiceSets: s.meaningChoiceSets ?? [],
        wordChoiceDistractors: s.wordChoiceDistractors ?? [],
        hints: s.hints ?? [],
        trapClaims: s.trapClaims ?? [],
        spellEligible: s.spellEligible ?? false,
        spellIneligibleReason: s.spellIneligibleReason ?? null,
      },
    });
  }
  if (DRY) { rows += senseRows.length; continue; }
  for (const r of senseRows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO vocab_drill_item_assets
         (sense_id, spelling, display_lemma, serve, serve_reason, content, gate_clean, campaign_tag, loaded_at)
       VALUES ($1, $2, $3, true, NULL, $4::jsonb, true, $5, now())
       ON CONFLICT (sense_id) DO UPDATE SET
         spelling = EXCLUDED.spelling,
         display_lemma = EXCLUDED.display_lemma,
         serve = EXCLUDED.serve,
         content = EXCLUDED.content,
         gate_clean = EXCLUDED.gate_clean,
         campaign_tag = EXCLUDED.campaign_tag,
         loaded_at = now()`,
      r.senseId, pack.spelling, pack.displayLemma ?? pack.spelling, JSON.stringify(r.content), TAG);
    rows++;
  }
}
console.log(`완료: ${rows}행 upsert · serve=false 팩 ${servedOff}건 스킵`);
await prisma.$disconnect();
