import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as grammarSharedModule from "../../../../src/lib/question-quality/validators/grammar/shared";
import * as sentenceOrderModule from "../../../../src/lib/question-quality/validators/sentence-order";
import * as summaryMcModule from "../../../../src/lib/question-quality/validators/summary/mc";

type JsonRecord = Record<string, unknown>;
type V9Case = {
  case_id: string;
  pair_id: string;
  family_id: string;
  oracle: "normal" | "defect";
  surface: JsonRecord;
};
type AdjudicationRow = {
  case_id: string;
  paired_control_case_id: string;
  family_id: string;
  adjudication: string;
};
type Issue = { code: string; severity: string; message: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const sealedRoot = path.resolve(here, "../deterministic-structural-reaudit-v9");
const adjudicationRoot = path.resolve(
  here,
  "../deterministic-structural-reaudit-v9-independent-adjudication",
);

const F1 = "F1_SUMMARY_KEY_OPTION_COHESION";
const F2 = "F2_GRAMMAR_RENDERED_LABEL_REFERENCE";
const F4 = "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY";
const confirmedFamilies = new Set([F1, F2, F4]);

const corpus = JSON.parse(
  readFileSync(path.join(sealedRoot, "cases.json"), "utf8"),
) as { cases: V9Case[] };
const adjudication = JSON.parse(
  readFileSync(path.join(adjudicationRoot, "adjudications.private.json"), "utf8"),
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

const caseById = new Map(corpus.cases.map((entry) => [entry.case_id, entry]));
const confirmedRows = adjudication.rows.filter(
  (row) =>
    row.adjudication === "CONFIRMED_ORACLE" &&
    confirmedFamilies.has(row.family_id),
);

assert.equal(confirmedRows.length, 46, "expected exactly 46 confirmed v9 disagreements");
assert.deepEqual(
  Object.fromEntries(
    [F1, F2, F4].map((family) => [
      family,
      confirmedRows.filter((row) => row.family_id === family).length,
    ]),
  ),
  { [F1]: 14, [F2]: 18, [F4]: 14 },
);
assert.ok(
  !confirmedRows.some((row) => row.case_id === "v9-f4-p12-defect"),
  "the redundant-wrapper p12 row must remain outside remediation",
);
assert.ok(
  !confirmedRows.some((row) => row.family_id.includes("SENTENCE_ORDER_STRUCTURAL_LABEL")),
  "product-scope sentence-order label rows must remain outside remediation",
);

const F4_CONTROL_TEXTS = [
  "The observers reviewed the complete morning record with care. They compared every result before they left the quiet laboratory for the day.",
  "The editors checked the final archive copy against the index. They recorded every confirmed difference in a separate review note afterward.",
  "The technicians inspected the calibrated instrument before the trial. They stored the verified readings in the shared project folder after lunch.",
];

function collectSentenceOrderIssues(candidate: string, position: number): Issue[] {
  const issues: Issue[] = [];
  validateSentenceOrderQuestion(
    {
      givenSentence: "A neutral opening sentence establishes the shared context.",
      paragraphs: ["(A)", "(B)", "(C)"].map((label, index) => ({
        label,
        text: index === position ? candidate : F4_CONTROL_TEXTS[index],
      })),
      options: [],
    },
    undefined,
    (severity, code, message) => issues.push({ severity, code, message }),
  );
  return issues;
}

function observe(entry: V9Case): boolean {
  if (entry.family_id === F1) {
    const channel = entry.surface.authoritative_selection_channel;
    assert.ok(channel === "stem" || channel === "explanation");
    const carrier = entry.surface[channel];
    const options = entry.surface.options;
    assert.equal(typeof carrier, "string");
    assert.ok(Array.isArray(options));
    return Boolean(
      findSummaryMcAnswerObjectMismatch(
        carrier,
        options as Array<Record<string, unknown>>,
        entry.surface.keyed_option,
      ),
    );
  }

  if (entry.family_id === F2) {
    const keyPoint = entry.surface.grammar_key_point;
    const inventory = entry.surface.rendered_label_inventory;
    assert.equal(typeof keyPoint, "string");
    assert.ok(Array.isArray(inventory));
    return Boolean(
      findGrammarKeypointNonexistentLabel(
        [keyPoint],
        inventory.map((label) => ({ label })),
      ),
    );
  }

  assert.equal(entry.family_id, F4);
  const candidate = entry.surface.candidate;
  assert.equal(typeof candidate, "string");
  const votes = [0, 1, 2].map((position) =>
    collectSentenceOrderIssues(candidate as string, position).some(
      (issue) => issue.code === "sentence-order-dependent-fragment",
    ),
  );
  assert.equal(new Set(votes).size, 1, `${entry.case_id} changed by wrapper position`);
  return votes[0];
}

const resultRows = confirmedRows.flatMap((row) => {
  const defect = caseById.get(row.case_id);
  const control = caseById.get(row.paired_control_case_id);
  assert.ok(defect, `missing defect ${row.case_id}`);
  assert.ok(control, `missing control ${row.paired_control_case_id}`);
  assert.equal(defect.family_id, row.family_id);
  assert.equal(control.family_id, row.family_id);
  assert.equal(defect.oracle, "defect");
  assert.equal(control.oracle, "normal");
  assert.equal(defect.pair_id, control.pair_id);
  return [
    {
      case_id: defect.case_id,
      family_id: defect.family_id,
      role: "confirmed_defect",
      expected: true,
      observed: observe(defect),
    },
    {
      case_id: control.case_id,
      family_id: control.family_id,
      role: "paired_control",
      expected: false,
      observed: observe(control),
    },
  ];
});

const failures = resultRows.filter((row) => row.expected !== row.observed);
assert.equal(resultRows.length, 92);
assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));

const byFamily = Object.fromEntries(
  [F1, F2, F4].map((family) => {
    const rows = resultRows.filter((row) => row.family_id === family);
    return [
      family,
      {
        confirmedDefects: rows.filter((row) => row.role === "confirmed_defect").length,
        confirmedDefectsCaught: rows.filter(
          (row) => row.role === "confirmed_defect" && row.observed,
        ).length,
        pairedControls: rows.filter((row) => row.role === "paired_control").length,
        pairedControlsPreserved: rows.filter(
          (row) => row.role === "paired_control" && !row.observed,
        ).length,
      },
    ];
  }),
);

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "PASS_POST_FIT_CONFIRMED_ONLY_REPLAY",
      qualification:
        "The implementation used independently adjudicated v9 failures; this is a post-fit regression replay, not an independent holdout PASS.",
      adjudicatedDisagreements: 46,
      pairedControls: 46,
      totalExecutions: 92,
      failures: 0,
      intentionallyExcluded: {
        productContractScopeMismatchF3: 13,
        redundantWrapperF4P12: 1,
      },
      byFamily,
    },
    null,
    2,
  )}\n`,
);
