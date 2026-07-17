import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as generationConstants from "../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants";
import * as quality from "../../../../src/lib/question-quality/index";
import * as qualityCore from "../../../../src/lib/question-quality/core";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as summaryMc from "../../../../src/lib/question-quality/validators/summary/mc";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

const generationConstantsRuntime =
  (generationConstants as unknown as { default?: typeof generationConstants }).default ??
  generationConstants;
const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const qualityCoreRuntime =
  (qualityCore as unknown as { default?: typeof qualityCore }).default ?? qualityCore;
const grammarSharedRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const summaryMcRuntime =
  (summaryMc as unknown as { default?: typeof summaryMc }).default ?? summaryMc;

const { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } =
  generationConstantsRuntime;
const { validateQuestionQuality } = qualityRuntime;
const { SHIP_FIRST_WARNING_CODES } = qualityCoreRuntime;
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

type AuditCase = {
  id: string;
  category: string;
  expectation: string;
  expected: boolean;
  observed: boolean;
  pass: boolean;
  evidence?: unknown;
};

const cases: AuditCase[] = [];

function addCase(
  id: string,
  category: string,
  expectation: string,
  expected: boolean,
  observed: boolean,
  evidence?: unknown,
): void {
  cases.push({
    id,
    category,
    expectation,
    expected,
    observed,
    pass: expected === observed,
    ...(evidence === undefined ? {} : { evidence }),
  });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha(relativePath: string): string {
  return sha256(readFileSync(path.join(repoRoot, relativePath)));
}

function issueShape(issues: Array<{ code: string; severity: string }>) {
  return issues.map(({ code, severity }) => ({ code, severity }));
}

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

// ---------------------------------------------------------------------------
// Shared fixtures. They are deliberately local to this audit: no test fixture
// or prior FAIL artifact is imported, so replay is independent of their logic.
// ---------------------------------------------------------------------------

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
  explanation:
    "Independent measurements support reliable decisions and reduce reliance on noisy results.",
};

function summaryDirectionIssues(direction: string) {
  return validateQuestionQuality({
    typeId: "SUMMARY_COMPLETE_MC",
    question: { ...summaryBase, direction },
    passage: summaryPassage,
    requestedDifficulty: "INTERMEDIATE",
  }).filter(
    (issue) =>
      issue.code === "summary-mc-missing-direction" ||
      issue.code.startsWith("summary-mc-direction"),
  );
}

const sentenceOrderBase = {
  givenSentence:
    "People often assume that efficient communication depends only on transmitting more information.",
  paragraphs: [
    {
      label: "(A)",
      text:
        "Yet listeners must also decide which details deserve attention during a complex exchange. That judgment depends on context, goals, and prior knowledge in the situation at hand.",
    },
    {
      label: "(B)",
      text:
        "Communication therefore succeeds when speakers deliberately guide attention instead of merely adding disconnected facts. Relevance matters as much as the total amount of information supplied to listeners.",
    },
    {
      label: "(C)",
      text:
        "A long message can consequently obscure the central point it was originally meant to clarify. More content does not automatically produce better understanding for attentive listeners in practice.",
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
  return validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }).filter((issue) => issue.code.startsWith("sentence-order-"));
}

function sentenceOrderWithEmptyParagraph(text: string) {
  return sentenceOrderIssues({
    ...sentenceOrderBase,
    paragraphs: sentenceOrderBase.paragraphs.map((paragraph, index) =>
      index === 1 ? { ...paragraph, text } : paragraph,
    ),
  });
}

function sentenceOrderWithGivenSuffix(suffix: string) {
  return sentenceOrderIssues({
    ...sentenceOrderBase,
    givenSentence: `${sentenceOrderBase.givenSentence} ${suffix}`,
  });
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

function blankExplanationIssues(explanation: string) {
  return blankIssues({ ...blankBase, explanation }).filter(
    (issue) =>
      issue.code === "blank-explanation-step-numbering" ||
      issue.code === "blank-explanation-narrative-circled-numbering",
  );
}

function blankResidualIssues(passageWithBlank: string, correctText: string) {
  return blankIssues({
    ...blankBase,
    passageWithBlank,
    options: [{ label: "1", text: correctText }, ...blankBase.options.slice(1)],
  }).filter((issue) => issue.code === "blank-paraphrase-correct-residual-visible");
}

const markedExpressions = [
  { label: "(A)", pointCode: "a" },
  { label: "(B)", pointCode: "b" },
  { label: "(C)", pointCode: "c" },
];

// ---------------------------------------------------------------------------
// Boundary 1: fatal summary-completion grammar vs broad craft collocation.
// ---------------------------------------------------------------------------

for (const [id, text] of [
  ["summary-invalid-equity-learning", "The policy promises equity to learning."],
  ["summary-invalid-opportunity-improving", "The program provides an opportunity to improving access."],
  ["summary-invalid-responsibility-ensuring", "Leaders accept responsibility to ensuring fairness."],
  ["summary-invalid-equality-achieving", "The reform seeks equality to achieving better outcomes."],
] as const) {
  const finding = findSummaryMcCorrectCompletionUngrammatical(text);
  addCase(id, "summary-collocation", "high-confidence gerund misuse is fatal", true, Boolean(finding), finding);
}

for (const [verb, text] of [
  ["bring", "Leaders accept a responsibility to bring evidence forward."],
  ["cling", "People have a right and an opportunity to cling to familiar routines."],
  ["fling", "The performer received an opportunity to fling the ribbon upward."],
  ["ring", "The technician has a responsibility to ring the alarm."],
  ["sing", "Every child deserves an opportunity to sing in the concert."],
  ["spring", "The program offers an opportunity to spring into action."],
  ["sting", "The insect has an opportunity to sting only when threatened."],
  ["swing", "The athlete had an opportunity to swing at the final pitch."],
] as const) {
  const finding = findSummaryMcCorrectCompletionUngrammatical(text);
  addCase(
    `summary-valid-infinitive-${verb}`,
    "summary-collocation",
    `base-form infinitive '${verb}' ending in -ing is not fatal`,
    false,
    Boolean(finding),
    finding,
  );
}

{
  const text = "The program offers an opportunity to learn from evidence.";
  const finding = findSummaryMcCorrectCompletionUngrammatical(text);
  addCase("summary-valid-infinitive-learn", "summary-collocation", "ordinary infinitive is not fatal", false, Boolean(finding), finding);
}

{
  const text = "This is a question of access to learning.";
  const fatal = findSummaryMcCorrectCompletionUngrammatical(text);
  const craft = findAwkwardSummaryMcCollocation(text);
  addCase("summary-nested-np-not-fatal", "summary-collocation", "broad nested noun phrase stays outside fatal detector", false, Boolean(fatal), fatal);
  addCase("summary-nested-np-craft-signal", "summary-collocation", "broad nested noun phrase retains craft signal", true, Boolean(craft), craft);
}

// ---------------------------------------------------------------------------
// Boundary 2: valid summary constraints vs genuinely competing task frames.
// ---------------------------------------------------------------------------

for (const [id, direction] of [
  ["direction-valid-canonical", summaryBase.direction],
  ["direction-valid-grammar-constraint", "Complete the summary by choosing the grammatically correct words for (A) and (B)."],
  ["direction-valid-grammar-options", "Complete the summary by selecting the grammatically correct options for (A) and (B)."],
  ["direction-valid-korean-grammar-constraint", "다음 요약문의 빈칸 (A), (B)에 들어갈 어법상 옳은 단어를 고르시오."],
  ["direction-valid-blank-wording", "Complete the summary by choosing the phrase that best fits blanks (A) and (B)."],
] as const) {
  const issues = summaryDirectionIssues(direction);
  const fatal =
    hasCode(issues, "summary-mc-missing-direction") ||
    hasCode(issues, "summary-mc-direction-task-mismatch");
  addCase(id, "summary-direction", "explicit summary-completion direction is not fatal", false, fatal, issueShape(issues));
}

for (const [id, direction] of [
  ["direction-competing-grammar-underlined", "Which of the underlined expressions is grammatically incorrect?"],
  ["direction-competing-grammar-sentence", "Choose the grammatically correct sentence."],
  ["direction-competing-blank-singular", "Choose the phrase that best fits the blank in the passage."],
  ["direction-competing-blank-fill", "Fill in the blank with the phrase that best completes the passage."],
  ["direction-competing-blank-plural", "Choose the words that best fit the blanks in the passage."],
  ["direction-competing-blank-place", "Select the phrase to place in the blank in this passage."],
  ["direction-competing-title", "Which title best represents the passage?"],
] as const) {
  const issues = summaryDirectionIssues(direction);
  const fatal = hasCode(issues, "summary-mc-direction-task-mismatch");
  addCase(id, "summary-direction", "clear competing task emits task-mismatch fatal", true, fatal, issueShape(issues));
}

for (const [id, direction] of [
  ["direction-mixed-summary-and-grammar", "Complete the summary by choosing words for (A) and (B). Then identify which underlined expression is grammatically incorrect."],
  ["direction-mixed-summary-and-blank", "Complete the summary by choosing words for (A) and (B). Then choose the phrase that best fits the blank in the passage."],
] as const) {
  const issues = summaryDirectionIssues(direction);
  const fatal = hasCode(issues, "summary-mc-direction-task-mismatch");
  addCase(id, "summary-direction", "mixed direction containing a second competing task is fatal", true, fatal, issueShape(issues));
}

{
  const issues = summaryDirectionIssues(" \n\t ");
  addCase("direction-missing", "summary-direction", "missing direction emits dedicated fatal", true, hasCode(issues, "summary-mc-missing-direction"), issueShape(issues));
}

// ---------------------------------------------------------------------------
// Boundary 3: circled option references vs circled narrative step structure.
// ---------------------------------------------------------------------------

for (const [id, explanation] of [
  ["circled-narrative-sentences", "① 빈칸 문장의 대조를 확인한다. ② 근거 문장의 방향을 확인한다. ③ 이를 종합해 정답을 고른다."],
  ["circled-narrative-compact", "① 빈칸 대조 확인 ② 근거 방향 확인 ③ 이를 종합"],
  ["circled-narrative-no-spaces", "①빈칸의 대조 확인②근거의 방향 확인③이를 종합"],
  ["circled-narrative-alternate-heads", "① 대조 관계 확인 ② 핵심 근거 확인 ③ 결론 종합"],
] as const) {
  const issues = blankExplanationIssues(explanation);
  addCase(
    id,
    "blank-circled-numbering",
    "two or more circled narrative steps emit fatal",
    true,
    hasCode(issues, "blank-explanation-narrative-circled-numbering"),
    issueShape(issues),
  );
}

for (const [id, explanation] of [
  ["circled-options-full-verdicts", "① 먼저 제시된 해결책만 충분하다고 보므로 오답이다. ② 다음으로 기술의 효과를 즉각적이라고 가정하므로 오답이다. ③ 마지막으로 지문의 결론과 일치하므로 정답이다."],
  ["circled-options-attached", "①은 범위를 과장해 오답이다. ②는 인과를 뒤집어 오답이다. ③은 지문의 결론과 일치해 정답이다."],
  ["circled-options-judged", "① 먼저 범위를 과장하므로 오답으로 판단된다. ② 다음으로 인과를 뒤집으므로 오답으로 판정된다. ③ 마지막으로 결론과 일치해 정답으로 판단된다."],
  ["circled-options-can-be-seen", "① 먼저 범위를 과장하므로 오답으로 볼 수 있다. ② 다음으로 인과를 뒤집으므로 오답이라고 할 수 있다. ③ 마지막으로 결론과 일치해 정답이라고 볼 수 있다."],
  ["circled-options-named", "① 선지는 범위를 과장한다. ② 보기는 인과를 뒤집는다. ③ 선지는 지문의 결론과 일치한다."],
  ["circled-options-coordinated", "①, ②, ④는 지문의 논지와 어긋나 오답이고, ③은 결론과 일치해 정답이다."],
] as const) {
  const issues = blankExplanationIssues(explanation);
  addCase(
    id,
    "blank-circled-numbering",
    "explicit option review is not narrative-step fatal",
    false,
    hasCode(issues, "blank-explanation-narrative-circled-numbering"),
    issueShape(issues),
  );
}

// ---------------------------------------------------------------------------
// Boundary 4: leading real/ghost keyPoint labels with common list prefixes.
// ---------------------------------------------------------------------------

for (const [id, point] of [
  ["ghost-plain", "(F) 분사 선택을 확인한다."],
  ["ghost-bullet-dot", "• (F) 분사 선택을 확인한다."],
  ["ghost-bullet-hyphen", "- (F) 분사 선택을 확인한다."],
  ["ghost-bullet-star", "* (F) 분사 선택을 확인한다."],
  ["ghost-number-period", "1. (F) 분사 선택을 확인한다."],
  ["ghost-number-paren", "2) (F) 분사 선택을 확인한다."],
  ["ghost-lowercase-label", "• (f) 분사 선택을 확인한다."],
  ["ghost-nested-bullet-number", "• 1. (F) 분사 선택을 확인한다."],
  ["ghost-circled-list-number", "① (F) 분사 선택을 확인한다."],
] as const) {
  const fatal = findGrammarKeypointNonexistentLabel([point], markedExpressions);
  const craft = findGrammarKeypointChoiceMismatch([point], markedExpressions, "(A)");
  addCase(
    id,
    "grammar-ghost-label",
    "leading nonexistent label remains fatal after list-prefix normalization",
    true,
    Boolean(fatal),
    { fatal, craftFallback: craft },
  );
}

for (const [id, point] of [
  ["ghost-valid-bullet-real-label", "• (A) 정동사 개수를 확인한다."],
  ["ghost-valid-number-real-label", "1. (C) 분사 선택을 확인한다."],
  ["ghost-later-parenthetical-mention", "(A) 정동사 개수를 확인하고 (F)는 예시로만 언급한다."],
] as const) {
  const fatal = findGrammarKeypointNonexistentLabel([point], markedExpressions);
  addCase(id, "grammar-ghost-label", "real leading label is not a ghost-label fatal", false, Boolean(fatal), fatal);
}

// ---------------------------------------------------------------------------
// Boundary 5: visually empty sentence-order chunks and case-folded labels.
// ---------------------------------------------------------------------------

for (const [id, text] of [
  ["sentence-empty-u200b", "\u200B"],
  ["sentence-empty-u200c", "\u200C"],
  ["sentence-empty-u200d", "\u200D"],
  ["sentence-empty-u2060", "\u2060"],
  ["sentence-empty-ufeff", "\uFEFF"],
  ["sentence-empty-format-combination", " \u200B\u200C\u200D\u2060\uFEFF \n"],
] as const) {
  const issues = sentenceOrderWithEmptyParagraph(text);
  addCase(id, "sentence-order-structure", "format-only paragraph emits empty-paragraph fatal", true, hasCode(issues, "sentence-order-empty-paragraph"), issueShape(issues));
}

for (const [id, suffix] of [
  ["sentence-given-uppercase-label", "(A) This belongs to a paragraph."],
  ["sentence-given-lowercase-label", "(a) This belongs to a paragraph."],
  ["sentence-given-spaced-lowercase-label", "( b ) This belongs to a paragraph."],
  ["sentence-given-fullwidth-lowercase-label", "（c） This belongs to a paragraph."],
] as const) {
  const issues = sentenceOrderWithGivenSuffix(suffix);
  addCase(id, "sentence-order-structure", "given block containing A/B/C label emits dedicated fatal", true, hasCode(issues, "sentence-order-given-contains-paragraph-label"), issueShape(issues));
}

{
  const issues = sentenceOrderWithGivenSuffix("(D) This is an ordinary parenthetical label outside the A/B/C paragraph set.");
  addCase("sentence-given-d-label-negative", "sentence-order-structure", "non-structural (D) does not emit A/B/C contamination fatal", false, hasCode(issues, "sentence-order-given-contains-paragraph-label"), issueShape(issues));
}

// ---------------------------------------------------------------------------
// Boundary 6: transformed-answer residual with token and dash equivalence.
// ---------------------------------------------------------------------------

for (const [id, passage, correct] of [
  ["residual-exact", "Teams praise evidence based reasoning. Their safeguard is _____.", "evidence based reasoning"],
  ["residual-ascii-hyphen", "Teams praise evidence-based reasoning. Their safeguard is _____.", "evidence based reasoning"],
  ["residual-hyphen-reverse", "Teams praise evidence based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-u2010", "Teams praise evidence‐based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-u2011", "Teams praise evidence‑based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-u2012", "Teams praise evidence‒based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-u2013", "Teams praise evidence–based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-u2014", "Teams praise evidence—based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-u2015", "Teams praise evidence―based reasoning. Their safeguard is _____.", "evidence-based reasoning"],
  ["residual-punctuation-boundary", "Teams praise ‘evidence-based reasoning.’ Their safeguard is _____.", "evidence based reasoning"],
] as const) {
  const issues = blankResidualIssues(passage, correct);
  addCase(id, "blank-residual", "token-identical phrase with space/hyphen/dash equivalence emits fatal", true, hasCode(issues, "blank-paraphrase-correct-residual-visible"), issueShape(issues));
}

for (const [id, passage, correct] of [
  ["residual-public-article", "A public article can shape debate. The community ultimately values _____.", "public art"],
  ["residual-mart-vs-art", "The marketplace became a regional mart. Its deepest value is _____.", "art"],
  ["residual-artistic-vs-art", "The artistic program gained support. Its deepest value is _____.", "art"],
  ["residual-reasoning-vs-reason", "Evidence-based reasoning improved the process. Its safeguard is _____.", "reason"],
  ["residual-base-vs-based", "Teams praise evidence base reasoning. Their safeguard is _____.", "evidence-based reasoning"],
] as const) {
  const issues = blankResidualIssues(passage, correct);
  addCase(id, "blank-residual", "substring or morphologically different text does not emit residual fatal", false, hasCode(issues, "blank-paraphrase-correct-residual-visible"), issueShape(issues));
}

// ---------------------------------------------------------------------------
// Boundary 7: standalone Korean specialist term vs embedded lexical strings.
// ---------------------------------------------------------------------------

for (const [id, text] of [
  ["terminology-standalone", "계사를 확인한다."],
  ["terminology-particle-object", "이 표현에서 계사를 찾아라."],
  ["terminology-particle-topic", "'계사'는 학생용 용어가 아니다."],
] as const) {
  const finding = findGrammarTerminologyRegister(text);
  addCase(id, "grammar-terminology", "standalone 계사 with ordinary particles is register finding", true, Boolean(finding), finding);
}

for (const [id, text] of [
  ["terminology-relationship", "관계사를 확인한다."],
  ["terminology-relative-clause", "관계사절의 선행사를 확인한다."],
  ["terminology-accountant", "예문의 주어는 그 회계사이고 동사는 reviewed이다."],
  ["terminology-certified-accountant", "공인회계사가 보고서를 검토했다."],
  ["terminology-world-history", "세계사 수업에서 산업혁명을 다뤘다."],
  ["terminology-modern-world-history", "근현대세계사 단원을 복습한다."],
] as const) {
  const finding = findGrammarTerminologyRegister(text);
  addCase(id, "grammar-terminology", "계사 embedded inside an ordinary Korean word is not a register finding", false, Boolean(finding), finding);
}

{
  const finding = findGrammarTerminologyError("전사구를 확인한다.");
  addCase("terminology-error-positive-control", "grammar-terminology", "incorrect 전사구 term retains fatal error detector", true, Boolean(finding), finding);
}

// ---------------------------------------------------------------------------
// Policy-map isolation: every newly split fatal must block relaxed publication
// and must not be admitted by salvage or SHIP_FIRST.
// ---------------------------------------------------------------------------

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

const policyMap = Object.fromEntries(
  fatalCodes.map((code) => [
    code,
    {
      relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
      salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
      shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
    },
  ]),
);

for (const code of fatalCodes) {
  const item = policyMap[code];
  addCase(
    `policy-${code}`,
    "policy-isolation",
    "fatal is relaxed-blocking and absent from salvage/SHIP_FIRST",
    true,
    item.relaxedBlocking && !item.salvageRelaxable && !item.shipFirstWarning,
    item,
  );
}

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
  "tests/unit/grammar-killer-overdrilled.test.mjs",
  "tests/unit/summary-mc-collocation-severity-split.test.mjs",
] as const;

const originalArtifactPaths = [
  "experiments/question-quality-20260715/reviews/deterministic-splits-fresh-audit/AUDIT.md",
  "experiments/question-quality-20260715/reviews/deterministic-splits-fresh-audit/RESULTS.json",
  "experiments/question-quality-20260715/reviews/deterministic-splits-fresh-audit/audit.mts",
  "experiments/question-quality-20260715/reviews/deterministic-splits-fresh-audit/verify.mjs",
] as const;

const categorySummary = Object.fromEntries(
  [...new Set(cases.map((item) => item.category))].map((category) => {
    const categoryCases = cases.filter((item) => item.category === category);
    return [
      category,
      {
        total: categoryCases.length,
        pass: categoryCases.filter((item) => item.pass).length,
        fail: categoryCases.filter((item) => !item.pass).length,
      },
    ];
  }),
);

const failedCases = cases.filter((item) => !item.pass);
const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "fresh-independent-remediation-boundary-audit",
  verdict: failedCases.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total: cases.length,
    pass: cases.length - failedCases.length,
    fail: failedCases.length,
    categories: categorySummary,
    failedCaseIds: failedCases.map((item) => item.id),
  },
  safety: {
    modelApiCalls: 0,
    browserCalls: 0,
    networkCalls: 0,
    databaseReads: 0,
    databaseWrites: 0,
    productionEdits: 0,
    existingTestEdits: 0,
  },
  provenance: {
    auditScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    auditedSourceAndTestSha256: Object.fromEntries(
      sourcePaths.map((item) => [item, fileSha(item)]),
    ),
    preservedOriginalFailArtifactSha256: Object.fromEntries(
      originalArtifactPaths.map((item) => [item, fileSha(item)]),
    ),
  },
  policy: {
    fatalCodes,
    map: policyMap,
    violations: fatalCodes.filter((code) => {
      const item = policyMap[code];
      return !item.relaxedBlocking || item.salvageRelaxable || item.shipFirstWarning;
    }),
  },
  passedCaseIds: cases.filter((item) => item.pass).map((item) => item.id),
  failures: failedCases,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
