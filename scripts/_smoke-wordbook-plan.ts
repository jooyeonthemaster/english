/**
 * 단어장 위저드 플랜 엔진 스모크 — 실DB 읽기전용
 * npx tsx --require ./scripts/_shim-server-only.cjs scripts/_smoke-wordbook-plan.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

for (const line of fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

let fails = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails += 1;
}

async function main() {
  const { buildWordbookPlan, countWordbookMatches } = await import(
    "../src/lib/vocab-drill/wordbook-plan"
  );
  const { nthStudyDate } = await import("../src/lib/vocab-drill/wordbook-plan-types");

  // 1) easy-first 600 (고1 기초) — 크기·단계수·난이도 단조 증가·중복 없음
  const p1 = await buildWordbookPlan({
    base: { grades: ["고1"], tiers: ["basic", "core"], excludePhrase: true, excludeStopwords: true, allSenses: false },
    size: 600,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "easy-first",
  });
  check("p1 총량 600", p1.totalPlanned === 600, `planned=${p1.totalPlanned} matched=${p1.totalMatched}`);
  check("p1 단계 30개", p1.units.length === 30, `${p1.units.length}`);
  const firstAvg = p1.units[0].avgDifficulty ?? 0;
  const lastAvg = p1.units[p1.units.length - 1].avgDifficulty ?? 0;
  check("p1 난이도 단조(첫<끝)", firstAvg < lastAvg, `${firstAvg} → ${lastAvg}`);
  const all1 = p1.units.flatMap((u) => u.senseIds);
  check("p1 중복 0", new Set(all1).size === all1.length, `${all1.length}`);
  check("p1 표본 존재", p1.units[0].sample.length === 6, JSON.stringify(p1.units[0].sample[0]));

  // 2) 함정 축(minTrapRate — 덱 spec 밖 축이 plan 에서 먹히는지)
  const c2 = await countWordbookMatches({ minTrapRate: 0.3, excludePhrase: true, excludeStopwords: true, allSenses: false });
  check("p2 함정 풀 400+", c2 >= 400, `${c2}`);

  // 3) mixed-pos — 매 단계 품사 3종 이상
  const p3 = await buildWordbookPlan({
    base: { tiers: ["core", "academic"], excludePhrase: true, excludeStopwords: true, allSenses: false },
    size: 200,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "mixed-pos",
  });
  const posPerUnit = p3.units.map((u) => new Set(u.sample.map((s) => s.pos)).size);
  check("p3 단계 10개", p3.units.length === 10, `${p3.units.length}`);
  check("p3 품사 섞임(표본 6개 중 3종+)", posPerUnit.every((n) => n >= 3), posPerUnit.join(","));

  // 4) tier-ladder — 앞 단계는 낮은 수준부터
  const p4 = await buildWordbookPlan({
    base: { tiers: ["basic", "core", "academic", "advanced"], excludePhrase: true, excludeStopwords: true, allSenses: false },
    size: 400,
    wordsPerDay: 40,
    studyDays: [1, 2, 3, 4, 5],
    order: "tier-ladder",
  });
  const t0 = p4.units[0].tierCounts;
  check("p4 1단계=basic 위주", (t0.basic ?? 0) >= 30, JSON.stringify(t0));

  // 5) 요청>풀 클램프 경고
  const p5 = await buildWordbookPlan({
    base: { grades: ["고1"], tiers: ["basic"], difficulties: [1], excludePhrase: true, excludeStopwords: true, allSenses: false },
    size: 2000,
    wordsPerDay: 20,
    studyDays: [1, 2, 3, 4, 5],
    order: "frequency",
  });
  check("p5 클램프+경고", p5.totalPlanned < 2000 && p5.warnings.length > 0, `planned=${p5.totalPlanned} warn=${p5.warnings[0] ?? ""}`);

  // 6) [음성테스트] 계기가 필터를 실제로 반영하는가 — 극단 조건은 극소수여야 한다
  const c6 = await countWordbookMatches({ tiers: ["basic"], difficulties: [5], allSenses: false });
  check("p6 음성 프로브(basic×5 ≈ 1)", c6 <= 5, `${c6}`);

  // 7) random — 선정은 빈출순과 동일 집합, 순서만 다름, 재계산해도 같은 순서(시드 고정)
  const base7 = { grades: ["고1"], tiers: ["basic", "core"], excludePhrase: true, excludeStopwords: true, allSenses: false } as const;
  const pFreq = await buildWordbookPlan({ base: { ...base7 }, size: 60, wordsPerDay: 20, studyDays: [1, 2, 3, 4, 5], order: "frequency" });
  const pRand1 = await buildWordbookPlan({ base: { ...base7 }, size: 60, wordsPerDay: 20, studyDays: [1, 2, 3, 4, 5], order: "random" });
  const pRand2 = await buildWordbookPlan({ base: { ...base7 }, size: 60, wordsPerDay: 20, studyDays: [1, 2, 3, 4, 5], order: "random" });
  const idsOf = (p: typeof pFreq) => p.units.flatMap((u) => u.senseIds);
  const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => new Set(b).has(x));
  check("r1 random 선정 = 빈출순 집합", setEq(idsOf(pFreq), idsOf(pRand1)));
  check("r2 random 순서는 다름", idsOf(pFreq).join(",") !== idsOf(pRand1).join(","));
  check("r3 random 시드 고정(재계산 동일)", idsOf(pRand1).join(",") === idsOf(pRand2).join(","));

  // 8) pos-grouped — 품사 블록이 연속(한 번 떠난 품사가 다시 나오지 않는다)
  const pGrp = await buildWordbookPlan({ base: { ...base7 }, size: 100, wordsPerDay: 25, studyDays: [1, 2, 3, 4, 5], order: "pos-grouped" });
  const posSeq = pGrp.units.flatMap((u) => u.sample.map((s) => s.pos));
  const seen = new Set<string>();
  let contiguous = true;
  let prev = "";
  for (const p of posSeq) {
    if (p !== prev) {
      if (seen.has(p)) { contiguous = false; break; }
      seen.add(p);
      prev = p;
    }
  }
  check("g1 pos-grouped 블록 연속(표본 기준)", contiguous, posSeq.join(","));

  // 9) 날짜 산식 — 2026-08-10=월요일
  const WD = [1, 2, 3, 4, 5];
  check("d1 월 시작 n=1", nthStudyDate("2026-08-10", 1, WD) === "2026-08-10", nthStudyDate("2026-08-10", 1, WD));
  check("d2 주5일 n=6 → 다음주 월", nthStudyDate("2026-08-10", 6, WD) === "2026-08-17", nthStudyDate("2026-08-10", 6, WD));
  check("d3 토 시작 → 월요일로", nthStudyDate("2026-08-15", 1, WD) === "2026-08-17", nthStudyDate("2026-08-15", 1, WD));
  check("d4 주7일 n=8", nthStudyDate("2026-08-10", 8, [0, 1, 2, 3, 4, 5, 6]) === "2026-08-17", nthStudyDate("2026-08-10", 8, [0, 1, 2, 3, 4, 5, 6]));
  // 요일 집합 신형 — 월수금(2026-08-10=월): 1→8.10, 2→8.12, 3→8.14, 4→8.17
  const MWF = [1, 3, 5];
  check("d5 월수금 n=2 → 수", nthStudyDate("2026-08-10", 2, MWF) === "2026-08-12", nthStudyDate("2026-08-10", 2, MWF));
  check("d6 월수금 n=4 → 다음주 월", nthStudyDate("2026-08-10", 4, MWF) === "2026-08-17", nthStudyDate("2026-08-10", 4, MWF));
  check("d7 화 시작+월수금 → 수요일부터", nthStudyDate("2026-08-11", 1, MWF) === "2026-08-12", nthStudyDate("2026-08-11", 1, MWF));
  // 구형 호환 — sanitizeVocabDeckSeries 가 daysPerWeek 만 있는 스케줄을 요일 집합으로 승격
  const { sanitizeVocabDeckSeries } = await import("../src/lib/vocab-drill/payload");
  const legacy = sanitizeVocabDeckSeries({ key: "wb_x", title: "t", index: 1, total: 2, schedule: { wordsPerDay: 20, daysPerWeek: 5, totalDays: 2 } });
  check("d8 구형(주5) → studyDays [1..5] 승격", JSON.stringify(legacy?.schedule?.studyDays) === "[1,2,3,4,5]", JSON.stringify(legacy?.schedule ?? null));
  const mwf = sanitizeVocabDeckSeries({ key: "wb_x", title: "t", index: 1, total: 2, schedule: { wordsPerDay: 20, studyDays: [5, 1, 3, 3], totalDays: 2 } });
  check("d9 신형 정렬·중복 제거 + daysPerWeek=길이", JSON.stringify(mwf?.schedule?.studyDays) === "[1,3,5]" && mwf?.schedule?.daysPerWeek === 3, JSON.stringify(mwf?.schedule ?? null));

  console.log(fails ? `\n${fails}건 실패` : "\n전건 통과");
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
