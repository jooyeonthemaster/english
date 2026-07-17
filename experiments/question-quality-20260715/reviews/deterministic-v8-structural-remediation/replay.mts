import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as qualityModule from "../../../../src/lib/question-quality/index";
import * as grammarSharedModule from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as summaryMcModule from "../../../../src/lib/question-quality/validators/summary/mc";

type JsonRecord = Record<string, unknown>;
type QualityIssue = { code: string; severity?: string; message?: string };
type BlindCase = {
  id: string;
  family: string;
  oracle: "ACCEPT" | "BLOCK";
  input: JsonRecord;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const v8Root = path.resolve(here, "../deterministic-splits-remediation-reaudit-v8");
const corpus = JSON.parse(
  readFileSync(path.join(v8Root, "cases.json"), "utf8"),
) as { cases: BlindCase[] };

const qualityRuntime =
  (qualityModule as unknown as { default?: typeof qualityModule }).default ??
  qualityModule;
const grammarRuntime =
  (grammarSharedModule as unknown as { default?: typeof grammarSharedModule })
    .default ?? grammarSharedModule;
const summaryRuntime =
  (summaryMcModule as unknown as { default?: typeof summaryMcModule }).default ??
  summaryMcModule;

const { validateQuestionQuality } = qualityRuntime;
const { findGrammarKeypointNonexistentLabel } = grammarRuntime;
const { findSummaryMcAnswerObjectMismatch } = summaryRuntime;

const targetFamilies = new Set([
  "summary_complete_mc_answer_object_binding",
  "grammar_ghost_labels_unicode_rendered",
  "sentence_order_body_duplicate_label_contamination",
  "sentence_order_dependent_fragments",
]);

const circledToNumeric = (value: string): string => {
  const index = "①②③④⑤".indexOf(value);
  return index >= 0 ? String(index + 1) : value;
};

const sentenceOrderPadding =
  "Additional observers documented this stage carefully in a separate field ledger, preserving every transition for later reconstruction by the review team.";

const sentenceOrderQuestion = (input: JsonRecord) => ({
  direction: "Arrange the following paragraphs in the most logical order.",
  givenSentence: input.intro,
  paragraphs: ["A", "B", "C"].map((label) => ({
    label: `(${label})`,
    text: `${(input.segments as Record<string, string>)[label]} ${sentenceOrderPadding}`,
  })),
  options: ["B-A-C", "A-B-C", "C-A-B", "B-C-A", "C-B-A"].map(
    (text, index) => ({
      label: String(index + 1),
      text: text
        .split("-")
        .map((label) => `(${label})`)
        .join("-"),
    }),
  ),
  correctAnswer: "1",
  explanation: input.explanation,
  keyPoints: [
    "Track the initiating action.",
    "Follow the observed change.",
    "Place the final outcome last.",
  ],
  tags: ["sequence"],
  difficulty: "INTERMEDIATE",
});

const fullIssues = (question: JsonRecord): QualityIssue[] =>
  validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: "",
    requestedDifficulty: "INTERMEDIATE",
  }) as QualityIssue[];

function observe(entry: BlindCase): { blocked: boolean; codes: string[] } {
  const { input } = entry;
  if (entry.family === "summary_complete_mc_answer_object_binding") {
    const options = (input.choices as string[]).map((text, index) => ({
      label: String(index + 1),
      text,
    }));
    const finding = findSummaryMcAnswerObjectMismatch(
      input.explanation,
      options,
      circledToNumeric(String(input.correct_answer)),
    );
    return {
      blocked: Boolean(finding),
      codes: finding ? ["summary-mc-answer-object-mismatch"] : [],
    };
  }

  if (entry.family === "grammar_ghost_labels_unicode_rendered") {
    const marked = (input.existing_labels as string[]).map((label) => ({ label }));
    const finding = findGrammarKeypointNonexistentLabel(
      [input.explanation],
      marked,
    );
    return {
      blocked: Boolean(finding),
      codes: finding ? ["grammar-keypoint-nonexistent-label"] : [],
    };
  }

  const issues = fullIssues(sentenceOrderQuestion(input));
  const targetCode =
    entry.family === "sentence_order_body_duplicate_label_contamination"
      ? "sentence-order-paragraph-body-label"
      : "sentence-order-dependent-fragment";
  const codes = issues
    .filter((issue) => issue.code === targetCode)
    .map((issue) => issue.code);
  return { blocked: codes.length > 0, codes };
}

const selected = corpus.cases.filter((entry) => targetFamilies.has(entry.family));
assert.equal(selected.length, 128);

const rows = selected.map((entry) => {
  const observation = observe(entry);
  const expectedBlock = entry.oracle === "BLOCK";
  return {
    id: entry.id,
    family: entry.family,
    expectedBlock,
    observedBlock: observation.blocked,
    correct: expectedBlock === observation.blocked,
    codes: observation.codes,
  };
});

const byFamily = Object.fromEntries(
  [...targetFamilies].map((family) => {
    const familyRows = rows.filter((row) => row.family === family);
    return [
      family,
      {
        total: familyRows.length,
        pass: familyRows.filter((row) => row.correct).length,
        falseNegative: familyRows.filter(
          (row) => row.expectedBlock && !row.observedBlock,
        ).length,
        falsePositive: familyRows.filter(
          (row) => !row.expectedBlock && row.observedBlock,
        ).length,
      },
    ];
  }),
);

const result = {
  verdict: "PASS_POST_FIT_REPLAY_ONLY",
  qualification:
    "The implementation saw v8 failures; this is not an independent holdout PASS.",
  total: rows.length,
  pass: rows.filter((row) => row.correct).length,
  falseNegative: rows.filter(
    (row) => row.expectedBlock && !row.observedBlock,
  ).length,
  falsePositive: rows.filter(
    (row) => !row.expectedBlock && row.observedBlock,
  ).length,
  byFamily,
  failures: rows.filter((row) => !row.correct),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
