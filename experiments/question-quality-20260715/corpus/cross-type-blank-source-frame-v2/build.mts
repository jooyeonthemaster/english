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
const priorFramePath = path.resolve(
  here,
  "../strict-blank-source-frame-v1/source-frame-public.json",
);
const publicPath = path.join(here, "source-frame-public.json");
const privatePath = path.join(here, "private/source-frame-private.json");
const expectedSnapshotHash =
  "c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13";
const FRAME_SIZE = 157;
const TARGET_DUAL_LENS_PASSES = 38;
const CONSERVATIVE_PASS_RATE = 0.298659465008;

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const countBy = (values: readonly (string | number | null | undefined)[]) =>
  Object.fromEntries(
    [...new Set(values.map((value) => String(value ?? "null")))]
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((value) => [value, values.filter((item) => String(item ?? "null") === value).length]),
  );

function logChoose(n: number, k: number): number {
  let total = 0;
  for (let index = 1; index <= k; index += 1) {
    total += Math.log(n - k + index) - Math.log(index);
  }
  return total;
}

function binomialReachProbability(n: number, target: number, p: number): number {
  let total = 0;
  for (let k = target; k <= n; k += 1) {
    total += Math.exp(
      logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p),
    );
  }
  return total;
}

const snapshotRaw = readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
const priorFrame = JSON.parse(readFileSync(priorFramePath, "utf8")) as {
  rows: Array<{ contentHash: string }>;
};
assert.equal(snapshot.snapshotHash, expectedSnapshotHash);
const selection = buildCorpusV3(snapshot);
const crossTypePool = selection.selected["focus-grammar-killer"];
assert.equal(crossTypePool.length, 307);
const priorHashes = new Set(priorFrame.rows.map((row) => row.contentHash));
assert.equal(crossTypePool.filter((item) => priorHashes.has(item.contentHash)).length, 0);

// Preserve the already frozen v3 queue sequence. No passage text, quality
// outcome, reviewer note, or post-hoc score participates in this cut.
const selected = crossTypePool.slice(0, FRAME_SIZE);
assert.equal(selected.length, FRAME_SIZE);
assert.equal(new Set(selected.map((item) => item.contentHash)).size, FRAME_SIZE);
const achieved = binomialReachProbability(
  FRAME_SIZE,
  TARGET_DUAL_LENS_PASSES,
  CONSERVATIVE_PASS_RATE,
);
const previous = binomialReachProbability(
  FRAME_SIZE - 1,
  TARGET_DUAL_LENS_PASSES,
  CONSERVATIVE_PASS_RATE,
);
assert.ok(achieved >= 0.95);
assert.ok(previous < 0.95);

const publicRows = selected.map((item, index) => ({
  frameId: `blank-supply-v2-${String(index + 1).padStart(3, "0")}`,
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
  automaticEligibility: "PASS_V3_FOCUS_GRAMMAR_SOURCE_GATE_CROSS_TYPE_BLANK_UNREVIEWED",
  manualSourceIntegrity: "UNREVIEWED",
  manualBlankDesignSuitability: "UNREVIEWED",
  rightsRecord: "NOT_PRESENT_IN_SNAPSHOT",
  campaignEligible: false,
}));

const discourse = countBy(publicRows.map((row) => row.discourse));
const topic = countBy(publicRows.map((row) => row.topic));
const wordBand = countBy(publicRows.map((row) => row.wordBand));
assert.deepEqual(discourse, {
  argumentative: 38,
  expository: 64,
  narrative: 46,
  practical: 9,
});
assert.deepEqual(topic, {
  "art-culture": 12,
  humanities: 35,
  "narrative-practical": 55,
  science: 33,
  social: 22,
});
assert.deepEqual(wordBand, { "120-169": 99, "170-229": 51, "230-360": 7 });

const bindingCore = {
  schemaVersion: 2,
  sourceSnapshotHash: snapshot.snapshotHash,
  sourceSnapshotFileSha256: sha256(snapshotRaw),
  selectionVersion: "2026-07-15-cross-type-blank-supply-v2",
  framePolicy:
    "First 157 rows of the already frozen v3 focus-grammar-killer queue; exact-content disjoint from strict blank v1; no post-review replacement or top-up.",
  sampleSizeBasis: {
    observedDualLensPasses: 24,
    observedRows: 59,
    oneSidedConfidence: 0.95,
    clopperPearsonLowerPassRate: CONSERVATIVE_PASS_RATE,
    targetDualLensPasses: TARGET_DUAL_LENS_PASSES,
    requiredCandidates: FRAME_SIZE,
    achievedReachProbability: achieved,
    previousSizeReachProbability: previous,
  },
  authorization:
    "BOUND_NOT_AUTHORIZED: every row requires two independent manual reviews; cross-type blank suitability is unreviewed; rights metadata is absent.",
  rows: publicRows,
};
const bindingHash = sha256(stableStringify(bindingCore));
const publicOutput = {
  ...bindingCore,
  bindingHash,
  aggregate: {
    count: publicRows.length,
    strictBlankV1ExactOverlap: 0,
    discourse,
    topic,
    wordBand,
    maximumDiscourseShare:
      Math.max(...Object.values(discourse)) / publicRows.length,
    maximumTopicShare: Math.max(...Object.values(topic)) / publicRows.length,
    maximumWordBandShare: Math.max(...Object.values(wordBand)) / publicRows.length,
    populatedDiscourses: Object.keys(discourse).length,
    populatedTopics: Object.keys(topic).length,
    populatedWordBands: Object.keys(wordBand).length,
    campaignEligible: 0,
    manualReviewsUnreviewed: publicRows.length,
    rightsRecordAbsent: publicRows.length,
  },
  privacy: {
    containsPassageText: false,
    containsPrivateSourceIdentifiers: false,
  },
  safety: {
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
    fullQuestionCandidatesGenerated: 0,
  },
};

const privateOutput = {
  schemaVersion: 2,
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
  `${JSON.stringify({
    bindingHash,
    count: publicRows.length,
    targetDualLensPasses: TARGET_DUAL_LENS_PASSES,
    campaignEligible: 0,
    modelApiCalls: 0,
  })}\n`,
);
