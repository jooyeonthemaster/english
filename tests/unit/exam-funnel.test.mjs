// 시험 분석 목록 행 퍼널 계산(src/lib/exam-report/funnel.ts) 계약 단위 테스트
// (docs/exam-analysis-v4-spec.md §2.1). tsx 하네스 관용구(exam-next-step 테스트와 동일):
// TS 모듈을 임시 하네스에서 import 해 JSON 으로 찍고 여기서 단정한다.
//
// 검증 축:
//  1. depth — INTERNAL 은 examLevel 유무로 SHALLOW/DEEP, 비INTERNAL 은 ANALYZED&&examLevel 만 DEEP.
//  2. boost 스냅샷 — progress 우선·boostedCount 폴백·형태 이상은 null·RUNNING 좀비는 FAILED 강등.
//  3. 게이트 — 문항 0 은 닫힘·0/0(승계로 열리지 않음), mapConfirmedNumbers ∩ 지도, 레거시 승계.
//  4. 학생 집계는 summarizeFunnelStudents 산식 그대로(제출 증거 = 답안 제출 또는 앱 응시).
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as m from "@/lib/exam-report/funnel";
const mod: any = (m as any).default ?? (m as any)["module.exports"] ?? m;
const { computeFunnel, readBoostSnapshot, computeDepth, BOOST_STALE_MS } = mod;

const NOW = 1_800_000_000_000;
function student(over: Record<string, any> = {}) {
  return Object.assign({ gradingConfirmed: false, reportStatus: "NONE", shareEnabled: false,
    answerToken: null, answerEnabled: false, answerSubmittedAt: null,
    examSubmissionId: null }, over);
}
function base(over: Record<string, any> = {}) {
  return Object.assign({
    status: "ANALYZED", sourceType: "INTERNAL", questionNumbers: ["1", "2", "3"],
    reviewState: {}, hasExamLevel: false, boostRaw: undefined, students: [], now: NOW,
  }, over);
}

const cases: Record<string, any> = {};
cases.staleMs = BOOST_STALE_MS;
// depth
cases.internalShallow = computeFunnel(base());
cases.internalDeep = computeFunnel(base({ hasExamLevel: true }));
cases.externalAnalyzedDeep = computeFunnel(base({ sourceType: "IMAGE", hasExamLevel: true }));
cases.externalAnalyzedShallow = computeFunnel(base({ sourceType: "IMAGE", hasExamLevel: false }));
cases.externalDraftWithLevel = computeFunnel(base({ sourceType: "IMAGE", status: "DRAFT", hasExamLevel: true }));
cases.depthNullSource = computeDepth({ status: "ANALYZED", sourceType: null, hasExamLevel: true });
// boost
cases.boostNone = readBoostSnapshot(undefined, NOW);
cases.boostGarbage = readBoostSnapshot({ status: "WEIRD", startedAt: 1 }, NOW);
cases.boostRunningFresh = readBoostSnapshot({ status: "RUNNING", startedAt: NOW - 1000, progress: { completed: 8, total: 20 } }, NOW);
cases.boostRunningStale = readBoostSnapshot({ status: "RUNNING", startedAt: NOW - BOOST_STALE_MS, progress: { completed: 8, total: 20 } }, NOW);
cases.boostRunningNoProgress = readBoostSnapshot({ status: "RUNNING", startedAt: NOW }, NOW);
cases.boostDoneLegacy = readBoostSnapshot({ status: "DONE", startedAt: 5, boostedCount: 12 }, NOW);
cases.boostFailed = readBoostSnapshot({ status: "FAILED", startedAt: 5, progress: { completed: 20, total: 20 } }, NOW);
cases.boostDoneLegacyPartial = readBoostSnapshot({ status: "DONE", startedAt: 5, boostedCount: 9, failedNumbers: ["3", "7", "11"] }, NOW);
cases.boostDoneSynthFailed = readBoostSnapshot({ status: "DONE", startedAt: 5, progress: { completed: 5, total: 5 }, synthFailed: true }, NOW);
cases.boostFailedCharge = readBoostSnapshot({ status: "FAILED", startedAt: 5, error: "CHARGE_FAILED", progress: { completed: 0, total: 5 } }, NOW);
cases.boostFailedEmptyError = readBoostSnapshot({ status: "FAILED", startedAt: 5, error: "", synthFailed: false }, NOW);
cases.boostInFunnel = computeFunnel(base({ boostRaw: { status: "RUNNING", startedAt: NOW, progress: { completed: 1, total: 3 } } }));
// gate — 게이트 산식 자체는 비INTERNAL 로 검증한다(INTERNAL 은 아래 구조상 열림)
const ext = (over: Record<string, any> = {}) => base({ sourceType: "IMAGE", ...over });
cases.gateNoMap = computeFunnel(ext({ questionNumbers: [], students: [student(), student()] }));
cases.gateClosedPartial = computeFunnel(ext({ reviewState: { mapConfirmedNumbers: ["1", "3", "99"] } }));
cases.gateOpenAll = computeFunnel(ext({ reviewState: { mapConfirmedNumbers: ["1", "2", "3"] } }));
cases.gateGrandfathered = computeFunnel(ext({ students: [student()] }));
cases.gateLegacyFlag = computeFunnel(ext({ reviewState: { mapConfirmed: true } }));
// INTERNAL 은 reviewState 없이·학생 0 이어도 열림(SHARED #5 — report-bridge 는 reviewState 를 쓰지 않는다)
cases.gateInternalNoReview = computeFunnel(base({ reviewState: {}, students: [] }));
cases.gateInternalNoMap = computeFunnel(base({ questionNumbers: [], reviewState: {}, students: [] }));
// students
// 26-09-04 §16: 자체 시험지의 「제출됨」 증거는 examSubmissionId(앱 응시)다 —
// 「INTERNAL 이면 미채점 전부 needGrading」 특례는 폐기됐다(링크만 보낸 학생이
// 채점 필요로 둔갑하던 결함). 첫 학생은 응시 제출자로 둔다.
cases.studentsInternal = computeFunnel(base({ students: [student({ examSubmissionId: "sub1" }), student({ gradingConfirmed: true }), student({ gradingConfirmed: true, reportStatus: "GENERATED", shareEnabled: true })] }));
cases.studentsExternal = computeFunnel(base({ sourceType: "IMAGE", students: [student(), student({ answerEnabled: true, answerToken: "t" }), student({ answerEnabled: true, answerToken: "t", answerSubmittedAt: "2026" })] }));
console.log(JSON.stringify(cases));
`;

function runHarness() {
  const dir = path.join(repoRoot, ".tmp-unit-exam-funnel");
  mkdirSync(dir, { recursive: true });
  const harnessPath = path.join(dir, "harness.ts");
  writeFileSync(harnessPath, harnessSource);
  try {
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    const line = raw.trim().split("\n").pop();
    return JSON.parse(line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const R = runHarness();

test("depth — INTERNAL 은 examLevel 유무, 비INTERNAL 은 ANALYZED&&examLevel 만 DEEP", () => {
  assert.equal(R.internalShallow.depth, "SHALLOW");
  assert.equal(R.internalDeep.depth, "DEEP");
  assert.equal(R.externalAnalyzedDeep.depth, "DEEP");
  assert.equal(R.externalAnalyzedShallow.depth, "SHALLOW");
  assert.equal(R.externalDraftWithLevel.depth, "SHALLOW");
  assert.equal(R.depthNullSource, "DEEP");
  assert.equal(R.internalDeep.hasExamLevel, true);
});

test("boost 스냅샷 — progress 우선·폴백·좀비 강등·형태 이상 null", () => {
  assert.equal(R.staleMs, 360_000);
  assert.equal(R.boostNone, null);
  assert.equal(R.boostGarbage, null);
  assert.deepEqual(R.boostRunningFresh, { status: "RUNNING", startedAt: R.boostRunningFresh.startedAt, completed: 8, total: 20 });
  assert.equal(R.boostRunningStale.status, "FAILED");
  assert.equal(R.boostRunningStale.completed, 8);
  assert.deepEqual([R.boostRunningNoProgress.completed, R.boostRunningNoProgress.total], [0, 0]);
  assert.equal(R.boostDoneLegacy.status, "DONE");
  assert.equal(R.boostDoneLegacy.completed, 12);
  // progress 없는 구 DONE 이력 — total 은 boostedCount+failedNumbers 로 복원(12/0 금지).
  assert.equal(R.boostDoneLegacy.total, 12);
  assert.deepEqual([R.boostDoneLegacyPartial.completed, R.boostDoneLegacyPartial.total], [9, 12]);
  assert.equal(R.boostFailed.status, "FAILED");
  assert.equal(R.boostInFunnel.boost.status, "RUNNING");
  assert.equal(R.boostInFunnel.boost.completed, 1);
  assert.equal(R.boostInFunnel.boost.total, 3);
});

test("boost 추가 필드 — synthFailed·error·stale 는 해당할 때만 실린다", () => {
  assert.equal(R.boostDoneSynthFailed.status, "DONE");
  assert.equal(R.boostDoneSynthFailed.synthFailed, true);
  assert.equal(R.boostDoneSynthFailed.stale, undefined);
  assert.equal(R.boostFailedCharge.status, "FAILED");
  assert.equal(R.boostFailedCharge.error, "CHARGE_FAILED");
  assert.equal(R.boostFailedCharge.stale, undefined);
  assert.equal(R.boostRunningStale.stale, true);
  assert.equal(R.boostRunningStale.error, undefined);
  // 정상 RUNNING/FAILED 기록엔 세 키가 없다(boostRunningFresh 는 위 deepEqual 로 정확 형태 보장)
  assert.equal(R.boostFailed.stale, undefined);
  assert.equal(R.boostFailed.synthFailed, undefined);
});

test("게이트 — INTERNAL 은 구조상 열림(reviewState 없음·학생 0 이어도 open+grandfathered, confirmed=N)", () => {
  assert.equal(R.gateInternalNoReview.gateOpen, true);
  assert.equal(R.gateInternalNoReview.grandfathered, true);
  assert.equal(R.gateInternalNoReview.confirmedCount, 3);
  assert.equal(R.gateInternalNoReview.questionCount, 3);
  assert.equal(R.gateInternalNoMap.gateOpen, true);
  assert.equal(R.gateInternalNoMap.confirmedCount, 0);
  assert.equal(R.gateInternalNoMap.depth, "SHALLOW");
});

test("boost 추가 필드 — 빈 error·false synthFailed 는 키 자체 생략(클라 truthy 판정 오염 방지)", () => {
  assert.equal("error" in R.boostFailedEmptyError, false);
  assert.equal("synthFailed" in R.boostFailedEmptyError, false);
  assert.equal("stale" in R.boostRunningFresh, false);
  assert.equal("error" in R.boostDoneSynthFailed, false);
});

test("게이트 — 문항 0 은 닫힘·0/0(학생이 있어도 승계 안 함)", () => {
  assert.equal(R.gateNoMap.questionCount, 0);
  assert.equal(R.gateNoMap.gateOpen, false);
  assert.equal(R.gateNoMap.grandfathered, false);
  assert.equal(R.gateNoMap.confirmedCount, 0);
  assert.equal(R.gateNoMap.students.total, 2);
});

test("게이트 — mapConfirmedNumbers ∩ 지도 번호, 전부 확인이면 열림", () => {
  assert.equal(R.gateClosedPartial.confirmedCount, 2);
  assert.equal(R.gateClosedPartial.gateOpen, false);
  assert.equal(R.gateOpenAll.confirmedCount, 3);
  assert.equal(R.gateOpenAll.gateOpen, true);
  assert.equal(R.gateOpenAll.grandfathered, false);
});

test("게이트 — 레거시 승계(학생 有·일괄 확인 플래그)는 열림 + grandfathered", () => {
  assert.equal(R.gateGrandfathered.gateOpen, true);
  assert.equal(R.gateGrandfathered.grandfathered, true);
  assert.equal(R.gateGrandfathered.confirmedCount, 3);
  assert.equal(R.gateLegacyFlag.gateOpen, true);
  assert.equal(R.gateLegacyFlag.grandfathered, true);
});

test("학생 집계 — summarizeFunnelStudents 산식(제출 증거 2계 §16·배타 합 = total)", () => {
  const i = R.studentsInternal.students;
  assert.equal(i.total, 3);
  assert.equal(i.needLink, 0);
  assert.equal(i.needGrading, 1);
  assert.equal(i.needReport, 1);
  assert.equal(i.shared, 1);
  assert.equal(i.reportGenerated, 1);
  const e = R.studentsExternal.students;
  assert.equal(e.total, 3);
  assert.equal(e.needLink, 1);
  assert.equal(e.awaitingAnswer, 1);
  assert.equal(e.needGrading, 1);
  assert.equal(e.answerIssued, 2);
  assert.equal(e.answerSubmitted, 1);
  assert.equal(
    e.needLink + e.awaitingAnswer + e.needGrading + e.needReport + e.reportGenerating + e.needShare + e.shared,
    e.total,
  );
});
