import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeReviewerReconciliation } from "./reconcile-reviewers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputs = computeReviewerReconciliation();
assert.equal(
  readFileSync(path.join(here, "private/reconciliation-v1.json"), "utf8"),
  outputs.privateBytes,
);
assert.equal(
  readFileSync(path.join(here, "reviewer-reconciliation-summary.json"), "utf8"),
  outputs.publicBytes,
);
const publicText = outputs.publicBytes;
for (const row of outputs.privateOutput.rows) {
  assert.equal(publicText.includes(row.frameId), false, "public frame ID leak");
  assert.equal(publicText.includes(row.contentHash), false, "public row hash leak");
}
assert.deepEqual(outputs.publicOutput.dispositions, {
  FRAME_PASS_BOTH_LENSES: 24,
  EXCLUDE: 9,
  DOMAIN_REVIEW: 26,
});
assert.deepEqual(outputs.publicOutput.framePassDistribution.discourse, {
  expository: 20,
  narrative: 2,
  argumentative: 2,
});
assert.equal(outputs.publicOutput.authorization.campaignEligibleRows, 0);

const manifestLines = readFileSync(
  path.join(here, "RECONCILIATION-MANIFEST.sha256"),
  "utf8",
)
  .trim()
  .split(/\r?\n/u);
assert.equal(manifestLines.length, 4);
const repoRoot = path.resolve(here, "../../../..");
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
    verdict: "PASS_RECONCILIATION_ARITHMETIC_FRAME_STILL_BLOCKED",
    frameRows: 59,
    dualLensFramePass: 24,
    exclude: 9,
    domainReview: 26,
    campaignEligibleRows: 0,
    manifestEntries: manifestLines.length,
    privateReconciliationSha256: outputs.publicOutput.privateReconciliationSha256,
    modelApiCalls: 0,
  }, null, 2)}\n`,
);
