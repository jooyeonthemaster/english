// luna 어법 벤치 최종 집계 (26-08-08) — key + 솔버2 + 감수2 + 생성 실측 조인.
import { readFileSync } from "fs";
import { resolve } from "path";

const DIR = "experiments/question-quality-20260715/luna-bench-20260808";
const j = (f: string) => JSON.parse(readFileSync(resolve(DIR, f), "utf8"));

const key = j("eval/key.json") as Record<string, { model: string; passageTitle: string; answers: string[] }>;
const solverA = j("eval/solver-A.json") as Record<string, { choice: string; confidence: number; ambiguity: string; note: string }>;
const solverB = j("eval/solver-B.json") as Record<string, { choice: string; confidence: number; ambiguity: string; note: string }>;
const audit = { ...j("eval/audit-1.json"), ...j("eval/audit-2.json") } as Record<
  string,
  { v2: string; v4: string; craft: number; grade: string; issues: string[] }
>;
const gen = j("gen.json") as { rows: any[] };
const retry = j("retry.json") as { rows: any[] };

const CIRCLED = ["①", "②", "③", "④", "⑤"];
const toCircled = (label: string) => CIRCLED[label.charCodeAt(1) - 65] ?? label;

console.log("Q  | 모델          | 정답 | 솔버A      | 솔버B      | v2   | v4   | craft | grade");
const perModel: Record<string, any> = {};
for (const [id, k] of Object.entries(key)) {
  const keyAns = toCircled(k.answers[0]);
  const a = solverA[id], b = solverB[id], au = audit[id];
  const aOk = a?.choice === keyAns, bOk = b?.choice === keyAns;
  const short = k.model.split("/")[1];
  console.log(
    `${id} | ${short.padEnd(13)} | ${keyAns}  | ${a?.choice ?? "?"} ${aOk ? "○" : "×"} amb=${(a?.ambiguity ?? "?").slice(0, 4)} | ${b?.choice ?? "?"} ${bOk ? "○" : "×"} amb=${(b?.ambiguity ?? "?").slice(0, 4)} | ${au?.v2 ?? "?"} | ${au?.v4 ?? "?"} | ${au?.craft ?? "?"}     | ${au?.grade ?? "?"}`,
  );
  const m = (perModel[k.model] ??= { n: 0, solveOk: 0, solveTotal: 0, bothOk: 0, v2f: 0, v4f: 0, craft: [] as number[], grades: {} as Record<string, number>, fIds: [] as string[] });
  m.n++;
  m.solveTotal += 2;
  m.solveOk += (aOk ? 1 : 0) + (bOk ? 1 : 0);
  if (aOk && bOk) m.bothOk++;
  if (au?.v2 === "FAIL") m.v2f++;
  if (au?.v4 === "FAIL") m.v4f++;
  if (typeof au?.craft === "number") m.craft.push(au.craft);
  m.grades[au?.grade ?? "?"] = (m.grades[au?.grade ?? "?"] ?? 0) + 1;
  if (au?.grade === "F") m.fIds.push(id);
}

console.log("\n══ 모델별 품질 요약 (게이트 통과분) ══");
for (const [model, m] of Object.entries(perModel)) {
  const craftAvg = m.craft.reduce((x: number, y: number) => x + y, 0) / Math.max(1, m.craft.length);
  console.log(
    `${model}: n=${m.n} | 블라인드 정답재현 ${m.solveOk}/${m.solveTotal}(양솔버 일치 ${m.bothOk}/${m.n}) | v2 FAIL ${m.v2f} | v4 FAIL ${m.v4f} | craft 평균 ${craftAvg.toFixed(1)} | 등급 ${JSON.stringify(m.grades)}${m.fIds.length ? " | F: " + m.fIds.join(",") : ""}`,
  );
}

console.log("\n══ 생성 실측 (1차 8콜 기준) ══");
for (const model of [...new Set(gen.rows.map((r) => r.model))]) {
  const rs = gen.rows.filter((r) => r.model === model);
  const ok = rs.filter((r) => !r.error && r.gateIssues.length === 0);
  const live = rs.filter((r) => !r.error && r.costUsd != null);
  const avgS = live.reduce((a, r) => a + r.durationMs, 0) / Math.max(1, live.length) / 1000;
  const med = [...live].sort((a, b) => a.durationMs - b.durationMs)[Math.floor(live.length / 2)];
  const avgCost = live.reduce((a, r) => a + (r.costUsd ?? 0), 0) / Math.max(1, live.length);
  console.log(
    `${model}: 게이트통과 ${ok.length}/8 | 평균 ${avgS.toFixed(1)}s (중앙 ${((med?.durationMs ?? 0) / 1000).toFixed(0)}s) | 콜당 $${avgCost.toFixed(5)} = ₩${(avgCost * 1470).toFixed(1)}`,
  );
}
const lunaAll = [...gen.rows.filter((r) => r.model.includes("luna")), ...retry.rows];
const lunaEmpty = lunaAll.filter((r) => r.finishReason === "error" || (r.error && !r.text));
console.log(`\nluna 신뢰성: 총 ${lunaAll.length}콜 중 빈응답/에러 ${lunaEmpty.length}콜 (${((lunaEmpty.length / lunaAll.length) * 100).toFixed(0)}%)`);

// 유효원가: 통과 1문항을 얻기까지의 기대 콜수 × 평균 콜단가 (1차 통과율 기준, 실패콜도 과금분 포함)
console.log("\n══ 유효원가 추정 (통과 1문항당, 1차 통과율 기준) ══");
for (const model of [...new Set(gen.rows.map((r) => r.model))]) {
  const rs = gen.rows.filter((r) => r.model === model);
  const passRate = rs.filter((r) => !r.error && r.gateIssues.length === 0).length / rs.length;
  const paid = rs.filter((r) => r.costUsd != null);
  const avgPaid = paid.reduce((a, r) => a + (r.costUsd ?? 0), 0) / Math.max(1, paid.length);
  const expCalls = passRate > 0 ? 1 / passRate : Infinity;
  console.log(`${model}: 1차 통과율 ${(passRate * 100).toFixed(0)}% → 기대 ${expCalls.toFixed(1)}콜/문항 ≈ ₩${(avgPaid * 1470 * expCalls).toFixed(0)}`);
}
