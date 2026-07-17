import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as grammarSharedModule from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as sentenceOrderModule from "../../../../src/lib/question-quality/validators/sentence-order";
import * as summaryMcModule from "../../../../src/lib/question-quality/validators/summary/mc";

type JsonRecord = Record<string, unknown>;
type CaseValue = {
  id: string;
  pairId: string;
  family: string;
  language: string;
  expected: "DEFECT" | "NORMAL";
  fixture: JsonRecord;
};
type Prediction = { blindId: string; prediction: "DEFECT" | "NORMAL" };
type AdjudicationRow = {
  caseId: string;
  pairedControlCaseId: string;
  family: string;
  adjudication:
    | "CONFIRMED_PRODUCT_CONTRACT"
    | "ORACLE_SCOPE_MISMATCH"
    | "AMBIGUOUS"
    | "REDUNDANT_UPSTREAM";
};
type Issue = { severity: string; code: string; message: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const reviewRoot = path.resolve(here, "..");
const sealedRoot = path.join(reviewRoot, "deterministic-structural-reaudit-v10");
const auditRoot = path.join(
  reviewRoot,
  "deterministic-structural-reaudit-v10-independent-audit",
);

const corpus = JSON.parse(readFileSync(path.join(sealedRoot, "cases.json"), "utf8")) as {
  cases: CaseValue[];
};
const blindMap = JSON.parse(
  readFileSync(path.join(auditRoot, "sealed-blind-map.json"), "utf8"),
) as { mapping: Array<{ blindId: string; sourceId: string; sourceIndex: number }> };
const baseline = JSON.parse(
  readFileSync(path.join(auditRoot, "predictions.json"), "utf8"),
) as { predictions: Prediction[] };
const rawAdjudication = JSON.parse(
  readFileSync(path.join(auditRoot, "adjudication.json"), "utf8"),
) as { overall: { confusion: Record<string, number>; correct: number; accuracy: number } };
const sourceAware = JSON.parse(
  readFileSync(path.join(auditRoot, "source-aware-adjudication.json"), "utf8"),
) as { rows: AdjudicationRow[] };

const grammarRuntime =
  (grammarSharedModule as unknown as { default?: typeof grammarSharedModule }).default ??
  grammarSharedModule;
const sentenceOrderRuntime =
  (sentenceOrderModule as unknown as { default?: typeof sentenceOrderModule }).default ??
  sentenceOrderModule;
const summaryRuntime =
  (summaryMcModule as unknown as { default?: typeof summaryMcModule }).default ??
  summaryMcModule;
const { findGrammarKeypointNonexistentLabel } = grammarRuntime;
const { validateSentenceOrderQuestion } = sentenceOrderRuntime;
const { findSummaryMcAnswerObjectMismatch } = summaryRuntime;

const baselineByBlindId = new Map(
  baseline.predictions.map((prediction) => [prediction.blindId, prediction.prediction]),
);
const blindIdBySourceId = new Map(
  blindMap.mapping.map((entry) => [entry.sourceId, entry.blindId]),
);
const baselineBySourceId = new Map(
  corpus.cases.map((entry) => [
    entry.id,
    baselineByBlindId.get(blindIdBySourceId.get(entry.id) ?? ""),
  ]),
);

const afterRows = corpus.cases.map((entry) => ({ entry, observed: observe(entry) }));
const afterById = new Map(afterRows.map(({ entry, observed }) => [entry.id, observed]));
const confirmed = sourceAware.rows.filter(
  ({ adjudication }) => adjudication === "CONFIRMED_PRODUCT_CONTRACT",
);
const scopeMismatch = sourceAware.rows.filter(
  ({ adjudication }) => adjudication === "ORACLE_SCOPE_MISMATCH",
);
const ambiguous = sourceAware.rows.filter(({ adjudication }) => adjudication === "AMBIGUOUS");
const redundant = sourceAware.rows.filter(
  ({ adjudication }) => adjudication === "REDUNDANT_UPSTREAM",
);

assert.equal(confirmed.length, 34);
assert.equal(scopeMismatch.length, 41);
assert.equal(ambiguous.length, 0);
assert.equal(redundant.length, 0);
assert.equal(new Set(confirmed.map(({ caseId }) => caseId)).size, 34);
assert.equal(new Set(confirmed.map(({ pairedControlCaseId }) => pairedControlCaseId)).size, 34);
assert.equal(new Set(scopeMismatch.map(({ pairedControlCaseId }) => pairedControlCaseId)).size, 41);

for (const row of confirmed) {
  assert.equal(afterById.get(row.caseId), "DEFECT", `confirmed miss ${row.caseId}`);
  assert.equal(
    afterById.get(row.pairedControlCaseId),
    "NORMAL",
    `confirmed paired control regressed ${row.pairedControlCaseId}`,
  );
}
for (const row of scopeMismatch) {
  assert.equal(afterById.get(row.caseId), "NORMAL", `scope mismatch was targeted ${row.caseId}`);
  assert.equal(
    afterById.get(row.pairedControlCaseId),
    "NORMAL",
    `scope paired control regressed ${row.pairedControlCaseId}`,
  );
}
for (const entry of corpus.cases.filter(({ expected }) => expected === "NORMAL")) {
  assert.equal(afterById.get(entry.id), "NORMAL", `normal oracle regressed ${entry.id}`);
}
for (const entry of corpus.cases.filter(
  ({ id }) => baselineBySourceId.get(id) === "DEFECT",
)) {
  assert.equal(afterById.get(entry.id), "DEFECT", `baseline true positive regressed ${entry.id}`);
}

const before = {
  tp: rawAdjudication.overall.confusion.expectedDefectPredictedDefect,
  fn: rawAdjudication.overall.confusion.expectedDefectPredictedNormal,
  fp: rawAdjudication.overall.confusion.expectedNormalPredictedDefect,
  tn: rawAdjudication.overall.confusion.expectedNormalPredictedNormal,
};
const after = confusion(afterRows);
assert.deepEqual(before, { tp: 25, fn: 75, fp: 0, tn: 100 });
assert.deepEqual(after, { tp: 59, fn: 41, fp: 0, tn: 100 });

const byFamily = Object.fromEntries(
  [...new Set(corpus.cases.map(({ family }) => family))].sort().map((family) => [
    family,
    confusion(afterRows.filter(({ entry }) => entry.family === family)),
  ]),
);
assert.deepEqual(byFamily, {
  GRAMMAR_ERROR_LEADING_LABEL: { tp: 6, fn: 19, fp: 0, tn: 25 },
  SENTENCE_ORDER_COMPLETE_UNITS: { tp: 15, fn: 10, fp: 0, tn: 25 },
  SENTENCE_ORDER_STANDALONE_LABELS: { tp: 25, fn: 0, fp: 0, tn: 25 },
  SUMMARY_COMPLETE_MC: { tp: 13, fn: 12, fp: 0, tn: 25 },
});

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "PASS_POST_FIT_CONFIRMED_ONLY_REPLAY",
      qualification:
        "The v10 confirmed failures informed this remediation; this is a paired post-fit replay, not a fresh independent holdout.",
      before,
      after,
      delta: { tp: 34, fn: -34, fp: 0, tn: 0 },
      confirmedProductContract: {
        defects: confirmed.length,
        caught: confirmed.filter(({ caseId }) => afterById.get(caseId) === "DEFECT").length,
        pairedControls: confirmed.length,
        pairedControlsPreserved: confirmed.filter(
          ({ pairedControlCaseId }) => afterById.get(pairedControlCaseId) === "NORMAL",
        ).length,
      },
      intentionallyUntargeted: {
        oracleScopeMismatch: scopeMismatch.length,
        remainedNormal: scopeMismatch.filter(({ caseId }) => afterById.get(caseId) === "NORMAL").length,
        pairedControlsPreserved: scopeMismatch.filter(
          ({ pairedControlCaseId }) => afterById.get(pairedControlCaseId) === "NORMAL",
        ).length,
        ambiguous: ambiguous.length,
        redundantUpstream: redundant.length,
      },
      baselineTruePositivesPreserved: corpus.cases.filter(
        ({ id }) => baselineBySourceId.get(id) === "DEFECT" && afterById.get(id) === "DEFECT",
      ).length,
      allNormalControlsPreserved: corpus.cases.filter(
        ({ expected, id }) => expected === "NORMAL" && afterById.get(id) === "NORMAL",
      ).length,
      byFamily,
      externalSystems: {
        apiCalls: 0,
        networkAttempts: 0,
        databaseCalls: 0,
        estimatedCostUsd: 0,
      },
    },
    null,
    2,
  )}\n`,
);

function observe(entry: CaseValue): "DEFECT" | "NORMAL" {
  const fixture = entry.fixture;
  if (entry.family === "SUMMARY_COMPLETE_MC") {
    const carrier = asRecord(fixture.carrier);
    const options = asRecords(fixture.options).map((option) => ({
      label: option.key,
      text: option.text,
    }));
    return findSummaryMcAnswerObjectMismatch(carrier.text, options, fixture.storedKey)
      ? "DEFECT"
      : "NORMAL";
  }
  if (entry.family === "GRAMMAR_ERROR_LEADING_LABEL") {
    const inventory = asRecord(fixture.renderedLabelInventory);
    const labels = Array.isArray(inventory.labels) ? inventory.labels : [];
    return findGrammarKeypointNonexistentLabel(
      [fixture.keyPoint],
      labels.map((label) => ({ label })),
    )
      ? "DEFECT"
      : "NORMAL";
  }
  if (entry.family === "SENTENCE_ORDER_COMPLETE_UNITS") {
    const issues = collectSentenceOrderIssues(
      Array.isArray(fixture.paragraphs)
        ? fixture.paragraphs.map((text, index) => ({
            label: ["(A)", "(B)", "(C)"][index],
            text,
          }))
        : [],
    );
    return issues.some(({ code }) => code === "sentence-order-dependent-fragment")
      ? "DEFECT"
      : "NORMAL";
  }
  assert.equal(entry.family, "SENTENCE_ORDER_STANDALONE_LABELS");
  const entries = asRecords(fixture.entries);
  const issues = collectSentenceOrderIssues(
    entries.map((item) => ({ label: item.labelNode, text: item.paragraph })),
  );
  const structuralCodes = new Set([
    "sentence-order-paragraph-count",
    "sentence-order-paragraph-labels",
    "sentence-order-paragraph-body-label",
    "sentence-order-label-order-leak",
  ]);
  return issues.some(({ code }) => structuralCodes.has(code)) ? "DEFECT" : "NORMAL";
}

function collectSentenceOrderIssues(paragraphs: JsonRecord[]): Issue[] {
  const issues: Issue[] = [];
  validateSentenceOrderQuestion(
    {
      givenSentence: "A neutral opening sentence establishes the context.",
      paragraphs,
      options: [
        { label: "①", text: "(B)-(C)-(A)" },
        { label: "②", text: "(C)-(A)-(B)" },
        { label: "③", text: "(B)-(A)-(C)" },
        { label: "④", text: "(C)-(B)-(A)" },
        { label: "⑤", text: "(A)-(C)-(B)" },
      ],
      correctAnswer: "①",
    },
    undefined,
    (severity, code, message) => issues.push({ severity, code, message }),
  );
  return issues;
}

function confusion(rows: Array<{ entry: CaseValue; observed: "DEFECT" | "NORMAL" }>) {
  const result = { tp: 0, fn: 0, fp: 0, tn: 0 };
  for (const { entry, observed } of rows) {
    if (entry.expected === "DEFECT" && observed === "DEFECT") result.tp += 1;
    if (entry.expected === "DEFECT" && observed === "NORMAL") result.fn += 1;
    if (entry.expected === "NORMAL" && observed === "DEFECT") result.fp += 1;
    if (entry.expected === "NORMAL" && observed === "NORMAL") result.tn += 1;
  }
  return result;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
