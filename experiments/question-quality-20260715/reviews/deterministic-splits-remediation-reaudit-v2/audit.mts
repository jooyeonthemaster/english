import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as summaryMc from "../../../../src/lib/question-quality/validators/summary/mc";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const baseHarnessPath = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-audit/audit.mts",
);
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const summaryRuntime =
  (summaryMc as unknown as { default?: typeof summaryMc }).default ?? summaryMc;

const { validateQuestionQuality } = qualityRuntime;
const {
  findGrammarKeypointNonexistentLabel,
  findGrammarTerminologyRegister,
} = grammarRuntime;
const { findSummaryMcCorrectCompletionUngrammatical } = summaryRuntime;

type ResultCase = {
  id: string;
  category: string;
  expectation: string;
  expected: boolean;
  observed: boolean;
  pass: boolean;
  evidence?: unknown;
};

type BaseResult = {
  verdict: string;
  summary: { total: number; pass: number; fail: number; failedCaseIds: string[] };
  safety: Record<string, number>;
  provenance: {
    auditScriptSha256: string;
    auditedSourceAndTestSha256: Record<string, string>;
  };
  policy: { violations: string[] };
  passedCaseIds: string[];
  failures: ResultCase[];
};

const base = JSON.parse(
  execFileSync(process.execPath, [tsxCli, baseHarnessPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
) as BaseResult;

const extraCases: ResultCase[] = [];

function addCase(
  id: string,
  category: string,
  expectation: string,
  expected: boolean,
  observed: boolean,
  evidence?: unknown,
): void {
  extraCases.push({
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

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function issueShape(issues: Array<{ code: string; severity: string }>) {
  return issues.map(({ code, severity }) => ({ code, severity }));
}

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

function directionIssues(direction: string) {
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

function explanationIssues(explanation: string) {
  return blankIssues({ ...blankBase, explanation }).filter(
    (issue) =>
      issue.code === "blank-explanation-step-numbering" ||
      issue.code === "blank-explanation-narrative-circled-numbering",
  );
}

function residualIssues(passageWithBlank: string, correctText: string) {
  return blankIssues({
    ...blankBase,
    passageWithBlank,
    options: [{ label: "1", text: correctText }, ...blankBase.options.slice(1)],
  }).filter((issue) => issue.code === "blank-paraphrase-correct-residual-visible");
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

function emptyParagraphIssues(text: string) {
  return validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question: {
      ...sentenceOrderBase,
      paragraphs: sentenceOrderBase.paragraphs.map((paragraph, index) =>
        index === 1 ? { ...paragraph, text } : paragraph,
      ),
    },
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }).filter((issue) => issue.code.startsWith("sentence-order-"));
}

const markedExpressions = [
  { label: "(A)", pointCode: "a" },
  { label: "(B)", pointCode: "b" },
  { label: "(C)", pointCode: "c" },
];

// Additional collocation negatives: every spelling ends in -ing but is a base
// verb after infinitival to.
for (const [verb, text] of [
  ["ping", "The monitor has a responsibility to ping the server."],
  ["sling", "The worker had an opportunity to sling the bag over one shoulder."],
  ["string", "The designer had an opportunity to string the lights across the room."],
  ["wring", "The device has a responsibility to wring excess water from the cloth."],
] as const) {
  const finding = findSummaryMcCorrectCompletionUngrammatical(text);
  addCase(
    `v2-summary-valid-infinitive-${verb}`,
    "summary-collocation-neighbors",
    "another base-form infinitive ending in -ing remains outside fatal subset",
    false,
    Boolean(finding),
    finding,
  );
}

for (const [id, direction, expectedFatal, expectation] of [
  [
    "v2-direction-valid-second-words",
    "Complete the summary for (A) and (B). Then choose the grammatically correct words for both blanks.",
    false,
    "second sentence that restates summary-word selection is valid",
  ],
  [
    "v2-direction-valid-second-option",
    "Complete the summary for (A) and (B). Then select the grammatically correct option for each blank.",
    false,
    "second sentence that restates summary-option selection is valid",
  ],
  [
    "v2-direction-valid-second-names-summary",
    "Complete the summary for (A) and (B). Then, in the summary, select the grammatically correct option.",
    false,
    "second sentence explicitly tied back to summary is valid",
  ],
  [
    "v2-direction-mixed-same-clause-and",
    "Complete the summary for (A) and (B), and identify which underlined expression is grammatically incorrect.",
    true,
    "same-clause second grammar task is fatal",
  ],
  [
    "v2-direction-mixed-colon",
    "Complete the summary for (A) and (B): choose the phrase that best fits the blank in the passage.",
    true,
    "colon-introduced competing blank task is fatal",
  ],
  [
    "v2-direction-mixed-and-then",
    "Complete the summary for (A) and (B), and then identify which underlined expression is grammatically incorrect.",
    true,
    "and-then competing grammar task is fatal",
  ],
  [
    "v2-direction-mixed-korean-period",
    "다음 요약문의 빈칸 (A), (B)를 완성하시오. 그리고 밑줄 친 표현 중 어법상 틀린 것을 고르시오.",
    true,
    "Korean second-sentence grammar task is fatal",
  ],
  [
    "v2-direction-mixed-korean-same-clause",
    "다음 요약문의 빈칸 (A), (B)를 완성하고 밑줄 친 표현 중 어법상 틀린 것을 고르시오.",
    true,
    "Korean same-clause competing grammar task is fatal",
  ],
] as const) {
  const issues = directionIssues(direction);
  addCase(
    id,
    "summary-direction-neighbors",
    expectation,
    expectedFatal,
    hasCode(issues, "summary-mc-direction-task-mismatch"),
    issueShape(issues),
  );
}

for (const [id, explanation, expectedFatal, expectation] of [
  [
    "v2-circled-option-must-be-seen",
    "① 먼저 범위를 과장하므로 오답으로 보아야 한다. ② 다음으로 인과를 뒤집으므로 오답으로 보아야 한다. ③ 마지막으로 결론과 일치해 정답으로 보아야 한다.",
    false,
    "보아야 한다 verdicts are option analysis",
  ],
  [
    "v2-circled-option-judgment-modal",
    "① 먼저 범위를 과장하므로 오답이라고 판단할 수 있다. ② 다음으로 인과를 뒤집으므로 오답이라고 판단할 수 있다. ③ 마지막으로 결론과 일치해 정답이라고 판단할 수 있다.",
    false,
    "판단할 수 있다 verdicts are option analysis",
  ],
  [
    "v2-circled-option-deemed",
    "① 먼저 범위를 과장하므로 오답으로 간주된다. ② 다음으로 인과를 뒤집으므로 오답으로 간주된다. ③ 마지막으로 결론과 일치해 정답으로 간주된다.",
    false,
    "간주된다 verdicts are option analysis",
  ],
  [
    "v2-circled-narrative-answer-condition",
    "① 먼저 정답의 조건을 정리한다. ② 다음으로 근거를 확인한다. ③ 마지막으로 이를 종합한다.",
    true,
    "mentioning 정답 inside a narrative step does not suppress fatal",
  ],
  [
    "v2-circled-narrative-elimination-method",
    "① 먼저 오답을 소거할 수 있는 기준을 세운다. ② 다음으로 소거할 수 있는 표현을 찾는다. ③ 마지막으로 근거를 종합한다.",
    true,
    "describing an elimination method remains narrative steps",
  ],
  [
    "v2-circled-option-particle-modal",
    "①은 먼저 범위를 과장해 오답으로 보아야 한다. ②는 다음으로 인과를 뒤집어 오답으로 보아야 한다. ③은 마지막으로 결론과 일치해 정답으로 보아야 한다.",
    false,
    "attached option particles independently establish option references",
  ],
] as const) {
  const issues = explanationIssues(explanation);
  addCase(
    id,
    "blank-circled-neighbors",
    expectation,
    expectedFatal,
    hasCode(issues, "blank-explanation-narrative-circled-numbering"),
    issueShape(issues),
  );
}

for (const [id, point, expectedFatal] of [
  ["v2-ghost-circled-period", "①. (F) 분사 선택을 확인한다.", true],
  ["v2-ghost-number-colon", "1: (F) 분사 선택을 확인한다.", true],
  ["v2-ghost-bracket-number", "[1] (F) 분사 선택을 확인한다.", true],
  ["v2-ghost-korean-list", "가. (F) 분사 선택을 확인한다.", true],
  ["v2-ghost-triple-prefix", "• 1. ① (F) 분사 선택을 확인한다.", true],
  ["v2-ghost-markdown-bold", "**(F)** 분사 선택을 확인한다.", true],
  ["v2-real-circled-period", "①. (A) 정동사 개수를 확인한다.", false],
  ["v2-real-triple-prefix", "• 1. ① (C) 분사 선택을 확인한다.", false],
] as const) {
  const finding = findGrammarKeypointNonexistentLabel([point], markedExpressions);
  addCase(
    id,
    "grammar-ghost-neighbors",
    expectedFatal
      ? "common list-prefix variant cannot hide nonexistent label"
      : "same list-prefix variant does not turn a real label into a ghost",
    expectedFatal,
    Boolean(finding),
    finding,
  );
}

for (const [id, text] of [
  ["v2-sentence-empty-u200e", "\u200E"],
  ["v2-sentence-empty-u200f", "\u200F"],
  ["v2-sentence-empty-u202a", "\u202A"],
  ["v2-sentence-empty-u202e", "\u202E"],
  ["v2-sentence-empty-u2061", "\u2061"],
  ["v2-sentence-empty-u2063", "\u2063"],
  ["v2-sentence-empty-soft-hyphen", "\u00AD"],
  ["v2-sentence-empty-mixed-format", " \u200E\u202A\u2061\u00AD "],
] as const) {
  const issues = emptyParagraphIssues(text);
  addCase(
    id,
    "sentence-order-format-neighbors",
    "another visually empty Unicode format-only paragraph is fatal",
    true,
    hasCode(issues, "sentence-order-empty-paragraph"),
    issueShape(issues),
  );
}

for (const [id, passage, correct, expectedFatal] of [
  [
    "v2-residual-straight-possessive",
    "The students' shared responsibility shaped the project. The key is _____.",
    "students' shared responsibility",
    true,
  ],
  [
    "v2-residual-curly-possessive",
    "The students’ shared responsibility shaped the project. The key is _____.",
    "students’ shared responsibility",
    true,
  ],
  [
    "v2-residual-contraction",
    "The fact that change can't be ignored shapes the debate. The key is _____.",
    "change can't be ignored",
    true,
  ],
  [
    "v2-residual-multi-separator",
    "Teams praise evidence — based reasoning. Their safeguard is _____.",
    "evidence-based reasoning",
    true,
  ],
  [
    "v2-residual-possessive-longer-token",
    "The studentship program shares responsibility. The key is _____.",
    "students' shared responsibility",
    false,
  ],
  [
    "v2-residual-hyphen-longer-token",
    "Teams praise evidence-based reasonings. Their safeguard is _____.",
    "evidence-based reasoning",
    false,
  ],
  [
    "v2-residual-apostrophe-unrelated",
    "Students share responsibility for the project. The key is _____.",
    "students' shared responsibility",
    false,
  ],
] as const) {
  const issues = residualIssues(passage, correct);
  addCase(
    id,
    "blank-residual-neighbors",
    expectedFatal
      ? "exact transformed answer with ordinary punctuation remains detectable"
      : "lexically different text remains clean",
    expectedFatal,
    hasCode(issues, "blank-paraphrase-correct-residual-visible"),
    issueShape(issues),
  );
}

for (const [id, text, expectedFinding] of [
  ["v2-terminology-standalone-comma", "계사, 즉 연결동사를 확인한다.", true],
  ["v2-terminology-standalone-particle", "계사로 분석하면 안 된다.", true],
  ["v2-terminology-sexagenary-year", "계사년은 2013년에 해당한다.", false],
  ["v2-terminology-sexagenary-day", "기록에는 계사일이라고 적혀 있다.", false],
  ["v2-terminology-prefixed-accountant", "세무회계사가 보고서를 검토했다.", false],
  ["v2-terminology-prefixed-history", "동아시아세계사를 공부했다.", false],
] as const) {
  const finding = findGrammarTerminologyRegister(text);
  addCase(
    id,
    "grammar-terminology-neighbors",
    expectedFinding
      ? "standalone specialist term remains detectable"
      : "계사 substring inside a longer lexical word remains clean",
    expectedFinding,
    Boolean(finding),
    finding,
  );
}

const baseFailureCases = base.failures;
const extraFailures = extraCases.filter((item) => !item.pass);
const allFailures = [...baseFailureCases, ...extraFailures];
const basePassIds = base.passedCaseIds;
const extraPassIds = extraCases.filter((item) => item.pass).map((item) => item.id);
const total = base.summary.total + extraCases.length;
const pass = base.summary.pass + extraPassIds.length;
const fail = base.summary.fail + extraFailures.length;

const extraCategorySummary = Object.fromEntries(
  [...new Set(extraCases.map((item) => item.category))].map((category) => {
    const categoryCases = extraCases.filter((item) => item.category === category);
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

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "deterministic-splits-remediation-reaudit-v2",
  verdict: allFailures.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total,
    pass,
    fail,
    base97: base.summary,
    extra: {
      total: extraCases.length,
      pass: extraPassIds.length,
      fail: extraFailures.length,
      categories: extraCategorySummary,
    },
    failedCaseIds: allFailures.map((item) => item.id),
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
    baseHarnessSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-audit/audit.mts",
    ),
    baseHarnessReportedSha256: base.provenance.auditScriptSha256,
    auditedSourceAndTestSha256: base.provenance.auditedSourceAndTestSha256,
    frozenBlockArtifactManifestSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-audit/MANIFEST.sha256",
    ),
  },
  policy: {
    baseViolations: base.policy.violations,
  },
  caseLedger: {
    allCaseIdsSha256: sha256(
      JSON.stringify([
        ...basePassIds,
        ...baseFailureCases.map((item) => item.id),
        ...extraCases.map((item) => item.id),
      ]),
    ),
    passedCaseIdsSha256: sha256(JSON.stringify([...basePassIds, ...extraPassIds])),
  },
  failures: allFailures.map(
    ({ id, category, expectation, expected, observed }) => ({
      id,
      category,
      expectation,
      expected,
      observed,
    }),
  ),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
