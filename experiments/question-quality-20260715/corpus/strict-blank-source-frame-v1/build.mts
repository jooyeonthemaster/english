import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const snapshotPath = path.resolve(here, "../v3/private/input-snapshot.json");
const publicPath = path.join(here, "source-frame-public.json");
const privatePath = path.join(here, "private/source-frame-private.json");
const expectedSnapshotHash =
  "c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13";

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const countBy = (values: readonly (string | number | null | undefined)[]) =>
  Object.fromEntries(
    [...new Set(values.map((value) => String(value ?? "null")))]
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((value) => [value, values.filter((item) => String(item ?? "null") === value).length]),
  );

const snapshotRaw = readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
assert.equal(snapshot.snapshotHash, expectedSnapshotHash);
const selection = buildCorpusV3(snapshot);
assert.equal(selection.status, "HARD_FAIL_SUPPLY_SHORTAGE");
const selected = selection.selected["focus-blank-killer"];
assert.equal(selected.length, 59);
assert.equal(new Set(selected.map((item) => item.contentHash)).size, 59);

const publicRows = selected.map((item, index) => ({
  frameId: `strict-blank-${String(index + 1).padStart(3, "0")}`,
  contentHash: item.contentHash,
  queueSequence: item.queueSequence,
  sourceKind: item.sourceKind ?? null,
  sourceLabel: item.source ?? null,
  sourceSubject: item.sourceSubject ?? null,
  sourceExamType: item.sourceExamType ?? null,
  year: item.document.year,
  round: item.document.round,
  originalType: item.document.originalType,
  qNumbers: item.document.qNumbers,
  wordCount: item.wordCount,
  sentenceCount: item.features.sentenceCount,
  wordBand: item.strata.wordBand,
  discourse: item.strata.discourse,
  topic: item.strata.topic,
  reconstructionKind: item.reconstructionKind ?? null,
  automaticEligibility: "PASS_V3_STRICT_CENTRAL_SPAN",
  manualPassageIntegrity: "UNREVIEWED",
  rightsRecord: "NOT_PRESENT_IN_SNAPSHOT",
  campaignEligible: false,
}));

assert.ok(publicRows.every((row) => row.sourceKind === "EXAM"));
assert.ok(publicRows.every((row) => row.originalType === "빈칸추론"));
assert.ok(publicRows.every((row) => row.wordCount >= 150 && row.wordCount <= 262));
assert.ok(publicRows.every((row) => row.sentenceCount >= 5 && row.sentenceCount <= 12));

const bindingCore = {
  schemaVersion: 1,
  sourceSnapshotHash: snapshot.snapshotHash,
  sourceSnapshotFileSha256: sha256(snapshotRaw),
  selectionVersion: "2026-07-15-v3-pinned-stratified",
  framePolicy:
    "Exact v3 strict focus-blank selection; no replacement, no top-up, no broadened originalType.",
  authorization:
    "BOUND_NOT_AUTHORIZED: every row requires independent manual passage-integrity review; source-rights metadata is absent and no legal conclusion is made.",
  rows: publicRows,
};
const bindingHash = sha256(stableStringify(bindingCore));
const publicOutput = {
  ...bindingCore,
  bindingHash,
  aggregate: {
    count: publicRows.length,
    sourceKind: countBy(publicRows.map((row) => row.sourceKind)),
    sourceLabel: countBy(publicRows.map((row) => row.sourceLabel)),
    year: countBy(publicRows.map((row) => row.year)),
    round: countBy(publicRows.map((row) => row.round)),
    originalType: countBy(publicRows.map((row) => row.originalType)),
    wordCount: {
      min: Math.min(...publicRows.map((row) => row.wordCount)),
      max: Math.max(...publicRows.map((row) => row.wordCount)),
    },
    sentenceCount: {
      min: Math.min(...publicRows.map((row) => row.sentenceCount)),
      max: Math.max(...publicRows.map((row) => row.sentenceCount)),
    },
    campaignEligible: 0,
    manualPassageIntegrityUnreviewed: publicRows.length,
    rightsRecordAbsent: publicRows.length,
  },
  safety: { modelApiCalls: 0, networkCalls: 0, databaseCalls: 0 },
};

const privateOutput = {
  schemaVersion: 1,
  bindingHash,
  sourceSnapshotHash: snapshot.snapshotHash,
  rows: selected.map((item, index) => ({
    frameId: publicRows[index].frameId,
    contentHash: item.contentHash,
    candidateId: item.id,
    sourceRecordId: item.sourceRecordId,
    documentKey: item.document.documentKey,
    sourceId: item.document.sourceId,
  })),
};

mkdirSync(path.dirname(privatePath), { recursive: true });
writeFileSync(publicPath, `${JSON.stringify(publicOutput, null, 2)}\n`, "utf8");
writeFileSync(privatePath, `${JSON.stringify(privateOutput, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({ bindingHash, count: publicRows.length, campaignEligible: 0, modelApiCalls: 0 })}\n`,
);
