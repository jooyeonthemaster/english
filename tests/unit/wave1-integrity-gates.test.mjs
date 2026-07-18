// Wave-1 무결성 게이트 계약 테스트 — 정답 키/재구성/누수/시비/조건 강제 게이트가
// 결함 픽스처는 차단(BLOCK)하고 정상 픽스처는 통과(PASS)시키는지,
// 그리고 새 코드가 전부 RELAXED_BLOCKING_QUALITY_CODES 에 등록됐는지 검증한다.
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

const errorCodes = (issues) =>
  issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);

// ── SENTENCE_ORDER: 정답 키 재구성 ──────────────────────────────────────────
const soGiven =
  "We are taught from an early age that sharing is caring. We tell our children to share their toys.";
const soA =
  "While some sites continue to offer true sharing, most are in fact selling a product, much like a traditional business. This shift matters because the moral appeal of sharing can hide the fact that a company is simply charging fees for access.";
const soB =
  "Thanks to popular websites and apps, users can share their cars, their spare bedrooms, their power tools, and even their own time and talents. This should be good for the owner, the community, and the environment.";
const soC =
  "And because both parties review each other, these digital platforms create a trusting environment among complete strangers. According to one of its earliest supporters, author Rachel Botsman, the gig economy takes advantage of idle capacity to better utilize assets.";
// 원문 = given + B + C + A (정답 순서 (B)-(C)-(A)).
const soPassage = [soGiven, soB, soC, soA].join(" ");

const sentenceOrderBase = {
  direction: "주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?",
  givenSentence: soGiven,
  paragraphs: [
    { label: "(A)", text: soA },
    { label: "(B)", text: soB },
    { label: "(C)", text: soC },
  ],
  options: [
    { label: "1", text: "(A)-(C)-(B)" },
    { label: "2", text: "(B)-(C)-(A)" },
    { label: "3", text: "(B)-(A)-(C)" },
    { label: "4", text: "(C)-(A)-(B)" },
    { label: "5", text: "(C)-(B)-(A)" },
  ],
  correctAnswer: "2",
  explanation: "테스트",
  keyPoints: ["글의 순서"],
  tags: ["순서"],
  difficulty: "INTERMEDIATE",
};

const soPass = errorCodes(validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: sentenceOrderBase,
  passage: soPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

const soMismatch = errorCodes(validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: { ...sentenceOrderBase, correctAnswer: "5" },
  passage: soPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

const soNotBacked = errorCodes(validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: {
    ...sentenceOrderBase,
    paragraphs: [
      { label: "(A)", text: soA },
      { label: "(B)", text: soB.replace("users can share their cars", "users can borrow their cars") },
      { label: "(C)", text: soC },
    ],
  },
  passage: soPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

// passage 미제공(추출/재현 흐름)이면 게이트 미동작 — 무회귀.
const soNoPassage = errorCodes(validateQuestionQuality({
  typeId: "SENTENCE_ORDER",
  question: { ...sentenceOrderBase, correctAnswer: "5" },
  passage: "",
  requestedDifficulty: "INTERMEDIATE",
}));

// ── WORD_ORDER: 칩 재구성 ───────────────────────────────────────────────────
const woModelAnswer = "Sharing resources with neighbors can reduce household waste over time";
const wordOrderBase = {
  direction: "주어진 단어를 올바른 순서로 배열하여 문장을 완성하시오.",
  scrambledWords: ["over time", "reduce household waste", "with neighbors", "can", "Sharing resources"],
  modelAnswer: woModelAnswer,
  correctAnswer: woModelAnswer,
  explanation: "테스트",
  keyPoints: ["어순"],
  tags: ["배열"],
  difficulty: "INTERMEDIATE",
};

const woPass = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: wordOrderBase,
  requestedDifficulty: "INTERMEDIATE",
}));

// 선언된 미끼가 있어도 정답 토큰이 전부 있으면 통과.
const woPassWithDistractor = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: {
    ...wordOrderBase,
    scrambledWords: ["over time", "reduces", "reduce household waste", "with neighbors", "can", "Sharing resources"],
    wordBankDistractors: ["reduces"],
  },
  requestedDifficulty: "INTERMEDIATE",
}));

// "can" 칩 누락 → 정답 조립 불가.
const woBlock = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: {
    ...wordOrderBase,
    scrambledWords: ["over time", "reduce household waste", "with neighbors", "Sharing resources"],
  },
  requestedDifficulty: "INTERMEDIATE",
}));

// ── WORD_ORDER acceptedAnswers 결정형 조립 검증 (T8 허용답안) ────────────────
// 각 허용답은 정답과 **동일 칩의 재배열**이어야 한다(= 제시 칩으로 과부족 0 조립).
// 유효 허용답(같은 칩 다른 어순) → accepted 게이트 무발화.
const woAcceptedValid = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: {
    ...wordOrderBase,
    acceptedAnswers: [
      woModelAnswer,
      "Over time sharing resources with neighbors can reduce household waste",
    ],
  },
  requestedDifficulty: "INTERMEDIATE",
}));

// 칩으로 만들 수 없는 허용답(단어 치환 waste→trash) → accepted 게이트 차단.
const woAcceptedBlock = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: {
    ...wordOrderBase,
    acceptedAnswers: [
      woModelAnswer,
      "Sharing resources with neighbors can reduce household trash over time",
    ],
  },
  requestedDifficulty: "INTERMEDIATE",
}));

// 선언 미끼(reduces)를 쓴 허용답 → 정답 칩 외 사용이라 차단. modelAnswer 는 여전히
// 조립 가능(reduces 는 미끼로 선언) → word-order-unreconstructable 는 무발화.
const woAcceptedUsesDistractor = errorCodes(validateQuestionQuality({
  typeId: "WORD_ORDER",
  question: {
    ...wordOrderBase,
    scrambledWords: ["over time", "reduces", "reduce household waste", "with neighbors", "can", "Sharing resources"],
    wordBankDistractors: ["reduces"],
    acceptedAnswers: [
      woModelAnswer,
      "Sharing resources with neighbors reduces household waste over time",
    ],
  },
  requestedDifficulty: "INTERMEDIATE",
}));

// ── BLANK_INFERENCE: SOURCE_EXACT 단일 빈칸 잔존 누수 ───────────────────────
const blankPassage =
  "People who delay the reward tend to achieve more in the long run. Studies show that children who delay the reward perform better later in school. This pattern repeats across cultures and age groups in many long-term studies.";
const blankBase = {
  direction: "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
  originalExpression: "delay the reward",
  passageWithBlank:
    "People who _____ tend to achieve more in the long run. Studies show that children who delay the reward perform better later in school. This pattern repeats across cultures and age groups in many long-term studies.",
  options: [
    { label: "1", text: "spend money quickly" },
    { label: "2", text: "avoid difficult tasks" },
    { label: "3", text: "delay the reward" },
    { label: "4", text: "follow their instincts" },
    { label: "5", text: "trust their teachers" },
  ],
  correctAnswer: "3",
  explanation: "테스트",
  keyPoints: ["빈칸"],
  tags: ["빈칸"],
  difficulty: "INTERMEDIATE",
};

const blankBlock = errorCodes(validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: blankBase,
  passage: blankPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

const blankPass = errorCodes(validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: {
    ...blankBase,
    passageWithBlank:
      "People who _____ tend to achieve more in the long run. Studies show that children who wait patiently perform better later in school. This pattern repeats across cultures and age groups in many long-term studies.",
  },
  passage: blankPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

// PARAPHRASE 모드는 자체 게이트가 있으므로 잔존 코드는 발화하지 않아야 함.
const blankParaphraseNoFire = errorCodes(validateQuestionQuality({
  typeId: "BLANK_INFERENCE",
  question: { ...blankBase, blankAnswerMode: "PARAPHRASE" },
  passage: blankPassage,
  requestedDifficulty: "INTERMEDIATE",
}));

// ── GRAMMAR_CORRECTION: 시제/지각동사 시비 ──────────────────────────────────
function correctionQuestion(sourceText, displayedText, errorPart, correctedPart) {
  return {
    direction: "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고치시오.",
    underlinedSegments: [
      { label: "(A)", isError: true, sourceText, displayedText, errorPart, correctedPart },
    ],
    passageWithUnderline: "In today's economy, __" + displayedText + "__ Analysts often disagree about why.",
    correctAnswer: "(A) " + correctedPart,
    explanation: "테스트",
    keyPoints: ["어법"],
    tags: ["어법"],
    difficulty: "INTERMEDIATE",
  };
}

const gcTenseSource = "The new startup outpaces its older rivals in every major market segment.";
const gcTenseBlock = errorCodes(validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: correctionQuestion(
    gcTenseSource,
    "The new startup outpaced its older rivals in every major market segment.",
    "outpaced",
    "outpaces",
  ),
  passage: "In today's economy, " + gcTenseSource + " Analysts often disagree about why.",
  grammarCorrectionErrorCount: 1,
  requestedDifficulty: "INTERMEDIATE",
}));

const gcPass = errorCodes(validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: correctionQuestion(
    gcTenseSource,
    "The new startup outpace its older rivals in every major market segment.",
    "outpace",
    "outpaces",
  ),
  passage: "In today's economy, " + gcTenseSource + " Analysts often disagree about why.",
  grammarCorrectionErrorCount: 1,
  requestedDifficulty: "INTERMEDIATE",
}));

const gcPerceptionSource =
  "We see the democratizing power of AI to broaden the attention of the medical and research communities.";
const gcPerceptionBlock = errorCodes(validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: correctionQuestion(
    gcPerceptionSource,
    "We see the democratizing power of AI broaden the attention of the medical and research communities.",
    "broaden",
    "to broaden",
  ),
  passage: "In today's economy, " + gcPerceptionSource + " Analysts often disagree about why.",
  grammarCorrectionErrorCount: 1,
  requestedDifficulty: "INTERMEDIATE",
}));

// 정상 지각동사 출제(*saw him to cross)는 통과해야 함.
const gcPerceptionSafeSource = "We saw him cross the street before the light changed at the corner.";
const gcPerceptionPass = errorCodes(validateQuestionQuality({
  typeId: "GRAMMAR_CORRECTION",
  question: correctionQuestion(
    gcPerceptionSafeSource,
    "We saw him to cross the street before the light changed at the corner.",
    "to cross",
    "cross",
  ),
  passage: "In today's economy, " + gcPerceptionSafeSource + " Analysts often disagree about why.",
  grammarCorrectionErrorCount: 1,
  requestedDifficulty: "INTERMEDIATE",
}));

// ── GRAMMAR_CHOICE_COMBO: 슬롯 시제/지각동사 시비 ───────────────────────────
const comboBlock = errorCodes(validateQuestionQuality({
  typeId: "GRAMMAR_CHOICE_COMBO",
  question: {
    direction: "다음 글의 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?",
    slots: [
      {
        label: "(A)",
        correctExpression: "outpaces",
        wrongExpression: "outpaced",
        surroundingText: "The new startup outpaces its older rivals in every market segment",
      },
      {
        label: "(B)",
        correctExpression: "to broaden",
        wrongExpression: "broaden",
        surroundingText: "We see the democratizing power of AI to broaden the attention of the medical and research communities",
      },
      {
        label: "(C)",
        correctExpression: "is",
        wrongExpression: "are",
        surroundingText: "the disease that spreads fastest is often the least studied",
      },
    ],
    explanation: "테스트",
    keyPoints: ["어법"],
    tags: ["어법"],
    difficulty: "INTERMEDIATE",
  },
  requestedDifficulty: "INTERMEDIATE",
}));

const comboPass = errorCodes(validateQuestionQuality({
  typeId: "GRAMMAR_CHOICE_COMBO",
  question: {
    direction: "다음 글의 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?",
    slots: [
      {
        label: "(A)",
        correctExpression: "outpaces",
        wrongExpression: "outpace",
        surroundingText: "The new startup outpaces its older rivals in every market segment",
      },
      {
        label: "(B)",
        correctExpression: "which",
        wrongExpression: "what",
        surroundingText: "the platform which connects strangers has grown quickly",
      },
      {
        label: "(C)",
        correctExpression: "is",
        wrongExpression: "are",
        surroundingText: "the disease that spreads fastest is often the least studied",
      },
    ],
    explanation: "테스트",
    keyPoints: ["어법"],
    tags: ["어법"],
    difficulty: "INTERMEDIATE",
  },
  requestedDifficulty: "INTERMEDIATE",
}));

// ── CONDITIONAL_WRITING: 기계 검증 가능 조건 강제 ───────────────────────────
function conditionalQuestion(conditions, modelAnswer) {
  return {
    direction: "다음 조건에 맞게 영작하시오.",
    referenceSentence: "물 없이는 식물이 사막의 더위에서 살아남을 수 없다.",
    conditions,
    modelAnswer,
    correctAnswer: modelAnswer,
    explanation: "테스트",
    keyPoints: ["영작"],
    tags: ["조건부 영작"],
    difficulty: "INTERMEDIATE",
  };
}

const cwRun = (conditions, modelAnswer) =>
  errorCodes(validateQuestionQuality({
    typeId: "CONDITIONAL_WRITING",
    question: conditionalQuestion(conditions, modelAnswer),
    requestedDifficulty: "INTERMEDIATE",
  }));

const cwWordCountBlock = cwRun(["총 8단어로 쓸 것"], "Plants cannot survive in the desert heat");
const cwWordCountPass = cwRun(["총 8단어로 쓸 것"], "Plants cannot survive in the hot desert heat");
const cwMustUseBlock = cwRun(["'Without'으로 시작할 것"], "Plants cannot survive in the desert heat.");
const cwMustUsePass = cwRun(["'Without'으로 시작할 것"], "Without water, plants cannot survive in the desert heat.");
const cwForbiddenBlock = cwRun(["'because'를 사용하지 말 것"], "Plants die because they have no water.");
const cwForbiddenPass = cwRun(["'because'를 사용하지 말 것"], "Plants deprived of water cannot survive for long.");
// 모호/범위 조건은 절대 발화하지 않음(보수 원칙).
const cwVaguePass = cwRun(
  ["관계대명사를 사용할 것", "10단어 이내로 쓸 것", "약 5단어로 쓸 것"],
  "Plants that lack water die.",
);

// ── RELAXED_BLOCKING 등록 ───────────────────────────────────────────────────
const relaxedMembership = Object.fromEntries(
  [
    "sentence-order-answer-key-mismatch",
    "sentence-order-paragraph-not-source-backed",
    "word-order-unreconstructable",
    "word-order-accepted-unreconstructable",
    "blank-answer-residual-visible",
    "grammar-correction-tense-only-error",
    "grammar-correction-perception-toggle",
    "combo-tense-only-error",
    "combo-perception-toggle",
    "cond-writing-condition-violated",
    "summary-mc-duplicate-correct-option",
  ].map((code) => [code, RELAXED_BLOCKING_QUALITY_CODES.has(code)]),
);

console.log(JSON.stringify({
  soPass, soMismatch, soNotBacked, soNoPassage,
  woPass, woPassWithDistractor, woBlock,
  woAcceptedValid, woAcceptedBlock, woAcceptedUsesDistractor,
  blankBlock, blankPass, blankParaphraseNoFire,
  gcTenseBlock, gcPass, gcPerceptionBlock, gcPerceptionPass,
  comboBlock, comboPass,
  cwWordCountBlock, cwWordCountPass, cwMustUseBlock, cwMustUsePass,
  cwForbiddenBlock, cwForbiddenPass, cwVaguePass,
  relaxedMembership,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".wave1-integrity-gates-harness.mts");
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

test("SENTENCE_ORDER answer-key reconstruction: correct permutation passes", () => {
  assert.ok(!result.soPass.includes("sentence-order-answer-key-mismatch"), JSON.stringify(result.soPass));
  assert.ok(!result.soPass.includes("sentence-order-paragraph-not-source-backed"), JSON.stringify(result.soPass));
});

test("SENTENCE_ORDER answer-key reconstruction: shuffled answer key blocks", () => {
  assert.ok(result.soMismatch.includes("sentence-order-answer-key-mismatch"), JSON.stringify(result.soMismatch));
});

test("SENTENCE_ORDER answer-key reconstruction: rewritten paragraph blocks as not-source-backed (no guessing)", () => {
  assert.ok(result.soNotBacked.includes("sentence-order-paragraph-not-source-backed"), JSON.stringify(result.soNotBacked));
  assert.ok(!result.soNotBacked.includes("sentence-order-answer-key-mismatch"), JSON.stringify(result.soNotBacked));
});

test("SENTENCE_ORDER answer-key reconstruction: skipped without a source passage (no regression)", () => {
  assert.ok(!result.soNoPassage.includes("sentence-order-answer-key-mismatch"), JSON.stringify(result.soNoPassage));
  assert.ok(!result.soNoPassage.includes("sentence-order-paragraph-not-source-backed"), JSON.stringify(result.soNoPassage));
});

test("WORD_ORDER reconstruction: complete chips pass (with and without declared distractors)", () => {
  assert.ok(!result.woPass.includes("word-order-unreconstructable"), JSON.stringify(result.woPass));
  assert.ok(!result.woPassWithDistractor.includes("word-order-unreconstructable"), JSON.stringify(result.woPassWithDistractor));
});

test("WORD_ORDER reconstruction: missing answer token blocks", () => {
  assert.ok(result.woBlock.includes("word-order-unreconstructable"), JSON.stringify(result.woBlock));
});

test("WORD_ORDER acceptedAnswers reconstruction: same-chip rearrangements pass", () => {
  assert.ok(
    !result.woAcceptedValid.includes("word-order-accepted-unreconstructable"),
    JSON.stringify(result.woAcceptedValid),
  );
});

test("WORD_ORDER acceptedAnswers reconstruction: non-chip entry (substituted word) blocks", () => {
  assert.ok(
    result.woAcceptedBlock.includes("word-order-accepted-unreconstructable"),
    JSON.stringify(result.woAcceptedBlock),
  );
});

test("WORD_ORDER acceptedAnswers reconstruction: entry using a declared distractor chip blocks (model still buildable)", () => {
  assert.ok(
    result.woAcceptedUsesDistractor.includes("word-order-accepted-unreconstructable"),
    JSON.stringify(result.woAcceptedUsesDistractor),
  );
  assert.ok(
    !result.woAcceptedUsesDistractor.includes("word-order-unreconstructable"),
    JSON.stringify(result.woAcceptedUsesDistractor),
  );
});

test("BLANK_INFERENCE residual leak: SOURCE_EXACT answer span visible elsewhere blocks", () => {
  assert.ok(result.blankBlock.includes("blank-answer-residual-visible"), JSON.stringify(result.blankBlock));
});

test("BLANK_INFERENCE residual leak: clean blanked passage passes", () => {
  assert.ok(!result.blankPass.includes("blank-answer-residual-visible"), JSON.stringify(result.blankPass));
});

test("BLANK_INFERENCE residual leak: does not fire in PARAPHRASE mode", () => {
  assert.ok(!result.blankParaphraseNoFire.includes("blank-answer-residual-visible"), JSON.stringify(result.blankParaphraseNoFire));
});

test("GRAMMAR_CORRECTION tense-only toggle blocks; agreement flip passes", () => {
  assert.ok(result.gcTenseBlock.includes("grammar-correction-tense-only-error"), JSON.stringify(result.gcTenseBlock));
  assert.ok(!result.gcPass.includes("grammar-correction-tense-only-error"), JSON.stringify(result.gcPass));
  assert.ok(!result.gcPass.includes("grammar-correction-perception-toggle"), JSON.stringify(result.gcPass));
});

test("GRAMMAR_CORRECTION perception-complement toggle blocks; safe perception item passes", () => {
  assert.ok(result.gcPerceptionBlock.includes("grammar-correction-perception-toggle"), JSON.stringify(result.gcPerceptionBlock));
  assert.ok(!result.gcPerceptionPass.includes("grammar-correction-perception-toggle"), JSON.stringify(result.gcPerceptionPass));
});

test("GRAMMAR_CHOICE_COMBO slot toggles block; clean slots pass", () => {
  assert.ok(result.comboBlock.includes("combo-tense-only-error"), JSON.stringify(result.comboBlock));
  assert.ok(result.comboBlock.includes("combo-perception-toggle"), JSON.stringify(result.comboBlock));
  assert.ok(!result.comboPass.includes("combo-tense-only-error"), JSON.stringify(result.comboPass));
  assert.ok(!result.comboPass.includes("combo-perception-toggle"), JSON.stringify(result.comboPass));
});

test("CONDITIONAL_WRITING exact word count is enforced", () => {
  assert.ok(result.cwWordCountBlock.includes("cond-writing-condition-violated"), JSON.stringify(result.cwWordCountBlock));
  assert.ok(!result.cwWordCountPass.includes("cond-writing-condition-violated"), JSON.stringify(result.cwWordCountPass));
});

test("CONDITIONAL_WRITING quoted must-use token is enforced", () => {
  assert.ok(result.cwMustUseBlock.includes("cond-writing-condition-violated"), JSON.stringify(result.cwMustUseBlock));
  assert.ok(!result.cwMustUsePass.includes("cond-writing-condition-violated"), JSON.stringify(result.cwMustUsePass));
});

test("CONDITIONAL_WRITING quoted forbidden token is enforced", () => {
  assert.ok(result.cwForbiddenBlock.includes("cond-writing-condition-violated"), JSON.stringify(result.cwForbiddenBlock));
  assert.ok(!result.cwForbiddenPass.includes("cond-writing-condition-violated"), JSON.stringify(result.cwForbiddenPass));
});

test("CONDITIONAL_WRITING never fires on vague/range conditions", () => {
  assert.ok(!result.cwVaguePass.includes("cond-writing-condition-violated"), JSON.stringify(result.cwVaguePass));
});

test("all wave-1 codes (and the promoted summary-mc duplicate) are RELAXED_BLOCKING", () => {
  for (const [code, isBlocking] of Object.entries(result.relaxedMembership)) {
    assert.equal(isBlocking, true, `${code} must be in RELAXED_BLOCKING_QUALITY_CODES`);
  }
});
