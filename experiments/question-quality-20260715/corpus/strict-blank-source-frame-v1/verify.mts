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
const snapshotPath = path.resolve(here, "../v3/private/input-snapshot.json");
const publicPath = path.join(here, "source-frame-public.json");
const privatePath = path.join(here, "private/source-frame-private.json");
const manifestPath = path.join(here, "MANIFEST.sha256");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const publicRaw = readFileSync(publicPath, "utf8");
const privateRaw = readFileSync(privatePath, "utf8");
const snapshotRaw = readFileSync(snapshotPath, "utf8");
const publicFrame = JSON.parse(publicRaw) as Record<string, unknown> & {
  bindingHash: string;
  rows: Array<Record<string, unknown> & { contentHash: string; frameId: string }>;
  aggregate: Record<string, unknown> & { count: number; campaignEligible: number };
};
const privateFrame = JSON.parse(privateRaw) as {
  bindingHash: string;
  rows: Array<{ frameId: string; contentHash: string; candidateId: string }>;
};
const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
assert.equal(snapshot.snapshotHash, publicFrame.sourceSnapshotHash);
assert.equal(sha256(snapshotRaw), publicFrame.sourceSnapshotFileSha256);

const selection = buildCorpusV3(snapshot);
assert.equal(selection.status, "HARD_FAIL_SUPPLY_SHORTAGE");
const selected = selection.selected["focus-blank-killer"];
assert.equal(selected.length, 59);
assert.equal(publicFrame.rows.length, 59);
assert.equal(privateFrame.rows.length, 59);
assert.equal(publicFrame.aggregate.count, 59);
assert.equal(publicFrame.aggregate.campaignEligible, 0);
assert.equal(privateFrame.bindingHash, publicFrame.bindingHash);

for (let index = 0; index < 59; index += 1) {
  const selectedItem = selected[index];
  const publicItem = publicFrame.rows[index];
  const privateItem = privateFrame.rows[index];
  assert.equal(publicItem.contentHash, selectedItem.contentHash);
  assert.equal(privateItem.contentHash, selectedItem.contentHash);
  assert.equal(privateItem.candidateId, selectedItem.id);
  assert.equal(privateItem.frameId, publicItem.frameId);
  assert.equal(publicItem.campaignEligible, false);
  assert.equal(publicItem.manualPassageIntegrity, "UNREVIEWED");
  assert.equal(publicItem.rightsRecord, "NOT_PRESENT_IN_SNAPSHOT");
}

const { bindingHash } = publicFrame;
const bindingCore = Object.fromEntries(
  Object.entries(publicFrame).filter(
    ([key]) => !["bindingHash", "aggregate", "safety"].includes(key),
  ),
);
assert.equal(sha256(stableStringify(bindingCore)), bindingHash);
assert.ok(!/"(?:text|candidateId|sourceRecordId|academyId|documentKey)"\s*:/u.test(publicRaw));
assert.ok(!privateRaw.includes('"text"'));

const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
assert.equal(manifestLines.length, 8);
for (const line of manifestLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  assert.equal(
    sha256(readFileSync(path.join(repoRoot, relativePath))),
    expected,
    `hash mismatch: ${relativePath}`,
  );
}

process.stdout.write(
  `${JSON.stringify({
    verdict: "BOUND_NOT_AUTHORIZED",
    bindingHash,
    rows: 59,
    campaignEligible: 0,
    manualReviewPending: 59,
    rightsRecordAbsent: 59,
    manifestEntries: manifestLines.length,
    safety: { modelApiCalls: 0, networkCalls: 0, databaseCalls: 0 },
  }, null, 2)}\n`,
);
