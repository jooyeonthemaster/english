import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// AI 지문 생성 — 부분 환불 금액 계약 (CONTRACTS §5 "부분 환불 금액 단위 테스트
// 선행" 의 이행분).
//
// 이 경로가 틀리면 되돌릴 방법이 없다. 덜 돌려주면 사용자가 만들지 못한 지문에
// 과금당하고, 더 돌려주면 이미 지문함에 들어간 산출물이 공짜가 된다(리퍼 경로에서
// 실제로 지적된 누수). 두 계산 주체를 모두 잠근다.
//   · run-job.ts        — 실행 종결 시 실패 f편 × 단가, 그리고 중단(catch) 시
//                          미완성 편수 × 단가
//   · workbench-ai-job-stale-cleanup.ts — 좀비 잡 리퍼의 unitPriceIfPerUnitCharge
//                          / undelivered(=인도분은 환불하지 않는다)
//
// ⚠️ 테스트 방식에 대해: 위 두 파일의 계산은 **export 된 순수 함수가 아니다**
// (run-job 은 async 본문 안 인라인, stale-cleanup 의 unitPriceIfPerUnitCharge 는
// 모듈 private). 두 파일 모두 이 작업의 배정 범위 밖이라 export 를 추가하지 않았다.
// 대신 (a) 원본 소스에서 계산식을 **문자열로 잠그고**(식이 바뀌면 이 테스트가
// 즉시 깨진다) (b) 같은 식의 복제본을 금액표 전체에 대해 검증한다. 복제본만
// 있으면 동어반복이지만, 소스 잠금과 함께 두면 "구현이 조용히 달라지는" 경로가
// 막힌다. 순수 함수 export 가 생기면 (b)를 실제 import 로 바꾸면 된다.
// ============================================================================

const harnessSource = `
import { readFileSync } from "node:fs";
import path from "node:path";

import costMod from "@/lib/credit-costs";

const { CREDIT_COSTS } = costMod as any;
const UNIT = CREDIT_COSTS.PASSAGE_AUTHORING;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

function readSrc(...parts: string[]) {
  return readFileSync(path.join(process.cwd(), ...parts), "utf8").replace(/\\r\\n/g, "\\n");
}
const runJobSrc = readSrc("src", "lib", "passage-authoring", "run-job.ts");
const reaperSrc = readSrc("src", "lib", "workbench-ai-job-stale-cleanup.ts");

// ── 0. 단가 ───────────────────────────────────────────────────────────────
// 화면 안내(402 폴백 · 편당 크레딧 뱃지)와 서버 청구·환불이 같은 상수를 봐야 한다.
check("PASSAGE_AUTHORING 단가는 양의 정수", Number.isInteger(UNIT) && UNIT > 0);
check("PASSAGE_AUTHORING 단가 = 2 (표시·청구·환불 공통)", UNIT === 2);

// ── 1. run-job 계산식 소스 잠금 ───────────────────────────────────────────
const RUNJOB_LOCKS: Array<[string, string]> = [
  ["성공 편수 집계", 'const success = items.filter((i) => i.status === "OK").length;'],
  ["실패 편수 = 전체 - 성공", "const failed = items.length - success;"],
  ["실패가 0편이면 환불 호출 없음", "if (failed > 0) {"],
  ["부분 환불액 = 단가 × 실패 편수", "CREDIT_COSTS.PASSAGE_AUTHORING * failed,"],
  ["환불 사유 문구(원장 대조용)", "AI 지문 생성 실패 \${failed}편 환불"],
  ["중단 경로: 미인도 = 요청 - 완성", "const unpaid = count - succeeded;"],
  ["중단 경로: 미인도 0이면 환불 없음", "if (unpaid > 0) {"],
  ["중단 환불액 = 단가 × 미인도 편수", "CREDIT_COSTS.PASSAGE_AUTHORING * unpaid,"],
  ["중단 환불 사유 문구", "AI 지문 생성 중단 \${unpaid}편 환불"],
  ["환불 실패는 잡에 표식을 남긴다", "await markRefundNeedsCheck(jobId);"],
];
for (const [name, snippet] of RUNJOB_LOCKS) {
  check("run-job 소스 잠금: " + name, runJobSrc.includes(snippet));
}
// 전액 환불로 되돌아가는(=인도분까지 돌려주는) 회귀를 문면으로도 막는다.
check(
  "run-job: 요청 편수 전체를 곱한 환불식이 없다",
  !/PASSAGE_AUTHORING \\* count/.test(runJobSrc) &&
    !/PASSAGE_AUTHORING \\* request\\.count/.test(runJobSrc),
);

// ── 2. run-job 금액표 ─────────────────────────────────────────────────────
// 정상 종결 경로: 실패 f편 × 단가.
function settleRefund(count: number, okCount: number) {
  const failed = count - okCount;
  return failed > 0 ? UNIT * failed : 0;
}
// 중단(catch) 경로: 완성되지 못한 편수 × 단가.
function abortRefund(count: number, succeeded: number) {
  const unpaid = count - succeeded;
  return unpaid > 0 ? UNIT * unpaid : 0;
}

const CASES: Array<{ count: number; ok: number; refund: number }> = [
  { count: 1, ok: 0, refund: 2 },
  { count: 1, ok: 1, refund: 0 },
  { count: 2, ok: 1, refund: 2 },
  { count: 3, ok: 0, refund: 6 },
  { count: 6, ok: 0, refund: 12 },
  { count: 6, ok: 1, refund: 10 },
  { count: 6, ok: 4, refund: 4 },
  { count: 6, ok: 5, refund: 2 },
  { count: 6, ok: 6, refund: 0 },
];
for (const c of CASES) {
  const charged = UNIT * c.count;
  const refunded = settleRefund(c.count, c.ok);
  check(
    \`부분 환불 \${c.count}편 중 \${c.ok}편 성공 → \${c.refund}크레딧\`,
    refunded === c.refund,
  );
  // 불변식 셋 — 금액표를 고쳐도 이 셋은 깨지면 안 된다.
  check(\`환불액 ≤ 청구액 (\${c.count}/\${c.ok})\`, refunded <= charged);
  check(\`순 과금 = 단가 × 인도 편수 (\${c.count}/\${c.ok})\`, charged - refunded === UNIT * c.ok);
  check(\`환불액 음수 없음 (\${c.count}/\${c.ok})\`, refunded >= 0);
}
// 전편 실패 = 전액.
for (const count of [1, 2, 3, 4, 5, 6]) {
  check(\`전편 실패(\${count}편)는 전액 환불\`, settleRefund(count, 0) === UNIT * count);
}
// 중단 경로도 같은 규칙(이미 저장된 편은 사용자가 그대로 쓴다 → 환불 대상 아님).
check("중단: 6편 중 2편 완성 → 8크레딧", abortRefund(6, 2) === 8);
check("중단: 전편 미완성 → 전액 12크레딧", abortRefund(6, 0) === 12);
check("중단: 전편 완성 → 환불 없음", abortRefund(6, 6) === 0);
check("중단: 순 과금 = 단가 × 완성 편수", UNIT * 6 - abortRefund(6, 2) === UNIT * 2);

// ── 3. 리퍼(stale-cleanup) 계산식 소스 잠금 ───────────────────────────────
const REAPER_LOCKS: Array<[string, string]> = [
  ["단위 과금 판정: 단가 유효성", "if (!Number.isFinite(unit) || unit <= 0) return null;"],
  ["단위 과금 판정: 요청 편수 유효성", "if (!Number.isFinite(requestedCount) || requestedCount <= 0) return null;"],
  ["단위 과금 판정: 청구액 == 단가 × 요청 편수", "return Math.abs(chargedAmount) === unit * requestedCount ? unit : null;"],
  ["부분 환불은 편당 과금 도메인 + 인도분이 있을 때만", "if (isPerUnitDeliveryDomain(job.domain) && job.successCount > 0) {"],
  ["미인도 = max(0, 요청 - 성공)", "const undelivered = Math.max(0, job.requestedCount - job.successCount);"],
  ["전부 인도됐으면 환불 자체를 건너뛴다", "if (undelivered === 0) return false;"],
  ["환불액 = 단가 × 미인도", "costOverride = unit * undelivered;"],
  ["편당 과금 도메인은 지문 생성 하나뿐", "return domain === AI_PASSAGE_AUTHORING_JOB_DOMAIN;"],
  ["인도분이 있으면 FAILED 가 아니라 PARTIAL/COMPLETED 로 마감", 'status: undelivered === 0 ? "COMPLETED" : "PARTIAL",'],
  ["마감 시 failedCount = 미인도 편수", "failedCount: undelivered,"],
];
for (const [name, snippet] of REAPER_LOCKS) {
  check("리퍼 소스 잠금: " + name, reaperSrc.includes(snippet));
}

// ── 4. 리퍼 금액·마감표 ───────────────────────────────────────────────────
function unitPriceIfPerUnitCharge(
  unit: number,
  chargedAmount: number,
  requestedCount: number,
): number | null {
  if (!Number.isFinite(unit) || unit <= 0) return null;
  if (!Number.isFinite(requestedCount) || requestedCount <= 0) return null;
  return Math.abs(chargedAmount) === unit * requestedCount ? unit : null;
}
/** null costOverride = refundCredits 기본값(=원 거래 잔여 전액). */
function staleRefundPlan(job: {
  perUnitDomain: boolean;
  requested: number;
  success: number;
  charged: number;
}) {
  let costOverride: number | null = null;
  if (job.perUnitDomain && job.success > 0) {
    const unit = unitPriceIfPerUnitCharge(UNIT, job.charged, job.requested);
    if (unit !== null) {
      const undelivered = Math.max(0, job.requested - job.success);
      if (undelivered === 0) return { refunds: false, costOverride: null };
      costOverride = unit * undelivered;
    }
  }
  return { refunds: true, costOverride };
}
function staleJobClose(job: { perUnitDomain: boolean; requested: number; success: number }) {
  const delivered = job.perUnitDomain && job.success > 0 && job.requested > 0;
  const undelivered = Math.max(0, job.requested - job.success);
  return delivered
    ? { status: undelivered === 0 ? "COMPLETED" : "PARTIAL", failedCount: undelivered }
    : { status: "FAILED", failedCount: 1 };
}

check("단위 과금 판정: 12 == 2×6 → 단가 2", unitPriceIfPerUnitCharge(UNIT, -12, 6) === UNIT);
check("단위 과금 판정: 부호 무관(abs)", unitPriceIfPerUnitCharge(UNIT, 12, 6) === UNIT);
check("단위 과금 판정: 금액 불일치 → null(전액 환불로 폴백)", unitPriceIfPerUnitCharge(UNIT, -10, 6) === null);
check("단위 과금 판정: 요청 0편 → null", unitPriceIfPerUnitCharge(UNIT, -12, 0) === null);
check("단위 과금 판정: 요청 음수 → null", unitPriceIfPerUnitCharge(UNIT, -12, -6) === null);
check("단위 과금 판정: NaN 요청 → null", unitPriceIfPerUnitCharge(UNIT, -12, NaN) === null);
check("단위 과금 판정: 단가 0 → null", unitPriceIfPerUnitCharge(0, 0, 6) === null);

// 편당 과금 도메인 + 인도분 있음 → 미인도분만 환불
const partial = staleRefundPlan({ perUnitDomain: true, requested: 6, success: 4, charged: -12 });
check("리퍼 부분 환불: 6편 중 4편 인도 → 4크레딧", partial.refunds && partial.costOverride === 4);
check("리퍼 부분 환불: 인도분은 환불되지 않는다", 12 - (partial.costOverride ?? 0) === UNIT * 4);

const allDelivered = staleRefundPlan({ perUnitDomain: true, requested: 6, success: 6, charged: -12 });
check("리퍼: 전부 인도됐으면 환불하지 않는다", allDelivered.refunds === false);
check("리퍼: 전부 인도 시 마감 상태 COMPLETED", staleJobClose({ perUnitDomain: true, requested: 6, success: 6 }).status === "COMPLETED");

const nothingDelivered = staleRefundPlan({ perUnitDomain: true, requested: 6, success: 0, charged: -12 });
check("리퍼: 인도 0편이면 전액 환불(costOverride 없음)", nothingDelivered.refunds && nothingDelivered.costOverride === null);
check("리퍼: 인도 0편이면 FAILED 마감", staleJobClose({ perUnitDomain: true, requested: 6, success: 0 }).status === "FAILED");

const oddCharge = staleRefundPlan({ perUnitDomain: true, requested: 6, success: 4, charged: -10 });
check("리퍼: 청구액이 단가×편수와 어긋나면 전액 환불로 되돌린다", oddCharge.refunds && oddCharge.costOverride === null);

const otherDomain = staleRefundPlan({ perUnitDomain: false, requested: 6, success: 4, charged: -12 });
check("리퍼: 다른 도메인은 기존 전액 환불 정책 그대로", otherDomain.refunds && otherDomain.costOverride === null);
check("리퍼: 다른 도메인은 마감 상태도 건드리지 않는다", staleJobClose({ perUnitDomain: false, requested: 6, success: 4 }).status === "FAILED");

for (const success of [1, 2, 3, 4, 5]) {
  const plan = staleRefundPlan({ perUnitDomain: true, requested: 6, success, charged: -12 });
  const close = staleJobClose({ perUnitDomain: true, requested: 6, success });
  check(\`리퍼 6편/인도 \${success}편: 환불 \${UNIT * (6 - success)}크레딧\`, plan.costOverride === UNIT * (6 - success));
  check(\`리퍼 6편/인도 \${success}편: PARTIAL + failedCount \${6 - success}\`, close.status === "PARTIAL" && close.failedCount === 6 - success);
  check(\`리퍼 6편/인도 \${success}편: 환불액 ≤ 청구액\`, (plan.costOverride ?? 0) <= UNIT * 6);
}

console.log(JSON.stringify({ passed, failures }));
`;

test("passage-authoring partial refund contract", () => {
  const tmpDir = path.join(repoRoot, "tests", ".tmp-passage-authoring");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".refund-harness.mts");
  let raw;
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(harnessPath, { force: true });
  }
  const lines = raw.trim().split(/\r?\n/);
  const result = JSON.parse(lines[lines.length - 1]);
  assert.deepEqual(result.failures, [], `실패한 검증: ${result.failures.join(", ")}`);
  assert.ok(result.passed > 50, `검증 수가 비정상적으로 적습니다: ${result.passed}`);
});
