import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as qualityCore from "../../../../src/lib/question-quality/core";
import * as generationConstants from "../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as summaryMc from "../../../../src/lib/question-quality/validators/summary/mc";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const qualityCoreRuntime =
  (qualityCore as unknown as { default?: typeof qualityCore }).default ?? qualityCore;
const generationConstantsRuntime =
  (generationConstants as unknown as { default?: typeof generationConstants }).default ??
  generationConstants;
const grammarSharedRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const summaryMcRuntime =
  (summaryMc as unknown as { default?: typeof summaryMc }).default ?? summaryMc;

const {
  validateQuestionQuality,
} = qualityRuntime;
const { SHIP_FIRST_WARNING_CODES } = qualityCoreRuntime;
const {
  RELAXED_BLOCKING_QUALITY_CODES,
  SALVAGE_RELAXABLE_CODES,
} = generationConstantsRuntime;
const {
  findGrammarKeypointChoiceMismatch,
  findGrammarKeypointNonexistentLabel,
  findGrammarTerminologyError,
  findGrammarTerminologyRegister,
} = grammarSharedRuntime;
const {
  findAwkwardSummaryMcCollocation,
  findSummaryMcCorrectCompletionUngrammatical,
} = summaryMcRuntime;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(relativePath: string): string {
  return sha256(readFileSync(path.join(repoRoot, relativePath)));
}

function issueShape(issues: Array<{ code: string; severity: string }>) {
  return issues.map(({ code, severity }) => ({ code, severity }));
}

function policy(code: string) {
  return {
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
    shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
  };
}

const fatalCodes = [
  "sentence-order-empty-paragraph",
  "sentence-order-given-contains-paragraph-label",
  "summary-mc-missing-direction",
  "summary-mc-direction-task-mismatch",
  "blank-explanation-narrative-circled-numbering",
  "blank-paraphrase-correct-residual-visible",
  "grammar-keypoint-nonexistent-label",
  "grammar-terminology-error",
  "summary-mc-correct-completion-ungrammatical",
] as const;

const craftCodes = [
  "sentence-order-given-too-long",
  "sentence-order-paragraph-too-short",
  "sentence-order-paragraph-too-thin",
  "summary-mc-direction-frame",
  "blank-explanation-step-numbering",
  "grammar-keypoint-choice-mismatch",
  "grammar-terminology-register",
  "summary-mc-awkward-collocation",
] as const;

const policyMap = Object.fromEntries(
  [...fatalCodes, ...craftCodes].map((code) => [code, policy(code)]),
);

const fatalPolicyViolations = fatalCodes.filter((code) => {
  const item = policyMap[code];
  return !item.relaxedBlocking || item.salvageRelaxable || item.shipFirstWarning;
});

const summaryPassage =
  "Careful teams compare independent measurements before making a decision. " +
  "This practice reduces the risk that one noisy result will determine the outcome.";

const summaryBase = {
  direction: "Complete the summary by choosing the best words for (A) and (B).",
  summaryWithBlanks:
    "Teams can make more (A) decisions by comparing measurements, thereby reducing reliance on (B) results.",
  blanks: [
    { label: "(A)", answer: "reliable" },
    { label: "(B)", answer: "noisy" },
  ],
  options: [
    { label: "1", text: "reliable / noisy", blankA: "reliable", blankB: "noisy" },
    { label: "2", text: "reliable / stable", blankA: "reliable", blankB: "stable" },
    { label: "3", text: "hasty / noisy", blankA: "hasty", blankB: "noisy" },
    { label: "4", text: "hasty / stable", blankA: "hasty", blankB: "stable" },
    { label: "5", text: "random / fixed", blankA: "random", blankB: "fixed" },
  ],
  correctAnswer: "1",
  explanation: "Independent measurements support reliable decisions and reduce reliance on noisy results.",
};

function directionIssues(direction: string) {
  return issueShape(
    validateQuestionQuality({
      typeId: "SUMMARY_COMPLETE_MC",
      question: { ...summaryBase, direction },
      passage: summaryPassage,
      requestedDifficulty: "INTERMEDIATE",
    }).filter(
      (issue) =>
        issue.code === "summary-mc-missing-direction" ||
        issue.code.startsWith("summary-mc-direction"),
    ),
  );
}

const sentenceOrderBase = {
  givenSentence:
    "People often assume that efficient communication depends only on transmitting more information.",
  paragraphs: [
    {
      label: "(A)",
      text: "Yet listeners must also decide which details deserve attention during a complex exchange. That judgment depends on context, goals, and prior knowledge in the situation at hand.",
    },
    {
      label: "(B)",
      text: "Communication therefore succeeds when speakers deliberately guide attention instead of merely adding disconnected facts. Relevance matters as much as the total amount of information supplied to listeners.",
    },
    {
      label: "(C)",
      text: "A long message can consequently obscure the central point it was originally meant to clarify. More content does not automatically produce better understanding for attentive listeners in practice.",
    },
  ],
  options: [
    { label: "1", text: "(A)-(B)-(C)" },
    { label: "2", text: "(A)-(C)-(B)" },
    { label: "3", text: "(B)-(A)-(C)" },
    { label: "4", text: "(B)-(C)-(A)" },
    { label: "5", text: "(C)-(A)-(B)" },
  ],
  correctAnswer: "2",
};

function sentenceOrderIssues(question: Record<string, unknown>) {
  return issueShape(
    validateQuestionQuality({
      typeId: "SENTENCE_ORDER",
      question,
      passage: "",
      requestedDifficulty: "INTERMEDIATE",
    }).filter((issue) => issue.code.startsWith("sentence-order-")),
  );
}

const blankBase = {
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  passageWithBlank:
    "Institutions often retain the effects of earlier choices. Their strongest long-term consequence is _____.",
  originalExpression: "lasting limits on how institutions can respond",
  answerLogic:
    "The answer restates the lasting institutional limits expressed in the source without copying them.",
  options: [
    { label: "1", text: "durable constraints on institutional choice" },
    { label: "2", text: "a temporary administrative convenience" },
    { label: "3", text: "an immediate expansion of discretion" },
    { label: "4", text: "a purely symbolic public gesture" },
    { label: "5", text: "an easily reversible procedural choice" },
  ],
  correctAnswer: "1",
  explanation: "Earlier choices can constrain what institutions are later able to do.",
};

function blankIssues(question: Record<string, unknown>) {
  return validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question,
    passage:
      "Institutions often retain the effects of earlier choices, creating lasting limits on how institutions can respond.",
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceParaphraseAnswer: true,
  });
}

function explanationNumberingIssues(explanation: string) {
  return issueShape(
    blankIssues({ ...blankBase, explanation }).filter(
      (issue) =>
        issue.code === "blank-explanation-step-numbering" ||
        issue.code === "blank-explanation-narrative-circled-numbering",
    ),
  );
}

function residualIssues(
  passageWithBlank: string,
  correctText: string,
) {
  const question = {
    ...blankBase,
    passageWithBlank,
    options: [
      { label: "1", text: correctText },
      ...blankBase.options.slice(1),
    ],
  };
  return issueShape(
    blankIssues(question).filter(
      (issue) => issue.code === "blank-paraphrase-correct-residual-visible",
    ),
  );
}

const markedExpressions = [
  { label: "(A)", pointCode: "a" },
  { label: "(B)", pointCode: "b" },
  { label: "(C)", pointCode: "c" },
];

const sourcePaths = [
  "src/lib/question-quality/core.ts",
  "src/lib/question-quality/dispatcher.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "src/lib/question-quality/validators/summary/mc.ts",
  "src/lib/question-quality/validators/blank/inference.ts",
  "src/lib/question-quality/validators/grammar/shared.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
  "tests/unit/sentence-order-quality.test.mjs",
  "tests/unit/summary-mc-direction-split.test.mjs",
  "tests/unit/blank-explanation-step-numbering.test.mjs",
  "tests/unit/question-validity-invariants.test.mjs",
  "tests/unit/grammar-keypoint-core10.test.mjs",
  "tests/unit/summary-mc-collocation-severity-split.test.mjs",
] as const;

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  safety: {
    modelApiCalls: 0,
    browserCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    productionEdits: 0,
  },
  provenance: {
    auditScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    sourceSha256: Object.fromEntries(sourcePaths.map((item) => [item, fileSha(item)])),
  },
  policy: {
    fatalCodes,
    craftCodes,
    map: policyMap,
    fatalPolicyViolations,
    legacyTerminologyCodePresentInAnyPolicy:
      RELAXED_BLOCKING_QUALITY_CODES.has("grammar-nonstandard-terminology") ||
      SALVAGE_RELAXABLE_CODES.has("grammar-nonstandard-terminology") ||
      SHIP_FIRST_WARNING_CODES.has("grammar-nonstandard-terminology"),
  },
  observations: {
    sentenceOrder: {
      whitespaceEmpty: sentenceOrderIssues({
        ...sentenceOrderBase,
        paragraphs: sentenceOrderBase.paragraphs.map((paragraph, index) =>
          index === 1 ? { ...paragraph, text: " \n\t " } : paragraph,
        ),
      }),
      zeroWidthEmpty: sentenceOrderIssues({
        ...sentenceOrderBase,
        paragraphs: sentenceOrderBase.paragraphs.map((paragraph, index) =>
          index === 1 ? { ...paragraph, text: "\u200B" } : paragraph,
        ),
      }),
      uppercaseGivenLabel: sentenceOrderIssues({
        ...sentenceOrderBase,
        givenSentence: `${sentenceOrderBase.givenSentence} (A) This text belongs to a paragraph.`,
      }),
      lowercaseGivenLabel: sentenceOrderIssues({
        ...sentenceOrderBase,
        givenSentence: `${sentenceOrderBase.givenSentence} (a) This text belongs to a paragraph.`,
      }),
    },
    summaryDirection: {
      missing: directionIssues("   "),
      competingGrammarTask: directionIssues(
        "Which of the underlined expressions is grammatically incorrect?",
      ),
      canonical: directionIssues(summaryBase.direction),
      validGrammarConstraint: directionIssues(
        "Complete the summary by choosing the grammatically correct words for (A) and (B).",
      ),
      competingBlankInferenceTask: directionIssues(
        "Choose the phrase that best fits the blank in the passage.",
      ),
    },
    blankExplanationNumbering: {
      intendedNarrativePositive: explanationNumberingIssues(
        "① 빈칸 문장의 대조를 확인한다. ② 근거 문장의 방향을 확인한다. ③ 이를 종합해 정답을 고른다.",
      ),
      legitimateOptionReview: explanationNumberingIssues(
        "① 먼저 제시된 해결책만 충분하다고 보므로 오답이다. ② 다음으로 기술의 효과를 즉각적이라고 가정하므로 오답이다. ③ 마지막으로 지문의 결론과 일치하므로 정답이다.",
      ),
      fragmentNarrativeWithoutBoundaries: explanationNumberingIssues(
        "① 빈칸 대조 확인 ② 근거 방향 확인 ③ 이를 종합",
      ),
      terseOptionVerdicts: explanationNumberingIssues(
        "①은 범위를 과장해 오답이다. ②는 인과를 뒤집어 오답이다. ③은 지문의 결론과 일치해 정답이다.",
      ),
    },
    blankParaphraseResidual: {
      exactVisible: residualIssues(
        "The policy creates durable constraints on institutional choice. Its deepest effect is _____.",
        "durable constraints on institutional choice",
      ),
      substringOnlyPublicArticle: residualIssues(
        "A public article can shape debate. The community ultimately values _____.",
        "public art",
      ),
      punctuationVariantVisible: residualIssues(
        "Teams often praise evidence based reasoning. Their strongest safeguard is _____.",
        "evidence-based reasoning",
      ),
    },
    grammarGhostLabel: {
      plainGhost: findGrammarKeypointNonexistentLabel(
        ["(F) 분사 선택을 확인한다."],
        markedExpressions,
      ),
      bulletPrefixedGhost: findGrammarKeypointNonexistentLabel(
        ["• (F) 분사 선택을 확인한다."],
        markedExpressions,
      ),
      numberedPrefixedGhost: findGrammarKeypointNonexistentLabel(
        ["1. (F) 분사 선택을 확인한다."],
        markedExpressions,
      ),
      bulletPrefixedCraftFallback: findGrammarKeypointChoiceMismatch(
        ["• (F) 분사 선택을 확인한다."],
        markedExpressions,
        "(A)",
      ),
    },
    grammarTerminology: {
      incorrectTerm: findGrammarTerminologyError("전사구를 확인한다."),
      specialistRegister: findGrammarTerminologyRegister("계사를 확인한다."),
      relationshipNearNegative: findGrammarTerminologyRegister("관계사를 확인한다."),
      accountantLexicalFalsePositive: findGrammarTerminologyRegister(
        "예문의 주어는 그 회계사이고 동사는 reviewed이다.",
      ),
    },
    summaryCompletionGrammar: {
      malformedGerund: findSummaryMcCorrectCompletionUngrammatical(
        "The policy promises equity to learning.",
      ),
      validInfinitiveLearn: findSummaryMcCorrectCompletionUngrammatical(
        "The program offers an opportunity to learn from evidence.",
      ),
      validInfinitiveSpring: findSummaryMcCorrectCompletionUngrammatical(
        "The program offers an opportunity to spring into action.",
      ),
      validInfinitiveBring: findSummaryMcCorrectCompletionUngrammatical(
        "Leaders accept a responsibility to bring evidence forward.",
      ),
      broadCraftNestedNounPhrase: findAwkwardSummaryMcCollocation(
        "This is a question of access to learning.",
      ),
    },
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
