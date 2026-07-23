// O211 코퍼스 복원 적용 — src/data/exam-passages/passages.json
// 정책(정보 무손실): text 는 복원하고, 심긴 오류는 plantedError 로 보존.
//   text            → 복원된 깨끗한 원문
//   plantedError    → { planted, original, excerpt, verifiedBy }
//   hasDeliberateError → 실제 텍스트 상태를 뜻하도록 교정(복원했으므로 false)
// 치환은 항상 발췌 구간 앵커링 + 구간 내 1회 검증(어제 G040 오손 판례 반영).
// 사용: node apply-corpus-restore.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
const root = "d:/Desktop/2026project/nara";
const CORPUS = path.join(root, "src/data/exam-passages/passages.json");
const CO = path.join(root, "experiments/question-quality-20260715/db-audit/corpus-20260721");
const OUT = path.join(root, "experiments/question-quality-20260721-corpus");
const DRY = process.argv.includes("--dry");

const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const res = JSON.parse(fs.readFileSync(path.join(CO, "restoration-results.json"), "utf8"));
const gate = JSON.parse(fs.readFileSync(path.join(OUT, "gate-results.json"), "utf8"));

const approved = new Set(gate.gateA.approvedIds);
const rejected = new Set(gate.gateA.rejectedList.map((r) => r.id));
const fixes = res.converged.filter((c) => approved.has(c.id) && !rejected.has(c.id));
console.log(`수렴 ${res.converged.length} → 게이트 승인 ${fixes.length} (거부 ${rejected.size})`);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TYPO = [
  [/['‘’ʼ]/g, "['‘’ʼ]"],
  [/["“”]/g, '["“”]'],
  [/[-‐‑‒–—―−]/g, "[-‐‑‒–—―−]"],
];
const typo = (s) => TYPO.reduce((a, [re, cls]) => a.replace(re, cls), s);
const wordRe = (t, f = "g") => new RegExp(`(?<![A-Za-z])${typo(esc(t))}(?![A-Za-z])`, f);
const excerptRe = (ex) =>
  new RegExp(
    ex.replace(/[­​]/g, "").trim().split(/\s+/).map((t) => typo(esc(t))).join("[\\s\\u00AD\\u200B]+"),
    "g",
  );
const count = (s, re) => (s.match(re) || []).length;

const byId = new Map(corpus.map((c) => [c.id, c]));
const planned = [];
const skipped = [];

for (const f of fixes) {
  const rec = byId.get(f.id);
  if (!rec) { skipped.push({ id: f.id, why: "NOT_IN_CORPUS" }); continue; }
  const text = rec.text;
  const spans = [...text.matchAll(excerptRe(f.plantedExcerpt))];
  if (spans.length !== 1) {
    // 발췌 불일치 → 단어 단독 1회 매칭이면 허용, 아니면 스킵
    const wc = count(text, wordRe(f.plantedText));
    if (wc === 1) {
      planned.push({
        id: f.id, how: "word-1hit(excerpt-miss)",
        before: text, after: text.replace(wordRe(f.plantedText, ""), f.correctedText), fix: f,
      });
    } else {
      skipped.push({ id: f.id, why: `EXCERPT_HITS=${spans.length}, WORD_HITS=${wc}`, planted: f.plantedText });
    }
    continue;
  }
  const span = spans[0][0];
  const inSpan = count(span, wordRe(f.plantedText));
  if (inSpan !== 1) { skipped.push({ id: f.id, why: `WORD_IN_SPAN=${inSpan}`, planted: f.plantedText }); continue; }
  const fixedSpan = span.replace(wordRe(f.plantedText, ""), f.correctedText);
  planned.push({ id: f.id, how: "excerpt-anchored", before: text, after: text.replace(span, fixedSpan), fix: f });
}

console.log(`\n적용 계획: ${planned.length}건 / 스킵 ${skipped.length}건`);
function diffCtx(b, a, pad = 50) {
  let s = 0; while (s < b.length && s < a.length && b[s] === a[s]) s++;
  let e = 0; while (e < b.length - s && e < a.length - s && b[b.length - 1 - e] === a[a.length - 1 - e]) e++;
  return `…${b.slice(Math.max(0, s - pad), s)}⟦${b.slice(s, b.length - e)} ⇒ ${a.slice(s, a.length - e)}⟧${b.slice(b.length - e, b.length - e + pad)}…`.replace(/\s+/g, " ");
}
for (const p of planned.slice(0, 25)) console.log(`  ${p.id} [${p.how}] ${diffCtx(p.before, p.after)}`);
if (planned.length > 25) console.log(`  … 외 ${planned.length - 25}건`);
for (const s of skipped) console.log(`  SKIP ${s.id}: ${s.why} ${s.planted ? `"${s.planted}"` : ""}`);

if (DRY) { console.log("\nDRY-RUN — 미적용"); process.exit(0); }

// ── 백업 ──
fs.copyFileSync(CORPUS, path.join(OUT, "passages.json.backup-20260721"));
console.log(`\n백업: passages.json.backup-20260721 (${(fs.statSync(CORPUS).size / 1048576).toFixed(2)} MB)`);

// ── 적용 ──
for (const p of planned) {
  const rec = byId.get(p.id);
  rec.text = p.after;
  rec.plantedError = {
    planted: p.fix.plantedText,
    original: p.fix.correctedText,
    excerpt: p.fix.plantedExcerpt,
    verifiedBy: "dual-convergence+gate",
    restoredAt: "2026-07-21",
  };
  rec.hasDeliberateError = false; // 텍스트 상태 기준으로 의미 교정
}
// 원본은 minified 단일 라인(개행 없음) — 포맷을 그대로 유지해야 diff 가 실제 변경분만 남는다.
fs.writeFileSync(CORPUS, JSON.stringify(corpus));
console.log(`적용 완료: ${planned.length}건 → passages.json`);

// ── 재검증 ──
const reread = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
const rById = new Map(reread.map((c) => [c.id, c]));
let bad = 0;
for (const p of planned) {
  const r = rById.get(p.id);
  if (r.text !== p.after) { console.log(`✗ TEXT MISMATCH ${p.id}`); bad++; continue; }
  if (!r.plantedError || r.plantedError.original !== p.fix.correctedText) { console.log(`✗ META MISSING ${p.id}`); bad++; continue; }
  if (!r.text.includes(p.fix.correctedText.trim())) { console.log(`✗ CORRECTION ABSENT ${p.id}`); bad++; }
}
console.log(bad === 0 ? `✓ 재검증 ${planned.length}/${planned.length} pass` : `✗ ${bad}건 문제`);
console.log(`레코드 수 보존: ${reread.length} (원본 ${corpus.length})`);

fs.writeFileSync(path.join(OUT, "applied-corpus-fixes.json"), JSON.stringify(
  planned.map((p) => ({ id: p.id, how: p.how, planted: p.fix.plantedText, original: p.fix.correctedText, reason: p.fix.reason })), null, 2));
fs.writeFileSync(path.join(OUT, "skipped-corpus-fixes.json"), JSON.stringify(skipped, null, 2));
