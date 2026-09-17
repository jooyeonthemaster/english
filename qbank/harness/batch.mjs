// 배치 런처 — unit-plan 에서 미완 유닛을 골라 워크플로 args JSON 을 만든다.
//
// 실행:
//   node qbank/harness/batch.mjs --limit 26 --passage 2027_06_5095396-q23   (한 지문 전 유형 = 파일럿)
//   node qbank/harness/batch.mjs --limit 200 --year 2027
//   node qbank/harness/batch.mjs --limit 300 --shard 0/4                    (다중 세션 병렬)
//   ... --out qbank/work/batch-001.json   (파일로 저장. 기본은 stdout)
//
// 선정 순서는 결정론적이다: 최신 연도 → 지문 id → 유형 정의 순서.
// 이미 FINAL 인 유닛은 자동으로 빠진다(레저와 동일 판정).

import fs from "node:fs";
import path from "node:path";
import { unitStatus, STATUS } from "./ledger.mjs";

const ROOT = process.cwd();
const PLAN = path.join(ROOT, "qbank/spec/unit-plan.json");

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf("--" + n);
  return i === -1 ? d : argv[i + 1];
};
const has = (n) => argv.includes("--" + n);

const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
let units = plan.units;

const year = arg("year");
if (year) units = units.filter((u) => String(u.year) === String(year));

const passage = arg("passage");
if (passage) units = units.filter((u) => u.passageId === passage);

const type = arg("type");
if (type) units = units.filter((u) => u.subType === type);

const tier = arg("tier");
if (tier) units = units.filter((u) => u.tier === tier);

const shard = arg("shard");
if (shard && shard.includes("/")) {
  const [s, t] = shard.split("/").map(Number);
  // 지문 단위 샤딩 — 같은 지문의 유형들은 같은 샤드에 있어야 지문 무결성 판정을 공유한다
  const pids = [...new Set(units.map((u) => u.passageId))].sort();
  const mine = new Set(pids.filter((_, i) => i % t === s));
  units = units.filter((u) => mine.has(u.passageId));
}

// 미완만 — 레저와 동일 판정 (파일시스템이 진실원, 불변조건 I5)
const pending = [];
for (const u of units) {
  const st = unitStatus(u.year, u.passageId, u.subType).status;
  if (st === STATUS.FINAL || st === STATUS.QUARANTINE || st === STATUS.PASSAGE_BLOCKED) continue;
  pending.push({ ...u, _status: st });
}

// 최신 연도 우선 → 지문 id → 계획상의 유형 순서(안정 정렬)
const typeOrder = new Map(plan.units.map((u, i) => [u.subType, i]).filter(([, i], idx, a) => a.findIndex(([s]) => s === a[idx][0]) === idx));
pending.sort(
  (a, b) =>
    b.year - a.year ||
    (a.passageId < b.passageId ? -1 : a.passageId > b.passageId ? 1 : 0) ||
    (typeOrder.get(a.subType) ?? 0) - (typeOrder.get(b.subType) ?? 0),
);

const limit = Number(arg("limit", 26));
const picked = pending.slice(0, limit);

const label =
  arg("label") ||
  (passage ? "passage-" + passage : year ? "year-" + year : shard ? "shard-" + shard.replace("/", "of") : "batch") +
    "-" +
    picked.length;

const out = {
  label,
  units: picked.map((u) => ({
    passageId: u.passageId,
    year: u.year,
    subType: u.subType,
    variants: u.variants,
    wordCount: u.wordCount,
    tier: u.tier,
    // 이미 저작된 유닛(GATED/REVIEWED 등)은 워크플로가 저작을 건너뛰고 검수로 직행한다.
    // 재개 시 완료분 재저작을 막고(비용·기준선 보호), 감독 견본도 덮이지 않는다.
    status: u._status,
  })),
};

const outPath = arg("out");
if (outPath) {
  fs.mkdirSync(path.dirname(path.join(ROOT, outPath)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, outPath), JSON.stringify(out, null, 1), "utf8");
}

if (has("summary") || outPath) {
  const byType = {};
  for (const u of picked) byType[u.subType] = (byType[u.subType] || 0) + 1;
  console.error(`[배치] ${label} · 선정 ${picked.length} / 미완 ${pending.length}`);
  console.error(`[배치] 문항 예상 ${picked.reduce((a, u) => a + u.variants, 0)}`);
  console.error(`[배치] 상태 분포: ${JSON.stringify(picked.reduce((a, u) => ((a[u._status] = (a[u._status] || 0) + 1), a), {}))}`);
  if (outPath) console.error(`[배치] → ${outPath}`);
} else {
  console.log(JSON.stringify(out));
}
