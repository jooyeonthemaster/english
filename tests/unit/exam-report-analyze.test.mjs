import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// v3 analyze 계약 검증 — D1-a poison-parse 방어(FAILED 항목 라운드트립 보존) +
// D2 재과금 방지(computeRunPlan: FAILED 문항만 무료) + 환불액 aiMeta 영속화.
// TS + `@/...` 앨리어스라 tsx 하니스로 JSON 요약을 뽑는다(grading/read 테스트 미러).
const harnessSource = `
import schemasMod from "@/lib/exam-report/schemas";
import routeHelpersMod from "@/app/api/exam-report/analyses/[id]/analyze/_lib/route-helpers";
const { parseExamAnalysisResult, questionAnalysisSchema, parseExamAiMeta } = schemasMod;
const { computeRunPlan } = routeHelpersMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}

// OK 항목 저장본 형태(분석 필드 채워짐).
function ok(number) {
  return {
    number, analysisStatus: "OK", typeLabel: "빈칸추론", difficulty: 3,
    difficultyRationale: "r", explanation: "해설", intent: "의도", examPoint: "포인트",
    keyConcepts: ["k"], solvingStrategy: "s",
  };
}
// FAILED 항목 저장본 형태(failedAnalysis 산출 — 분석 필드 빈 문자열).
function failed(number) {
  return {
    number, analysisStatus: "FAILED", typeLabel: "", difficulty: 3,
    difficultyRationale: "", explanation: "", intent: "", examPoint: "",
    keyConcepts: [], solvingStrategy: "",
  };
}
function q(number, order) {
  return { number, order, kind: "MC", points: 5, typeLabel: "t", brief: "b" };
}

// ── D1-a: FAILED 항목이 배열 전체 파스를 무너뜨리지 않는다 ──
// 빈 explanation/intent/examPoint 를 가진 FAILED 항목이 섞여도 OK 항목은 보존되고
// FAILED 항목도 유지된다(구 스키마는 min(1) 거부 → 전체 null → 누적 OK 소실).
const poisoned = { perQuestion: [ok("1"), ok("2"), failed("3"), ok("4")], examLevel: null };
const parsed = parseExamAnalysisResult(poisoned);
check("D1a: 전체 null 로 리셋되지 않음", parsed !== null);
check("D1a: OK 항목 3개 + FAILED 1개 = 4개 보존", parsed && parsed.perQuestion.length === 4);
check("D1a: OK 항목 상태 보존", parsed && parsed.perQuestion.filter((p) => p.analysisStatus === "OK").length === 3);
check("D1a: FAILED 항목 유지", parsed && parsed.perQuestion.some((p) => p.number === "3" && p.analysisStatus === "FAILED"));
check("D1a: OK 항목 해설 보존", parsed && parsed.perQuestion.find((p) => p.number === "1").explanation === "해설");

// FAILED 항목 단독 파스도 성공(safeParse) — 구 스키마는 실패했다.
const failedParse = questionAnalysisSchema.safeParse(failed("9"));
check("D1a: FAILED 항목 단독 safeParse 성공", failedParse.success === true);
const okParse = questionAnalysisSchema.safeParse(ok("9"));
check("D1a: OK 항목 단독 safeParse 성공", okParse.success === true);
// 진짜 손상 항목(number 공백)은 드롭 — 나머지 보존.
const withCorrupt = { perQuestion: [ok("1"), { analysisStatus: "OK", number: "" }, ok("2")], examLevel: null };
const parsed2 = parseExamAnalysisResult(withCorrupt);
check("D1a: 손상 항목만 드롭 + 나머지 보존", parsed2 && parsed2.perQuestion.length === 2);
// prior 부재(null) → null 유지(첫 실행 판별 계약).
check("D1a: null 입력 → null", parseExamAnalysisResult(null) === null);
check("D1a: perQuestion 없는 객체 → null", parseExamAnalysisResult({ foo: 1 }) === null);

// ── D1-a 라운드트립: JSON 직렬화 후에도 보존(DB Json 경계 시뮬레이션) ──
const roundTrip = parseExamAnalysisResult(JSON.parse(JSON.stringify(poisoned)));
check("D1a: JSON 라운드트립 후 4개 보존", roundTrip && roundTrip.perQuestion.length === 4);

// ── D2: computeRunPlan 재과금 방지 ──
const questions = [q("1", 1), q("2", 2), q("3", 3)];

// 첫 실행(prior 없음) → max(15,N) 청구.
const first = computeRunPlan({ questions, prior: null });
check("D2: 첫 실행 isFirstRun", first.isFirstRun === true);
check("D2: 첫 실행 cost = max(15,3) = 15", first.cost === 15);

// 전량 FAILED 저장본을 파스(D1a 로 보존) → 전체 재실행은 무료(FAILED 문항만).
const allFailedPrior = parseExamAnalysisResult({
  perQuestion: [failed("1"), failed("2"), failed("3")], examLevel: null,
});
check("D2: 전량 FAILED prior 파스 보존(누락 없음)", allFailedPrior.perQuestion.length === 3);
const retryAll = computeRunPlan({ questions, prior: allFailedPrior });
check("D2: 전량 FAILED 재실행 = 무료(cost 0)", retryAll.cost === 0);
check("D2: 전량 FAILED 재실행 isFirstRun=false", retryAll.isFirstRun === false);
check("D2: 전량 FAILED 재실행 attempted=3", retryAll.attemptedKeys.length === 3);
check("D2: 전량 FAILED 재실행 freeKeys=3", retryAll.freeKeys.length === 3);

// 일부 OK + 일부 FAILED → 전체 재실행은 FAILED 만 시도, 그마저 무료.
const mixedPrior = parseExamAnalysisResult({
  perQuestion: [ok("1"), failed("2"), ok("3")], examLevel: null,
});
const retryMixed = computeRunPlan({ questions, prior: mixedPrior });
check("D2: 혼합 prior 전체 재실행 attempted=FAILED 1개", retryMixed.attemptedKeys.length === 1);
check("D2: 혼합 prior FAILED 재시도 무료", retryMixed.cost === 0);

// 문항단위(requestedNumbers): 사전 FAILED = 무료.
const targetFailed = computeRunPlan({ questions, prior: mixedPrior, requestedNumbers: ["2"] });
check("D2: 사전 FAILED 문항 지정 재분석 무료", targetFailed.cost === 0);
// 문항단위: 이미 OK 인 문항 강제 재분석 = 재과금(1). "전체 재실행 재과금" 경로.
const targetOk = computeRunPlan({ questions, prior: mixedPrior, requestedNumbers: ["1"] });
check("D2: OK 문항 강제 재분석 재과금(cost 1)", targetOk.cost === 1);
check("D2: OK 문항 강제 재분석 free 아님", targetOk.freeKeys.length === 0);

// ── D2④: paidFullRun 이중과금 차단(전체 재개에서 미시도 문항 무료) ──
// prior 에 항목이 아예 없는 문항(중단으로 미시도) — paidFullRun 미지정이면 기존 동작 불변.
const partialPrior = parseExamAnalysisResult({ perQuestion: [ok("1")], examLevel: null });
const resumeNoFlag = computeRunPlan({ questions, prior: partialPrior });
check("D2④: paidFullRun 미지정 → 미시도 2문항 과금(기존 동작 불변)", resumeNoFlag.cost === 2);
check("D2④: paidFullRun 미지정 freeKeys=0", resumeNoFlag.freeKeys.length === 0);
// paidFullRun=true → 미시도 문항도 freeKeys 포함(cost 0) — 첫 실행 max(15,N)에 이미 포함.
const resumePaid = computeRunPlan({ questions, prior: partialPrior, paidFullRun: true });
check("D2④: paidFullRun 전체 재개 무료(cost 0)", resumePaid.cost === 0);
check("D2④: paidFullRun 미시도 2문항 freeKeys 포함", resumePaid.freeKeys.length === 2);
check("D2④: paidFullRun attempted 는 동일(미시도 2)", resumePaid.attemptedKeys.length === 2);
// paidFullRun + 사전 FAILED 혼합 → FAILED 무료 규칙과 공존(전부 무료).
const resumePaidMixed = computeRunPlan({ questions, prior: mixedPrior, paidFullRun: true });
check("D2④: paidFullRun + FAILED 혼합도 무료", resumePaidMixed.cost === 0);
// 문항단위 강제 재분석(이미 OK)은 paidFullRun 이어도 재과금(기존 규칙 불변).
const resumePaidForce = computeRunPlan({
  questions, prior: mixedPrior, requestedNumbers: ["1"], paidFullRun: true,
});
check("D2④: paidFullRun 이어도 OK 강제 재분석은 과금(cost 1)", resumePaidForce.cost === 1);
// prior 소실(체크포인트 0) + paidFullRun → 첫 실행 판정이어도 재과금 없음.
const firstPaid = computeRunPlan({ questions, prior: null, paidFullRun: true });
check("D2④: prior 소실 + paidFullRun → 재과금 없음(cost 0)", firstPaid.cost === 0);
check("D2④: prior 소실 + paidFullRun 도 isFirstRun 판정 유지", firstPaid.isFirstRun === true);

// ── D2⑤: 문항단위(requestedNumbers)도 paidFullRun 미시도 무료(이중과금 차단) ──
// 28문항 전액과금 후 중단 → 미시도 문항 {numbers:["2"]} 지정 재분석이 1cr 추가
// 청구되던 결함(검수 MEDIUM) — prior 부재(미시도) 문항은 freeKeys 처리.
const targetUntriedPaid = computeRunPlan({
  questions, prior: partialPrior, requestedNumbers: ["2"], paidFullRun: true,
});
check("D2⑤: paidFullRun 문항단위 미시도 무료(cost 0)", targetUntriedPaid.cost === 0);
check("D2⑤: paidFullRun 문항단위 미시도 freeKeys=1", targetUntriedPaid.freeKeys.length === 1);
// paidFullRun 미지정이면 문항단위 미시도는 기존대로 과금(기존 동작 불변).
const targetUntriedNoFlag = computeRunPlan({
  questions, prior: partialPrior, requestedNumbers: ["2"],
});
check("D2⑤: paidFullRun 미지정 문항단위 미시도 과금(cost 1, 불변)", targetUntriedNoFlag.cost === 1);
// prior OK 문항 강제 재분석은 paidFullRun 이어도 과금(기존 테스트 고정 계약) —
// D2④ resumePaidForce 에서 이미 단언, 여기서는 freeKeys 미포함만 재확인.
check("D2⑤: paidFullRun OK 강제 재분석 freeKeys 미포함", resumePaidForce.freeKeys.length === 0);

// ── D2/D2③: refundedCredits aiMeta 영속화(파스 라운드트립으로 노출) ──
const meta = parseExamAiMeta({ model: "m", refundedCredits: 15, runStartedAt: 123, synthFailures: 1 });
check("D2③: refundedCredits aiMeta 통과", meta.refundedCredits === 15);
const metaNone = parseExamAiMeta({ model: "m" });
check("D2③: refundedCredits 미기록 → undefined", metaNone.refundedCredits === undefined);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-report-analyze-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const summary = runHarness();

test("exam-report analyze(v3): D1-a poison-parse 방어 + D2 재과금/환불/paidFullRun 계약", () => {
  assert.equal(summary.failed, 0, `analyze failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 32, `expected ≥32 checks, got ${summary.passed}`);
});
