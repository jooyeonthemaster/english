import assert from "node:assert/strict";

import * as sentenceOrderModule from "../../../../src/lib/question-quality/validators/sentence-order";
import * as summaryMcModule from "../../../../src/lib/question-quality/validators/summary/mc";

type Issue = { code: string; severity: string; message: string };
const sentenceRuntime =
  (sentenceOrderModule as unknown as { default?: typeof sentenceOrderModule }).default ??
  sentenceOrderModule;
const summaryRuntime =
  (summaryMcModule as unknown as { default?: typeof summaryMcModule }).default ??
  summaryMcModule;
const { validateSentenceOrderQuestion } = sentenceRuntime;
const { findSummaryMcAnswerObjectMismatch } = summaryRuntime;

const summaryOptions = [
  { label: "A", text: "Mira cataloged the shells by size." },
  { label: "B", text: "Mira discarded every shell at noon." },
  { label: "C", text: "Mira left the shells on the beach." },
];
const summaryPairs = [
  {
    name: "novel final one-line recap mismatch",
    text: "The final one-line recap reads: “Mira cataloged the shells by size.”",
    key: "B",
    defect: true,
  },
  {
    name: "novel final one-line recap faithful control",
    text: "The final one-line recap reads: “Mira cataloged the shells by size.”",
    key: "A",
    defect: false,
  },
  {
    name: "comparison draft remains non-authoritative",
    text: "Comparison draft: “Mira cataloged the shells by size.” It is not the final summary.",
    key: "B",
    defect: false,
  },
  {
    name: "explicit rejection remains non-authoritative",
    text: "Do not use “Mira cataloged the shells by size.” as the completed recap.",
    key: "B",
    defect: false,
  },
  {
    name: "ordinary option mention remains an abstention",
    text: "The notes mention “Mira cataloged the shells by size.” during comparison.",
    key: "B",
    defect: false,
  },
];
for (const row of summaryPairs) {
  assert.equal(
    Boolean(findSummaryMcAnswerObjectMismatch(row.text, summaryOptions, row.key)),
    row.defect,
    row.name,
  );
}

const fragmentPairs = [
  ["Having examined every sample.", "Having examined every sample, Lena signed the log."],
  [
    "The sharp scent of pine inside the storage room.",
    "The sharp scent of pine lingered inside the storage room.",
  ],
  ["The schedule: to inspect the lower tunnel.", "The schedule was to inspect the lower tunnel."],
  ["The result—four sealed boxes beside the doorway.", "The result was four sealed boxes beside the doorway."],
  ["Before the first train; an empty platform near the river.", "The first train departed; the platform then emptied."],
  ["Invited to present the findings.", "The researchers were invited to present the findings."],
  ["By comparing two independent samples.", "The team reduced error by comparing two independent samples."],
  ["“Because the main road remained flooded.”", "“Because the main road remained flooded, the buses turned back.”"],
  ["“Where the narrow channel bends?”", "“Where does the narrow channel bend?”"],
] as const;
for (const [defect, control] of fragmentPairs) {
  assert.equal(hasFragmentIssue(defect), true, `novel fragment was missed: ${defect}`);
  assert.equal(hasFragmentIssue(control), false, `novel paired control regressed: ${control}`);
}

for (const control of [
  "The researcher in the hallway smiles at every visitor.",
  "The books on the highest shelf belong to Maya.",
  "A painted sign near the entrance points east.",
  "The final instruction was to fold the chart twice.",
]) {
  assert.equal(hasFragmentIssue(control), false, `semantic truth control regressed: ${control}`);
}

assert.equal(hasLabelIssue(["(A)", "(B)", "(C)"]), false);
assert.equal(hasLabelIssue(["( A )", "( B )", "( C )"]), true);
assert.equal(hasLabelIssue(["(A)\u200B", "(B)\u200B", "(C)\u200B"]), true);
assert.equal(hasLabelIssue(["\n(A)\t", " (B) ", "\r(C)\n"]), false);

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "PASS_NOVEL_PAIRED_REGRESSIONS",
      summaryCases: summaryPairs.length,
      fragmentPairs: fragmentPairs.length,
      semanticTruthControls: 4,
      labelSets: 4,
      failures: 0,
      qualification:
        "These cases were authored separately from the v10 fixture strings but exercise the same bounded product contracts.",
      externalSystems: { apiCalls: 0, networkAttempts: 0, databaseCalls: 0 },
    },
    null,
    2,
  )}\n`,
);

function hasFragmentIssue(candidate: string): boolean {
  return collectIssues(["(A)", "(B)", "(C)"], candidate).some(
    ({ code }) => code === "sentence-order-dependent-fragment",
  );
}

function hasLabelIssue(labels: string[]): boolean {
  return collectIssues(labels, "The observer recorded the stable result carefully.").some(
    ({ code }) => code === "sentence-order-paragraph-labels",
  );
}

function collectIssues(labels: string[], candidate: string): Issue[] {
  const issues: Issue[] = [];
  validateSentenceOrderQuestion(
    {
      givenSentence: "A neutral opening sentence establishes the shared context.",
      paragraphs: labels.map((label, index) => ({
        label,
        text:
          index === 0
            ? candidate
            : `The review team recorded a complete control sentence for paragraph ${index + 1}.`,
      })),
      options: [],
    },
    undefined,
    (severity, code, message) => issues.push({ severity, code, message }),
  );
  return issues;
}
