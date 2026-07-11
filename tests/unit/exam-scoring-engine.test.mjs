import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 통합 시험 채점 엔진(exam-scoring) 계약 검증 — TS + `@/` 앨리어스라 tsx 하니스
// (exam-report-answer-entry.test.mjs 패턴 미러). 핵심 계약:
//  - 선지 개수 가변(5~12)·복수정답·서답형 다중 필드·LEMMA 보수 강등이 전부 결정론.
//  - buildAnswerSpec 은 어떤 입력에도 throw 하지 않고 해석 불가 시 MANUAL_ONLY 강등.
//  - 미입력=UNKNOWN 은 호출자 몫 — gradeAnswer 는 오답/검토만 판정.
const harnessSource = `
import answerSpecMod from "@/lib/exam-scoring/answer-spec";
import gradeMod from "@/lib/exam-scoring/grade";
import normalizeMod from "@/lib/exam-scoring/normalize";
const { buildAnswerSpec } = answerSpecMod as unknown as typeof import("@/lib/exam-scoring/answer-spec");
const { gradeAnswer } = gradeMod as unknown as typeof import("@/lib/exam-scoring/grade");
const { normalizeChoiceTokenExtended, normalizeChoiceList, normalizeText } =
  normalizeMod as unknown as typeof import("@/lib/exam-scoring/normalize");

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const opts = (n: number, labelOf: (i: number) => string = (i) => String(i + 1)) =>
  Array.from({ length: n }, (_, i) => ({ label: labelOf(i), text: "text " + (i + 1) }));

// ── 정규화 축 ──
check("norm: ③ → 3", normalizeChoiceTokenExtended("③") === "3");
check("norm: ⑫ → 12", normalizeChoiceTokenExtended("⑫") === "12");
check("norm: (C) → 3", normalizeChoiceTokenExtended("(C)") === "3");
check("norm: (a) → 1", normalizeChoiceTokenExtended("(a)") === "1");
check("norm: '11' → 11", normalizeChoiceTokenExtended("11") === "11");
check("norm: 리스트 '(A), (C)' → [1,3]", JSON.stringify(normalizeChoiceList("(A), (C)")) === JSON.stringify(["1","3"]));
check("norm: 리스트 ['②','④'] → [2,4]", JSON.stringify(normalizeChoiceList(["②","④"])) === JSON.stringify(["2","4"]));
check("norm: 텍스트 스마트따옴표·말단구두점", normalizeText("  Don’t   give up! ") === "don't give up");

// ── 1) BLANK_INFERENCE 단일 5지 — 라벨 표기 불일치 흡수(① vs "1") ──
const blank = buildAnswerSpec({
  id: "q1", type: "MULTIPLE_CHOICE", subType: "BLANK_INFERENCE", points: 4,
  options: opts(5, (i) => "①②③④⑤"[i]),
  correctAnswer: "3",
  structuredData: { correctAnswer: "3" },
});
check("blank: SINGLE_CHOICE", blank.inputKind === "SINGLE_CHOICE");
check("blank: optionCount 5", blank.optionCount === 5);
check("blank: 정답 ③ 선택 → CORRECT 4점", (() => {
  const r = gradeAnswer(blank, { choice: "③" });
  return r.status === "CORRECT" && r.earnedPoints === 4;
})());
check("blank: ② 선택 → WRONG 0점", (() => {
  const r = gradeAnswer(blank, { choice: "②" });
  return r.status === "WRONG" && r.earnedPoints === 0;
})());

// ── 2) GRAMMAR_ERROR 복수정답 + 가변 7지 ──
const grammar = buildAnswerSpec({
  id: "q2", type: "MULTIPLE_CHOICE", subType: "GRAMMAR_ERROR", points: 5,
  options: opts(7, (i) => "(" + "ABCDEFG"[i] + ")"),
  correctAnswer: "(A), (C)",
  structuredData: { correctAnswers: ["(A)", "(C)"] },
});
check("grammar: MULTI_CHOICE", grammar.inputKind === "MULTI_CHOICE");
check("grammar: optionCount 7", grammar.optionCount === 7);
check("grammar: selectCount 2", grammar.selectCount === 2);
check("grammar: correctChoices [1,3]", JSON.stringify(grammar.correctChoices) === JSON.stringify(["1","3"]));
check("grammar: {①,③} → CORRECT", gradeAnswer(grammar, { choices: ["①","③"] }).status === "CORRECT");
check("grammar: {①} 부분선택 → WRONG(부분점수 없음)", gradeAnswer(grammar, { choices: ["①"] }).status === "WRONG");
check("grammar: {①,③,⑤} 초과선택 → WRONG", gradeAnswer(grammar, { choices: ["①","③","⑤"] }).status === "WRONG");

// ── 3) CONTENT_MATCH 12지 + 확장 토큰 ──
const content = buildAnswerSpec({
  id: "q3", type: "MULTIPLE_CHOICE", subType: "CONTENT_MATCH", points: 3,
  options: opts(12),
  correctAnswer: "11",
  structuredData: {},
});
check("content: optionCount 12", content.optionCount === 12);
check("content: '11' 선택 → CORRECT", gradeAnswer(content, { choice: "11" }).status === "CORRECT");
check("content: ⑪ 선택 → CORRECT(원형 12지)", gradeAnswer(content, { choice: "⑪" }).status === "CORRECT");

// ── 4) SENTENCE_INSERT 마커 정규화 ──
const insert = buildAnswerSpec({
  id: "q4", type: "MULTIPLE_CHOICE", subType: "SENTENCE_INSERT", points: 3,
  options: opts(5, (i) => "①②③④⑤"[i]),
  correctAnswer: "(C)",
  structuredData: {},
});
check("insert: (C)→3 정규화", JSON.stringify(insert.correctChoices) === JSON.stringify(["3"]));
check("insert: ③ → CORRECT", gradeAnswer(insert, { choice: "③" }).status === "CORRECT");

// ── 5) SUMMARY_COMPLETE 서답형 2필드 부분점수 ──
const summary = buildAnswerSpec({
  id: "q5", type: "SHORT_ANSWER", subType: "SUMMARY_COMPLETE", points: 6,
  structuredData: { blanks: [
    { label: "(A)", answer: "diversity" },
    { label: "(B)", answer: "resilience" },
  ]},
});
check("summary: TEXT_MULTI 2필드", summary.inputKind === "TEXT_MULTI" && summary.fields?.length === 2);
check("summary: 전부 정답 → CORRECT 6점", (() => {
  const r = gradeAnswer(summary, { texts: { "(A)": "Diversity", "(B)": " resilience. " } });
  return r.status === "CORRECT" && r.earnedPoints === 6;
})());
check("summary: 1/2 → PARTIAL 3점", (() => {
  const r = gradeAnswer(summary, { texts: { "(A)": "diversity", "(B)": "stability" } });
  return r.status === "PARTIAL" && r.earnedPoints === 3;
})());
check("summary: 0/2 → WRONG", gradeAnswer(summary, { texts: { "(A)": "x", "(B)": "y" } }).status === "WRONG");

// ── 6) SUMMARY_WRITING variants + LEMMA 보수 강등 ──
const writingVariants = buildAnswerSpec({
  id: "q6", type: "SHORT_ANSWER", subType: "SUMMARY_WRITING", points: 8,
  structuredData: { blanks: [
    { label: "(A)", answer: "gives up easily", acceptableVariants: ["easily gives up"], requiredLemmas: ["give", "up"] },
  ]},
});
check("writing: variants 일치 → CORRECT", gradeAnswer(writingVariants, { texts: { "(A)": "easily gives up" } }).status === "CORRECT");
check("writing: VARIANTS 모드 불일치 → WRONG", gradeAnswer(writingVariants, { texts: { "(A)": "quits fast" } }).status === "WRONG");

const writingLemma = buildAnswerSpec({
  id: "q7", type: "SHORT_ANSWER", subType: "SUMMARY_WRITING", points: 8,
  structuredData: { scoringMode: "LEMMA", blanks: [
    { label: "(A)", answer: "gives up easily", requiredLemmas: ["gives", "up"] },
  ]},
});
check("lemma: 정확 일치 → CORRECT", gradeAnswer(writingLemma, { texts: { "(A)": "gives up easily" } }).status === "CORRECT");
check("lemma: 표제어 전부 포함·불일치 → NEEDS_REVIEW(보수 강등)", (() => {
  const r = gradeAnswer(writingLemma, { texts: { "(A)": "he gives it up" } });
  return r.status === "NEEDS_REVIEW" && r.earnedPoints === null;
})());
check("lemma: 표제어 누락 → WRONG", gradeAnswer(writingLemma, { texts: { "(A)": "quits" } }).status === "WRONG");

const writingRubric = buildAnswerSpec({
  id: "q8", type: "SHORT_ANSWER", subType: "SUMMARY_WRITING", points: 8,
  structuredData: { scoringMode: "LLM_RUBRIC", blanks: [{ label: "(A)", answer: "x" }] },
});
check("rubric: LLM_RUBRIC → MANUAL_ONLY", writingRubric.inputKind === "MANUAL_ONLY");

// ── 7) GRAMMAR_CORRECTION 밑줄 구간 필드 ──
const correction = buildAnswerSpec({
  id: "q9", type: "SHORT_ANSWER", subType: "GRAMMAR_CORRECTION", points: 4,
  structuredData: { underlinedSegments: [
    { label: "(A)", isError: true, correctedPart: "have been" },
    { label: "(B)", isError: true, correctedPart: "which" },
  ]},
});
check("correction: 2필드", correction.fields?.length === 2);
check("correction: seg 키 안정", JSON.stringify(correction.fields?.map((f) => f.key)) === JSON.stringify(["seg-1","seg-2"]));
check("correction: 전부 정답 → CORRECT", gradeAnswer(correction, { texts: { "seg-1": "have been", "seg-2": "which" } }).status === "CORRECT");
check("correction: 1/2 → PARTIAL 2점", gradeAnswer(correction, { texts: { "seg-1": "have been", "seg-2": "who" } }).earnedPoints === 2);

// ── 8) 자유영작 → MANUAL_ONLY, 입력 있으면 NEEDS_REVIEW ──
const freeWriting = buildAnswerSpec({
  id: "q10", type: "SHORT_ANSWER", subType: "CONDITIONAL_WRITING", points: 10,
  structuredData: { modelAnswer: "If I had known, I would have helped." },
});
check("free: MANUAL_ONLY", freeWriting.inputKind === "MANUAL_ONLY");
check("free: 입력 → NEEDS_REVIEW·점수 null", (() => {
  const r = gradeAnswer(freeWriting, { texts: { answer: "If I knew..." } });
  return r.status === "NEEDS_REVIEW" && r.earnedPoints === null;
})());

// ── 9) 방어 강등 — throw 절대 금지 ──
check("방어: 정답 없음 → MANUAL_ONLY", buildAnswerSpec({
  id: "q11", type: "MULTIPLE_CHOICE", subType: "TITLE", points: 3,
  options: opts(5), correctAnswer: null, structuredData: null,
}).inputKind === "MANUAL_ONLY");
check("방어: 정답이 선지 범위 밖 → MANUAL_ONLY", buildAnswerSpec({
  id: "q12", type: "MULTIPLE_CHOICE", subType: "TITLE", points: 3,
  options: opts(5), correctAnswer: "7", structuredData: {},
}).inputKind === "MANUAL_ONLY");
check("방어: 미지 유형 + options → 폴백 단일선택", buildAnswerSpec({
  id: "q13", type: "MULTIPLE_CHOICE", subType: "CUSTOM_NEW_TYPE", points: 3,
  options: opts(4), correctAnswer: "②", structuredData: {},
}).inputKind === "SINGLE_CHOICE");
check("방어: 미지 유형 + options 없음 → MANUAL_ONLY", buildAnswerSpec({
  id: "q14", type: "ESSAY", subType: "UNKNOWN_TYPE", points: 3,
  structuredData: "not-json{{{",
}).inputKind === "MANUAL_ONLY");
check("방어: structuredData 문자열 JSON 파싱", buildAnswerSpec({
  id: "q15", type: "SHORT_ANSWER", subType: "FILL_BLANK_KEY", points: 2,
  structuredData: JSON.stringify({ answer: "in spite of" }),
}).inputKind === "TEXT_SINGLE");

// ── 10) WORD_ORDER 정규화 관대 비교 ──
const wordOrder = buildAnswerSpec({
  id: "q16", type: "SHORT_ANSWER", subType: "WORD_ORDER", points: 4,
  structuredData: { modelAnswer: "Not until yesterday did she realize the truth." },
});
check("wordOrder: 대소문자·말단 구두점 흡수 → CORRECT", gradeAnswer(wordOrder, {
  texts: { answer: "not until yesterday did she realize the truth" },
}).status === "CORRECT");

console.log(JSON.stringify({ passed, failures }));
`;

test("exam-scoring 엔진 — 26유형 대표 계약(가변 선지·복수정답·서답형 다중필드·LEMMA 보수 강등·방어 강등)", () => {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".exam-scoring-engine-harness.mts");
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
  assert.ok(summary.passed >= 40, `통과 수 이상(${summary.passed})`);
});
