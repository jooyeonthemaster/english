import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as selectorCoreModule from "../selector-core";
import * as queueSizingModule from "../v3/queue-sizing";
import * as selectorV2Module from "../v2/selector-core-v2";
import * as selectorV3Module from "../v3/selector-core-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";

const selectorCore =
  (selectorCoreModule as unknown as { default?: typeof selectorCoreModule }).default ??
  selectorCoreModule;
const queueSizing =
  (queueSizingModule as unknown as { default?: typeof queueSizingModule }).default ??
  queueSizingModule;
const selectorV2 =
  (selectorV2Module as unknown as { default?: typeof selectorV2Module }).default ??
  selectorV2Module;
const selectorV3 =
  (selectorV3Module as unknown as { default?: typeof selectorV3Module }).default ??
  selectorV3Module;
const { stableStringify } = selectorCore;
const {
  binomialReachProbability,
  clopperPearsonLowerBound,
  minimumQueueSize,
} = queueSizing;
const { NearDuplicateIndex } = selectorV2;
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
const membershipPath = path.resolve(
  here,
  "../cross-type-blank-source-frame-v2/private/reconciliation-and-split-v2.json",
);
const membershipRaw = readFileSync(membershipPath, "utf8");
const membershipSource = JSON.parse(membershipRaw) as {
  selection: { rows: Array<{ contentHash: string }> };
};
const membershipProjection = membershipSource.selection.rows
  .map((row) => row.contentHash)
  .sort((a, b) => a.localeCompare(b, "en"));
const membershipSet = new Set(membershipProjection);
assert.equal(membershipSet.size, 38);

const grammarQueue = buildCorpusV3(snapshot).selected["focus-grammar-killer"];
assert.equal(grammarQueue.length, 307);
assert.equal(
  grammarQueue.filter((item) => membershipSet.has(item.contentHash)).length,
  38,
);

// Independent reimplementation of transitive cluster expansion around the
// frozen membership-only seed, using the same frozen query engine.
const cluster = new Set(membershipSet);
const observedRounds: Array<{ round: number; addedRows: number }> = [];
for (let round = 1; ; round += 1) {
  const index = new NearDuplicateIndex();
  for (const item of grammarQueue) {
    if (!cluster.has(item.contentHash)) continue;
    index.add({
      id: item.id,
      text: item.text,
      source: "blank-v2-operational-membership-cluster",
      document: item.document,
    });
  }
  const additions = grammarQueue.filter(
    (item) => !cluster.has(item.contentHash) && Boolean(index.query(item as never)),
  );
  for (const item of additions) cluster.add(item.contentHash);
  observedRounds.push({ round, addedRows: additions.length });
  if (additions.length === 0) break;
}
assert.equal(cluster.size, 38);
assert.deepEqual(observedRounds, [{ round: 1, addedRows: 0 }]);

const eligibleRemainder = grammarQueue.filter(
  (item) => !cluster.has(item.contentHash),
);
assert.equal(eligibleRemainder.length, 269);
const passRate = clopperPearsonLowerBound(19, 52, 0.95);
const required = minimumQueueSize(38, passRate, 0.95);
assert.equal(passRate, 0.2541665012621336);
assert.equal(required, 186);
assert.ok(binomialReachProbability(required, 38, passRate) >= 0.95);
assert.ok(binomialReachProbability(required - 1, 38, passRate) < 0.95);
const expectedFrame = eligibleRemainder.slice(0, required);

assert.equal(publicOutput.status, "BOUND_REVIEW_FRAME_NOT_AUTHORIZED");
assert.equal(publicOutput.sampleSizeBasis.requiredCandidates, 186);
assert.equal(publicOutput.sampleSizeBasis.targetDualLensPasses, 38);
assert.equal(publicOutput.collisionPolicy.seedMembershipRows, 38);
assert.equal(publicOutput.collisionPolicy.clusterRows, 38);
assert.equal(publicOutput.collisionPolicy.additionalClusterCollisionRows, 0);
assert.equal(publicOutput.supply.remainingAfterClusterExclusion, 269);
assert.equal(publicOutput.supply.boundReviewFrameRows, 186);
assert.equal(publicOutput.supply.unboundEligibleRemainderRows, 83);
assert.equal(publicOutput.supply.shortfall, 0);
assert.deepEqual(publicOutput.inclusionProvenance.fieldsReadFromBlankOperationalSelection, [
  "contentHash",
]);
for (const key of [
  "reviewerVerdictsUsed",
  "reviewerReasonsUsed",
  "reviewerNotesUsed",
  "blankMembershipArtifactPassageTextUsed",
  "passageTextUsedAsPositiveInclusionFeature",
  "splitLabelsUsedForInclusion",
  "metadataUsedForInclusion",
  "outcomeAwareSelection",
]) {
  assert.equal(publicOutput.inclusionProvenance[key], false, key);
}
assert.equal(
  publicOutput.inclusionProvenance.passageTextUsedOnlyByFrozenCollisionExclusion,
  true,
);
assert.equal(publicOutput.aggregate.campaignEligible, 0);
assert.equal(publicOutput.aggregate.manualReviewsUnreviewed, 186);
assert.equal(publicOutput.aggregate.blankOperationalMembershipExactOverlap, 0);
assert.equal(publicOutput.aggregate.blankOperationalCollisionClusterOverlap, 0);
assert.equal(publicOutput.rows.length, 186);
assert.deepEqual(
  publicOutput.rows.map((row: { contentHash: string }) => row.contentHash),
  expectedFrame.map((row) => row.contentHash),
);
assert.deepEqual(
  publicOutput.rows.map((row: { queueSequence: number }) => row.queueSequence),
  expectedFrame.map((row) => row.queueSequence),
);

assert.equal(
  publicOutput.sourceBlankOperationalMembershipFileSha256,
  createHash("sha256").update(membershipRaw).digest("hex"),
);
assert.equal(
  publicOutput.sourceBlankOperationalMembershipProjectionSha256,
  createHash("sha256").update(stableStringify(membershipProjection)).digest("hex"),
);
assert.equal(privateOutput.bindingHash, publicOutput.bindingHash);
assert.equal(privateOutput.rows.length, 186);
assert.deepEqual(
  privateOutput.rows.map((row: { contentHash: string }) => row.contentHash),
  expectedFrame.map((row) => row.contentHash),
);
assert.deepEqual(
  privateOutput.rows.map((row: { passageText: string }) => row.passageText),
  expectedFrame.map((row) => row.text),
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
for (const row of privateOutput.rows) {
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

const buildSource = readFileSync(path.join(here, "build.mts"), "utf8");
for (const forbiddenSelectionInput of [
  "reviewerAVerdict",
  "reviewerBVerdict",
  "reasonCodes",
  "blockers",
  "selectedSplit",
  "reviewer-a.json",
  "reviewer-b.json",
]) {
  assert.equal(
    buildSource.includes(forbiddenSelectionInput),
    false,
    `build references forbidden reviewer input: ${forbiddenSelectionInput}`,
  );
}

const privateRelativePath = path
  .relative(repoRoot, privatePath)
  .split(path.sep)
  .join("/");
assert.equal(
  spawnSync("git", ["check-ignore", "--quiet", privateRelativePath], {
    cwd: repoRoot,
    windowsHide: true,
  }).status,
  0,
  "private JSON is not git-ignored",
);

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
    verdict: "BOUND_REVIEW_FRAME_NOT_AUTHORIZED",
    conservativePassRate: passRate,
    targetDualLensPasses: 38,
    requiredCandidates: required,
    blankOperationalMembershipRows: membershipSet.size,
    collisionClusterRows: cluster.size,
    additionalClusterCollisionRows: cluster.size - membershipSet.size,
    remainingAfterClusterExclusion: eligibleRemainder.length,
    boundReviewFrameRows: expectedFrame.length,
    campaignEligibleRows: 0,
    privateJsonGitIgnored: true,
    manifestEntries: manifest.length,
    modelApiCalls: 0,
    fullQuestionCandidatesGenerated: 0,
  }, null, 2)}\n`,
);
