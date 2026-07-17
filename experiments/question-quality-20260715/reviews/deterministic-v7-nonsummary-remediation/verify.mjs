import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cases as frozenBlindCases } from "../deterministic-splits-remediation-reaudit-v7/blind-holdout-cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const frozenV7Dir = path.join(
  path.dirname(here),
  "deterministic-splits-remediation-reaudit-v7",
);
const result = JSON.parse(readFileSync(path.join(here, "RESULTS.json"), "utf8"));
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha = (filePath) => sha256(readFileSync(filePath));

for (const line of readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/)) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `invalid remediation manifest line: ${line}`);
  assert.equal(
    fileSha(path.join(here, match[2])),
    match[1],
    `remediation artifact drift: ${match[2]}`,
  );
}

assert.equal(result.verdict, "BLOCK");
assert.equal(result.apiCandidatesConsumed, 0);
assert.deepEqual(result.safety, {
  modelApiCalls: 0,
  networkCalls: 0,
  databaseReads: 0,
  databaseWrites: 0,
  secretReads: 0,
});

assert.equal(
  fileSha(path.join(frozenV7Dir, "MANIFEST.sha256")),
  result.frozenV7.manifestSha256,
);
for (const line of readFileSync(
  path.join(frozenV7Dir, "MANIFEST.sha256"),
  "utf8",
)
  .trim()
  .split(/\r?\n/)) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `invalid frozen manifest line: ${line}`);
  assert.equal(
    fileSha(path.join(frozenV7Dir, match[2])),
    match[1],
    `frozen v7 drift: ${match[2]}`,
  );
}

assert.equal(
  fileSha(path.join(here, "replay.mts")),
  result.provenance.replayScriptSha256,
);
assert.equal(
  fileSha(path.join(here, "GRAMMAR-TRUTH-DESIGN.md")),
  result.provenance.grammarTruthDesignSha256,
);
for (const [relativePath, expectedHash] of Object.entries(
  result.provenance.sourceAndTestSha256,
)) {
  assert.equal(
    fileSha(path.join(repoRoot, relativePath)),
    expectedHash,
    `source/test drift: ${relativePath}`,
  );
}

const replay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, path.join(here, "replay.mts")], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
);
assert.equal(replay.verdict, result.verdict);
assert.deepEqual(
  {
    total: replay.exactFrozenScoringReplay.total,
    pass: replay.exactFrozenScoringReplay.pass,
    fail: replay.exactFrozenScoringReplay.fail,
  },
  {
    total: result.exactFrozenScoringReplay.total,
    pass: result.exactFrozenScoringReplay.pass,
    fail: result.exactFrozenScoringReplay.fail,
  },
);
assert.deepEqual(
  {
    total: replay.remediationAwareReplay.total,
    pass: replay.remediationAwareReplay.pass,
    fail: replay.remediationAwareReplay.fail,
  },
  {
    total: result.remediationAwareReplay.total,
    pass: result.remediationAwareReplay.pass,
    fail: result.remediationAwareReplay.fail,
  },
);
assert.deepEqual(
  replay.remediationAwareReplay.boundedHighConfidenceSubset,
  result.remediationAwareReplay.boundedHighConfidenceSubset,
);
assert.equal(
  replay.remediationAwareReplay.families.blank_explanation_step_numbering.fail,
  0,
);
assert.equal(
  replay.remediationAwareReplay.families.sentence_order_paragraph_integrity.fail,
  0,
);
assert.equal(
  replay.remediationAwareReplay.families.grammar_keypoint_nonexistent_label
    .falseNegative,
  0,
);
assert.equal(
  replay.remediationAwareReplay.families.grammar_terminology_accuracy
    .falseNegative,
  16,
);

const contradictoryCase = frozenBlindCases.find(
  (entry) => entry.id === result.residualBlockers.frozenOracleContradiction.id,
);
assert.ok(contradictoryCase);
assert.equal(contradictoryCase.expectedFlag, false);
assert.deepEqual(
  contradictoryCase.input.declaredLabels,
  result.residualBlockers.frozenOracleContradiction.declaredLabels,
);
assert.ok(
  String(contradictoryCase.input.explanation).startsWith(
    result.residualBlockers.frozenOracleContradiction.referencedLabel,
  ),
);
assert.equal(
  result.residualBlockers.frozenOracleContradiction.referencedLabel,
  "㉡",
);
assert.equal(
  result.residualBlockers.frozenScorerCoverageGap.count,
  replay.residualBlockers.frozenScorerCoverageGap.count,
);

process.stdout.write(
  "PASS_ARTIFACT_INTEGRITY_BOUNDED_REMEDIATION_ONLY_OVERALL_BLOCK\n",
);
