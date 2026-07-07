import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// grading.ts 순수 채점 로직 계약 검증 — TS + `@/...` 앨리어스라 tsx 하니스로
// 실행해 JSON 요약을 뽑는다(subject-scope-where.test.mjs 하니스 패턴 미러).
const harnessSource = `
import gradingMod from "@/lib/exam-report/grading";
const {
  normalizeResponses,
  deriveStatusFromChoice,
  computeScoreSummary,
  computeDataLevel,
  clampEarnedPoints,
  carryStudentAnswers,
} = gradingMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);

function q(number, order, kind, points, correctAnswer) {
  return { number, order, kind, points, questionText: "Q" + number, correctAnswer };
}
const structureA = {
  questions: [
    q("1", 1, "MC", 5, "3"),
    q("2", 2, "MC", 5, "2"),
    q("3", 3, "MC", 5, "4"),
    q("4", 4, "MC", 5, "1"),
    q("5", 5, "SHORT", 10, "recall"),
  ],
  sharedPassages: [],
  totalPoints: null,
};
const r = (number, status, extra = {}) => ({ number, status, source: "MANUAL", reviewed: true, ...extra });

// ── normalizeResponses ──
const norm = normalizeResponses(structureA, [
  r("2", "WRONG", { chosenChoice: "3" }),
  r("999", "CORRECT"), // 구조에 없는 응답 → 폐기
]);
check("normalize: 전 문항 길이 = 구조 문항 수", norm.length === 5);
check("normalize: order 정렬", json(norm.map((x) => x.number)) === json(["1", "2", "3", "4", "5"]));
check("normalize: 구조에 없는 응답 폐기", !norm.some((x) => x.number === "999"));
check("normalize: 누락 문항 = UNKNOWN/MANUAL/reviewed:false(판독 프리필 보존)", (() => {
  const one = norm.find((x) => x.number === "1");
  return one.status === "UNKNOWN" && one.source === "MANUAL" && one.reviewed === false;
})());
check("normalize: 기존 응답 보존", norm.find((x) => x.number === "2").chosenChoice === "3");

// ── deriveStatusFromChoice ──
check("derive: 정답 일치 → CORRECT", deriveStatusFromChoice(structureA.questions[0], "3") === "CORRECT");
check("derive: 원형숫자 정규화 대조", deriveStatusFromChoice(structureA.questions[0], "③") === "CORRECT");
check("derive: 불일치 → WRONG", deriveStatusFromChoice(structureA.questions[0], "2") === "WRONG");
check("derive: correctAnswer 없음 → UNKNOWN", deriveStatusFromChoice({ number: "x", order: 9, kind: "MC", points: 1, questionText: "" }, "1") === "UNKNOWN");

// ── computeScoreSummary (전부 배점 존재) ──
const summA = computeScoreSummary(structureA, [
  r("1", "CORRECT"),
  r("2", "WRONG", { chosenChoice: "3" }),
  r("3", "WRONG", { chosenChoice: "1" }),
  r("4", "CORRECT"),
  r("5", "PARTIAL", { earnedPoints: 6 }),
]);
check("score: correctCount", summA.correctCount === 2);
check("score: wrongCount", summA.wrongCount === 2);
check("score: partialCount", summA.partialCount === 1);
check("score: unknownCount", summA.unknownCount === 0);
check("score: totalScore = 5+5+6", summA.totalScore === 16);
check("score: maxScore = 전 문항 배점 합", summA.maxScore === 30);
check("score: extras 미전달 classAverage null", summA.classAverage === null);

// ── computeScoreSummary (채점된 배점 null → totalScore/maxScore null) ──
const structureC = {
  questions: [q("1", 1, "MC", null, "1"), q("2", 2, "MC", 5, "2")],
  sharedPassages: [],
  totalPoints: 10,
};
const summC = computeScoreSummary(structureC, [r("1", "CORRECT"), r("2", "WRONG")]);
check("score: 채점된 배점 null → totalScore null", summC.totalScore === null);
check("score: 채점된 배점 null → maxScore null", summC.maxScore === null);
check("score: 카운트는 여전히 계산", summC.correctCount === 1 && summC.wrongCount === 1);

// maxScore 폴백: 배점 일부 null 이지만 그 문항이 UNKNOWN(미채점) → totalPoints 폴백
const summCUnknown = computeScoreSummary(structureC, [r("2", "WRONG")]);
check("score: 미채점 null배점 → maxScore=totalPoints 폴백", summCUnknown.maxScore === 10);

// ── earnedPoints 클램프 (만점 초과·음수 총점 오염 방지) ──
// 5번(배점 10)에 만점 초과 30 → 10 으로 캡, 음수는 0 으로 바닥.
const summClampOver = computeScoreSummary(structureA, [
  r("1", "CORRECT"),
  r("5", "PARTIAL", { earnedPoints: 30 }),
]);
check("score: 부분점수 만점 초과 → 배점으로 캡", summClampOver.totalScore === 5 + 10);
const summClampNeg = computeScoreSummary(structureA, [
  r("5", "PARTIAL", { earnedPoints: -5 }),
]);
check("score: 부분점수 음수 → 0 으로 바닥", summClampNeg.totalScore === 0);

const clamped = clampEarnedPoints(structureA, [
  r("5", "PARTIAL", { earnedPoints: 30 }),
  r("1", "PARTIAL", { earnedPoints: -2 }),
  r("2", "CORRECT", { earnedPoints: 99 }),
]);
check("clamp: 만점 초과 → 배점", clamped.find((x) => x.number === "5").earnedPoints === 10);
check("clamp: 음수 → 0", clamped.find((x) => x.number === "1").earnedPoints === 0);
check("clamp: PARTIAL 아니면 불변", clamped.find((x) => x.number === "2").earnedPoints === 99);

// ── carryStudentAnswers (E2 판독 병합의 학생 답 원문 승계 — 결함 수리) ──
// 판독행(AUTO)은 studentAnswer 를 만들지 않으므로 병합 교체 후 prior 에서 승계돼야 한다.
const carryPrior = [
  { number: "1", status: "CORRECT", source: "MANUAL", reviewed: true, chosenChoice: "3" },
  { number: "5", status: "UNKNOWN", source: "MANUAL", reviewed: false, studentAnswer: "recall memory" },
];
const carryMergedIn = [
  { number: "1", status: "WRONG", source: "AUTO", reviewed: false, chosenChoice: "5" },
  { number: "5", status: "UNKNOWN", source: "AUTO", reviewed: false, aiRead: { writtenAnswer: "recal memo" } },
];
const carried = carryStudentAnswers(carryPrior, carryMergedIn);
check("carry: merged 에 없고 prior 에 있으면 승계", carried[1].studentAnswer === "recall memory");
check("carry: 승계 시 타 필드 불변(aiRead/status/source 유지)",
  carried[1].aiRead.writtenAnswer === "recal memo" && carried[1].status === "UNKNOWN" && carried[1].source === "AUTO");
check("carry: prior 에도 없으면 그대로(발명 금지)", carried[0].studentAnswer === undefined);

// merged 가 이미 studentAnswer 를 가지면 prior 값으로 되돌리지 않는다.
const carriedKeep = carryStudentAnswers(
  [{ number: "5", status: "UNKNOWN", source: "MANUAL", reviewed: false, studentAnswer: "old" }],
  [{ number: "5", status: "UNKNOWN", source: "AUTO", reviewed: false, studentAnswer: "new" }],
);
check("carry: merged 가 이미 가지면 유지", carriedKeep[0].studentAnswer === "new");

// prior null/undefined → merged 불변(동일 참조 반환).
const carryBase = [{ number: "1", status: "UNKNOWN", source: "AUTO", reviewed: false }];
check("carry: prior null → merged 그대로", carryStudentAnswers(null, carryBase) === carryBase);
check("carry: prior undefined → merged 그대로", carryStudentAnswers(undefined, carryBase) === carryBase);

// numberKey(공백 제거) 매칭 — "서답형 3" ↔ "서답형3" 동일 문항으로 승계.
const carriedKey = carryStudentAnswers(
  [{ number: "서답형 3", status: "UNKNOWN", source: "MANUAL", reviewed: false, studentAnswer: "supplies" }],
  [{ number: "서답형3", status: "UNKNOWN", source: "AUTO", reviewed: false }],
);
check("carry: numberKey 공백 제거 매칭", carriedKey[0].studentAnswer === "supplies");

// ── computeDataLevel ──
const rich = computeDataLevel(structureA, [
  r("2", "WRONG", { chosenChoice: "3" }),
  r("3", "WRONG", { chosenChoice: "1" }),
  r("5", "PARTIAL", { earnedPoints: 6 }),
]);
check("dataLevel: WRONG MC 선지 100% + 서술형 earnedPoints → RICH", rich === "RICH");

const withChoices = computeDataLevel(structureA, [
  r("2", "WRONG", { chosenChoice: "3" }),
  r("3", "WRONG", { chosenChoice: "1" }),
]);
check("dataLevel: WRONG MC 선지 100% (서술형/반평균 없음) → WITH_CHOICES", withChoices === "WITH_CHOICES");

const statusOnly = computeDataLevel(structureA, [r("2", "WRONG"), r("3", "WRONG")]);
check("dataLevel: WRONG MC 선지 0% → STATUS_ONLY", statusOnly === "STATUS_ONLY");

const noWrongMc = computeDataLevel(structureA, [r("1", "CORRECT"), r("4", "CORRECT")]);
check("dataLevel: WRONG MC 0개 → STATUS_ONLY (과대평가 금지)", noWrongMc === "STATUS_ONLY");

const richByAvg = computeDataLevel(
  structureA,
  [r("2", "WRONG", { chosenChoice: "3" }), r("3", "WRONG", { chosenChoice: "1" })],
  { classAverage: 72 },
);
check("dataLevel: WITH_CHOICES + classAverage → RICH", richByAvg === "RICH");

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-report-grading-harness.mts");
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

test("exam-report grading: 순수 채점 로직 계약", () => {
  assert.equal(summary.failed, 0, `grading failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 28, `expected ≥28 checks, got ${summary.passed}`);
});
