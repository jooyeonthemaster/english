// wave5: 렌더-선지 정합 게이트 2종 — 26-07-05 final-std 스윕 실측 결함 재현 차단.
// ① 어법 isError 마커가 오류형 대신 정답형을 지문에 렌더((E) 'in which' vs 선지 'which')
// ② TSW cloze 퇴화 stem("The (A), (B)"만 남는 summaryWithBlanks)
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import quality from "@/lib/question-quality";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { RELAXED_BLOCKING_QUALITY_CODES } = generationConstants;

const passage =
  "Painters treated black and white as tools for shading. " +
  "There are many traditions to which these colors belong in art history.";

function grammarCase(renderedInner) {
  return validateQuestionQuality({
    typeId: "GRAMMAR_ERROR",
    question: {
      direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
      difficulty: "KILLER",
      passageWithMarkers:
        "Painters treated black and white as tools for shading. " +
        "There are many traditions __(E) " + renderedInner + "__ these colors belong in art history.",
      markedExpressions: [
        { label: "(E)", expression: "to which", errorExpression: "which", correction: "to which", isError: true, pointCode: "b", surroundingText: "There are many traditions to which these colors belong in art history" },
      ],
      options: [ { label: "(E)", text: "which" } ],
      correctAnswer: "(E)",
      explanation: "belong 뒤에는 전치사구가 필요하므로 which는 to which로 고쳐야 한다.",
    },
    passage,
    grammarMarkerCount: 1,
    grammarAnswerCount: 1,
  }).filter((i) => i.code === "grammar-marker-error-form-mismatch");
}

function tswCase(summaryWithBlanks) {
  return validateQuestionQuality({
    typeId: "TOPIC_SENTENCE_WRITING",
    question: {
      direction: "다음 글의 주제문을 완성하시오.",
      summaryWithBlanks,
      blanks: [
        { label: "(A)", answer: "red dominated" },
        { label: "(B)", answer: "other colors waited" },
      ],
      modelAnswer: "The red dominated early art, other colors waited for recognition.",
      explanation: "지문의 핵심을 요약한 주제문이다.",
    },
    passage,
  }).filter((i) => i.code === "tsw-cloze-degenerate-stem");
}

// SENTENCE_ORDER: 구두점 변형(― vs -, 곡선따옴표)만 다른 단락은 통과해야 하고
// 단어 재작성은 여전히 차단되어야 한다 (wave5 오탐 수정 검증).
const soPassage =
  "Black and white were treated as tools ― not colors ― by early painters. " +
  "Red held a “supreme” position in ancient art for centuries. " +
  "Other colors had to wait a long time before recognition arrived.";

function sentenceOrderCase(paraBText) {
  return validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question: {
      direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
      givenSentence: "Early painters had their own view of color.",
      paragraphs: [
        { label: "(A)", text: "Black and white were treated as tools - not colors - by early painters." },
        { label: "(B)", text: paraBText },
        { label: "(C)", text: "Other colors had to wait a long time before recognition arrived." },
      ],
      options: [
        { label: "①", text: "(A)-(B)-(C)" },
        { label: "②", text: "(B)-(A)-(C)" },
        { label: "③", text: "(B)-(C)-(A)" },
        { label: "④", text: "(C)-(A)-(B)" },
        { label: "⑤", text: "(C)-(B)-(A)" },
      ],
      correctAnswer: "①",
      explanation: "도구로서의 흑백 → 레드의 지위 → 다른 색의 인정 순서다.",
    },
    passage: soPassage,
  }).filter((i) => i.code.startsWith("sentence-order-paragraph-not-source-backed") || i.code === "sentence-order-answer-key-mismatch");
}

function summaryMcCase(summaryWithBlanks) {
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: {
      direction: "다음 글의 요약문 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
      summaryWithBlanks,
      options: [
        { label: "①", text: "dominant / delayed" },
        { label: "②", text: "minor / instant" },
        { label: "③", text: "dominant / instant" },
        { label: "④", text: "minor / delayed" },
        { label: "⑤", text: "neutral / delayed" },
      ],
      correctAnswer: "①",
      explanation: "레드의 지배적 지위와 다른 색의 늦은 인정을 요약한다.",
    },
    passage: soPassage,
  }).filter((i) => i.code === "summary-mc-stem-unterminated");
}

console.log(JSON.stringify({
  grammarMismatchBlocked: grammarCase("to which"),
  grammarMatchPass: grammarCase("which"),
  tswDegenerateBlocked: tswCase("The (A), (B)"),
  tswNormalPass: tswCase("In early art, (A) while (B) for recognition across cultures."),
  soPunctuationVariantPass: sentenceOrderCase("Red held a \\"supreme\\" position in ancient art for centuries."),
  soRewriteBlocked: sentenceOrderCase("Red kept an unmatched rank in ancient art for many years."),
  summaryUnterminatedBlocked: summaryMcCase("Red was (A) in early art, while recognition of other colors was the words for "),
  summaryTerminatedPass: summaryMcCase("Red was (A) in early art, while recognition of other colors was (B)."),
  relaxedGrammar: RELAXED_BLOCKING_QUALITY_CODES.has("grammar-marker-error-form-mismatch"),
  relaxedTsw: RELAXED_BLOCKING_QUALITY_CODES.has("tsw-cloze-degenerate-stem"),
  relaxedSummaryStem: RELAXED_BLOCKING_QUALITY_CODES.has("summary-mc-stem-unterminated"),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave5-render-integrity-harness.mts");
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

const result = runHarness();

test("grammar marker rendering the CORRECT form instead of errorExpression blocks", () => {
  assert.equal(result.grammarMismatchBlocked.length, 1, JSON.stringify(result.grammarMismatchBlocked));
  assert.equal(result.grammarMismatchBlocked[0].severity, "error");
});

test("grammar marker rendering errorExpression exactly passes", () => {
  assert.equal(result.grammarMatchPass.length, 0, JSON.stringify(result.grammarMatchPass));
});

test("TSW cloze degenerate stem blocks; normal stem passes", () => {
  assert.equal(result.tswDegenerateBlocked.length, 1, JSON.stringify(result.tswDegenerateBlocked));
  assert.equal(result.tswNormalPass.length, 0, JSON.stringify(result.tswNormalPass));
});

test("SENTENCE_ORDER punctuation variants pass; word rewrites still block", () => {
  assert.equal(result.soPunctuationVariantPass.length, 0, JSON.stringify(result.soPunctuationVariantPass));
  assert.ok(result.soRewriteBlocked.length >= 1, JSON.stringify(result.soRewriteBlocked));
});

test("SUMMARY_COMPLETE_MC unterminated stem blocks; terminated passes", () => {
  assert.equal(result.summaryUnterminatedBlocked.length, 1, JSON.stringify(result.summaryUnterminatedBlocked));
  assert.equal(result.summaryTerminatedPass.length, 0, JSON.stringify(result.summaryTerminatedPass));
});

test("all wave5 codes block in relaxed mode", () => {
  assert.equal(result.relaxedGrammar, true);
  assert.equal(result.relaxedTsw, true);
  assert.equal(result.relaxedSummaryStem, true);
});
