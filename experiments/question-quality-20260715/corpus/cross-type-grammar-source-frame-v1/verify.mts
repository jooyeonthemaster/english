import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as selectorCoreModule from "../selector-core";
import * as queueSizingModule from "../v3/queue-sizing";
import * as selectorV3Module from "../v3/selector-core-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";

const selectorCore =
  (selectorCoreModule as unknown as { default?: typeof selectorCoreModule }).default ??
  selectorCoreModule;
const queueSizing =
  (queueSizingModule as unknown as { default?: typeof queueSizingModule }).default ??
  queueSizingModule;
const selectorV3 =
  (selectorV3Module as unknown as { default?: typeof selectorV3Module }).default ??
  selectorV3Module;
const { stableStringify } = selectorCore;
const {
  binomialReachProbability,
  clopperPearsonLowerBound,
  minimumQueueSize,
} = queueSizing;
const { buildCorpusV3 } = selectorV3;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const publicOutput = JSON.parse(
  readFileSync(path.join(here, "source-frame-public.json"), "utf8"),
);
const privatePath = path.join(here, "private/source-frame-private.json");
const privateOutput = JSON.parse(readFileSync(privatePath, "utf8"));
const snapshot = JSON.parse(
  readFileSync(path.resolve(here, "../v3/private/input-snapshot.json"), "utf8"),
) as V3PinnedSnapshot;
const blankFrame = JSON.parse(
  readFileSync(
    path.resolve(here, "../cross-type-blank-source-frame-v2/source-frame-public.json"),
    "utf8",
  ),
);

const grammarQueue = buildCorpusV3(snapshot).selected["focus-grammar-killer"];
assert.equal(grammarQueue.length, 307);
assert.deepEqual(
  blankFrame.rows.map((row: { contentHash: string }) => row.contentHash),
  grammarQueue.slice(0, 157).map((row) => row.contentHash),
);
const remainder = grammarQueue.slice(157);
const blankHashes = new Set(
  blankFrame.rows.map((row: { contentHash: string }) => row.contentHash),
);
assert.equal(remainder.length, 150);
assert.equal(remainder.some((row) => blankHashes.has(row.contentHash)), false);

const passRate = clopperPearsonLowerBound(19, 52, 0.95);
const required = minimumQueueSize(38, passRate, 0.95);
assert.equal(passRate, 0.2541665012621336);
assert.equal(required, 186);
assert.ok(binomialReachProbability(required, 38, passRate) >= 0.95);
assert.ok(binomialReachProbability(required - 1, 38, passRate) < 0.95);
assert.equal(required - remainder.length, 36);

assert.equal(publicOutput.status, "HARD_BLOCK_SUPPLY_SHORTAGE");
assert.equal(publicOutput.supply.operationalReviewFrameRows, 0);
assert.equal(publicOutput.supply.reviewActivated, false);
assert.equal(publicOutput.sampleSizeBasis.targetDualLensPasses, 38);
assert.equal(publicOutput.sampleSizeBasis.requiredCandidates, 186);
assert.equal(publicOutput.supply.availableRemainderRows, 150);
assert.equal(publicOutput.supply.shortfall, 36);
assert.equal(publicOutput.aggregate.campaignEligible, 0);
assert.equal(publicOutput.aggregate.blankSupplyV2ExactOverlap, 0);
assert.equal(publicOutput.aggregate.manualReviewsUnreviewed, 150);
assert.equal(publicOutput.availableRows.length, 150);
assert.deepEqual(
  publicOutput.availableRows.map((row: { contentHash: string }) => row.contentHash),
  remainder.map((row) => row.contentHash),
);
assert.deepEqual(
  publicOutput.availableRows.map((row: { queueSequence: number }) => row.queueSequence),
  remainder.map((row) => row.queueSequence),
);

assert.equal(privateOutput.bindingHash, publicOutput.bindingHash);
assert.equal(privateOutput.operationalReviewFrameRows.length, 0);
assert.equal(privateOutput.availableRows.length, 150);
assert.deepEqual(
  privateOutput.availableRows.map((row: { contentHash: string }) => row.contentHash),
  remainder.map((row) => row.contentHash),
);
assert.deepEqual(
  privateOutput.availableRows.map((row: { passageText: string }) => row.passageText),
  remainder.map((row) => row.text),
);

const core = Object.fromEntries(
  Object.entries(publicOutput).filter(
    ([key]) => !["bindingHash", "aggregate", "privacy", "safety"].includes(key),
  ),
);
const actualBindingHash = createHash("sha256")
  .update(stableStringify(core))
  .digest("hex");
assert.equal(actualBindingHash, publicOutput.bindingHash);

const publicText = JSON.stringify(publicOutput);
for (const forbiddenKey of [
  "passageText",
  "candidateId",
  "sourceRecordId",
  "documentKey",
  "sourceDocumentId",
]) {
  assert.equal(
    new RegExp(`"${forbiddenKey}"\\s*:`, "u").test(publicText),
    false,
    `public private field leak: ${forbiddenKey}`,
  );
}
for (const row of privateOutput.availableRows) {
  assert.ok(typeof row.passageText === "string" && row.passageText.length > 0);
  assert.equal(publicText.includes(row.passageText), false, "public passage-text leak");
  for (const key of [
    "candidateId",
    "sourceRecordId",
    "documentKey",
    "sourceDocumentId",
  ]) {
    const value = row[key];
    if (typeof value === "string" && value.length > 0) {
      assert.equal(publicText.includes(value), false, `public private-ID leak: ${key}`);
    }
  }
}

const privateRelativePath = path
  .relative(repoRoot, privatePath)
  .split(path.sep)
  .join("/");
const ignored = spawnSync("git", ["check-ignore", "--quiet", privateRelativePath], {
  cwd: repoRoot,
  windowsHide: true,
});
assert.equal(ignored.status, 0, "private JSON is not git-ignored");

const manifest = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
assert.equal(manifest.length, 6);
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
    verdict: "HARD_BLOCK_SUPPLY_SHORTAGE",
    conservativePassRate: passRate,
    targetDualLensPasses: 38,
    requiredCandidates: required,
    availableRemainderRows: remainder.length,
    shortfall: required - remainder.length,
    operationalReviewFrameRows: 0,
    campaignEligibleRows: 0,
    blankSupplyV2ExactOverlap: 0,
    privateJsonGitIgnored: true,
    manifestEntries: manifest.length,
    modelApiCalls: 0,
    fullQuestionCandidatesGenerated: 0,
  }, null, 2)}\n`,
);
