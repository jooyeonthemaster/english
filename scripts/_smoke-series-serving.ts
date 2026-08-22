/** 시리즈 표식이 학생 서빙 경로(풀 해석·과제 풀)를 오염시키지 않는지 — 읽기전용 */
import * as fs from "node:fs";
import * as path from "node:path";
for (const line of fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
let fails = 0;
const check = (n: string, ok: boolean, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
  if (!ok) fails++;
};
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { resolveDeckSenses, countDeckPool } = await import("../src/lib/vocab-drill/content");
  const { buildWordbookPlan } = await import("../src/lib/vocab-drill/wordbook-plan");
  const { sanitizeVocabDeckSeries } = await import("../src/lib/vocab-drill/payload");

  // 1) 위저드가 만들 법한 단계 spec 을 그대로 해석
  const plan = await buildWordbookPlan({
    base: { grades: ["고1"], tiers: ["basic", "core"], excludePhrase: true, excludeStopwords: true, allSenses: false },
    size: 40, wordsPerDay: 20, daysPerWeek: 5, order: "easy-first",
  });
  const unit = plan.units[0];
  const spec = {
    senseIds: unit.senseIds,
    limit: unit.senseIds.length,
    series: { key: "wb_probe", title: "프로브", index: 1, total: 2, schedule: { wordsPerDay: 20, daysPerWeek: 5 as const, totalDays: 2 } },
  };
  const [senses, pool] = await Promise.all([resolveDeckSenses(spec), countDeckPool(spec)]);
  check("단계 spec 해석 = 20개", senses.length === 20, `resolved=${senses.length} pool=${pool}`);
  check("countDeckPool 일치", pool === 20, `${pool}`);
  const ids = new Set(senses.map((s) => s.id));
  check("해석 결과가 플랜 목록과 동일", unit.senseIds.every((id) => ids.has(id)), `${ids.size}`);

  // 2) 새니타이저 왕복 — 시리즈 표식이 살아남고, 불량은 통째 버려진다
  check("정상 시리즈 통과", !!sanitizeVocabDeckSeries(spec.series));
  check("index>total 거부", !sanitizeVocabDeckSeries({ ...spec.series, index: 3 }));
  check("총단계 61 거부", !sanitizeVocabDeckSeries({ ...spec.series, index: 1, total: 61 }));
  check("반쪽 스케줄 → schedule 만 탈락", (() => {
    const r = sanitizeVocabDeckSeries({ ...spec.series, schedule: { wordsPerDay: 20 } });
    return !!r && r.schedule === undefined;
  })());
  check("key 없음 거부", !sanitizeVocabDeckSeries({ ...spec.series, key: "" }));

  // 3) [음성테스트] 유령 senseId 는 풀에서 사라진다(생성 액션의 실존 검증 근거)
  const ghost = await resolveDeckSenses({ senseIds: ["ghost-id-does-not-exist"], limit: 1 });
  check("유령 id → 0개", ghost.length === 0, `${ghost.length}`);

  await prisma.$disconnect();
  console.log(fails ? `\n${fails}건 실패` : "\n전건 통과");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
