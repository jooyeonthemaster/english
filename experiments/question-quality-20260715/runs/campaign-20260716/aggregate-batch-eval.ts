/** 배치 평가 집계 (일반화): argv[2]=evalDir. reviews/*.json + key.json 조인. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const EVAL = resolve(process.argv[2]!);
const key = JSON.parse(readFileSync(join(EVAL, "key.json"), "utf8")) as Record<string, Record<string, unknown>>;

const norm = (s: unknown) => {
  const t = String(s ?? "").trim();
  const map: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5", "(A)": "1", "(B)": "2", "(C)": "3", "(D)": "4", "(E)": "5", A: "1", B: "2", C: "3", D: "4", E: "5" };
  return map[t] ?? t.replace(/[()]/g, "").trim();
};
const readJson = (p: string): Record<string, unknown> | null => {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
};

console.log("pid   arm            솔버1 솔버2 V실패    craft grade killer issues");
const rows: Array<{ grade: string; craft: number | null; vOk: boolean; killer: boolean }> = [];
for (const [pid, meta] of Object.entries(key)) {
  const s1 = readJson(join(EVAL, "reviews", `${pid}.solver1.json`));
  const s2 = readJson(join(EVAL, "reviews", `${pid}.solver2.json`));
  const aud = readJson(join(EVAL, "reviews", `${pid}.auditor.json`));
  const adj = readJson(join(EVAL, "reviews", `${pid}.adjudicator.json`));
  const ca = norm(meta.correctAnswer);
  const v = (aud?.validity ?? {}) as Record<string, boolean>;
  const craft = (aud?.craft ?? {}) as Record<string, number>;
  const craftSum = aud ? Object.values(craft).reduce((a, b) => a + b, 0) : null;
  const vStr = aud ? ["V1", "V2", "V3", "V4", "V5"].map((k) => (v[k] ? "·" : k)).join("") : "?";
  const s1ok = s1 ? (norm(s1.answer) === ca && !s1.multipleDefensible ? "○" : "✗") : "?";
  const s2ok = s2 ? (norm(s2.answer) === ca && !s2.multipleDefensible ? "○" : "✗") : "?";
  const issues = ((aud?.validityIssues ?? []) as Array<{ code: string }>).map((i) => i.code).slice(0, 3).join(",");
  const arm = String(meta.armId ?? meta.plan ?? "?");
  console.log(`${pid} ${arm.padEnd(14)} ${s1ok}  ${s2ok}  ${vStr.padEnd(8)} ${String(craftSum ?? "?").padStart(4)} ${String(aud?.grade ?? "?").padEnd(4)} ${aud?.killerConditionsMet ? "Y" : "N"} ${adj ? "adj:" + (adj.finalV2 ? "V2ok" : "V2FAIL") : ""} ${issues}`);
  rows.push({ grade: String(aud?.grade ?? "?"), craft: craftSum, vOk: vStr === "·····", killer: Boolean(aud?.killerConditionsMet) });
}
const graded = rows.filter((r) => r.grade !== "?");
console.log(`\n요약: n=${rows.length} | V전통과 ${rows.filter((r) => r.vOk).length} | 등급 ${["A", "B", "C", "F"].map((g) => g + ":" + graded.filter((r) => r.grade === g).length).join(" ")} | craft평균 ${(graded.reduce((s, r) => s + (r.craft ?? 0), 0) / graded.length).toFixed(1)}/24 | killer충족 ${rows.filter((r) => r.killer).length}`);
