import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as quality from "../../../../src/lib/question-quality/index";
import * as grammarShared from "../../../../src/lib/question-quality/validators/grammar/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const baseHarnessPath = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v2/audit.mts",
);
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const qualityRuntime =
  (quality as unknown as { default?: typeof quality }).default ?? quality;
const grammarRuntime =
  (grammarShared as unknown as { default?: typeof grammarShared }).default ?? grammarShared;
const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel, findGrammarTerminologyRegister } =
  grammarRuntime;

type AuditCase = {
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
  policy: { baseViolations: string[] };
  caseLedger: { allCaseIdsSha256: string; passedCaseIdsSha256: string };
  failures: AuditCase[];
};

const base = JSON.parse(
  execFileSync(process.execPath, [tsxCli, baseHarnessPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
) as BaseResult;

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

function hasCode(issues: Array<{ code: string }>, code: string): boolean {
  return issues.some((issue) => issue.code === code);
}

function issueShape(issues: Array<{ code: string; severity: string }>) {
  return issues.map(({ code, severity }) => ({ code, severity }));
}

// ---------------------------------------------------------------------------
// Local fixtures: v3 does not import test fixtures or root-owned test logic.
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

function paragraphIssues(text: string) {
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

// ---------------------------------------------------------------------------
// Group 1 — summary directions: 8 valid bound-summary forms and 8 genuine
// mixed-task forms across punctuation/conjunction boundaries.
// ---------------------------------------------------------------------------

for (const [id, direction] of [
  ["v3-direction-valid-both-blanks", "Complete the summary for (A) and (B). Then select the grammatically correct option for both blanks."],
  ["v3-direction-valid-all-blanks", "Complete the summary for (A) and (B). Next choose the grammatically correct option for all blanks."],
  ["v3-direction-valid-two-blanks", "Complete the summary for (A) and (B): select the grammatically correct option for the two blanks."],
  ["v3-direction-valid-labeled-blanks", "Complete the summary for (A) and (B). Also select the grammatically correct options for blanks (A) and (B)."],
  ["v3-direction-valid-bare-labels", "Complete the summary for (A) and (B). Then select the grammatically correct option for (A) and (B)."],
  ["v3-direction-valid-korean-each", "다음 요약문의 빈칸 (A), (B)를 완성하시오. 각 빈칸에 어법상 옳은 선택지를 고르시오."],
  ["v3-direction-valid-korean-two", "다음 요약문의 빈칸 (A), (B)를 완성하시오. 두 빈칸에 어법상 옳은 선택지를 고르시오."],
  ["v3-direction-valid-same-clause", "Complete the summary for (A) and (B) and choose the grammatically correct option for each blank."],
] as const) {
  const issues = directionIssues(direction);
  addCase(
    id,
    "summary-direction-v3",
    "summary-bound selection wording is not a competing-task fatal",
    false,
    hasCode(issues, "summary-mc-direction-task-mismatch"),
    issueShape(issues),
  );
}

for (const [id, direction] of [
  ["v3-direction-mixed-bare-and", "Complete the summary for (A) and (B) and identify which underlined expression is grammatically incorrect."],
  ["v3-direction-mixed-while", "Complete the summary for (A) and (B) while identifying which underlined expression is grammatically incorrect."],
  ["v3-direction-mixed-parenthetical", "Complete the summary for (A) and (B) (also identify which underlined expression is grammatically incorrect)."],
  ["v3-direction-mixed-slash", "Complete the summary for (A) and (B) / choose the title that best represents the passage."],
  ["v3-direction-mixed-em-dash", "Complete the summary for (A) and (B) — identify which underlined expression is grammatically incorrect."],
  ["v3-direction-mixed-korean-myeo", "다음 요약문의 빈칸 (A), (B)를 완성하며 밑줄 친 표현 중 어법상 틀린 것을 고르시오."],
  ["v3-direction-mixed-korean-after", "다음 요약문의 빈칸 (A), (B)를 완성한 뒤 밑줄 친 표현 중 어법상 틀린 것을 고르시오."],
  ["v3-direction-mixed-content-match", "Complete the summary for (A) and (B), and then choose which statement is false according to the passage."],
] as const) {
  const issues = directionIssues(direction);
  addCase(
    id,
    "summary-direction-v3",
    "independent second task remains fatal across another clause boundary",
    true,
    hasCode(issues, "summary-mc-direction-task-mismatch"),
    issueShape(issues),
  );
}

// ---------------------------------------------------------------------------
// Group 2 — circled explanations: diverse option-verdict predicates and
// narrative meta-instructions containing the same lexical material.
// ---------------------------------------------------------------------------

for (const [id, explanation] of [
  ["v3-circled-option-judged-passive", "① 먼저 범위를 과장하므로 오답이라 판단된다. ② 다음으로 인과를 뒤집으므로 오답이라 판단된다. ③ 마지막으로 결론과 일치해 정답이라 판단된다."],
  ["v3-circled-option-bwaya", "① 먼저 범위를 과장하므로 오답이라고 봐야 한다. ② 다음으로 인과를 뒤집으므로 오답이라고 봐야 한다. ③ 마지막으로 결론과 일치해 정답이라고 봐야 한다."],
  ["v3-circled-option-recognized", "① 먼저 범위를 과장하므로 오답으로 인정된다. ② 다음으로 인과를 뒤집으므로 오답으로 인정된다. ③ 마지막으로 결론과 일치해 정답으로 인정된다."],
  ["v3-circled-option-recognizable", "① 먼저 범위를 과장하므로 오답으로 인정할 수 있다. ② 다음으로 인과를 뒤집으므로 오답으로 인정할 수 있다. ③ 마지막으로 결론과 일치해 정답으로 인정할 수 있다."],
  ["v3-circled-option-classify", "① 먼저 범위를 과장하므로 오답으로 분류해야 한다. ② 다음으로 인과를 뒤집으므로 오답으로 분류해야 한다. ③ 마지막으로 결론과 일치해 정답으로 분류해야 한다."],
  ["v3-circled-option-corresponds", "① 먼저 범위를 과장하므로 오답에 해당한다고 판단한다. ② 다음으로 인과를 뒤집으므로 오답에 해당한다고 판단한다. ③ 마지막으로 결론과 일치해 정답에 해당한다고 판단한다."],
  ["v3-circled-option-named-choice", "① 선택지는 범위를 과장한다. ② 선택지는 인과를 뒤집는다. ③ 선택지는 결론과 일치한다."],
  ["v3-circled-option-attached-particle", "①은 먼저 범위를 과장한다. ②는 다음으로 인과를 뒤집는다. ③은 마지막으로 결론과 일치한다."],
] as const) {
  const issues = explanationIssues(explanation);
  addCase(
    id,
    "blank-circled-v3",
    "explicit option analysis is not a narrative-step fatal",
    false,
    hasCode(issues, "blank-explanation-narrative-circled-numbering"),
    issueShape(issues),
  );
}

for (const [id, explanation] of [
  ["v3-circled-narrative-judgment-criteria", "① 먼저 정답으로 판단할 수 있는 기준을 세운다. ② 다음으로 오답으로 판단할 수 있는 기준을 세운다. ③ 마지막으로 기준을 종합한다."],
  ["v3-circled-narrative-processing-criteria", "① 먼저 오답으로 처리할 항목의 기준을 세운다. ② 다음으로 정답으로 처리할 항목의 기준을 세운다. ③ 마지막으로 이를 종합한다."],
  ["v3-circled-narrative-classification-criteria", "① 먼저 오답으로 분류할 기준을 정한다. ② 다음으로 정답으로 분류할 기준을 정한다. ③ 마지막으로 이를 적용한다."],
  ["v3-circled-narrative-correspondence-condition", "① 먼저 정답에 해당하는 조건을 정리한다. ② 다음으로 오답에 해당하는 조건을 정리한다. ③ 마지막으로 조건을 대조한다."],
  ["v3-circled-narrative-eliminated-if", "① 먼저 소거된다면 확인할 순서를 정한다. ② 다음으로 소거된다면 남는 근거를 찾는다. ③ 마지막으로 이를 종합한다."],
  ["v3-circled-narrative-recognition-rule", "① 먼저 정답으로 인정할 수 있는 규칙을 만든다. ② 다음으로 오답으로 인정할 수 있는 규칙을 만든다. ③ 마지막으로 규칙을 검증한다."],
  ["v3-circled-narrative-standard", "① 먼저 빈칸의 논리 방향을 확인한다. ② 다음으로 핵심 근거를 정리한다. ③ 마지막으로 두 근거를 종합한다."],
  ["v3-circled-narrative-appropriate-condition", "① 먼저 적절하다고 볼 수 있는 조건을 세운다. ② 다음으로 부적절하다고 볼 수 있는 조건을 세운다. ③ 마지막으로 조건을 적용한다."],
] as const) {
  const issues = explanationIssues(explanation);
  addCase(
    id,
    "blank-circled-v3",
    "meta-level narrative steps remain fatal despite verdict vocabulary",
    true,
    hasCode(issues, "blank-explanation-narrative-circled-numbering"),
    issueShape(issues),
  );
}

// ---------------------------------------------------------------------------
// Group 3 — grammar ghost labels under additional real-world list/Markdown
// prefixes. Every positive uses nonexistent (F); controls use real (A)/(C).
// ---------------------------------------------------------------------------

for (const [id, point] of [
  ["v3-ghost-fullwidth-period", "1． (F) 분사 선택을 확인한다."],
  ["v3-ghost-ideographic-comma", "1、 (F) 분사 선택을 확인한다."],
  ["v3-ghost-fullwidth-paren", "①） (F) 분사 선택을 확인한다."],
  ["v3-ghost-circled-hangul", "㉠ (F) 분사 선택을 확인한다."],
  ["v3-ghost-parenthesized-hangul", "(가) (F) 분사 선택을 확인한다."],
  ["v3-ghost-latin-list", "A. (F) 분사 선택을 확인한다."],
  ["v3-ghost-roman-list", "Ⅰ. (F) 분사 선택을 확인한다."],
  ["v3-ghost-three-digit-list", "100. (F) 분사 선택을 확인한다."],
  ["v3-ghost-markdown-quote", "> (F) 분사 선택을 확인한다."],
  ["v3-ghost-markdown-heading", "# (F) 분사 선택을 확인한다."],
  ["v3-ghost-markdown-task", "- [ ] (F) 분사 선택을 확인한다."],
  ["v3-ghost-nested-quote", "1. > (F) 분사 선택을 확인한다."],
] as const) {
  const finding = findGrammarKeypointNonexistentLabel([point], markedExpressions);
  addCase(
    id,
    "grammar-ghost-v3",
    "another common prefix cannot hide a leading nonexistent label",
    true,
    Boolean(finding),
    finding,
  );
}

for (const [id, point] of [
  ["v3-real-exotic-nested", "가) 1: ②. (C) 분사 선택을 확인한다."],
  ["v3-real-markdown-task", "- [ ] (A) 정동사 개수를 확인한다."],
  ["v3-real-later-ghost-mention", "(A) 정동사 개수를 확인하고 예시에서는 (F)를 언급한다."],
  ["v3-real-no-leading-label", "일반 설명에서 (F)를 예로 들지만 실제 keyPoint 참조는 아니다."],
] as const) {
  const finding = findGrammarKeypointNonexistentLabel([point], markedExpressions);
  addCase(
    id,
    "grammar-ghost-v3",
    "real or non-leading references do not become ghost-label fatals",
    false,
    Boolean(finding),
    finding,
  );
}

// ---------------------------------------------------------------------------
// Group 4 — Unicode Cf generalization, including BMP and astral controls plus
// visible-text controls that must remain nonempty.
// ---------------------------------------------------------------------------

for (const [id, text] of [
  ["v3-sentence-empty-u061c", "\u061C"],
  ["v3-sentence-empty-u180e", "\u180E"],
  ["v3-sentence-empty-u202b", "\u202B"],
  ["v3-sentence-empty-u202c", "\u202C"],
  ["v3-sentence-empty-u202d", "\u202D"],
  ["v3-sentence-empty-u2064", "\u2064"],
  ["v3-sentence-empty-u2066", "\u2066"],
  ["v3-sentence-empty-u2067", "\u2067"],
  ["v3-sentence-empty-u2068", "\u2068"],
  ["v3-sentence-empty-u2069", "\u2069"],
  ["v3-sentence-empty-ufff9", "\uFFF9"],
  ["v3-sentence-empty-language-tag", "\u{E0001}"],
  ["v3-sentence-empty-tag-space", "\u{E0020}"],
  ["v3-sentence-empty-bmp-astral-mix", " \u061C\u202B\u2066\u{E0001}\u{E0020} "],
] as const) {
  const issues = paragraphIssues(text);
  addCase(
    id,
    "sentence-order-format-v3",
    "another format-control-only paragraph emits empty fatal",
    true,
    hasCode(issues, "sentence-order-empty-paragraph"),
    issueShape(issues),
  );
}

for (const [id, text] of [
  ["v3-sentence-visible-with-bidi", "Visible\u200E words remain real content in this complete sentence. A second sentence keeps the paragraph structurally substantial."],
  ["v3-sentence-visible-with-tags", "Visible\u{E0001} words remain real content in this complete sentence. Another sentence supplies enough substantive content for readers."],
] as const) {
  const issues = paragraphIssues(text);
  addCase(
    id,
    "sentence-order-format-v3",
    "format controls embedded in visible prose do not erase real content",
    false,
    hasCode(issues, "sentence-order-empty-paragraph"),
    issueShape(issues),
  );
}

// ---------------------------------------------------------------------------
// Group 5 — exact residuals containing punctuation beyond possessive/dashes,
// plus near-negative punctuation and morphology controls.
// ---------------------------------------------------------------------------

for (const [id, passage, correct] of [
  ["v3-residual-double-possessive", "The teachers' students' shared responsibility shaped the project. The key is _____.", "teachers' students' shared responsibility"],
  ["v3-residual-curly-nbsp", "The students’\u00A0shared responsibility shaped the project. The key is _____.", "students’ shared responsibility"],
  ["v3-residual-comma", "Teams value evidence, context, and judgment. Their safeguard is _____.", "evidence, context, and judgment"],
  ["v3-residual-slash", "The report uses cost/benefit analysis throughout. Its method is _____.", "cost/benefit analysis"],
  ["v3-residual-ampersand", "The agency follows a research & development strategy. Its approach is _____.", "research & development strategy"],
  ["v3-residual-parentheses", "Teams rely on evidence (not intuition) when deciding. Their rule is _____.", "evidence (not intuition)"],
  ["v3-residual-colon", "The policy follows one principle: shared responsibility. Its foundation is _____.", "one principle: shared responsibility"],
  ["v3-residual-abbreviation", "A U.S. policy shaped the response. The decisive factor is _____.", "U.S. policy"],
  ["v3-residual-semicolon", "The plan balances speed; accuracy remains essential. Its formula is _____.", "speed; accuracy"],
  ["v3-residual-plus", "The course teaches theory + practice together. Its design is _____.", "theory + practice"],
] as const) {
  const issues = residualIssues(passage, correct);
  addCase(
    id,
    "blank-residual-v3",
    "an exact punctuated transformed answer remains a direct leak",
    true,
    hasCode(issues, "blank-paraphrase-correct-residual-visible"),
    issueShape(issues),
  );
}

for (const [id, passage, correct] of [
  ["v3-residual-possessive-number-negative", "A teacher's shared responsibility shaped the project. The key is _____.", "teachers' shared responsibility"],
  ["v3-residual-ampersand-word-negative", "The agency follows a research and development strategy. Its approach is _____.", "research & development strategy"],
  ["v3-residual-abbreviation-negative", "A US policy shaped the response. The decisive factor is _____.", "U.S. policy"],
  ["v3-residual-plural-negative", "Teams value evidence, contexts, and judgment. Their safeguard is _____.", "evidence, context, and judgment"],
  ["v3-residual-longer-token-negative", "The costbenefit analysis was disputed. Its method is _____.", "cost/benefit analysis"],
  ["v3-residual-parenthetical-word-negative", "Teams rely on evidence and not intuition. Their rule is _____.", "evidence (not intuition)"],
] as const) {
  const issues = residualIssues(passage, correct);
  addCase(
    id,
    "blank-residual-v3",
    "punctuation or morphology-different wording is not treated as exact residual",
    false,
    hasCode(issues, "blank-paraphrase-correct-residual-visible"),
    issueShape(issues),
  );
}

// ---------------------------------------------------------------------------
// Group 6 — standalone 계사 particles, calendar compounds, lexical compounds,
// and specialist compounds whose prefix must not hide the register signal.
// ---------------------------------------------------------------------------

for (const [id, text] of [
  ["v3-terminology-standalone-topic", "계사는 학생용 표현이 아니다."],
  ["v3-terminology-standalone-genitive", "계사의 기능을 설명한다."],
  ["v3-terminology-standalone-also", "계사도 함께 확인한다."],
  ["v3-terminology-standalone-only", "계사만 강조하면 안 된다."],
  ["v3-terminology-standalone-called", "계사라는 용어를 바꿔 쓴다."],
  ["v3-terminology-standalone-whether", "계사인지 연결동사인지 확인한다."],
  ["v3-terminology-prefixed-noncopular", "비계사 구문이라는 전문 용어를 피한다."],
  ["v3-terminology-prefixed-semicopula", "유사계사라는 전문 용어를 피한다."],
  ["v3-terminology-prefixed-zero-copula", "무계사절이라는 전문 용어를 피한다."],
  ["v3-terminology-prefixed-quasi", "준계사라는 전문 용어를 피한다."],
] as const) {
  const finding = findGrammarTerminologyRegister(text);
  addCase(
    id,
    "grammar-terminology-v3",
    "standalone or specialist-compound 계사 remains a register finding",
    true,
    Boolean(finding),
    finding,
  );
}

for (const [id, text] of [
  ["v3-terminology-calendar-month", "계사월은 육십갑자 달 이름이다."],
  ["v3-terminology-calendar-hour", "계사시는 육십갑자 시각 이름이다."],
  ["v3-terminology-calendar-born", "그는 계사년생으로 기록되어 있다."],
  ["v3-terminology-calendar-pillar", "명리학에서는 계사일주라고 부른다."],
  ["v3-terminology-accountants-association", "한국공인회계사회가 자료를 냈다."],
  ["v3-terminology-world-historical", "그 사건은 세계사적인 전환점이다."],
  ["v3-terminology-relative-clause", "관계사절의 선행사를 확인한다."],
  ["v3-terminology-statistical-history", "통계사 연구에서 표본 설계를 다룬다."],
] as const) {
  const finding = findGrammarTerminologyRegister(text);
  addCase(
    id,
    "grammar-terminology-v3",
    "calendar or ordinary lexical compound containing 계사 remains clean",
    false,
    Boolean(finding),
    finding,
  );
}

const failures = [...base.failures, ...cases.filter((item) => !item.pass)];
const extraPass = cases.filter((item) => item.pass).length;
const total = base.summary.total + cases.length;
const pass = base.summary.pass + extraPass;
const fail = base.summary.fail + cases.length - extraPass;
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

const result = {
  schemaVersion: 1,
  auditDateKst: "2026-07-15",
  auditKind: "deterministic-splits-remediation-reaudit-v3",
  verdict: failures.length === 0 ? "PASS" : "BLOCK",
  summary: {
    total,
    pass,
    fail,
    base144: {
      total: base.summary.total,
      pass: base.summary.pass,
      fail: base.summary.fail,
      failedCaseIds: base.summary.failedCaseIds,
    },
    extra: {
      total: cases.length,
      pass: extraPass,
      fail: cases.length - extraPass,
      categories: categorySummary,
    },
    failedCaseIds: failures.map((item) => item.id),
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
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v2/audit.mts",
    ),
    baseHarnessReportedSha256: base.provenance.auditScriptSha256,
    auditedSourceAndTestSha256: base.provenance.auditedSourceAndTestSha256,
    frozenV2BlockManifestSha256: fileSha(
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v2/MANIFEST.sha256",
    ),
  },
  policy: { inheritedViolations: base.policy.baseViolations },
  caseLedger: {
    baseAllCaseIdsSha256: base.caseLedger.allCaseIdsSha256,
    basePassedCaseIdsSha256: base.caseLedger.passedCaseIdsSha256,
    extraAllCaseIdsSha256: sha256(JSON.stringify(cases.map((item) => item.id))),
    extraPassedCaseIdsSha256: sha256(
      JSON.stringify(cases.filter((item) => item.pass).map((item) => item.id)),
    ),
  },
  failures: failures.map(({ id, category, expected, observed }) => ({
    id,
    category,
    expected,
    observed,
  })),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
