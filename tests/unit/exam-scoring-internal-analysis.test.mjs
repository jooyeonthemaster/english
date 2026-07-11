import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// exam-report 어댑터(internal-analysis) 계약 검증 — TS + `@/` 앨리어스라 tsx 하니스
// (exam-scoring-engine.test.mjs 패턴 미러). 핵심 계약:
//  - kind 매핑(SINGLE/MULTI→MC, TEXT→SHORT, MANUAL→ESSAY)·brief 정답 힌트 부재.
//  - 복수정답/확장 토큰 correctAnswer 가 parseExamMap 라운드트립에서 오염되지 않는다.
//  - 정직 합성: 해설 없으면 FAILED(플레이스홀더 금지), 있으면 OK 가 저장 파스를 생존.
//  - toStudentResponses: NEEDS_REVIEW→UNKNOWN·manualStatus 최우선·미입력=UNKNOWN·
//    computeScoreSummary 정합(부분점수 포함).
const harnessSource = `
import internalMod from "@/lib/exam-scoring/internal-analysis";
import gradingMod from "@/lib/exam-report/grading";
import schemasMod from "@/lib/exam-report/schemas";
const { buildInternalStructure, buildInternalAnalysis, toStudentResponses } =
  internalMod as unknown as typeof import("@/lib/exam-scoring/internal-analysis");
const { computeScoreSummary } =
  gradingMod as unknown as typeof import("@/lib/exam-report/grading");
const { parseExamMap, parseExamAnalysisResult } =
  schemasMod as unknown as typeof import("@/lib/exam-report/schemas");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const opts = (n: number, labelOf: (i: number) => string = (i) => String(i + 1)) =>
  Array.from({ length: n }, (_, i) => ({ label: labelOf(i), text: "text " + (i + 1) }));

// ── 픽스처: 4문항 시험지(단일선택·복수정답·서답형 2필드·자유영작) ──
const items = [
  {
    questionId: "q2", orderNum: 2, points: 5,
    question: {
      id: "q2", type: "MULTIPLE_CHOICE", subType: "GRAMMAR_ERROR",
      questionText: "다음 밑줄 친 부분 중 어법상 틀린 것을 모두 고르시오.",
      options: opts(7, (i) => "(" + "ABCDEFG"[i] + ")"),
      correctAnswer: "(B), (D)",
      structuredData: { correctAnswers: ["(B)", "(D)"] },
      difficulty: "INTERMEDIATE",
      tags: null,
      explanation: null, // 해설 없음 → 분석 FAILED(정직 미분석)
    },
  },
  {
    questionId: "q1", orderNum: 1, points: 4,
    question: {
      id: "q1", type: "MULTIPLE_CHOICE", subType: "BLANK_INFERENCE",
      questionText: "본문 전문...",
      options: opts(5, (i) => "①②③④⑤"[i]),
      correctAnswer: "3",
      structuredData: {
        correctAnswer: "3",
        direction: "다음 글의 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
        wrongOptionExplanations: { "2": "부분 일치 함정입니다." },
      },
      difficulty: "KILLER",
      tags: JSON.stringify(["빈칸", "추론", "연결사", "대조", "여분태그"]),
      explanation: {
        content: "<p>역접 연결어 뒤에서 <b>대조</b> 논지가 강화됩니다.</p>",
        keyPoints: JSON.stringify(["역접 연결어 뒤 주장 강화"]),
        wrongOptionExplanations: JSON.stringify({ "1": "도입부 소재 반복 함정입니다." }),
      },
    },
  },
  {
    questionId: "q3", orderNum: 3, points: 6,
    question: {
      id: "q3", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE",
      questionText: "요약문을 완성하시오.",
      structuredData: {
        direction: "다음 글을 읽고 요약문의 빈칸을 완성하시오.",
        blanks: [
          { label: "(A)", answer: "diversity" },
          { label: "(B)", answer: "resilience" },
        ],
      },
      difficulty: "BASIC",
      tags: JSON.stringify(["요약"]),
      explanation: { content: "핵심어는 다양성과 회복력입니다.", keyPoints: null, wrongOptionExplanations: null },
    },
  },
  {
    questionId: "q4", orderNum: 4, points: 10,
    question: {
      id: "q4", type: "ESSAY", subType: "CONDITIONAL_WRITING",
      questionText: "조건에 맞게 영작하시오." + "가".repeat(100), // 80자 클램프 검증용 장문
      structuredData: { modelAnswer: "If I had known, I would have helped." },
      difficulty: null,
      tags: null,
      explanation: null,
    },
  },
];

const structure = buildInternalStructure({
  exam: { title: "중간 대비 1회", totalPoints: 100 },
  items, // 의도적으로 미정렬(2,1,3,4) — 정렬 계약 검증
});

// ── 1) 구조: kind 매핑·number/order·정답·확신도 ──
const byNumber = new Map(structure.questions.map((q) => [q.number, q]));
const s1 = byNumber.get("1")!;
const s2 = byNumber.get("2")!;
const s3 = byNumber.get("3")!;
const s4 = byNumber.get("4")!;
check("구조: orderNum 오름차순 정렬", JSON.stringify(structure.questions.map((q) => q.number)) === JSON.stringify(["1","2","3","4"]));
check("구조: SINGLE→MC", s1.kind === "MC" && s1.order === 1 && s1.points === 4);
check("구조: MULTI→MC", s2.kind === "MC");
check("구조: TEXT_MULTI→SHORT", s3.kind === "SHORT");
check("구조: MANUAL→ESSAY", s4.kind === "ESSAY");
check("구조: 단일 정답 숫자토큰 + HIGH", s1.correctAnswer === "3" && s1.answerConfidence === "HIGH");
check("구조: 복수 정답 원형 join", s2.correctAnswer === "②, ④");
check("구조: 서답형 모범답 요약(라벨 답)", s3.correctAnswer === "(A) diversity / (B) resilience");
check("구조: 자유영작 정답·확신도 생략", s4.correctAnswer === undefined && s4.answerConfidence === undefined);
check("구조: typeLabel 한글(공백 제거 관례)", s1.typeLabel === "빈칸추론" && s2.typeLabel === "어법판단");
check("구조: totalPoints = 배점 실합", structure.totalPoints === 25);

// ── 2) brief: 발문 1줄·80자 클램프·정답 힌트 부재 ──
check("brief: direction 우선", s1.brief === "다음 글의 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.");
check("brief: 80자 클램프", structure.questions.every((q) => q.brief.length <= 80) && s4.brief.length <= 80);
check("brief: 정답 힌트 부재(서답형 모범답 미포함)", !s3.brief.includes("diversity") && !s3.brief.includes("resilience"));
check("brief: 정답 힌트 부재(자유영작 모범답 미포함)", !s4.brief.includes("If I had known"));

// ── 3) parseExamMap 라운드트립 — normalizeMcAnswer 오염 회피 검증 ──
const roundTrip = parseExamMap(JSON.parse(JSON.stringify(structure)));
check("라운드트립: examMap 파스 성공", roundTrip != null);
const r1 = roundTrip?.questions.find((q) => q.number === "1");
const r2 = roundTrip?.questions.find((q) => q.number === "2");
check("라운드트립: 단일 정답 보존", r1?.correctAnswer === "3");
check("라운드트립: 복수 정답 비오염 보존", r2?.correctAnswer === "②, ④");

// ── 4) 분석: 정직 합성(OK/FAILED)·tags·난이도·함정 ──
const analysis = buildInternalAnalysis({ items });
const a1 = analysis.perQuestion.find((p) => p.number === "1")!;
const a2 = analysis.perQuestion.find((p) => p.number === "2")!;
const a3 = analysis.perQuestion.find((p) => p.number === "3")!;
check("분석: number 정렬 보장", JSON.stringify(analysis.perQuestion.map((p) => p.number)) === JSON.stringify(["1","2","3","4"]));
check("분석: 해설 있음 → OK", a1.analysisStatus === "OK");
check("분석: HTML 제거 해설", a1.explanation.includes("대조") && !a1.explanation.includes("<b>"));
check("분석: keyConcepts = tags 상한 4", JSON.stringify(a1.keyConcepts) === JSON.stringify(["빈칸","추론","연결사","대조"]));
check("분석: KILLER→5 / BASIC→2 / 미설정→3", a1.difficulty === 5 && a3.difficulty === 2 && analysis.perQuestion[3].difficulty === 3);
check("분석: intent/examPoint 합니다체 채움", a1.intent.endsWith("니다.") && a1.examPoint.endsWith("니다."));
check("분석: trapDesign 2소스 병합(해설 우선)", JSON.stringify(a1.trapDesign?.map((t) => t.choice)) === JSON.stringify(["1","2"]) && (a1.trapDesign?.[0].why.length ?? 0) > 0);
check("분석: 해설 없음 → FAILED(플레이스홀더 금지)", a2.analysisStatus === "FAILED" && a2.explanation === "" && a2.intent === "");
check("분석: FAILED 여도 typeLabel/keyConcepts 재료 유지", a2.typeLabel === "어법판단");
check("분석: examLevel 정직 null", analysis.examLevel === null);

// ── 5) parseExamAnalysisResult 라운드트립 — OK/FAILED 둘 다 생존 ──
const analysisRT = parseExamAnalysisResult(JSON.parse(JSON.stringify(analysis)));
check("라운드트립: 분석 전 문항 생존", analysisRT?.perQuestion.length === 4);
check("라운드트립: OK 유지", analysisRT?.perQuestion.find((p) => p.number === "1")?.analysisStatus === "OK");
check("라운드트립: FAILED 유지(드롭 금지)", analysisRT?.perQuestion.find((p) => p.number === "2")?.analysisStatus === "FAILED");

// ── 6) toStudentResponses: 상태 매핑·정규화·보존 ──
const snapshot = [
  { questionId: "q1", orderNum: 1, points: 4 },
  { questionId: "q2", orderNum: 2, points: 5 },
  { questionId: "q3", orderNum: 3, points: 6 },
  { questionId: "q4", orderNum: 4, points: 10 },
];
const submission = [
  { questionId: "q1", orderNum: 1, input: { choice: "③" }, result: { status: "CORRECT", earnedPoints: 4 } },
  { questionId: "q2", orderNum: 2, input: { choices: ["②", "④"] }, result: { status: "CORRECT", earnedPoints: 5 } },
  { questionId: "q3", orderNum: 3, input: { texts: { "(A)": "diversity", "(B)": "stability" } }, result: { status: "PARTIAL", earnedPoints: 3 } },
  { questionId: "q4", orderNum: 4, input: { texts: { answer: "If I knew it, I would help." } }, result: { status: "NEEDS_REVIEW", earnedPoints: null } },
  { questionId: "q-ghost", orderNum: 99, input: { choice: "1" }, result: { status: "CORRECT", earnedPoints: 1 } },
] as any;
const responses = toStudentResponses(submission, snapshot);
const rByNum = new Map(responses.map((r) => [r.number, r]));
check("응답: 스냅샷 밖 questionId 폐기", responses.length === 4 && !rByNum.has("99"));
check("응답: 자동 CORRECT → 동일 status + reviewed:true", rByNum.get("1")?.status === "CORRECT" && rByNum.get("1")?.reviewed === true);
check("응답: chosenChoice 정규화(③→3)", rByNum.get("1")?.chosenChoice === "3");
check("응답: MULTI chosenChoice ', ' join", rByNum.get("2")?.chosenChoice === "2, 4");
check("응답: PARTIAL earnedPoints 승계", rByNum.get("3")?.status === "PARTIAL" && rByNum.get("3")?.earnedPoints === 3);
check("응답: 서답형 studentAnswer '(라벨) 값' join", rByNum.get("3")?.studentAnswer === "(A) diversity / (B) stability");
check("응답: NEEDS_REVIEW → UNKNOWN + reviewed:false", rByNum.get("4")?.status === "UNKNOWN" && rByNum.get("4")?.reviewed === false);
check("응답: NEEDS_REVIEW 학생답 원문 보존(단일 필드는 값만)", rByNum.get("4")?.studentAnswer === "If I knew it, I would help.");
check("응답: source 전부 MANUAL", responses.every((r) => r.source === "MANUAL"));

// 미입력(input null)·응답 자체 부재 → UNKNOWN
const sparse = toStudentResponses(
  [{ questionId: "q1", orderNum: 1, input: null }] as any,
  snapshot,
);
check("응답: input null → UNKNOWN", sparse[0].status === "UNKNOWN" && sparse[0].reviewed === false);
check("응답: 응답 부재 문항 → UNKNOWN 기본행", sparse[3].status === "UNKNOWN" && sparse[3].number === "4");

// manualStatus 최우선 + manualEarnedPoints 클램프(배점 10 초과 12 → 10)
const manual = toStudentResponses(
  [
    { questionId: "q4", orderNum: 4, input: { texts: { answer: "..." } }, result: { status: "NEEDS_REVIEW", earnedPoints: null }, manualStatus: "PARTIAL", manualEarnedPoints: 12 },
    { questionId: "q1", orderNum: 1, input: null, manualStatus: "WRONG" },
  ] as any,
  snapshot,
);
const mByNum = new Map(manual.map((r) => [r.number, r]));
check("응답: manualStatus 가 NEEDS_REVIEW 를 이긴다", mByNum.get("4")?.status === "PARTIAL" && mByNum.get("4")?.reviewed === true);
check("응답: manualEarnedPoints [0,배점] 클램프", mByNum.get("4")?.earnedPoints === 10);
check("응답: 미입력도 manualStatus 우선(강사 판정)", mByNum.get("1")?.status === "WRONG" && mByNum.get("1")?.reviewed === true);

// ── 7) computeScoreSummary 정합(부분점수 포함) ──
const summary = computeScoreSummary(structure, responses);
check("점수: totalScore = 4+5+3(PARTIAL)", summary.totalScore === 12);
check("점수: maxScore = 25", summary.maxScore === 25);
check("점수: 카운트 분해", summary.correctCount === 2 && summary.partialCount === 1 && summary.unknownCount === 1);

// NEEDS_REVIEW 를 강사가 WRONG 확정하면 UNKNOWN 0 → gradingConfirmed 조건 성립
const confirmed = toStudentResponses(
  submission.slice(0, 4).map((r: any) =>
    r.questionId === "q4" ? { ...r, manualStatus: "WRONG" } : r,
  ),
  snapshot,
);
const confirmedSummary = computeScoreSummary(structure, confirmed);
check("점수: 수동확정 후 UNKNOWN 0(확정 게이트 성립)", confirmedSummary.unknownCount === 0 && confirmedSummary.totalScore === 12);
check("응답: 확정 후 전행 reviewed:true", confirmed.every((r) => r.reviewed === true));

console.log(JSON.stringify({ passed, failures }));
`;

test("exam-scoring internal-analysis — exam-report 어댑터 계약(kind 매핑·brief 무힌트·라운드트립 비오염·정직 합성·응답 변환·점수 정합)", () => {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-scoring-internal-analysis-harness.mts");
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
  const lastLine = raw.trim().split("\n").at(-1);
  const summary = JSON.parse(lastLine);
  assert.deepEqual(summary.failures, [], `실패 케이스: ${summary.failures?.join(" | ")}`);
  assert.ok(summary.passed >= 30, `통과 수 이상(${summary.passed})`);
});
