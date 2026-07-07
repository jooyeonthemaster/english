import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// v3 판독 계약 검증 — examMap zod 드리프트 흡수 + E2 판독 zod + mergeReadIntoResponses.
// TS + `@/...` 앨리어스라 tsx 하니스로 JSON 요약을 뽑는다(grading 테스트 패턴 미러).
const harnessSource = `
import schemasMod from "@/lib/exam-report/schemas";
import gradingMod from "@/lib/exam-report/grading";
import routeHelpersMod from "@/app/api/exam-report/analyses/[id]/analyze/_lib/route-helpers";
const {
  examMapEntrySchema, examMapExtractionSchema, examMapSchema,
  questionAnalysisBatchSchema, studentReadLlmSchema, parseReadState,
} = schemasMod;
const { mergeReadIntoResponses, carryStudentAnswers } = gradingMod;
const { mergeAnswersIntoExamMap } = routeHelpersMod;

const failures = [];
let passed = 0;
function check(name, cond) {
  if (cond) passed += 1;
  else failures.push(name);
}
const json = (v) => JSON.stringify(v);

// ── examMapEntrySchema 드리프트 흡수 ──
const e1 = examMapEntrySchema.parse({
  number: 1, order: "1번", kind: "서술형", points: "5점",
  typeLabel: "영작", brief: "다음을 영작", correctAnswer: "recall", answerConfidence: "높음",
});
check("entry: number 문자열화", e1.number === "1");
check("entry: order 숫자 추출", e1.order === 1);
check("entry: kind 한글→ESSAY", e1.kind === "ESSAY");
check("entry: points 3점형→숫자", e1.points === 5);
check("entry: answerConfidence 높음→HIGH", e1.answerConfidence === "HIGH");
check("entry: 서답 correctAnswer 원문 보존", e1.correctAnswer === "recall");

// MC 정답 원형숫자 → "1".."5" 정규화(kind 아는 객체 레벨 transform)
const e2 = examMapEntrySchema.parse({
  number: "3", order: 3, kind: "MC", points: 3, typeLabel: "빈칸", brief: "b",
  correctAnswer: "③", answerConfidence: "확실",
});
check("entry: MC 원형숫자 정답→3", e2.correctAnswer === "3");
check("entry: answerConfidence 확실→HIGH", e2.answerConfidence === "HIGH");

// answerConfidence 미상/누락 → MEDIUM
const e3 = examMapEntrySchema.parse({
  number: "4", order: 4, kind: "MC", points: 2, typeLabel: "어법", brief: "b",
  answerConfidence: "글쎄",
});
check("entry: answerConfidence 불명→MEDIUM", e3.answerConfidence === "MEDIUM");
check("entry: correctAnswer 누락→undefined", e3.correctAnswer === undefined);

// ── examMapExtractionSchema (E1a, 구조만 — v3.1 정답 미포함, pageCount 없음) ──
// E1a 는 문제를 풀지 않는다: correctAnswer/answerConfidence 를 넣어도 스키마가 버린다.
const ext = examMapExtractionSchema.parse({
  questions: [
    { number: "1", order: 1, kind: "MC", points: 3, typeLabel: "t", brief: "b", correctAnswer: "④", answerConfidence: "HIGH" },
  ],
  totalPoints: "100점",
});
check("extract: totalPoints 100점→100", ext.totalPoints === 100);
check("extract: E1a 는 정답을 담지 않음(구조만)",
  ext.questions[0].correctAnswer === undefined && ext.questions[0].answerConfidence === undefined);

// ── questionAnalysisBatchSchema (E1b, 정답 도출 포함 — v3.1) ──
const batch = questionAnalysisBatchSchema.parse({
  analyses: [
    { number: "1", typeLabel: "빈칸추론", correctAnswer: "④", answerConfidence: "높음",
      difficulty: 3, explanation: "e", intent: "i", examPoint: "p", keyConcepts: ["k"], solvingStrategy: "s" },
    { number: "2", typeLabel: "어법", difficulty: 2, explanation: "e", intent: "i", examPoint: "p" },
  ],
});
check("batch: correctAnswer 파싱(정규화는 엔진 buildAnswer)", batch.analyses[0].correctAnswer === "④");
check("batch: answerConfidence 높음→HIGH", batch.analyses[0].answerConfidence === "HIGH");
check("batch: 정답/확신도 누락→undefined",
  batch.analyses[1].correctAnswer === undefined && batch.analyses[1].answerConfidence === undefined);

// ── examMapSchema (DB, pageCount catch(0)) ──
const dbMap = examMapSchema.parse({
  questions: [{ number: "1", order: 1, kind: "MC", points: 3, typeLabel: "t", brief: "b", answerConfidence: "LOW" }],
  totalPoints: null,
});
check("dbMap: pageCount 누락→0", dbMap.pageCount === 0);
check("dbMap: answerConfidence LOW 보존", dbMap.questions[0].answerConfidence === "LOW");

// ── studentReadLlmSchema (E2) 드리프트 흡수 ──
const read = studentReadLlmSchema.parse({
  responses: [
    { number: "1", status: "정답아님", chosenChoice: "④", confidence: "높음", evidence: "굵게 표시" },
    { number: "2", status: "UNKNOWN", confidence: "낮음" },
    { number: "서답형 3", status: "PARTIAL", writtenAnswer: "supplies", earnedPoints: "2점", confidence: "MEDIUM" },
  ],
  uncertainties: [{ number: "2", question: "표시가 모호합니다", kind: "MC" }],
});
check("read: status 미상→UNKNOWN catch", read.responses[0].status === "UNKNOWN");
check("read: chosenChoice ④→4", read.responses[0].chosenChoice === "4");
check("read: confidence 높음→HIGH", read.responses[0].confidence === "HIGH");
check("read: confidence 낮음→LOW", read.responses[1].confidence === "LOW");
check("read: earnedPoints 2점→2", read.responses[2].earnedPoints === 2);
check("read: uncertainties 파싱", read.uncertainties.length === 1 && read.uncertainties[0].kind === "MC");

// uncertainties 누락 → catch([])
const read2 = studentReadLlmSchema.parse({ responses: [] });
check("read: uncertainties 누락→[]", json(read2.uncertainties) === json([]));

// ── parseReadState 드리프트/폴백 ──
const rs = parseReadState({ status: "READ", readRuns: 2, uncertainties: [{ number: "1", question: "q", kind: "MC" }] });
check("readState: status READ", rs.status === "READ" && rs.readRuns === 2);
const rsBad = parseReadState({ status: "?!", readRuns: "x" });
check("readState: 잘못된 status→NONE catch", rsBad.status === "NONE");
check("readState: 잘못된 readRuns→0 catch", rsBad.readRuns === 0);
const rsNull = parseReadState(null);
check("readState: null→기본값", rsNull.status === "NONE" && json(rsNull.uncertainties) === json([]));

// ── mergeReadIntoResponses ──
// 강사 확정(reviewed:true)은 재판독으로 덮지 않고 보존, 미확정은 신선한 판독으로 교체.
const existing = [
  { number: "1", status: "CORRECT", source: "MANUAL", reviewed: true, chosenChoice: "3" },  // 강사 확정
  { number: "2", status: "WRONG", source: "AUTO", reviewed: false, chosenChoice: "1" },       // 미확정 프리필
  { number: "3", status: "UNKNOWN", source: "AUTO", reviewed: false },                        // 미확정
];
const fresh = [
  { number: "1", status: "WRONG", source: "AUTO", reviewed: false, chosenChoice: "5", aiRead: { confidence: "LOW" } },  // 무시돼야
  { number: "2", status: "CORRECT", source: "AUTO", reviewed: false, chosenChoice: "2", aiRead: { confidence: "HIGH" } },
  { number: "3", status: "WRONG", source: "AUTO", reviewed: false, chosenChoice: "4", aiRead: { confidence: "HIGH" } },
];
const merged = mergeReadIntoResponses(existing, fresh);
check("merge: 기준집합=fresh 길이", merged.length === 3);
check("merge: 강사확정(reviewed) 보존", merged[0].status === "CORRECT" && merged[0].chosenChoice === "3" && merged[0].reviewed === true);
check("merge: 미확정은 신선한 판독으로 교체", merged[1].status === "CORRECT" && merged[1].chosenChoice === "2" && merged[1].reviewed === false);
check("merge: 미확정 UNKNOWN→신선한 판독", merged[2].status === "WRONG" && merged[2].aiRead.confidence === "HIGH");

// existing 없음 → fresh 그대로
const mergedNew = mergeReadIntoResponses(null, fresh);
check("merge: existing 없으면 fresh 그대로", mergedNew.length === 3 && mergedNew[0].status === "WRONG");

// ── merge → carryStudentAnswers 조합(read 라우트/클라 재병합과 동일 순서) ──
// 결함 수리 검증: 학생 링크 제출(reviewed:false MANUAL, studentAnswer 원문)이 판독행
// (AUTO, studentAnswer 미생성)으로 교체돼도 답 원문이 소실되지 않고 승계된다.
const linkExisting = [
  { number: "서답형 4", status: "UNKNOWN", source: "MANUAL", reviewed: false, studentAnswer: "I have been" },
];
const linkFresh = [
  { number: "서답형 4", status: "UNKNOWN", source: "AUTO", reviewed: false, aiRead: { writtenAnswer: "I hav been" } },
];
const linkCarried = carryStudentAnswers(linkExisting, mergeReadIntoResponses(linkExisting, linkFresh));
check("merge+carry: 학생 링크 제출 studentAnswer 원문 생존", linkCarried[0].studentAnswer === "I have been");
check("merge+carry: 판독행 필드(aiRead/source) 유지",
  linkCarried[0].source === "AUTO" && linkCarried[0].aiRead.writtenAnswer === "I hav been");

// ── mergeAnswersIntoExamMap (E1b 정답 → examMap 병합, v3.1) ──
const dbExamMap = {
  questions: [
    { number: "1", order: 1, kind: "MC", points: 3, typeLabel: "t", brief: "b" },                              // E1a 직후(정답 없음)
    { number: "2", order: 2, kind: "MC", points: 3, typeLabel: "t", brief: "b", correctAnswer: "2", answerConfidence: "HIGH" }, // 강사 인라인(비-attempted)
    { number: "서답형 3", order: 3, kind: "ESSAY", points: 5, typeLabel: "영작", brief: "b" },
  ],
  totalPoints: 11,
  pageCount: 2,
};
const answers = [
  { number: "1", correctAnswer: "4", answerConfidence: "HIGH" },
  { number: "서답형3", correctAnswer: "recall", answerConfidence: "MEDIUM" }, // numberKey 정규화 대조
];
const mergedMap = mergeAnswersIntoExamMap({ dbExamMap, answers, attemptedKeys: new Set(["1", "서답형3"]) });
check("mergeAnswers: attempted 정답 병합", mergedMap.questions[0].correctAnswer === "4" && mergedMap.questions[0].answerConfidence === "HIGH");
check("mergeAnswers: 비-attempted(강사 편집) 불가침", mergedMap.questions[1].correctAnswer === "2" && mergedMap.questions[1].answerConfidence === "HIGH");
check("mergeAnswers: numberKey 정규화로 서답형 병합", mergedMap.questions[2].correctAnswer === "recall");
check("mergeAnswers: 배점/유형 등 타 필드 보존", mergedMap.questions[0].points === 3 && mergedMap.questions[2].kind === "ESSAY");

// 정답 미도출(배치 실패) → 기존 정답 보존 + 확신도만 갱신
const merged2 = mergeAnswersIntoExamMap({
  dbExamMap,
  answers: [{ number: "2", correctAnswer: undefined, answerConfidence: "LOW" }],
  attemptedKeys: new Set(["2"]),
});
check("mergeAnswers: 미도출 시 기존 정답 보존+확신도 갱신", merged2.questions[1].correctAnswer === "2" && merged2.questions[1].answerConfidence === "LOW");

// answers 비면 원본 그대로 반환
const merged3 = mergeAnswersIntoExamMap({ dbExamMap, answers: [], attemptedKeys: new Set(["1"]) });
check("mergeAnswers: answers 비면 원본 반환", merged3 === dbExamMap);

// dbExamMap null → null
check("mergeAnswers: examMap null → null", mergeAnswersIntoExamMap({ dbExamMap: null, answers, attemptedKeys: new Set() }) === null);

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-report-read-harness.mts");
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

test("exam-report read(v3): examMap/판독 zod 드리프트 + mergeReadIntoResponses 병합/보존", () => {
  assert.equal(summary.failed, 0, `read failures: ${JSON.stringify(summary.failures)}`);
  assert.ok(summary.passed >= 28, `expected ≥28 checks, got ${summary.passed}`);
});
