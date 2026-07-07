// Wave-1 스키마 순서 게이트 — 구조화 출력 모델은 스키마 프로퍼티 순서대로 필드를
// 생성하므로, MC 유형 전반이 "발문 → 콘텐츠 → 정답 → 오답해설 → 해설/keyPoints/
// tags/difficulty" 생성 순서를 갖는지 검증한다. 또한 BLANK_INFERENCE 의 설계-우선
// 필드 blankDesign(필수, direction 직후)과 후처리 제거 계약을 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import mc from "@/lib/question-ai-schemas-mc";
import pp from "@/lib/question-postprocess";

const {
  AI_QUESTION_SCHEMAS,
  aiBlankInferenceSchema,
  buildAiMultiBlankInferenceSchema,
  buildAiIrrelevantSchema,
  buildAiVocabChoiceSchema,
  buildAiSentenceInsertSchema,
  buildAiContentMatchSchema,
  buildAiGenericOptionCountSchema,
  getAiResponseSchema,
} = mc;
const { postProcessQuestion } = pp;

const REORDERED_TYPES = [
  "BLANK_INFERENCE", "SUMMARY_COMPLETE_MC", "IRRELEVANT", "SENTENCE_INSERT",
  "SENTENCE_ORDER", "VOCAB_CHOICE", "TITLE", "TOPIC", "MAIN_IDEA",
  "TOPIC_MAIN_IDEA", "IMPLIED_MEANING", "CONTENT_MATCH", "CONTEXT_MEANING",
  "SYNONYM", "ANTONYM", "REFERENCE",
];

const shapeKeys = (schema: any): string[] => Object.keys(schema.shape);
const unwrapResponse = (schema: any): string[] =>
  Object.keys(schema.shape.questions.element.shape);
const isRequired = (schema: any, key: string): boolean =>
  !schema.shape[key].safeParse(undefined).success;

const shapes: Record<string, string[]> = {};
for (const typeId of REORDERED_TYPES) {
  shapes[typeId] = shapeKeys(AI_QUESTION_SCHEMAS[typeId]);
}

const builders: Record<string, string[]> = {
  multiBlank2: shapeKeys(buildAiMultiBlankInferenceSchema(2)),
  multiBlank3: shapeKeys(buildAiMultiBlankInferenceSchema(3)),
  irrelevant7: shapeKeys(buildAiIrrelevantSchema(7)),
  vocabChoice8x2: shapeKeys(buildAiVocabChoiceSchema(8, 2)),
  sentenceInsert7: shapeKeys(buildAiSentenceInsertSchema(7)),
  contentMatch8x2: shapeKeys(buildAiContentMatchSchema(8, 2)),
  genericTitle6: shapeKeys(buildAiGenericOptionCountSchema("TITLE", 6, 1)),
  genericTopic6x2: shapeKeys(buildAiGenericOptionCountSchema("TOPIC", 6, 2)),
  summaryMc3: unwrapResponse(getAiResponseSchema("SUMMARY_COMPLETE_MC", { summaryCompleteMcBlankCount: 3 })),
  antonym6: unwrapResponse(getAiResponseSchema("ANTONYM", { antonymPairCount: 6 })),
};

const blankDesignMeta = {
  singleRequired: isRequired(aiBlankInferenceSchema, "blankDesign"),
  multi2Required: isRequired(buildAiMultiBlankInferenceSchema(2), "blankDesign"),
  multi3Required: isRequired(buildAiMultiBlankInferenceSchema(3), "blankDesign"),
};

// ── 후처리 blankDesign 제거 계약 ────────────────────────────────────────────
const singlePassage =
  "Learning improves when students connect ideas to daily life. " +
  "This connection makes later recall much easier for them.";

const singleBlankItem = {
  direction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
  blankDesign: "내부 설계 메모: 첫 문장(주제문)을 빈칸으로 선택했다. 정답 축은 재진술이며, 오답은 극성 반전/과협소/과확장/소재 연상으로 설계했다.",
  originalExpression: "connect ideas to daily life",
  surroundingText: "students connect ideas to daily life. This connection",
  options: [
    { label: "1", text: "connect ideas to daily life" },
    { label: "2", text: "memorize isolated facts quickly" },
    { label: "3", text: "avoid using prior knowledge" },
    { label: "4", text: "repeat definitions without context" },
    { label: "5", text: "ignore everyday examples entirely" },
  ],
  correctAnswer: "1",
  wrongOptionExplanations: {
    "2": "암기 속도로 초점을 바꾼다.",
    "3": "사전 지식 활용을 부정한다.",
    "4": "맥락 없는 반복으로 과협소하다.",
    "5": "일상 예시를 배제해 극성이 반대다.",
  },
  explanation: "빈칸 문장은 글의 주제문이다. 뒤 문장이 recall 향상 근거를 제시하므로 정답은 1이다.",
  keyPoints: ["연결 학습", "회상"],
  tags: ["빈칸"],
  difficulty: "BASIC",
};

const multiPassage =
  "Dogs run fast in the park every morning. " +
  "Cats sleep on the warm sofa near the window all afternoon.";

const multiBlankItem = {
  direction: "다음 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
  blankDesign: "내부 설계 메모: 서로 다른 두 문장에서 술어부를 빈칸으로 선택했다.",
  blanks: [
    { label: "(A)", originalExpression: "run fast", surroundingText: "Dogs run fast in the park every morning" },
    { label: "(B)", originalExpression: "sleep on the warm sofa", surroundingText: "Cats sleep on the warm sofa near the window" },
  ],
  options: [
    { label: "1", text: "run fast …… sleep on the warm sofa", blankValues: ["run fast", "sleep on the warm sofa"] },
    { label: "2", text: "walk slowly …… hide under the bed", blankValues: ["walk slowly", "hide under the bed"] },
    { label: "3", text: "run fast …… hide under the bed", blankValues: ["run fast", "hide under the bed"] },
    { label: "4", text: "walk slowly …… sleep on the warm sofa", blankValues: ["walk slowly", "sleep on the warm sofa"] },
    { label: "5", text: "bark loudly …… chase the birds", blankValues: ["bark loudly", "chase the birds"] },
  ],
  correctAnswer: "1",
  wrongOptionExplanations: {
    "2": "둘 다 원문과 다르다.",
    "3": "(B)가 원문과 다르다.",
    "4": "(A)가 원문과 다르다.",
    "5": "둘 다 지문에 없는 내용이다.",
  },
  explanation: "각 빈칸은 원문 표현과 정확히 일치해야 한다.",
  keyPoints: ["빈칸 조합"],
  tags: ["빈칸"],
  difficulty: "BASIC",
};

const singleProcessed = postProcessQuestion("BLANK_INFERENCE", singlePassage, singleBlankItem);
const multiProcessed = postProcessQuestion("BLANK_INFERENCE", multiPassage, multiBlankItem);

console.log(JSON.stringify({
  shapes,
  builders,
  blankDesignMeta,
  singleProcessed: {
    success: singleProcessed.success,
    error: singleProcessed.error ?? null,
    hasBlankDesign: Object.prototype.hasOwnProperty.call(singleProcessed.data, "blankDesign"),
    passageWithBlank: singleProcessed.data.passageWithBlank ?? null,
    originalExpression: singleProcessed.data.originalExpression ?? null,
  },
  multiProcessed: {
    success: multiProcessed.success,
    error: multiProcessed.error ?? null,
    hasBlankDesign: Object.prototype.hasOwnProperty.call(multiProcessed.data, "blankDesign"),
    passageWithBlank: multiProcessed.data.passageWithBlank ?? null,
  },
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave1-schema-order-harness.mts");
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

const TAIL = ["explanation", "keyPoints", "tags", "difficulty"];

// 유형별 "본문 콘텐츠 앵커" — correctAnswer 는 반드시 이 필드 뒤에 와야 한다.
const CONTENT_ANCHORS = {
  BLANK_INFERENCE: "originalExpression",
  SUMMARY_COMPLETE_MC: "summaryWithBlanks",
  IRRELEVANT: "sentences",
  SENTENCE_INSERT: "givenSentence",
  SENTENCE_ORDER: "paragraphs",
  VOCAB_CHOICE: "markedWords",
  TITLE: "options",
  TOPIC: "options",
  MAIN_IDEA: "options",
  TOPIC_MAIN_IDEA: "options",
  IMPLIED_MEANING: "underlinedExpression",
  CONTENT_MATCH: "matchType",
  CONTEXT_MEANING: "underlinedWord",
  SYNONYM: "targetWord",
  ANTONYM: "markedWords",
  REFERENCE: "underlinedPronoun",
};

function assertGenerationOrder(name, keys, anchor) {
  assert.equal(keys[0], "direction", `${name}: direction must be first, got ${JSON.stringify(keys)}`);
  assert.deepEqual(
    keys.slice(-4),
    TAIL,
    `${name}: final four keys must be explanation/keyPoints/tags/difficulty, got ${JSON.stringify(keys)}`,
  );
  const anchorIdx = keys.indexOf(anchor);
  const optionsIdx = keys.indexOf("options");
  const answerIdx = keys.indexOf("correctAnswer");
  const wrongIdx = keys.indexOf("wrongOptionExplanations");
  const explanationIdx = keys.indexOf("explanation");
  assert.ok(anchorIdx >= 0, `${name}: missing content anchor ${anchor}`);
  assert.ok(answerIdx >= 0, `${name}: missing correctAnswer`);
  assert.ok(answerIdx > anchorIdx, `${name}: correctAnswer must come after ${anchor} (${JSON.stringify(keys)})`);
  assert.ok(answerIdx > optionsIdx, `${name}: correctAnswer must come after options (${JSON.stringify(keys)})`);
  assert.ok(wrongIdx > answerIdx, `${name}: wrongOptionExplanations must come after correctAnswer (${JSON.stringify(keys)})`);
  assert.ok(wrongIdx < explanationIdx, `${name}: wrongOptionExplanations must come before explanation (${JSON.stringify(keys)})`);
  const answersIdx = keys.indexOf("correctAnswers");
  if (answersIdx >= 0) {
    assert.ok(answersIdx > anchorIdx, `${name}: correctAnswers must come after ${anchor}`);
    assert.ok(answersIdx < wrongIdx, `${name}: correctAnswers must come before wrongOptionExplanations`);
  }
}

test("all 16 reordered MC/vocab types follow generation order (direction → content → answer → tail)", () => {
  for (const [typeId, anchor] of Object.entries(CONTENT_ANCHORS)) {
    assertGenerationOrder(typeId, result.shapes[typeId], anchor);
  }
});

test("dynamic count builders also follow generation order", () => {
  assertGenerationOrder("multiBlank2", result.builders.multiBlank2, "blanks");
  assertGenerationOrder("multiBlank3", result.builders.multiBlank3, "blanks");
  assertGenerationOrder("irrelevant7", result.builders.irrelevant7, "sentences");
  assertGenerationOrder("vocabChoice8x2", result.builders.vocabChoice8x2, "markedWords");
  assertGenerationOrder("sentenceInsert7", result.builders.sentenceInsert7, "givenSentence");
  assertGenerationOrder("contentMatch8x2", result.builders.contentMatch8x2, "matchType");
  assertGenerationOrder("genericTitle6", result.builders.genericTitle6, "options");
  assertGenerationOrder("genericTopic6x2", result.builders.genericTopic6x2, "options");
  assertGenerationOrder("summaryMc3", result.builders.summaryMc3, "summaryWithBlanks");
  assertGenerationOrder("antonym6", result.builders.antonym6, "markedWords");
});

test("multi-answer builders keep correctAnswers present and ordered", () => {
  assert.ok(result.builders.vocabChoice8x2.includes("correctAnswers"));
  assert.ok(result.builders.contentMatch8x2.includes("correctAnswers"));
  assert.ok(result.builders.genericTopic6x2.includes("correctAnswers"));
});

test("blankDesign is required and sits right after direction in blank schemas", () => {
  assert.equal(result.shapes.BLANK_INFERENCE[1], "blankDesign");
  assert.equal(result.builders.multiBlank2[1], "blankDesign");
  assert.equal(result.builders.multiBlank3[1], "blankDesign");
  assert.equal(result.blankDesignMeta.singleRequired, true, "single-blank blankDesign must be required");
  assert.equal(result.blankDesignMeta.multi2Required, true, "multi-blank(2) blankDesign must be required");
  assert.equal(result.blankDesignMeta.multi3Required, true, "multi-blank(3) blankDesign must be required");
});

test("postProcessQuestion strips blankDesign on the single-blank path", () => {
  assert.equal(result.singleProcessed.success, true, result.singleProcessed.error);
  assert.equal(result.singleProcessed.hasBlankDesign, false, "blankDesign must be stripped before persisting");
  assert.match(result.singleProcessed.passageWithBlank, /_{3,}/);
  assert.equal(result.singleProcessed.originalExpression, "connect ideas to daily life");
});

test("postProcessQuestion strips blankDesign on the multi-blank path", () => {
  assert.equal(result.multiProcessed.success, true, result.multiProcessed.error);
  assert.equal(result.multiProcessed.hasBlankDesign, false, "blankDesign must be stripped before persisting");
  assert.match(result.multiProcessed.passageWithBlank, /\(A\)\s+_{3,}/);
  assert.match(result.multiProcessed.passageWithBlank, /\(B\)\s+_{3,}/);
});
