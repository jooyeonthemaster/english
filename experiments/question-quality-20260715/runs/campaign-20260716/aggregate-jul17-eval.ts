/** 7/17 프로덕션 배치 평가 집계: reviews/*.json + key.json 조인 → 셀별 품질×원가 최종표. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EVAL = join(process.cwd(), "experiments/question-quality-20260715/runs/campaign-20260716/eval-jul17-prod");
const key = JSON.parse(readFileSync(join(EVAL, "key.json"), "utf8")) as Record<string, {
  jobId: string; plan: string; subType: string; difficulty: string;
  costKrw: number; calls: number; passageTitle: string; correctAnswer: unknown;
  qualityWarnings: Array<{ code: string }> | null; explanationRepaired: boolean | null;
}>;

const norm = (s: unknown) => {
  const t = String(s ?? "").trim();
  const map: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5", "(A)": "1", "(B)": "2", "(C)": "3", "(D)": "4", "(E)": "5", A: "1", B: "2", C: "3", D: "4", E: "5" };
  return map[t] ?? t.replace(/[()]/g, "").trim();
};

const readJson = (p: string): Record<string, unknown> | null => {
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
};

type RowOut = {
  pid: string; plan: string; subType: string; costKrw: number; calls: number;
  s1ok: boolean | null; s2ok: boolean | null; s1multi: boolean; s2multi: boolean;
  V: string; craftSum: number | null; grade: string; killer: boolean | null;
  adjudicated: string; finalV2: boolean | null; issues: string;
};

const rows: RowOut[] = [];
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
  const issues = [
    ...(((aud?.validityIssues ?? []) as Array<{ code: string; severity?: string }>).map((i) => i.code)),
  ].slice(0, 4).join(",");
  rows.push({
    pid, plan: meta.plan, subType: meta.subType === "GRAMMAR_ERROR" ? "어법" : "빈칸",
    costKrw: meta.costKrw, calls: meta.calls,
    s1ok: s1 ? norm(s1.answer) === ca && !s1.multipleDefensible : null,
    s2ok: s2 ? norm(s2.answer) === ca && !s2.multipleDefensible : null,
    s1multi: Boolean(s1?.multipleDefensible), s2multi: Boolean(s2?.multipleDefensible),
    V: vStr, craftSum, grade: String(aud?.grade ?? "?"),
    killer: aud ? Boolean(aud.killerConditionsMet) : null,
    adjudicated: adj ? "yes" : "", finalV2: adj ? Boolean(adj.finalV2) : null,
    issues,
  });
}

rows.sort((a, b) => `${a.plan}/${a.subType}`.localeCompare(`${b.plan}/${b.subType}`) || a.pid.localeCompare(b.pid));
console.log("pid   plan/유형          원가  솔버1 솔버2 V실패    craft grade killer adj  issues");
for (const r of rows) {
  console.log(
    `${r.pid} ${(r.plan + "/" + r.subType).padEnd(16)} ${String(r.costKrw).padStart(4)}원 ${fmtOk(r.s1ok, r.s1multi)}  ${fmtOk(r.s2ok, r.s2multi)}  ${r.V.padEnd(8)} ${String(r.craftSum ?? "?").padStart(4)} ${r.grade.padEnd(4)} ${r.killer === null ? "?" : r.killer ? "Y" : "N"}    ${(r.adjudicated + (r.finalV2 === null ? "" : r.finalV2 ? "→V2ok" : "→V2fail")).padEnd(9)} ${r.issues}`,
  );
}
function fmtOk(ok: boolean | null, multi: boolean) { return ok === null ? "?" : ok ? "○" : multi ? "복수" : "✗"; }

console.log("\n=== 셀별 품질 요약 ===");
const cells = new Map<string, RowOut[]>();
for (const r of rows) {
  const k = `${r.plan}/${r.subType}`;
  (cells.get(k) ?? cells.set(k, []).get(k)!).push(r);
}
for (const [k, g] of [...cells.entries()].sort()) {
  const graded = g.filter((r) => r.grade !== "?");
  const gradeCount = ["A", "B", "C", "F"].map((gr) => `${gr}:${graded.filter((r) => r.grade === gr).length}`).join(" ");
  const bothSolved = g.filter((r) => r.s1ok === true && r.s2ok === true).length;
  const avgCost = Math.round(g.reduce((s, r) => s + r.costKrw, 0) / g.length);
  const avgCraft = graded.length ? (graded.reduce((s, r) => s + (r.craftSum ?? 0), 0) / graded.length).toFixed(1) : "?";
  const killerY = g.filter((r) => r.killer === true).length;
  console.log(`${k.padEnd(16)} n=${g.length} 평균원가 ${avgCost}원 | 블라인드 양솔버 일치 ${bothSolved}/${g.length} | ${gradeCount} | craft평균 ${avgCraft}/24 | killer조건충족 ${killerY}`);
}
