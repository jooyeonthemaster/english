import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as selectorCoreModule from "../selector-core";
import * as selectorV3Module from "../v3/selector-core-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";

const selectorCore =
  (selectorCoreModule as unknown as { default?: typeof selectorCoreModule }).default ??
  selectorCoreModule;
const selectorV3 =
  (selectorV3Module as unknown as { default?: typeof selectorV3Module }).default ??
  selectorV3Module;
const { stableStringify } = selectorCore;
const { buildCorpusV3 } = selectorV3;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const publicOutput = JSON.parse(
  readFileSync(path.join(here, "source-frame-public.json"), "utf8"),
);
const privateOutput = JSON.parse(
  readFileSync(path.join(here, "private/source-frame-private.json"), "utf8"),
);
const snapshot = JSON.parse(
  readFileSync(path.resolve(here, "../v3/private/input-snapshot.json"), "utf8"),
) as V3PinnedSnapshot;
const strictFrame = JSON.parse(
  readFileSync(
    path.resolve(here, "../strict-blank-source-frame-v1/source-frame-public.json"),
    "utf8",
  ),
);
const selected = buildCorpusV3(snapshot).selected["focus-grammar-killer"].slice(0, 157);
assert.equal(publicOutput.rows.length, 157);
assert.equal(privateOutput.rows.length, 157);
assert.deepEqual(
  publicOutput.rows.map((row: { contentHash: string }) => row.contentHash),
  selected.map((row) => row.contentHash),
);
assert.deepEqual(
  privateOutput.rows.map((row: { contentHash: string }) => row.contentHash),
  selected.map((row) => row.contentHash),
);
const strictHashes = new Set(
  strictFrame.rows.map((row: { contentHash: string }) => row.contentHash),
);
assert.equal(
  publicOutput.rows.some((row: { contentHash: string }) => strictHashes.has(row.contentHash)),
  false,
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
assert.equal(privateOutput.bindingHash, publicOutput.bindingHash);
assert.equal(publicOutput.sampleSizeBasis.requiredCandidates, 157);
assert.equal(publicOutput.sampleSizeBasis.targetDualLensPasses, 38);
assert.ok(publicOutput.sampleSizeBasis.achievedReachProbability >= 0.95);
assert.ok(publicOutput.sampleSizeBasis.previousSizeReachProbability < 0.95);
assert.equal(publicOutput.aggregate.campaignEligible, 0);
assert.equal(publicOutput.aggregate.populatedDiscourses, 4);
assert.equal(publicOutput.aggregate.populatedTopics, 5);
assert.equal(publicOutput.aggregate.populatedWordBands, 3);
assert.ok(publicOutput.aggregate.maximumDiscourseShare < 0.41);
assert.ok(publicOutput.aggregate.maximumTopicShare < 0.36);
assert.ok(publicOutput.aggregate.maximumWordBandShare < 0.64);

const publicText = JSON.stringify(publicOutput);
for (const row of privateOutput.rows) {
  for (const key of ["candidateId", "sourceRecordId", "documentKey", "sourceId"]) {
    if (typeof row[key] === "string" && row[key]) {
      assert.equal(publicText.includes(row[key]), false, `public private-ID leak: ${key}`);
    }
  }
}

const manifest = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
assert.equal(manifest.length, 5);
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
    verdict: "BOUND_BALANCED_SUPPLY_NOT_AUTHORIZED",
    rows: publicOutput.rows.length,
    strictBlankV1ExactOverlap: 0,
    targetDualLensPasses: 38,
    campaignEligibleRows: 0,
    manifestEntries: manifest.length,
    modelApiCalls: 0,
    fullQuestionCandidatesGenerated: 0,
  }, null, 2)}\n`,
);
