import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeReviewerReconciliationAndSplit } from "./reconcile-and-split.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const output = computeReviewerReconciliationAndSplit();
assert.equal(
  readFileSync(path.join(here, "private/reconciliation-and-split-v2.json"), "utf8"),
  output.privateBytes,
);
assert.equal(
  readFileSync(path.join(here, "reviewer-reconciliation-summary.json"), "utf8"),
  output.publicBytes,
);

assert.deepEqual(output.publicOutput.dispositions, {
  FRAME_PASS_BOTH_LENSES: 133,
  EXCLUDE: 23,
  DOMAIN_REVIEW: 1,
});
assert.deepEqual(output.publicOutput.pairMatrix, {
  A_PASS__B_PASS: 133,
  A_PASS__B_DOMAIN_REVIEW: 1,
  A_EXCLUDE__B_PASS: 18,
  A_EXCLUDE__B_DOMAIN_REVIEW: 3,
  A_EXCLUDE__B_EXCLUDE: 2,
});

const selected = output.privateOutput.selection.rows;
assert.equal(selected.length, 38);
assert.equal(new Set(selected.map((row) => row.frameId)).size, 38);
assert.equal(new Set(selected.map((row) => row.contentHash)).size, 38);
assert.deepEqual(
  Object.fromEntries(
    Object.entries(output.publicOutput.frozenBalancedSplit.splitSummary).map(
      ([split, value]) => [split, value.rows],
    ),
  ),
  { development: 6, confirmatory: 20, reserve: 12 },
);
assert.deepEqual(
  output.publicOutput.frozenBalancedSplit.splitSummary.development.discourse,
  { argumentative: 2, expository: 2, narrative: 1, practical: 1 },
);
assert.deepEqual(
  output.publicOutput.frozenBalancedSplit.splitSummary.confirmatory.discourse,
  { argumentative: 5, expository: 5, narrative: 5, practical: 5 },
);
assert.deepEqual(
  output.publicOutput.frozenBalancedSplit.splitSummary.reserve.discourse,
  { argumentative: 3, expository: 3, narrative: 4, practical: 2 },
);
assert.deepEqual(
  output.publicOutput.dualPassDistribution.discourse,
  { argumentative: 34, expository: 54, narrative: 36, practical: 9 },
);
assert.equal(output.publicOutput.authorization.campaignEligibleRows, 0);

const publicText = output.publicBytes;
for (const row of output.privateOutput.rows) {
  assert.equal(publicText.includes(row.frameId), false, "public frame ID leak");
  assert.equal(publicText.includes(row.contentHash), false, "public content hash leak");
}

const manifestLines = readFileSync(
  path.join(here, "RECONCILIATION-MANIFEST.sha256"),
  "utf8",
)
  .trim()
  .split(/\r?\n/u);
assert.equal(manifestLines.length, 8);
for (const line of manifestLines) {
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
    verdict: "PASS_RECONCILIATION_AND_BALANCED_SPLIT_NOT_AUTHORIZED",
    frameRows: 157,
    dualLensPass: 133,
    exclude: 23,
    domainReview: 1,
    development: 6,
    confirmatory: 20,
    reserve: 12,
    campaignEligibleRows: 0,
    manifestEntries: manifestLines.length,
    privateReconciliationSha256:
      output.publicOutput.privateReconciliationSha256,
    modelApiCalls: 0,
  }, null, 2)}\n`,
);
