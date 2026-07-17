import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as uiModule from "../../../../src/lib/question-type-ui";

const ui =
  (uiModule as unknown as { default?: typeof uiModule }).default ?? uiModule;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const rubric = JSON.parse(readFileSync(path.join(here, "rubric.json"), "utf8"));
const active = ui.QUESTION_TYPE_GROUPS.flatMap((group) =>
  group.items.map((item) => item.id),
);
const rubricTypes = Object.keys(rubric.types);
assert.equal(active.length, 25);
assert.equal(new Set(active).size, 25);
assert.deepEqual([...rubricTypes].sort(), [...active].sort());
assert.deepEqual(Object.keys(rubric.gradeScale), ["F", "C", "B", "A"]);
assert.ok(rubric.globalFatalChecks.length >= 8);
assert.equal(rubric.blindEvaluation.raters, 2);
assert.equal(rubric.blindEvaluation.adjudicatorOnDisagreement, 1);
assert.equal(rubric.nonFocusSentinelAllocation.nonFocusTypeCount, 23);
assert.equal(rubric.nonFocusSentinelAllocation.rowsPerType, 4);
assert.equal(rubric.nonFocusSentinelAllocation.totalRows, 92);
assert.equal(
  rubric.nonFocusSentinelAllocation.nonFocusTypeCount *
    rubric.nonFocusSentinelAllocation.rowsPerType,
  rubric.nonFocusSentinelAllocation.totalRows,
);
assert.deepEqual(rubric.nonFocusSentinelAllocation.cellPattern, [
  "STANDARD_BASIC",
  "STANDARD_KILLER",
  "PREMIUM_BASIC",
  "PREMIUM_KILLER",
]);
assert.equal(rubric.calibrationCertificateScope.all25TypesCertified, false);
assert.equal(
  rubric.calibrationCertificateScope.grammarSurfaceContract,
  "EXACT_5_MARKERS_1_INVALID",
);
assert.equal(rubric.calibrationCertificateScope.blankRequiredAxes.length, 7);
assert.ok(rubric.calibrationCertificateScope.blankRequiredAxes.includes("stance"));
assert.ok(
  rubric.calibrationCertificateScope.blankRequiredAxes.includes(
    "temporalRelation",
  ),
);
for (const typeId of active) {
  const entry = rubric.types[typeId];
  assert.equal(typeof entry.task, "string", `${typeId} task`);
  assert.ok(entry.task.length >= 20, `${typeId} task too short`);
  assert.ok(entry.fatalDefects.length >= 4, `${typeId} fatal checks`);
  assert.ok(entry.craftChecks.length >= 4, `${typeId} craft checks`);
  assert.ok(entry.killerCriterion.length >= 40, `${typeId} killer criterion`);
  assert.ok(entry.explanationCriterion.length >= 30, `${typeId} explanation criterion`);
}

const manifest = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
assert.equal(manifest.length, 3);
for (const line of manifest) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  const actual = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
  assert.equal(actual, expected, `hash mismatch: ${relativePath}`);
}

process.stdout.write(
  `${JSON.stringify({
    verdict: "PASS_RUBRIC_STRUCTURE_ONLY_NO_QUALITY_CLAIM",
    activeTypes: active.length,
    rubricTypes: rubricTypes.length,
    grades: Object.keys(rubric.gradeScale),
    blindRaters: rubric.blindEvaluation.raters,
    nonFocusRowsPerType: rubric.nonFocusSentinelAllocation.rowsPerType,
    nonFocusTotalRows: rubric.nonFocusSentinelAllocation.totalRows,
    manifestEntries: manifest.length,
    modelApiCalls: 0,
  }, null, 2)}\n`,
);
