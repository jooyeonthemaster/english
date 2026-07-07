// Wave-2 서술형 스키마 계약 테스트 — 7개 작문 유형 스키마가 "생성 순서"
// (발문 → 콘텐츠 → modelAnswer → correctAnswer → 해설 꼬리)로 재배열됐는지,
// WORD_ORDER 에 선언 미끼 필드(wordBankDistractors)가 추가됐는지,
// GRAMMAR_CORRECTION superRefine 게이트가 재배열 후에도 살아있는지,
// 그리고 새 프롬프트 자체검증 문구가 실제로 존재하는지 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import essaySchemas from "@/lib/question-schemas-essay";
import aiSchemas from "@/lib/question-ai-schemas-mc";
import essayPrompts from "@/lib/question-prompts-essay";
import mcPrompts from "@/lib/question-prompts-mc";

const {
  conditionalWritingSchema,
  sentenceTransformSchema,
  fillBlankKeySchema,
  summaryCompleteSchema,
  buildSummaryCompleteSchema,
  summaryWritingSchema,
  buildSummaryWritingSchema,
  wordOrderSchema,
  grammarCorrectionSchema,
} = essaySchemas;
const { AI_QUESTION_SCHEMAS } = aiSchemas;
const { ESSAY_PROMPTS } = essayPrompts;
const { MC_PROMPTS } = mcPrompts;

const shapeKeys = (schema: any): string[] => Object.keys(schema.shape ?? {});

const orders: Record<string, string[]> = {
  CONDITIONAL_WRITING: shapeKeys(conditionalWritingSchema),
  SENTENCE_TRANSFORM: shapeKeys(sentenceTransformSchema),
  FILL_BLANK_KEY: shapeKeys(fillBlankKeySchema),
  SUMMARY_COMPLETE: shapeKeys(summaryCompleteSchema),
  SUMMARY_COMPLETE_BUILT_3: shapeKeys(buildSummaryCompleteSchema(3)),
  SUMMARY_WRITING: shapeKeys(summaryWritingSchema),
  SUMMARY_WRITING_BUILT_2: shapeKeys(buildSummaryWritingSchema(2)),
  WORD_ORDER: shapeKeys(wordOrderSchema),
  GRAMMAR_CORRECTION: shapeKeys(grammarCorrectionSchema),
};

// 생성 경로가 실제로 쓰는 병합 레지스트리도 같은(재배열된) 스키마여야 한다.
const registryOrders: Record<string, string[]> = {
  CONDITIONAL_WRITING: shapeKeys(AI_QUESTION_SCHEMAS.CONDITIONAL_WRITING),
  SENTENCE_TRANSFORM: shapeKeys(AI_QUESTION_SCHEMAS.SENTENCE_TRANSFORM),
  FILL_BLANK_KEY: shapeKeys(AI_QUESTION_SCHEMAS.FILL_BLANK_KEY),
  SUMMARY_COMPLETE: shapeKeys(AI_QUESTION_SCHEMAS.SUMMARY_COMPLETE),
  SUMMARY_WRITING: shapeKeys(AI_QUESTION_SCHEMAS.SUMMARY_WRITING),
  WORD_ORDER: shapeKeys(AI_QUESTION_SCHEMAS.WORD_ORDER),
  GRAMMAR_CORRECTION: shapeKeys(AI_QUESTION_SCHEMAS.GRAMMAR_CORRECTION),
};

// GRAMMAR_CORRECTION superRefine 생존 검사 — 재배열이 검증 체인을 지우지 않았는지.
const gcBadFixture = {
  direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
  underlinedSegments: [
    {
      label: "(A)",
      sourceText: "He goes to school every day.",
      displayedText: "He goes to school every day.",
      isError: false,
    },
  ],
  correctAnswer: "(A) goes",
  explanation: "테스트",
  keyPoints: ["어법"],
  tags: ["어법"],
  difficulty: "BASIC",
};
const gcGoodFixture = {
  ...gcBadFixture,
  underlinedSegments: [
    {
      label: "(A)",
      sourceText: "He goes to school every day.",
      displayedText: "He go to school every day.",
      isError: true,
      errorPart: "go",
      correctedPart: "goes",
    },
  ],
};

const gcBadParse = grammarCorrectionSchema.safeParse(gcBadFixture);
const gcGoodParse = grammarCorrectionSchema.safeParse(gcGoodFixture);

const promptChecks = {
  cwNoVerbatim: ESSAY_PROMPTS.CONDITIONAL_WRITING.includes("verbatim 복사 금지"),
  cwMechanicalConditions: ESSAY_PROMPTS.CONDITIONAL_WRITING.includes("기계적으로 판정"),
  cwExplanationTemplate:
    ESSAY_PROMPTS.CONDITIONAL_WRITING.includes("조건 적용") &&
    ESSAY_PROMPTS.CONDITIONAL_WRITING.includes("구문 변환 근거") &&
    ESSAY_PROMPTS.CONDITIONAL_WRITING.includes("채점 포인트"),
  stMeaningCheck: ESSAY_PROMPTS.SENTENCE_TRANSFORM.includes("의미 보존 자체 검증"),
  stHedge: ESSAY_PROMPTS.SENTENCE_TRANSFORM.includes("극성"),
  stGradedAnswers: ESSAY_PROMPTS.SENTENCE_TRANSFORM.includes("등급형 답안 기준"),
  woDeclareDistractors: ESSAY_PROMPTS.WORD_ORDER.includes("wordBankDistractors"),
  woReconstructCheck: ESSAY_PROMPTS.WORD_ORDER.includes("재구성 자체 검증"),
  swGlossBackTranslation: ESSAY_PROMPTS.SUMMARY_WRITING.includes("역번역 자체 검증"),
  swDirectionWordBankReality: ESSAY_PROMPTS.SUMMARY_WRITING.includes("발문-보기 실재 정합"),
  irrAnswerLabelSelfCheck: MC_PROMPTS.IRRELEVANT.includes("정답 라벨 정합 자체 검증"),
  siAnswerNumberSelfCheck: MC_PROMPTS.SENTENCE_INSERT.includes("정답 번호 정합 자체 검증"),
  refOptionSelfCheck: MC_PROMPTS.REFERENCE.includes("선지·정답 정합 자체 검증"),
  refNoMarkup: MC_PROMPTS.REFERENCE.includes("어떤 서식도 넣지 마세요"),
};

console.log(JSON.stringify({
  orders,
  registryOrders,
  gcBadParseSuccess: gcBadParse.success,
  gcGoodParseSuccess: gcGoodParse.success,
  promptChecks,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave2-writing-schemas-harness.mts");
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

function assertGenerationOrder(name, keys, { contentBefore = [], answerLike = [] } = {}) {
  assert.equal(keys[0], "direction", `${name}: direction must be first (${JSON.stringify(keys)})`);
  assert.deepEqual(
    keys.slice(-4),
    TAIL,
    `${name}: explanation/keyPoints/tags/difficulty must be the last four (${JSON.stringify(keys)})`,
  );
  const correctAnswerIndex = keys.indexOf("correctAnswer");
  assert.equal(
    correctAnswerIndex,
    keys.length - 5,
    `${name}: correctAnswer must sit right before the explanation tail (${JSON.stringify(keys)})`,
  );
  for (const [dep, target] of contentBefore) {
    const depIndex = keys.indexOf(dep);
    const targetIndex = keys.indexOf(target);
    assert.ok(depIndex >= 0, `${name}: missing field ${dep}`);
    assert.ok(targetIndex >= 0, `${name}: missing field ${target}`);
    assert.ok(
      depIndex < targetIndex,
      `${name}: ${dep} must be generated before ${target} (${JSON.stringify(keys)})`,
    );
  }
  for (const field of answerLike) {
    const index = keys.indexOf(field);
    assert.ok(index >= 0, `${name}: missing field ${field}`);
    assert.ok(
      index < correctAnswerIndex,
      `${name}: ${field} must come before correctAnswer (${JSON.stringify(keys)})`,
    );
  }
}

test("CONDITIONAL_WRITING schema: content → modelAnswer → answer → tail", () => {
  assertGenerationOrder("CONDITIONAL_WRITING", result.orders.CONDITIONAL_WRITING, {
    contentBefore: [
      ["referenceSentence", "modelAnswer"],
      ["conditions", "modelAnswer"],
    ],
    answerLike: ["modelAnswer"],
  });
});

test("SENTENCE_TRANSFORM schema: originalSentence/conditions → modelAnswer → answer → tail", () => {
  assertGenerationOrder("SENTENCE_TRANSFORM", result.orders.SENTENCE_TRANSFORM, {
    contentBefore: [
      ["originalSentence", "modelAnswer"],
      ["conditions", "modelAnswer"],
    ],
    answerLike: ["modelAnswer"],
  });
});

test("FILL_BLANK_KEY schema: sentenceWithBlank → answer → correctAnswer → tail", () => {
  assertGenerationOrder("FILL_BLANK_KEY", result.orders.FILL_BLANK_KEY, {
    contentBefore: [["sentenceWithBlank", "answer"]],
    answerLike: ["answer"],
  });
});

test("SUMMARY_COMPLETE schema (base + built n=3): summary → blanks → answer → tail", () => {
  for (const key of ["SUMMARY_COMPLETE", "SUMMARY_COMPLETE_BUILT_3"]) {
    assertGenerationOrder(key, result.orders[key], {
      contentBefore: [["summaryWithBlanks", "blanks"]],
      answerLike: ["blanks"],
    });
  }
});

test("SUMMARY_WRITING schema (base + built n=2): summary/clues → blanks → modelAnswer → answer → tail", () => {
  for (const key of ["SUMMARY_WRITING", "SUMMARY_WRITING_BUILT_2"]) {
    assertGenerationOrder(key, result.orders[key], {
      contentBefore: [
        ["summaryWithBlanks", "blanks"],
        ["wordBank", "blanks"],
        ["blanks", "modelAnswer"],
      ],
      answerLike: ["modelAnswer", "scoringCriteria"],
    });
  }
});

test("WORD_ORDER schema: chips → modelAnswer → answer → tail + declared-distractor field exists", () => {
  const keys = result.orders.WORD_ORDER;
  assertGenerationOrder("WORD_ORDER", keys, {
    contentBefore: [
      ["scrambledWords", "modelAnswer"],
      ["wordBankDistractors", "modelAnswer"],
    ],
    answerLike: ["modelAnswer"],
  });
  assert.ok(keys.includes("wordBankDistractors"), JSON.stringify(keys));
});

test("GRAMMAR_CORRECTION schema: segments/corrections → answer → tail", () => {
  assertGenerationOrder("GRAMMAR_CORRECTION", result.orders.GRAMMAR_CORRECTION, {
    contentBefore: [["underlinedSegments", "correctedSentence"]],
    answerLike: ["underlinedSegments", "correctedParts"],
  });
});

test("AI registry serves the reordered writing schemas (same key order)", () => {
  for (const typeId of [
    "CONDITIONAL_WRITING",
    "SENTENCE_TRANSFORM",
    "FILL_BLANK_KEY",
    "SUMMARY_COMPLETE",
    "SUMMARY_WRITING",
    "WORD_ORDER",
    "GRAMMAR_CORRECTION",
  ]) {
    assert.deepEqual(
      result.registryOrders[typeId],
      result.orders[typeId],
      `AI_QUESTION_SCHEMAS.${typeId} must expose the same reordered schema`,
    );
  }
});

test("GRAMMAR_CORRECTION superRefine gate survived the reorder", () => {
  assert.equal(result.gcBadParseSuccess, false, "non-error segment must be rejected");
  assert.equal(result.gcGoodParseSuccess, true, "valid mutated segment must pass");
});

test("prompts contain the new wave-2 self-check instructions", () => {
  for (const [key, present] of Object.entries(result.promptChecks)) {
    assert.equal(present, true, `prompt check failed: ${key}`);
  }
});
