/**
 * Non-LLM regression test for IRRELEVANT slot counts.
 *
 * Covers the server-side pieces that previously rejected 6~10 slot questions:
 * prompt contracts, post-processing, option labels, and quality validation.
 */

import { processIrrelevant } from "../src/lib/question-postprocess/processors/irrelevant";
import {
  buildQuestionTargetCandidateBlock,
  validateQuestionQuality,
} from "../src/lib/question-quality";
import {
  buildQuestionTypeSettingsPrompt,
  readIrrelevantSlotCountSetting,
  validateIrrelevantAgainstPassage,
} from "../src/lib/question-type-generation-settings";
import { getAiResponseSchema } from "../src/lib/question-ai-schemas-mc";

const LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

const PASSAGE_SENTENCES = [
  "Scientific claims become trustworthy when evidence is gathered through careful observation and repeated testing.",
  "Researchers also need transparent methods so that other people can examine how the conclusion was reached.",
  "Peer review adds another layer of protection by asking specialists to challenge weak assumptions before publication.",
  "Even after publication, later studies may revise a claim if new evidence exposes a limitation in the original design.",
  "This process can feel slow, but the delay helps prevent personal preference from replacing public evidence.",
  "Healthy skepticism therefore supports science by forcing claims to survive questions instead of avoiding them.",
  "At the same time, skepticism becomes unhelpful when it rejects all expertise before looking at the actual data.",
  "The best response is neither blind trust nor automatic disbelief, but a disciplined habit of checking reasons.",
  "In that sense, science depends on criticism because criticism keeps its conclusions connected to evidence.",
  "A community that values such criticism is better able to correct errors without abandoning the search for truth.",
];

const PASSAGE = PASSAGE_SENTENCES.join(" ");

function makeAiQuestion(slotCount: number) {
  const irrelevantIndex = Math.min(2, slotCount - 1);
  const sentences = PASSAGE_SENTENCES.slice(0, slotCount);
  sentences[irrelevantIndex] =
    "Scientific evidence becomes stronger when reviewers ignore the test results and protect the original claim from criticism.";

  return {
    direction: "다음 글의 흐름과 관계 없는 문장은?",
    difficulty: "INTERMEDIATE",
    sentences,
    irrelevantIndex,
    correctAnswer: LABELS[irrelevantIndex],
    options: LABELS.slice(0, slotCount).map((label) => ({ label, text: label })),
    explanation:
      "정답 문장은 evidence, reviewers, criticism 같은 표현을 공유하지만 검증과 비판을 통해 신뢰성을 높인다는 글의 흐름과 반대로, 결과를 무시하고 원래 주장을 보호해야 한다고 말한다.",
    keyPoints: ["evidence-based trust", "peer review", "healthy skepticism"],
    wrongOptionExplanations: Object.fromEntries(
      LABELS.slice(0, slotCount)
        .filter((_, index) => index !== irrelevantIndex)
        .map((label) => [label, "지문의 검증 절차를 이어 주는 문장이다."]),
    ),
    tags: ["무관한 문장"],
  };
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertNoQualityErrors(slotCount: number): void {
  const processed = processIrrelevant(PASSAGE, makeAiQuestion(slotCount));
  assert(processed.success, `post-process failed for slotCount=${slotCount}: ${processed.error}`);

  const question = processed.data as Record<string, unknown>;
  assert(Array.isArray(question.sentences), `sentences missing for slotCount=${slotCount}`);
  assert((question.sentences as unknown[]).length === slotCount, `sentences length mismatch for slotCount=${slotCount}`);
  assert(Array.isArray(question.options), `options missing for slotCount=${slotCount}`);
  assert((question.options as unknown[]).length === slotCount, `options length mismatch for slotCount=${slotCount}`);

  const issues = validateQuestionQuality({
    typeId: "IRRELEVANT",
    question,
    passage: PASSAGE,
    requestedDifficulty: "INTERMEDIATE",
  });
  const errors = issues.filter((issue) => issue.severity === "error");
  assert(errors.length === 0, `quality errors for slotCount=${slotCount}: ${JSON.stringify(errors)}`);
}

for (const slotCount of [5, 6, 10]) {
  const typePrompt = buildQuestionTypeSettingsPrompt("IRRELEVANT", { slotCount });
  if (slotCount > 5) {
    assert(typePrompt.includes(`exactly ${slotCount} slots`), `type prompt missing slotCount=${slotCount}`);
  }

  const candidateBlock = buildQuestionTargetCandidateBlock("IRRELEVANT", PASSAGE, {
    irrelevantSlotCount: slotCount,
    requestedDifficulty: slotCount === 10 ? "KILLER" : "INTERMEDIATE",
  });
  assert(
    candidateBlock.includes(`sentences[${slotCount}]`),
    `candidate block missing dynamic sentences[${slotCount}]`,
  );
  assertNoQualityErrors(slotCount);
}

const killerCandidateBlock = buildQuestionTargetCandidateBlock("IRRELEVANT", PASSAGE, {
  irrelevantSlotCount: 10,
  requestedDifficulty: "KILLER",
});
assert(
  killerCandidateBlock.includes("IRRELEVANT difficulty calibration: KILLER"),
  "KILLER candidate block should include stronger irrelevant-sentence guidance",
);

const mismatchQuestion = makeAiQuestion(6);
mismatchQuestion.options = mismatchQuestion.options.slice(0, 5);
const mismatchIssues = validateQuestionQuality({
  typeId: "IRRELEVANT",
  question: mismatchQuestion,
  passage: PASSAGE,
  requestedDifficulty: "INTERMEDIATE",
});
assert(
  mismatchIssues.some((issue) => issue.code === "option-count" && issue.message.includes("Expected 6")),
  "6-slot IRRELEVANT should require 6 options",
);

const incompleteExplanationQuestion = makeAiQuestion(9);
incompleteExplanationQuestion.wrongOptionExplanations = Object.fromEntries(
  Object.entries(incompleteExplanationQuestion.wrongOptionExplanations).slice(0, 4),
);
const incompleteExplanationIssues = validateQuestionQuality({
  typeId: "IRRELEVANT",
  question: incompleteExplanationQuestion,
  passage: PASSAGE,
  requestedDifficulty: "INTERMEDIATE",
});
assert(
  incompleteExplanationIssues.some((issue) => issue.code === "wrong-option-explanation-count"),
  "9-slot IRRELEVANT should require explanations for all 8 wrong options",
);

const obviousCounterclaimQuestion = makeAiQuestion(10);
obviousCounterclaimQuestion.irrelevantIndex = 7;
obviousCounterclaimQuestion.sentences[7] =
  "However, repeated testing might instead hinder scientific progress by limiting academic freedom.";
obviousCounterclaimQuestion.correctAnswer = LABELS[7];
obviousCounterclaimQuestion.options = LABELS.slice(0, 10).map((label) => ({ label, text: label }));
obviousCounterclaimQuestion.wrongOptionExplanations = Object.fromEntries(
  LABELS.slice(0, 10)
    .filter((_, index) => index !== obviousCounterclaimQuestion.irrelevantIndex)
    .map((label) => [label, "This source sentence supports the paragraph's evidence-based flow."]),
);
const obviousCounterclaimIssues = validateQuestionQuality({
  typeId: "IRRELEVANT",
  question: obviousCounterclaimQuestion,
  passage: PASSAGE,
  requestedDifficulty: "KILLER",
});
assert(
  obviousCounterclaimIssues.some((issue) => issue.code === "irrelevant-obvious-counterclaim-cue"),
  "KILLER IRRELEVANT should reject explicit counterclaim giveaway cues",
);

const prescriptiveGiveawayQuestion = makeAiQuestion(10);
prescriptiveGiveawayQuestion.irrelevantIndex = 6;
prescriptiveGiveawayQuestion.sentences[6] =
  "Even in the absence of financial incentives, researchers should prioritize their own academic interests to secure intellectual property rights.";
prescriptiveGiveawayQuestion.correctAnswer = LABELS[6];
prescriptiveGiveawayQuestion.options = LABELS.slice(0, 10).map((label) => ({ label, text: label }));
prescriptiveGiveawayQuestion.wrongOptionExplanations = Object.fromEntries(
  LABELS.slice(0, 10)
    .filter((_, index) => index !== prescriptiveGiveawayQuestion.irrelevantIndex)
    .map((label) => [label, "This source sentence supports the paragraph's evidence-based flow."]),
);
const prescriptiveGiveawayIssues = validateQuestionQuality({
  typeId: "IRRELEVANT",
  question: prescriptiveGiveawayQuestion,
  passage: PASSAGE,
  requestedDifficulty: "KILLER",
});
assert(
  prescriptiveGiveawayIssues.some((issue) => issue.code === "irrelevant-prescriptive-giveaway"),
  "KILLER IRRELEVANT should reject blunt prescriptive giveaway cues",
);
assert(
  prescriptiveGiveawayIssues.some((issue) => issue.code === "irrelevant-obvious-counterclaim-cue"),
  "KILLER IRRELEVANT should reject intellectual-property detours",
);

const sponsorAdviceQuestion = makeAiQuestion(10);
sponsorAdviceQuestion.irrelevantIndex = 6;
sponsorAdviceQuestion.sentences[6] =
  "Therefore, establishing a fair standard to evaluate financial rewards can encourage researchers to develop stable relationships with various sponsors.";
sponsorAdviceQuestion.correctAnswer = LABELS[6];
sponsorAdviceQuestion.options = LABELS.slice(0, 10).map((label) => ({ label, text: label }));
sponsorAdviceQuestion.wrongOptionExplanations = Object.fromEntries(
  LABELS.slice(0, 10)
    .filter((_, index) => index !== sponsorAdviceQuestion.irrelevantIndex)
    .map((label) => [label, "This source sentence supports the paragraph's evidence-based flow."]),
);
const sponsorAdviceIssues = validateQuestionQuality({
  typeId: "IRRELEVANT",
  question: sponsorAdviceQuestion,
  passage: PASSAGE,
  requestedDifficulty: "KILLER",
});
assert(
  sponsorAdviceIssues.some((issue) => issue.code === "irrelevant-prescriptive-giveaway"),
  "KILLER IRRELEVANT should reject sponsor-relationship advice detours",
);

const dynamicSchema = getAiResponseSchema("IRRELEVANT", { irrelevantSlotCount: 9 });
const schemaQuestion = makeAiQuestion(9);
const correctLabel = schemaQuestion.correctAnswer;
const schemaWrongExplanations = schemaQuestion.options
  .filter((option) => option.label !== correctLabel)
  .map((option) => ({
    label: option.label,
    explanation: `${option.label} is part of the original source flow, so it is not the irrelevant inserted sentence.`,
  }));
assert(
  !dynamicSchema.safeParse({
    questions: [{ ...schemaQuestion, wrongOptionExplanations: schemaWrongExplanations.slice(0, 4) }],
  }).success,
  "9-slot IRRELEVANT schema should reject only 4 wrong-option explanations",
);
assert(
  dynamicSchema.safeParse({
    questions: [{ ...schemaQuestion, wrongOptionExplanations: schemaWrongExplanations }],
  }).success,
  "9-slot IRRELEVANT schema should accept 8 wrong-option explanations",
);

assert(readIrrelevantSlotCountSetting({ slotCount: 7 }) === 7, "direct slotCount setting was not read");
assert(readIrrelevantSlotCountSetting({ IRRELEVANT: { slotCount: 8 } }) === 8, "nested slotCount setting was not read");
assert(!validateIrrelevantAgainstPassage(10, 6).ok, "guardrail should reject slotCount above passage length");
assert(validateIrrelevantAgainstPassage(6, 6).ok, "guardrail should allow slotCount equal to passage length");

console.log("[irrelevant-dynamic-slots] ok");
