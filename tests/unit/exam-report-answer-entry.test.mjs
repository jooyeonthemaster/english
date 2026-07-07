import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// answer-entry.ts 답안 링크 순수 로직 계약 검증 — TS + `@/...` 앨리어스라 tsx 하니스로
// 실행해 JSON 요약을 뽑는다(exam-report-grading.test.mjs 하니스 패턴 미러).
// 최우선 계약: buildAnswerSheet 산출물에 정답 계열 키 자체가 없어야 하고(누출 원천 차단),
// reviewed:true(강사 확정) 행은 applyAnswerSubmission 이 절대 건드리지 않는다.
const harnessSource = `
import answerEntryMod from "@/lib/exam-report/answer-entry";
const { buildAnswerSheet, applyAnswerSubmission } = answerEntryMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);

function q(number, order, kind, points, correctAnswer, answerConfidence) {
  const entry = { number, order, kind, points, typeLabel: "유형" + number, brief: "발문 " + number };
  if (correctAnswer != null) entry.correctAnswer = correctAnswer;
  if (answerConfidence != null) entry.answerConfidence = answerConfidence;
  return entry;
}
// order 를 일부러 뒤섞어 정렬 계약을 검증한다. "서술형 2" 류 공백 번호 포함.
const examMap = {
  questions: [
    q("3", 3, "MC", 5, "4", "HIGH"),
    q("1", 1, "MC", 5, "3", "HIGH"),
    q("2", 2, "MC", 5, undefined), // 정답 미도출(E1b 전) — UNKNOWN 파생 검증
    q("서술형 1", 4, "SHORT", 10, "recall", "MEDIUM"),
    q("서술형 2", 5, "ESSAY", 15, "모범답안 요약", "LOW"),
  ],
  totalPoints: 40,
  pageCount: 2,
};
const r = (number, status, extra = {}) => ({ number, status, source: "MANUAL", reviewed: false, ...extra });

// ── buildAnswerSheet: 정답 스트립(키 자체 부재) + order 정렬 ──
const sheet = buildAnswerSheet(examMap);
check("sheet: 전 문항 포함", sheet.length === 5);
check("sheet: order 오름차순", json(sheet.map((x) => x.order)) === json([1, 2, 3, 4, 5]));
check("sheet: correctAnswer 키 자체 부재", sheet.every((x) => !("correctAnswer" in x)));
check("sheet: answerConfidence 키 자체 부재", sheet.every((x) => !("answerConfidence" in x)));
check("sheet: 화이트리스트 6키만", sheet.every((x) => json(Object.keys(x).sort()) === json(["brief", "kind", "number", "order", "points", "typeLabel"])));
check("sheet: 메타 보존", (() => {
  const one = sheet.find((x) => x.number === "서술형 2");
  return one && one.kind === "ESSAY" && one.points === 15 && one.typeLabel === "유형서술형 2" && one.brief === "발문 서술형 2";
})());

// ── applyAnswerSubmission: MC 정오 파생 ──
const mc = applyAnswerSubmission({
  examMap,
  existing: null,
  entries: [
    { number: "1", choice: "3" }, // 정답 일치 → CORRECT
    { number: "3", choice: "2" }, // 불일치 → WRONG
    { number: "2", choice: "5" }, // correctAnswer 없음 → UNKNOWN
  ],
});
const byNum = (rs, n) => rs.find((x) => x.number === n);
check("mc: 정답 일치 → CORRECT", byNum(mc.responses, "1").status === "CORRECT");
check("mc: chosenChoice 기록", byNum(mc.responses, "1").chosenChoice === "3");
check("mc: 불일치 → WRONG", byNum(mc.responses, "3").status === "WRONG");
check("mc: 정답 부재 → UNKNOWN", byNum(mc.responses, "2").status === "UNKNOWN");
check("mc: applied = 3", mc.applied === 3);
check("mc: 적용 행 MANUAL/reviewed:false", ["1", "2", "3"].every((n) => {
  const row = byNum(mc.responses, n);
  return row.source === "MANUAL" && row.reviewed === false;
}));
check("mc: 미제출 문항 UNKNOWN 프리필 유지", byNum(mc.responses, "서술형 1").status === "UNKNOWN");
check("mc: 응답은 examMap 전 문항 order 정렬", json(mc.responses.map((x) => x.number)) === json(["1", "2", "3", "서술형 1", "서술형 2"]));

// ── reviewed:true(강사 확정) 행 절대 불변 ──
const reviewedRow = r("1", "WRONG", { reviewed: true, chosenChoice: "2", note: "강사 확정" });
const guard = applyAnswerSubmission({
  examMap,
  existing: [reviewedRow],
  entries: [
    { number: "1", choice: "3" }, // 확정 행 → 스킵 + skippedReviewed
    { number: "3", choice: "4" }, // 일반 행 → 적용
  ],
});
check("reviewed: 확정 행 status 불변", byNum(guard.responses, "1").status === "WRONG");
check("reviewed: 확정 행 chosenChoice 불변", byNum(guard.responses, "1").chosenChoice === "2");
check("reviewed: 확정 행 reviewed 유지", byNum(guard.responses, "1").reviewed === true);
check("reviewed: skippedReviewed 수집", json(guard.skippedReviewed) === json(["1"]));
check("reviewed: 확정 외 행은 정상 적용", byNum(guard.responses, "3").status === "CORRECT");
check("reviewed: applied 는 적용분만", guard.applied === 1);

// ── SHORT/ESSAY: studentAnswer 저장 + UNKNOWN + earnedPoints 초기화 ──
const essayPrior = r("서술형 1", "PARTIAL", { earnedPoints: 6, aiRead: { confidence: "LOW", writtenAnswer: "판독답" } });
const essay = applyAnswerSubmission({
  examMap,
  existing: [essayPrior],
  entries: [
    { number: "서술형 1", text: "  학생이 쓴 답  " },
    { number: "서술형 2", text: "에세이 답안" },
  ],
});
check("essay: studentAnswer trim 저장", byNum(essay.responses, "서술형 1").studentAnswer === "학생이 쓴 답");
check("essay: status UNKNOWN(자동채점 금지)", byNum(essay.responses, "서술형 1").status === "UNKNOWN");
check("essay: UNKNOWN 리셋 시 earnedPoints 초기화", byNum(essay.responses, "서술형 1").earnedPoints === undefined);
check("essay: 기존 aiRead 보존(정오표 대조 재료)", byNum(essay.responses, "서술형 1").aiRead?.writtenAnswer === "판독답");
check("essay: ESSAY 도 동일 적용", byNum(essay.responses, "서술형 2").studentAnswer === "에세이 답안");

// ── 500자 캡 ──
const long = applyAnswerSubmission({
  examMap,
  existing: null,
  entries: [{ number: "서술형 1", text: "가".repeat(800) }],
});
check("cap: 500자 캡", byNum(long.responses, "서술형 1").studentAnswer.length === 500);

// ── 빈 entry / 미존재 number 스킵 ──
const skips = applyAnswerSubmission({
  examMap,
  existing: [r("1", "UNKNOWN", { aiRead: { confidence: "HIGH", chosenChoice: "3" } })],
  entries: [
    { number: "1" },                    // choice/text 둘 다 없음 → 스킵(행 불변)
    { number: "서술형 1", text: "   " }, // 공백만 → 스킵
    { number: "999", choice: "1" },     // examMap 에 없는 번호 → 스킵
    { number: "1", choice: "6" },       // 비유효 선지 → 스킵(방어)
  ],
});
check("skip: applied 0", skips.applied === 0);
check("skip: 빈 entry 는 행 불변(aiRead 유지)", byNum(skips.responses, "1").aiRead?.chosenChoice === "3");
check("skip: 미존재 번호 발명 금지", !skips.responses.some((x) => x.number === "999"));
check("skip: skippedReviewed 비어있음", skips.skippedReviewed.length === 0);

// ── MC 적용 시 aiRead 보존 ──
const mcPreserve = applyAnswerSubmission({
  examMap,
  existing: [r("1", "CORRECT", { source: "AUTO", aiRead: { confidence: "MEDIUM", chosenChoice: "1" } })],
  entries: [{ number: "1", choice: "3" }],
});
check("mc-preserve: aiRead 보존", byNum(mcPreserve.responses, "1").aiRead?.chosenChoice === "1");
check("mc-preserve: source AUTO → MANUAL 전환", byNum(mcPreserve.responses, "1").source === "MANUAL");

// ── 공백 번호(numberKey) 조인 — "서술형1" 표기 드리프트 흡수 ──
const keyed = applyAnswerSubmission({
  examMap,
  existing: null,
  entries: [{ number: "서술형1", text: "공백 없는 표기" }],
});
check("numberKey: 공백 제거 조인 + examMap 번호로 저장", byNum(keyed.responses, "서술형 1").studentAnswer === "공백 없는 표기");

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-report-answer-entry-harness.mts");
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

test("exam-report answer-entry: 답안 링크 순수 로직 계약", () => {
  assert.equal(summary.failed, 0, `answer-entry failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 28, `expected ≥28 checks, got ${summary.passed}`);
});
