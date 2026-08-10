/**
 * 지문↔단어 전수 매핑 적재기 — vocab_drill_passage_words
 *
 * 왜 필요한가: vocab_drill_examples 는 **학생 카드용 예문**이라 후보당 5개 상한
 * (vocab-corpus-build.ts EXAMPLE_CAP)에 걸린다. 빈출어는 상한이 일찍 차서 나머지
 * 지문 출현분이 통째로 버려지고, 그 결과 "이 기출 지문에 나온 단어"를 물으면
 * 지문 어휘의 절반만 답한다(실측 185,635항목 → 97,524행, 지문당 40.9 → 21.5).
 *
 * 이 적재기는 추출 원본(raw)을 다시 훑어 **(지문 × 뜻) 유일쌍**을 상한 없이
 * 복원한다. LLM 을 부르지 않는다 — lemma+pos → lemmaId, 정의문 → senseId 로
 * 해소하는 결정론적 조회가 전부다(실측 해소율 98.95%, 미해소는 전량 A/B
 * 자리표시자 상관구문·약어처럼 애초에 표제어가 아닌 것들이다).
 *
 * 해소 규칙은 vocab-db-load.ts:191-206 과 **반드시 같아야 한다**:
 *   lemmaId = sha1(lemma.trim().toLowerCase() US pos)[0..15]
 *   senseId = lemmaId ':' sha1(normSense(senseKey))[0..7]
 * 병합(4단계)으로 흡수된 소수파 정의문은 senses.senseEnVariants 에 남아 있으므로
 * 대표 senseKey 와 변이형을 **모두** 색인에 넣는다. 이걸 빠뜨리면 해소율이
 * 급락한다(변이형 키가 146,652개 — 대표 키 35,341개의 4배다).
 *
 * 사용법:
 *   npx tsx -r dotenv/config scripts/vocab-passage-words-load.ts dotenv_config_path=.env
 *   npx tsx -r dotenv/config scripts/vocab-passage-words-load.ts --apply dotenv_config_path=.env
 *
 * 선행 조건: prisma/sql/vocab-drill-passage-words.sql 적용(DDL, 사용자 승인 사항).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import fs from "node:fs";
import PASSAGES from "../src/data/exam-passages/passages.json";

// ── 옵션 ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const OPT = {
  apply: argv.includes("--apply"),
  raw: flag("raw") ?? "experiments/vocab-corpus-20260728/raw",
  // Postgres 는 한 문장의 바인딩 파라미터가 65535 개로 막혀 있다. 16컬럼이므로
  // 청크는 4,095 가 이론 상한 — 여유를 두고 2,000 으로 간다(실측 왕복 92회).
  chunk: Math.max(1, Math.min(4000, Number(flag("chunk") ?? "2000"))),
};

const US = "\x1f";
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");
const fmt = (n: number) => n.toLocaleString("ko-KR");

/** vocab-corpus-build.ts:41-48 · vocab-db-load.ts:191-198 과 동일 규칙. */
function normSense(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(to|a|an|the)\s+/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface RawEntry {
  surface: string;
  lemma: string;
  pos: string;
  senseEn: string;
  senseKo: string;
  sentenceIndex: number;
}
interface RawFile {
  passageId: string;
  entries: RawEntry[];
}
interface PassageMeta {
  id: string;
  examId: string;
  year: number;
  exam: string;
  board: string;
  grade?: string;
  qNumbers: number[];
  typeGroup: string;
}

const COLS = [
  "id", "bundleVersion", "passageId", "senseId", "lemmaId", "surface",
  "sentenceIndex", "occurrences", "year", "board", "exam", "grade",
  "qFrom", "qTo", "typeGroup", "examId",
] as const;

// ── 본체 ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  const db = new PrismaClient();
  try {
    // ① 활성 번들 — 콘텐츠 세대의 정본. 없으면 적재할 대상이 없다는 뜻이다.
    const bundle = await db.vocabDrillBundle.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { loadedAt: "desc" },
      select: { version: true },
    });
    if (!bundle) {
      console.error("✗ 활성 번들이 없다. vocab-db-load.ts --activate 가 먼저다.");
      process.exitCode = 1;
      return;
    }
    const version = bundle.version;

    // ② 해소 색인
    const lemmas = await db.vocabDrillLemma.findMany({
      where: { retiredAt: null },
      select: { id: true, lemma: true, pos: true },
    });
    const senses = await db.vocabDrillSense.findMany({
      where: { retiredAt: null },
      select: { id: true, lemmaId: true, senseKey: true, senseEnVariants: true },
    });
    // 명시 판정으로 이관된 sense — 옛 id 를 가리키면 현행 id 로 따라간다.
    const aliases = await db.vocabDrillSenseAlias.findMany({
      select: { fromSenseId: true, toSenseId: true },
    });

    // ⚠️ 표제어 키는 **반드시 lemma.trim().toLowerCase()** 다(vocab-db-load.ts
    //    lemmaIdOf 규칙). 원문 대소문자로 조회하면 A/B 자리표시자 상관구문이
    //    통째로 새 나간다 — raw 는 `not only A but also B`, 정본은 소문자
    //    `not only a but also b` 로 적재돼 있다(실측 1,849건 미해소 → 0).
    const lemmaKey = (lemma: string, pos: string) =>
      `${lemma.trim().toLowerCase()}${US}${pos}`;
    const lemmaIdx = new Map<string, string>();
    for (const l of lemmas) lemmaIdx.set(lemmaKey(l.lemma, l.pos), l.id);

    const senseIdx = new Map<string, string>();
    let variantKeys = 0;
    for (const s of senses) {
      const put = (k: string) => {
        const n = normSense(k);
        // 대표 키가 먼저 들어가고 변이형은 덮지 않는다 — 두 뜻이 같은 정규화형을
        // 낳는 드문 경우에 대표 쪽이 이기게 한다.
        if (n && !senseIdx.has(`${s.lemmaId}${US}${n}`)) {
          senseIdx.set(`${s.lemmaId}${US}${n}`, s.id);
        }
      };
      put(s.senseKey);
      for (const v of (s.senseEnVariants as unknown as string[]) ?? []) {
        if (typeof v === "string") { put(v); variantKeys++; }
      }
    }
    const aliasIdx = new Map(aliases.map((a) => [a.fromSenseId, a.toSenseId]));
    console.log(
      `[1] 색인  표제어 ${fmt(lemmas.length)} · 뜻 ${fmt(senses.length)}` +
        `(변이형 키 ${fmt(variantKeys)}) · 이관 ${fmt(aliasIdx.size)} · 번들 ${version}`,
    );

    // ③ 지문 메타 — 역정규화 원천
    const metaIdx = new Map<string, PassageMeta>(
      (PASSAGES as unknown as PassageMeta[]).map((p) => [p.id, p]),
    );

    // ④ raw 순회 → (지문×뜻) 유일쌍
    const files = fs.readdirSync(OPT.raw).filter((f) => f.endsWith(".json"));
    if (!files.length) {
      console.error(`✗ raw 산출물이 없다: ${OPT.raw}`);
      process.exitCode = 1;
      return;
    }

    type Acc = {
      senseId: string; lemmaId: string; surface: string;
      sentenceIndex: number; occurrences: number;
    };
    const rows: unknown[][] = [];
    let entries = 0, resolved = 0, noLemma = 0, noSense = 0, noMeta = 0, badFile = 0;
    const missLemma = new Map<string, number>();
    const passagesSeen = new Set<string>();

    for (const f of files) {
      let j: RawFile;
      try {
        j = JSON.parse(fs.readFileSync(`${OPT.raw}/${f}`, "utf8"));
      } catch {
        badFile++;
        continue;
      }
      const pid = j.passageId ?? f.slice(0, -5);
      const meta = metaIdx.get(pid);
      if (!meta) {
        noMeta++;
        continue; // 지문 정본에 없는 산출물 — 역정규화할 메타가 없으므로 싣지 않는다
      }

      // 같은 뜻이 한 지문의 여러 문장에 나오면 1행으로 접는다. 대표 문장은
      // **가장 앞 문장** — 학생에게 보여줄 때 지문 순서와 어긋나지 않게.
      const byPair = new Map<string, Acc>();
      for (const e of j.entries ?? []) {
        entries++;
        const lemmaId = lemmaIdx.get(lemmaKey(e.lemma ?? "", e.pos));
        if (!lemmaId) {
          noLemma++;
          missLemma.set(`${e.lemma}/${e.pos}`, (missLemma.get(`${e.lemma}/${e.pos}`) ?? 0) + 1);
          continue;
        }
        const hit = senseIdx.get(`${lemmaId}${US}${normSense(e.senseEn ?? "")}`);
        if (!hit) { noSense++; continue; }
        const senseId = aliasIdx.get(hit) ?? hit;
        resolved++;

        const si = Number.isFinite(e.sentenceIndex) ? e.sentenceIndex : 0;
        const prev = byPair.get(senseId);
        if (!prev) {
          byPair.set(senseId, {
            senseId, lemmaId, surface: e.surface ?? e.lemma,
            sentenceIndex: si, occurrences: 1,
          });
        } else {
          prev.occurrences++;
          if (si < prev.sentenceIndex) {
            prev.sentenceIndex = si;
            prev.surface = e.surface ?? e.lemma;
          }
        }
      }
      if (!byPair.size) continue;
      passagesSeen.add(pid);

      const qs = meta.qNumbers?.length ? meta.qNumbers : [0];
      const qFrom = Math.min(...qs);
      const qTo = Math.max(...qs);
      for (const a of byPair.values()) {
        rows.push([
          sha1(`${pid}${US}${a.senseId}`).slice(0, 16),
          version, pid, a.senseId, a.lemmaId, a.surface,
          a.sentenceIndex, a.occurrences, meta.year, meta.board, meta.exam,
          meta.grade ?? null, qFrom, qTo, meta.typeGroup ?? null, meta.examId,
        ]);
      }
    }

    const pct = (n: number) => `${((n / Math.max(1, entries)) * 100).toFixed(2)}%`;
    console.log(
      `\n[2] 해소  raw ${fmt(files.length)}파일 · 항목 ${fmt(entries)}` +
        (badFile ? ` (깨진 파일 ${badFile})` : "") +
        (noMeta ? ` (지문 정본에 없어 제외 ${noMeta}건)` : ""),
    );
    console.log(`  senseId 해소   ${fmt(resolved).padStart(9)}  (${pct(resolved)})`);
    console.log(`  표제어 미해소  ${fmt(noLemma).padStart(9)}  (${pct(noLemma)})`);
    console.log(`  뜻 미해소      ${fmt(noSense).padStart(9)}  (${pct(noSense)})`);
    if (missLemma.size) {
      const top = [...missLemma.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      console.log(`  └ 미해소 상위: ${top.map(([k, v]) => `${k}(${v})`).join(", ")}`);
    }

    // ④-b examples 합집합 — **초집합 불변식을 구조적으로 보장한다.**
    //
    // raw 해소만으로는 미세한 잔여가 남는다: 4단계 병합이 어떤 후보의 예문을
    // 대표 뜻으로 재배치하면, 그 예문의 (지문, 뜻) 은 병합 **후** 뜻을 가리키는데
    // raw 의 정의문은 병합 **전** 후보를 가리켜 서로 다른 senseId 로 풀린다
    // (실측 잔여 1건: serve/verb — DB "bring food or drink to someone at a table"
    //  vs raw "to provide food or drink to someone as part of a meal").
    //
    // examples 도 같은 파이프라인의 산출이라 그 쌍 역시 정본이다. 이 패스가 없으면
    // 「기출 범위로 찾기」가 기존 예문 화면보다 단어를 **덜** 보여주는 역전이 난다.
    const have = new Set(rows.map((r) => `${r[2]}${US}${r[3]}`));
    const exPairs = await db.$queryRaw<
      { passageId: string; senseId: string; lemmaId: string; surface: string; sentenceIndex: number }[]
    >`
      SELECT DISTINCT ON ("passageId", "senseId")
             "passageId", "senseId", "lemmaId", "surface", "sentenceIndex"
        FROM "vocab_drill_examples"
       WHERE "retiredAt" IS NULL
       ORDER BY "passageId", "senseId", "sentenceIndex" ASC`;
    let fromExamples = 0;
    for (const e of exPairs) {
      if (have.has(`${e.passageId}${US}${e.senseId}`)) continue;
      const meta = metaIdx.get(e.passageId);
      if (!meta) continue;
      const qs = meta.qNumbers?.length ? meta.qNumbers : [0];
      rows.push([
        sha1(`${e.passageId}${US}${e.senseId}`).slice(0, 16),
        version, e.passageId, e.senseId, e.lemmaId, e.surface,
        e.sentenceIndex, 1, meta.year, meta.board, meta.exam,
        meta.grade ?? null, Math.min(...qs), Math.max(...qs),
        meta.typeGroup ?? null, meta.examId,
      ]);
      passagesSeen.add(e.passageId);
      fromExamples++;
    }
    console.log(
      `  examples 합집합 보강 ${fmt(fromExamples)}행` +
        (fromExamples ? " (병합으로 뜻이 재배치된 잔여)" : " — raw 해소가 examples 를 완전히 덮었다"),
    );

    // 무결성 — 중복 (지문,뜻) 이 있으면 접기 로직이 깨진 것이다. UNIQUE 가 막아주지만
    // DB 까지 가기 전에 여기서 잡는다.
    const ids = new Set(rows.map((r) => r[0] as string));
    if (ids.size !== rows.length) {
      console.error(`✗ id 중복 ${fmt(rows.length - ids.size)}건 — (지문,뜻) 접기가 깨졌다.`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `\n[3] 적재 계획  vocab_drill_passage_words  ${fmt(rows.length)}행` +
        ` (지문 ${fmt(passagesSeen.size)}개 · 지문당 평균 ${(rows.length / passagesSeen.size).toFixed(1)}개)`,
    );

    const before = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "vocab_drill_passage_words"`;
    console.log(`  현재 ${fmt(Number(before[0]?.n ?? 0))}행 → upsert ${fmt(rows.length)}행 (청크 ${OPT.chunk})`);

    if (!OPT.apply) {
      console.log("\nDRY-RUN 종료 — 읽기만 했다. 실제로 쓰려면 --apply 를 붙여라.");
      return;
    }

    // ⑤ 쓰기 — 다중 VALUES + ON CONFLICT DO UPDATE(vocab-db-load.ts bulkUpsert 동형)
    const colList = Prisma.raw(COLS.map((c) => `"${c}"`).join(", "));
    const updatable = COLS.filter((c) => c !== "id" && c !== "createdAt");
    const action = Prisma.raw(
      `DO UPDATE SET ${[
        ...updatable.map((c) => `"${c}" = EXCLUDED."${c}"`),
        `"updatedAt" = CURRENT_TIMESTAMP`,
      ].join(", ")}`,
    );
    let written = 0;
    for (let i = 0; i < rows.length; i += OPT.chunk) {
      const slice = rows.slice(i, i + OPT.chunk);
      const values = Prisma.join(
        slice.map((r) => Prisma.sql`(${Prisma.join(r.map((v) => Prisma.sql`${v}`))})`),
      );
      written += await db.$executeRaw`
        INSERT INTO "vocab_drill_passage_words" (${colList})
        VALUES ${values}
        ON CONFLICT ("id") ${action}
      `;
      process.stdout.write(`\r  적재 ${fmt(Math.min(i + OPT.chunk, rows.length))}/${fmt(rows.length)}`);
    }
    process.stdout.write("\n");
    console.log(`  반영 ${fmt(written)}행`);

    // ⑥ 자기검증 — DDL §2 의 4문을 그대로 돈다. 하나라도 어긋나면 실패로 끝낸다.
    console.log("\n[4] 자기검증");
    const [tot] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "vocab_drill_passage_words"`;
    const [orphan] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "vocab_drill_passage_words" pw
       WHERE NOT EXISTS (SELECT 1 FROM "vocab_drill_senses" s WHERE s.id = pw."senseId")`;
    const [docs] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "passageId")::bigint AS n FROM "vocab_drill_passage_words"`;
    const [uncovered] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT DISTINCT "passageId","senseId" FROM "vocab_drill_examples" WHERE "retiredAt" IS NULL
        EXCEPT
        SELECT "passageId","senseId" FROM "vocab_drill_passage_words") t`;

    const checks: [string, number, string, boolean][] = [
      ["① 총행수", Number(tot.n), `${fmt(rows.length)} 기대`, Number(tot.n) >= rows.length],
      ["② 고아 senseId", Number(orphan.n), "0 기대", Number(orphan.n) === 0],
      ["③ 지문 수", Number(docs.n), `${fmt(passagesSeen.size)} 기대`, Number(docs.n) >= passagesSeen.size],
      ["④ examples 미포함 쌍", Number(uncovered.n), "0 기대", Number(uncovered.n) === 0],
    ];
    let failed = 0;
    for (const [label, got, want, ok] of checks) {
      console.log(`  ${ok ? "✅" : "❌"} ${label.padEnd(22)} ${fmt(got).padStart(9)}  (${want})`);
      if (!ok) failed++;
    }
    if (failed) {
      console.error(`\n✗ 자기검증 ${failed}건 실패 — 위 수치를 먼저 해명하라.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\n✅ 완료 — ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
