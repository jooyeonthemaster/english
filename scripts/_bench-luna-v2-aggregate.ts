// 확증런 v2 집계기 (26-08-14) — 솔버 2 × 감수 1 × key 조인 → 팔별 판정표.
// F 정의(선행 벤치 동일): v2 축(솔버 불일치·복수정답 시비가 감수로 확증) 또는
// v4 축(감수 fatal). 솔버 단독 불일치는 F-후보로만 표기(본체 재검증 대상 목록).
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";

const DIR = "experiments/question-quality-20260715/luna-bench-20260814";
const EV = resolve(DIR, "eval-v2");

function load(name: string): any {
  const p = resolve(EV, name);
  if (!existsSync(p)) {
    console.error(`누락: ${name}`);
    return null;
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function main() {
  const key = load("key.json");
  const gen = JSON.parse(readFileSync(resolve(DIR, "gen-v2.json"), "utf8"));
  const genByItem = new Map<string, any>();
  for (const [id, k] of Object.entries<any>(key)) {
    const row = gen.rows.find(
      (r: any) => r.arm === k.arm && r.passageId === k.passageId && !r.error,
    );
    genByItem.set(id, row);
  }

  const solvers: Record<string, Map<string, any>> = {};
  for (const name of ["solver-GA", "solver-GB", "solver-BA", "solver-BB"]) {
    const j = load(`${name}.json`);
    if (!j) continue;
    solvers[name] = new Map(j.items.map((it: any) => [it.id, it]));
  }
  const audits = new Map<string, any>();
  for (const name of ["audit-G1", "audit-G2", "audit-B1", "audit-B2"]) {
    const j = load(`${name}.json`);
    if (!j) continue;
    for (const it of j.items) audits.set(it.id, { ...it, auditor: j.auditor });
  }

  interface Verdict {
    id: string;
    arm: string;
    solverMiss: string[]; // 오답 낸 솔버
    altSuspicion: string[];
    auditFatal: boolean;
    auditIssues: string[];
    craft: number | null;
    fCandidate: boolean; // 본체 재검증 필요(솔버 단독 시비)
    fConfirmed: boolean; // 솔버 미스+감수 fatal 이 겹치거나 감수 fatal
  }

  const verdicts: Verdict[] = [];
  for (const [id, k] of Object.entries<any>(key)) {
    const isG = id.startsWith("G");
    const sA = solvers[isG ? "solver-GA" : "solver-BA"]?.get(id);
    const sB = solvers[isG ? "solver-GB" : "solver-BB"]?.get(id);
    const audit = audits.get(id);
    const solverMiss: string[] = [];
    const altSuspicion: string[] = [];
    for (const [tag, s] of [
      ["A", sA],
      ["B", sB],
    ] as const) {
      if (!s) continue;
      if (String(s.answer).trim() !== String(k.answer).trim())
        solverMiss.push(`${tag}:${s.answer}`);
      if (s.altSuspicion) altSuspicion.push(`${tag}:${s.altSuspicion}`);
    }
    const auditFatal = Boolean(audit?.fatal);
    const fConfirmed = auditFatal || solverMiss.length === 2; // 양 솔버 동시 미스 = v2 강신호
    const fCandidate = !fConfirmed && (solverMiss.length > 0 || altSuspicion.length > 0);
    verdicts.push({
      id,
      arm: k.arm,
      solverMiss,
      altSuspicion,
      auditFatal,
      auditIssues: audit?.issues ?? [],
      craft: typeof audit?.craft === "number" ? audit.craft : null,
      fCandidate,
      fConfirmed,
    });
  }

  console.log("══ 팔별 품질 요약 ══");
  for (const arm of ["luna-g", "g36-g", "luna-b", "g36-b"]) {
    const vs = verdicts.filter((v) => v.arm === arm);
    const rows = vs.map((v) => genByItem.get(v.id)).filter(Boolean);
    const fC = vs.filter((v) => v.fConfirmed);
    const cand = vs.filter((v) => v.fCandidate);
    const craft = vs.filter((v) => v.craft != null);
    const avgCraft = craft.reduce((a, v) => a + (v.craft ?? 0), 0) / Math.max(1, craft.length);
    const avgS = rows.reduce((a, r) => a + (r?.totalDurationMs ?? 0), 0) / Math.max(1, rows.length) / 1000;
    const avgCost =
      (rows.reduce((a, r) => a + (r?.totalCostUsd ?? 0), 0) / Math.max(1, rows.length)) * 1470;
    console.log(
      `${arm}: n=${vs.length} | F확정 ${fC.length} (${((fC.length / vs.length) * 100).toFixed(0)}%) | F후보 ${cand.length} | craft ${avgCraft.toFixed(1)} | ${avgS.toFixed(1)}s | ₩${avgCost.toFixed(1)}`,
    );
    for (const v of fC)
      console.log(`   F확정 ${v.id}: 솔버미스[${v.solverMiss}] fatal=${v.auditFatal} ${v.auditIssues.slice(0, 2).join(" | ").slice(0, 140)}`);
    for (const v of cand)
      console.log(`   F후보 ${v.id}: 미스[${v.solverMiss}] 시비[${v.altSuspicion.join("; ").slice(0, 100)}]`);
  }

  // 본체 재검증 대상 상세 덤프
  const needReview = verdicts.filter((v) => v.fConfirmed || v.fCandidate);
  console.log(`\n본체 재검증 대상 ${needReview.length}건: ${needReview.map((v) => v.id).join(", ")}`);
}
main();
