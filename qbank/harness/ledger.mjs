// 레저 — 파일시스템을 스캔해 유닛 상태를 재구성한다. (불변조건 I5: 상태의 진실원은 파일시스템)
// 워크플로 캐시도 대화 기억도 신뢰하지 않는다. 어떤 세션에서든 이걸 돌리면 정확한 현황이 나온다.
//
// 실행: node qbank/harness/ledger.mjs [--next N] [--year YYYY] [--json]
//   --next N   다음 배치 후보 N개를 출력 (최신 연도 우선)
//   --year     특정 연도만
//   --json     기계 판독용 JSON 출력
//   --shard S/T  전체를 T개로 나눈 S번째 샤드만 (다중 세션 병렬용, 0-indexed)

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QB = path.join(ROOT, "qbank");
const OUT = path.join(QB, "out");
const PLAN = path.join(QB, "spec", "unit-plan.json");
const STATE_MD = path.join(QB, "STATE.md");

const argv = process.argv.slice(2);
const flag = (name, def = null) => {
  const i = argv.indexOf("--" + name);
  return i === -1 ? def : argv[i + 1] ?? true;
};
const has = (name) => argv.includes("--" + name);

// ── 유닛 상태 판정 ─────────────────────────────────────────────────────────
// 파일 존재 + 내용으로만 판정한다. 어떤 외부 상태도 참조하지 않는다.
export const STATUS = {
  PENDING: "PENDING",       // 아무것도 없음
  PASSAGE_BLOCKED: "PASSAGE_BLOCKED", // 지문 무결성 실패로 격리
  AUTHORED: "AUTHORED",     // .md 는 있으나 게이트 미실행
  GATE_FAILED: "GATE_FAILED", // 게이트 blocking 존재 → 재저작 필요
  GATED: "GATED",           // 게이트 통과, 검수 미실행
  REVIEW_ISSUES: "REVIEW_ISSUES", // 검수에서 critical/major 미해결 → 수리 필요
  REVIEWED: "REVIEWED",     // 검수 통과, 확정 미실행
  FINAL: "FINAL",           // 확정 완료
  QUARANTINE: "QUARANTINE", // 3회 초과 실패
};

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

export function unitDir(year, passageId) {
  return path.join(OUT, String(year), passageId);
}

export function unitStatus(year, passageId, subType) {
  const d = unitDir(year, passageId);
  const p = (ext) => path.join(d, subType + ext);

  const passage = readJson(path.join(d, "_passage.json"));
  if (passage && passage.integrity && passage.integrity.ok === false) return { status: STATUS.PASSAGE_BLOCKED, passage };

  const meta = readJson(p(".meta.json"));
  if (meta && meta.quarantined) return { status: STATUS.QUARANTINE, meta };

  if (fs.existsSync(p(".final.jsonl"))) {
    const lines = fs.readFileSync(p(".final.jsonl"), "utf8").split("\n").filter((l) => l.trim());
    if (lines.length > 0) return { status: STATUS.FINAL, count: lines.length, meta };
  }

  const hasMd = fs.existsSync(p(".md"));
  if (!hasMd) return { status: STATUS.PENDING };

  const gate = readJson(p(".gate.json"));
  if (!gate) return { status: STATUS.AUTHORED, meta };
  // 게이트 판정보다 나중에 .md 가 갱신됐으면(수리) 게이트는 스테일 → 재실행 필요
  const mdM = fs.statSync(p(".md")).mtimeMs;
  const gtM = fs.statSync(p(".gate.json")).mtimeMs;
  if (mdM > gtM + 1000) return { status: STATUS.AUTHORED, stale: "gate", meta };
  // 형식 차단(프로덕션 동일 축) + 품질 차단(우리 상향 축) 둘 다 비어야 통과
  if ((gate.blocking || []).length > 0 || (gate.qualityBlocking || []).length > 0)
    return { status: STATUS.GATE_FAILED, gate, meta };

  const review = readJson(p(".review.json"));
  if (!review) return { status: STATUS.GATED, gate, meta };
  const rvM = fs.statSync(p(".review.json")).mtimeMs;
  if (mdM > rvM + 1000) return { status: STATUS.GATED, stale: "review", gate, meta };

  const unresolved = (review.findings || []).filter(
    (f) => (f.severity === "critical" || f.severity === "major") && f.outcome !== "fixed" && f.outcome !== "no_change_needed"
  );
  if (unresolved.length > 0) return { status: STATUS.REVIEW_ISSUES, unresolved: unresolved.length, review, gate, meta };

  return { status: STATUS.REVIEWED, review, gate, meta };
}

// ── 스캔 ──────────────────────────────────────────────────────────────────
function loadPlan() {
  const plan = readJson(PLAN);
  if (!plan) {
    console.error("[레저] unit-plan.json 이 없다. 먼저 `node qbank/harness/plan.mjs` 를 실행하라.");
    process.exit(2);
  }
  return plan;
}

function main() {
  const plan = loadPlan();
  let units = plan.units;

  const yearFilter = flag("year");
  if (yearFilter) units = units.filter((u) => String(u.year) === String(yearFilter));

  const shard = flag("shard");
  if (shard && typeof shard === "string" && shard.includes("/")) {
    const [s, t] = shard.split("/").map(Number);
    // 지문 단위로 샤딩한다 — 같은 지문의 유형들은 같은 샤드에 있어야 지문 무결성 결과를 공유한다
    const pids = [...new Set(units.map((u) => u.passageId))].sort();
    const mine = new Set(pids.filter((_, i) => i % t === s));
    units = units.filter((u) => mine.has(u.passageId));
  }

  const counts = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
  const byYear = {};
  const byType = {};
  const pending = [];
  let finalQuestions = 0;

  for (const u of units) {
    const r = unitStatus(u.year, u.passageId, u.subType);
    counts[r.status]++;
    byYear[u.year] = byYear[u.year] || Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
    byYear[u.year][r.status]++;
    byType[u.subType] = byType[u.subType] || Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
    byType[u.subType][r.status]++;
    if (r.status === STATUS.FINAL) finalQuestions += r.count || 0;
    if (
      r.status === STATUS.PENDING ||
      r.status === STATUS.AUTHORED ||
      r.status === STATUS.GATE_FAILED ||
      r.status === STATUS.GATED ||
      r.status === STATUS.REVIEW_ISSUES ||
      r.status === STATUS.REVIEWED
    ) {
      pending.push({ ...u, status: r.status });
    }
  }

  // 최신 연도 우선 → 같은 연도 안에서는 지문 id 순 (결정론적)
  pending.sort((a, b) => b.year - a.year || (a.passageId < b.passageId ? -1 : a.passageId > b.passageId ? 1 : 0));

  const total = units.length;
  const done = counts[STATUS.FINAL];
  const result = {
    scannedAt: new Date().toISOString(),
    totalUnits: total,
    doneUnits: done,
    donePct: total ? +((done / total) * 100).toFixed(2) : 0,
    finalQuestions,
    targetQuestions: plan.targetQuestions,
    counts,
    byYear,
    byType,
    nextBatch: pending.slice(0, Number(flag("next", 0)) || 0),
    remainingUnits: pending.length,
  };

  if (has("json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("═══ QBANK 레저 ═══", result.scannedAt);
  console.log(`유닛  ${done.toLocaleString()} / ${total.toLocaleString()}  (${result.donePct}%)`);
  console.log(`문항  ${finalQuestions.toLocaleString()} / ${(plan.targetQuestions || 0).toLocaleString()}`);
  console.log("\n상태별:");
  for (const [k, v] of Object.entries(counts)) if (v) console.log(`  ${k.padEnd(16)} ${v.toLocaleString()}`);
  console.log("\n연도별 진행(FINAL/전체):");
  const years = Object.keys(byYear).sort((a, b) => b - a);
  for (const y of years) {
    const t = Object.values(byYear[y]).reduce((a, b) => a + b, 0);
    const f = byYear[y][STATUS.FINAL];
    const bar = "█".repeat(Math.round((f / t) * 20)).padEnd(20, "·");
    console.log(`  ${y}  ${bar} ${f}/${t}`);
  }
  if (result.nextBatch.length) {
    console.log(`\n다음 배치 후보 ${result.nextBatch.length}건:`);
    for (const u of result.nextBatch) console.log(`  [${u.status}] ${u.year} ${u.passageId} ${u.subType}`);
  }
  console.log(`\n잔여 유닛 ${pending.length.toLocaleString()}`);

  writeState(result, plan);
}

function writeState(r, plan) {
  const years = Object.keys(r.byYear).sort((a, b) => b - a);
  const lines = [
    "# QBANK 현황 (자동 생성 — 손으로 고치지 마라)",
    "",
    "> 생성 " + r.scannedAt + " · `node qbank/harness/ledger.mjs` 가 매 실행마다 덮어쓴다.",
    "",
    `- **유닛** ${r.doneUnits.toLocaleString()} / ${r.totalUnits.toLocaleString()} (${r.donePct}%)`,
    `- **확정 문항** ${r.finalQuestions.toLocaleString()} / ${(plan.targetQuestions || 0).toLocaleString()}`,
    `- **잔여 유닛** ${r.remainingUnits.toLocaleString()}`,
    "",
    "## 상태별",
    "",
    "| 상태 | 유닛 |",
    "|---|---:|",
    ...Object.entries(r.counts).filter(([, v]) => v).map(([k, v]) => `| ${k} | ${v.toLocaleString()} |`),
    "",
    "## 연도별",
    "",
    "| 연도 | 확정 | 전체 | % |",
    "|---|---:|---:|---:|",
    ...years.map((y) => {
      const t = Object.values(r.byYear[y]).reduce((a, b) => a + b, 0);
      const f = r.byYear[y].FINAL;
      return `| ${y} | ${f} | ${t} | ${t ? ((f / t) * 100).toFixed(1) : 0}% |`;
    }),
    "",
  ];
  fs.mkdirSync(path.dirname(STATE_MD), { recursive: true });
  fs.writeFileSync(STATE_MD, lines.join("\n"), "utf8");
}

if (import.meta.url.startsWith("file:") && process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
