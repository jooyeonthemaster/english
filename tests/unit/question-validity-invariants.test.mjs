import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = String.raw`
import quality from "@/lib/question-quality";
import qualityCore from "@/lib/question-quality/core";
import generationConstants from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts";

const { validateQuestionQuality } = quality;
const { SHIP_FIRST_WARNING_CODES } = qualityCore;
const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } = generationConstants;

function issues(input: any) {
  return validateQuestionQuality(input);
}

const sourcePassage =
  "Writers develop such a style by acknowledging that readers expect the same things that listeners expect in conversation. In fact, writing does not permit the nonverbal communication and immediate feedback that are part of conversation.";

const grammarQuestion: Record<string, unknown> = {
  difficulty: "KILLER",
  passageWithMarkers:
    "Writers develop such a style by __(A) acknowledging__ that readers __(B) expect__ the same things that listeners expect in conversation. In fact, writing __(C) is not permitted__ the nonverbal communication and immediate feedback __(D) that__ are __(E) part__ of conversation.",
  markedExpressions: [
    { label: "(A)", isError: false, pointCode: "i", expression: "acknowledging", errorExpression: "acknowledging", surroundingText: "Writers develop such a style by acknowledging that readers expect" },
    { label: "(B)", isError: false, pointCode: "a", expression: "expect", errorExpression: "expect", surroundingText: "readers expect the same things" },
    { label: "(C)", isError: true, pointCode: "e", expression: "does not permit", errorExpression: "is not permitted", correction: "does not permit", surroundingText: "writing does not permit the nonverbal communication and immediate feedback" },
    { label: "(D)", isError: false, pointCode: "b", expression: "that", errorExpression: "that", surroundingText: "communication and immediate feedback that are part" },
    { label: "(E)", isError: false, pointCode: "c", expression: "part", errorExpression: "part", surroundingText: "are part of conversation" },
  ],
  options: [
    { label: "(A)", text: "acknowledging" },
    { label: "(B)", text: "expect" },
    { label: "(C)", text: "is not permitted" },
    { label: "(D)", text: "that" },
    { label: "(E)", text: "part" },
  ],
  correctAnswer: "(C)",
  correctAnswers: ["(C)"],
  explanation: "permit은 목적어를 취하므로 능동태로 써야 한다는 해설입니다.",
  wrongOptionExplanations: {
    "(A)": "전치사 뒤 동명사입니다.",
    "(B)": "복수 주어와 일치합니다.",
    "(D)": "관계절을 이끕니다.",
    "(E)": "보어 명사입니다.",
  },
};

const retainedPassive = issues({
  typeId: "GRAMMAR_ERROR",
  question: grammarQuestion,
  passage: sourcePassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const nonPassiveMutationQuestion = structuredClone(grammarQuestion);
(nonPassiveMutationQuestion.markedExpressions as any[])[2] = {
  ...(nonPassiveMutationQuestion.markedExpressions as any[])[2],
  errorExpression: "does not permits",
};
nonPassiveMutationQuestion.passageWithMarkers = String(
  nonPassiveMutationQuestion.passageWithMarkers,
).replace("is not permitted", "does not permits");
(nonPassiveMutationQuestion.options as any[])[2].text = "does not permits";
const nonPassiveMutation = issues({
  typeId: "GRAMMAR_ERROR",
  question: nonPassiveMutationQuestion,
  passage: sourcePassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const comboBase = {
  difficulty: "KILLER",
  passageWithMarkers:
    "Writers develop such a style by acknowledging (A) [what / that] readers expect the same things that listeners expect in conversation. This attention may be (B) [very / even] more important. Writers anticipate the (C) [absent / absently] reader's response.",
  slots: [
    { label: "(A)", pointCode: "b", wrongExpression: "what", correctExpression: "that", surroundingText: "acknowledging that readers expect the same things" },
    { label: "(B)", pointCode: "m", wrongExpression: "very", correctExpression: "even", surroundingText: "even more important" },
    { label: "(C)", pointCode: "f", wrongExpression: "absently", correctExpression: "absent", surroundingText: "the absent reader's response" },
  ],
  options: [
    { label: "1", text: "what - even - absent", slotValues: ["what", "even", "absent"] },
    { label: "2", text: "what - very - absently", slotValues: ["what", "very", "absently"] },
    { label: "3", text: "that - even - absent", slotValues: ["that", "even", "absent"] },
    { label: "4", text: "that - very - absent", slotValues: ["that", "very", "absent"] },
    { label: "5", text: "that - even - absently", slotValues: ["that", "even", "absently"] },
  ],
  correctAnswer: "3",
  explanation:
    "(A) expect의 목적어가 빠져 있고 선행사 the same things를 수식하므로 목적격 관계대명사 that이 맞습니다. (B) even이 비교급을 강조합니다. (C) absent가 명사를 수식합니다.",
  keyPoints: ["관계대명사 that과 what의 구분", "비교급 강조", "형용사 수식"],
  wrongOptionExplanations: {
    "1": "선행사가 있는데 what을 썼습니다.",
    "2": "세 슬롯이 모두 틀렸습니다.",
    "4": "very는 비교급을 강조하지 못합니다.",
    "5": "absently는 명사를 수식하지 못합니다.",
  },
};
const comboMislabel = issues({
  typeId: "GRAMMAR_CHOICE_COMBO",
  question: comboBase,
  passage: sourcePassage,
  requestedDifficulty: "KILLER",
});

const comboClean = structuredClone(comboBase);
comboClean.explanation =
  "(A) acknowledge 뒤에는 완전한 절을 이끄는 명사절 접속사 that이 맞고, what을 쓰면 명사 성분이 하나 더 생깁니다. (B) even이 비교급을 강조합니다. (C) absent가 명사를 수식합니다.";
comboClean.keyPoints = ["명사절 접속사 that과 선행사 포함 관계사 what의 구분", "비교급 강조", "형용사 수식"];
comboClean.wrongOptionExplanations = {
  "1": "(A) 완전한 절 앞에 명사절 접속사가 필요하므로 what은 맞지 않습니다.",
  "2": "세 슬롯이 모두 틀렸습니다.",
  "4": "very는 비교급을 강조하지 못합니다.",
  "5": "absently는 명사를 수식하지 못합니다.",
};
const comboCorrectExplanation = issues({
  typeId: "GRAMMAR_CHOICE_COMBO",
  question: comboClean,
  passage: sourcePassage,
  requestedDifficulty: "KILLER",
});

const seamQuestion = {
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank: "Writing _____ that are part of conversation requires care.",
  originalExpression: "lacks nonverbal communication and immediate feedback",
  options: [
    { label: "1", text: "lacks physical cues and instant responses" },
    { label: "2", text: "allows readers to control the flow of exchange" },
    { label: "3", text: "requires formal grammar rules and structures" },
    { label: "4", text: "restricts information to preserve interest" },
    { label: "5", text: "encourages gestures and adjustments" },
  ],
  correctAnswer: "1",
  explanation: "글쓰기는 즉각적인 단서와 반응이 부족합니다.",
};
const seamBroken = issues({
  typeId: "BLANK_INFERENCE",
  question: seamQuestion,
  passage: "Writing lacks nonverbal communication and immediate feedback that are part of conversation.",
  requestedDifficulty: "KILLER",
});

const seamCleanQuestion = structuredClone(seamQuestion);
seamCleanQuestion.passageWithBlank = "The policy creates _____ that are difficult to reverse.";
seamCleanQuestion.options = [
  { label: "1", text: "several institutional constraints" },
  { label: "2", text: "long-lasting social costs" },
  { label: "3", text: "two competing incentives" },
  { label: "4", text: "durable political tradeoffs" },
  { label: "5", text: "multiple implementation barriers" },
];
const seamClean = issues({
  typeId: "BLANK_INFERENCE",
  question: seamCleanQuestion,
  requestedDifficulty: "KILLER",
});

const awkwardBlankQuestion = structuredClone(seamQuestion);
awkwardBlankQuestion.passageWithBlank = "Experts rely on _____ when evidence is noisy.";
awkwardBlankQuestion.originalExpression = "disciplined analytical methods";
awkwardBlankQuestion.options = [
  { label: "1", text: "rational tools" },
  { label: "2", text: "disciplined analytical methods" },
  { label: "3", text: "careful comparisons of competing claims" },
  { label: "4", text: "structured reviews of the available evidence" },
  { label: "5", text: "explicit tests of plausible alternatives" },
];
awkwardBlankQuestion.correctAnswer = "1";
const awkwardBlank = issues({
  typeId: "BLANK_INFERENCE",
  question: awkwardBlankQuestion,
  requestedDifficulty: "KILLER",
});

const slotSyntaxBlankQuestion = structuredClone(seamQuestion);
slotSyntaxBlankQuestion.passageWithBlank = "Experts improve judgment by _____.";
slotSyntaxBlankQuestion.originalExpression = "organizing evidence around explicit assumptions";
slotSyntaxBlankQuestion.options = [
  { label: "1", text: "by organizing evidence around explicit assumptions" },
  { label: "2", text: "by comparing rival explanations" },
  { label: "3", text: "by separating predictive facts from noise" },
  { label: "4", text: "by revising weak assumptions" },
  { label: "5", text: "by testing the structure of their reasoning" },
];
slotSyntaxBlankQuestion.correctAnswer = "1";
const slotSyntaxBlank = issues({
  typeId: "BLANK_INFERENCE",
  question: slotSyntaxBlankQuestion,
  requestedDifficulty: "KILLER",
});

const paraphraseResidualQuestion = {
  ...structuredClone(seamCleanQuestion),
  passageWithBlank:
    "The policy creates several institutional constraints. Its strongest long-term effect is _____.",
  originalExpression: "lasting limits on how institutions can respond",
  answerLogic:
    "The correct option restates lasting limits as institutional constraints, but the same wording must not remain visible.",
  options: [
    { label: "1", text: "several institutional constraints" },
    { label: "2", text: "a temporary administrative convenience" },
    { label: "3", text: "an immediate expansion of discretion" },
    { label: "4", text: "a purely symbolic public gesture" },
    { label: "5", text: "an easily reversible procedural choice" },
  ],
  correctAnswer: "1",
};
const paraphraseResidual = issues({
  typeId: "BLANK_INFERENCE",
  question: paraphraseResidualQuestion,
  requestedDifficulty: "INTERMEDIATE",
  blankInferenceParaphraseAnswer: true,
});

const paraphraseResidualNearNegativeQuestion = structuredClone(paraphraseResidualQuestion);
paraphraseResidualNearNegativeQuestion.passageWithBlank =
  "The policy creates several institutional barriers. Its strongest long-term effect is _____.";
const paraphraseResidualNearNegative = issues({
  typeId: "BLANK_INFERENCE",
  question: paraphraseResidualNearNegativeQuestion,
  requestedDifficulty: "INTERMEDIATE",
  blankInferenceParaphraseAnswer: true,
});

const paraphraseResidualTokenBoundaryQuestion = structuredClone(paraphraseResidualQuestion);
paraphraseResidualTokenBoundaryQuestion.passageWithBlank =
  "A public article can explain cultural policy, while the proposal's central aim is _____.";
paraphraseResidualTokenBoundaryQuestion.originalExpression =
  "supporting civic artworks in shared spaces";
paraphraseResidualTokenBoundaryQuestion.options[0].text = "public art";
const paraphraseResidualTokenBoundary = issues({
  typeId: "BLANK_INFERENCE",
  question: paraphraseResidualTokenBoundaryQuestion,
  requestedDifficulty: "INTERMEDIATE",
  blankInferenceParaphraseAnswer: true,
});

const paraphraseResidualHyphenEquivalentQuestion = structuredClone(paraphraseResidualQuestion);
paraphraseResidualHyphenEquivalentQuestion.passageWithBlank =
  "The committee endorses evidence based reasoning. Its central recommendation is _____.";
paraphraseResidualHyphenEquivalentQuestion.originalExpression =
  "reasoning that is disciplined by available evidence";
paraphraseResidualHyphenEquivalentQuestion.options[0].text = "evidence-based reasoning";
const paraphraseResidualHyphenEquivalent = issues({
  typeId: "BLANK_INFERENCE",
  question: paraphraseResidualHyphenEquivalentQuestion,
  requestedDifficulty: "INTERMEDIATE",
  blankInferenceParaphraseAnswer: true,
});

function possessiveResidualIssues(apostrophe: string) {
  const question = structuredClone(paraphraseResidualQuestion);
  const correctText = "students" + apostrophe + " shared responsibility";
  question.passageWithBlank =
    "The " + correctText + " shaped the project. The key is _____.";
  question.originalExpression = "the learners' collective duty for the project";
  question.options[0].text = correctText;
  return issues({
    typeId: "BLANK_INFERENCE",
    question,
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceParaphraseAnswer: true,
  });
}

const paraphraseResidualStraightPossessive = possessiveResidualIssues("'");
const paraphraseResidualCurlyPossessive = possessiveResidualIssues("’");

function punctuatedResidualIssues(passage: string, correctText: string) {
  const question = structuredClone(paraphraseResidualQuestion);
  question.passageWithBlank = passage;
  question.originalExpression = "a semantically equivalent source expression";
  question.options[0].text = correctText;
  return issues({
    typeId: "BLANK_INFERENCE",
    question,
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceParaphraseAnswer: true,
  });
}

const punctuatedResidualExact = [
  ["The teachers' students' shared responsibility shaped the project. The key is _____.", "teachers' students' shared responsibility"],
  ["The students’\u00A0shared responsibility shaped the project. The key is _____.", "students’ shared responsibility"],
  ["Teams value evidence, context, and judgment. Their safeguard is _____.", "evidence, context, and judgment"],
  ["The report uses cost/benefit analysis throughout. Its method is _____.", "cost/benefit analysis"],
  ["The agency follows a research & development strategy. Its approach is _____.", "research & development strategy"],
  ["Teams rely on evidence (not intuition) when deciding. Their rule is _____.", "evidence (not intuition)"],
  ["The policy follows one principle: shared responsibility. Its foundation is _____.", "one principle: shared responsibility"],
  ["A U.S. policy shaped the response. The decisive factor is _____.", "U.S. policy"],
  ["The plan balances speed; accuracy remains essential. Its formula is _____.", "speed; accuracy"],
  ["The course teaches theory + practice together. Its design is _____.", "theory + practice"],
].map(([passage, correctText]) => punctuatedResidualIssues(passage, correctText));

const punctuatedResidualNearNegative = [
  ["A teacher's shared responsibility shaped the project. The key is _____.", "teachers' shared responsibility"],
  ["The agency follows a research and development strategy. Its approach is _____.", "research & development strategy"],
  ["A US policy shaped the response. The decisive factor is _____.", "U.S. policy"],
  ["Teams value evidence, contexts, and judgment. Their safeguard is _____.", "evidence, context, and judgment"],
  ["The costbenefit analysis was disputed. Its method is _____.", "cost/benefit analysis"],
  ["Teams rely on evidence and not intuition. Their rule is _____.", "evidence (not intuition)"],
].map(([passage, correctText]) => punctuatedResidualIssues(passage, correctText));

const missingWrongExplanations = structuredClone(grammarQuestion);
missingWrongExplanations.wrongOptionExplanations = {};
const missingExplanationIssues = issues({
  typeId: "GRAMMAR_ERROR",
  question: missingWrongExplanations,
  passage: sourcePassage,
  requestedDifficulty: "KILLER",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
});

const criticalCodes = [
  "blank-relative-tail-contract",
  "blank-finite-tail-agreement-contract",
  "blank-double-connector-boundary",
  "blank-double-preposition-boundary",
  "blank-double-punctuation-boundary",
  "blank-article-boundary",
  "blank-awkward-correct-option",
  "blank-awkward-option",
  "blank-option-slot-syntax",
  "blank-paraphrase-subject-slot-mismatch",
  "blank-paraphrase-correct-residual-visible",
  "blank-explanation-narrative-circled-numbering",
  "sentence-order-empty-paragraph",
  "sentence-order-given-contains-paragraph-label",
  "summary-mc-missing-direction",
  "summary-mc-direction-task-mismatch",
  "summary-mc-correct-completion-ungrammatical",
  "topic-option-language",
  "implied-meaning-option-language",
  "irrelevant-inserted-ungrammatical",
  "combo-complementizer-that-mislabel",
  "grammar-debatable-retained-object-passive",
  "grammar-explanation-lint",
  "grammar-category-mislabel",
  "grammar-explanation-typo",
  "grammar-answer-nonword-forced",
  "grammar-correction-form-exposed",
  "grammar-error-pos-change",
  "grammar-gibberish-inversion-fragment",
  "grammar-keypoint-nonexistent-label",
  "grammar-terminology-error",
  "grammar-appear-pointcode-voice-mismatch",
  "grammar-pointcode-span-mismatch",
  "wrong-option-explanation-count",
];

process.stdout.write(JSON.stringify({
  retainedPassive,
  nonPassiveMutation,
  comboMislabel,
  comboCorrectExplanation,
  seamBroken,
  seamClean,
  awkwardBlank,
  slotSyntaxBlank,
  paraphraseResidual,
  paraphraseResidualNearNegative,
  paraphraseResidualTokenBoundary,
  paraphraseResidualHyphenEquivalent,
  paraphraseResidualStraightPossessive,
  paraphraseResidualCurlyPossessive,
  punctuatedResidualExact,
  punctuatedResidualNearNegative,
  missingExplanationIssues,
  policy: Object.fromEntries(criticalCodes.map((code) => [code, {
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
    shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
  }])),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".question-validity-invariants-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    rmSync(harnessPath, { force: true });
  }
}

const result = runHarness();
const find = (items, code) => items.find((item) => item.code === code);

test("retained-object active-to-passive answer sites are rejected without catching non-passive mutations", () => {
  assert.equal(
    find(result.retainedPassive, "grammar-debatable-retained-object-passive")?.severity,
    "error",
  );
  assert.equal(
    find(result.nonPassiveMutation, "grammar-debatable-retained-object-passive"),
    undefined,
  );
});

test("combo complementizer-that explanation mislabels are caught across student-facing explanation fields", () => {
  assert.equal(
    find(result.comboMislabel, "combo-complementizer-that-mislabel")?.severity,
    "error",
  );
  assert.equal(
    find(result.comboCorrectExplanation, "combo-complementizer-that-mislabel"),
    undefined,
  );
});

test("blank seam grammar shortcuts are blocking while homogeneous option contracts pass", () => {
  assert.equal(find(result.seamBroken, "blank-relative-tail-contract")?.severity, "error");
  assert.equal(find(result.seamClean, "blank-relative-tail-contract"), undefined);
});

test("awkward blank wording and contextual slot syntax cannot be shipped as craft warnings", () => {
  assert.equal(
    find(result.awkwardBlank, "blank-awkward-correct-option")?.severity,
    "error",
  );
  assert.equal(
    find(result.slotSyntaxBlank, "blank-option-slot-syntax")?.severity,
    "error",
  );
});

test("a paraphrased correct option visible elsewhere is a fatal leak without near-match false positives", () => {
  assert.equal(
    find(result.paraphraseResidual, "blank-paraphrase-correct-residual-visible")?.severity,
    "error",
  );
  assert.equal(
    find(
      result.paraphraseResidualNearNegative,
      "blank-paraphrase-correct-residual-visible",
    ),
    undefined,
  );
  assert.equal(
    find(
      result.paraphraseResidualTokenBoundary,
      "blank-paraphrase-correct-residual-visible",
    ),
    undefined,
    JSON.stringify(result.paraphraseResidualTokenBoundary),
  );
  assert.equal(
    find(
      result.paraphraseResidualHyphenEquivalent,
      "blank-paraphrase-correct-residual-visible",
    )?.severity,
    "error",
    JSON.stringify(result.paraphraseResidualHyphenEquivalent),
  );
  for (const issues of [
    result.paraphraseResidualStraightPossessive,
    result.paraphraseResidualCurlyPossessive,
  ]) {
    assert.equal(
      find(issues, "blank-paraphrase-correct-residual-visible")?.severity,
      "error",
      JSON.stringify(issues),
    );
  }
  for (const issues of result.punctuatedResidualExact) {
    assert.equal(
      find(issues, "blank-paraphrase-correct-residual-visible")?.severity,
      "error",
      JSON.stringify(issues),
    );
  }
  for (const issues of result.punctuatedResidualNearNegative) {
    assert.equal(
      find(issues, "blank-paraphrase-correct-residual-visible"),
      undefined,
      JSON.stringify(issues),
    );
  }
});

test("missing wrong-option explanations are errors", () => {
  assert.equal(
    find(result.missingExplanationIssues, "wrong-option-explanation-count")?.severity,
    "error",
  );
});

test("validity and factual-explanation codes cannot be downgraded by relaxed/salvage/ship-first policy", () => {
  for (const [code, policy] of Object.entries(result.policy)) {
    assert.equal(policy.relaxedBlocking, true, `${code} must block relaxed mode`);
    assert.equal(policy.salvageRelaxable, false, `${code} must not be salvage-relaxable`);
    assert.equal(policy.shipFirstWarning, false, `${code} must not be ship-first warning`);
  }
});
