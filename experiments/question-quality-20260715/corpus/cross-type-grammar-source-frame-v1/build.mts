import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const snapshotPath = path.resolve(here, "../v3/private/input-snapshot.json");
const blankFramePath = path.resolve(
  here,
  "../cross-type-blank-source-frame-v2/source-frame-public.json",
);
const publicPath = path.join(here, "source-frame-public.json");
const privatePath = path.join(here, "private/source-frame-private.json");
const expectedSnapshotHash =
  "c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13";
const SOURCE_QUEUE_SIZE = 307;
const BLANK_V2_PREFIX_SIZE = 157;
const TARGET_DUAL_LENS_PASSES = 38;
const ONE_SIDED_CONFIDENCE = 0.95;
const REQUIRED_REACH_PROBABILITY = 0.95;
const OBSERVED_GRAMMAR_PASSES = 19;
const OBSERVED_GRAMMAR_ROWS = 52;

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const countBy = (values: readonly (string | number | null | undefined)[]) =>
  Object.fromEntries(
    [...new Set(values.map((value) => String(value ?? "null")))]
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((value) => [
        value,
        values.filter((item) => String(item ?? "null") === value).length,
      ]),
  );

const snapshotRaw = readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
const blankFrame = JSON.parse(readFileSync(blankFramePath, "utf8")) as {
  bindingHash: string;
  rows: Array<{ contentHash: string; queueSequence: number }>;
};
assert.equal(snapshot.snapshotHash, expectedSnapshotHash);

const selection = buildCorpusV3(snapshot);
const grammarQueue = selection.selected["focus-grammar-killer"];
assert.equal(grammarQueue.length, SOURCE_QUEUE_SIZE);
assert.equal(new Set(grammarQueue.map((item) => item.contentHash)).size, SOURCE_QUEUE_SIZE);

const blankPrefix = grammarQueue.slice(0, BLANK_V2_PREFIX_SIZE);
assert.equal(blankFrame.rows.length, BLANK_V2_PREFIX_SIZE);
assert.deepEqual(
  blankFrame.rows.map((row) => row.contentHash),
  blankPrefix.map((item) => item.contentHash),
);
assert.deepEqual(
  blankFrame.rows.map((row) => row.queueSequence),
  blankPrefix.map((item) => item.queueSequence),
);

// The ordering is inherited from the immutable v3 queue. Passage text,
// metadata, and review outcomes do not participate in the cut.
const availableRemainder = grammarQueue.slice(BLANK_V2_PREFIX_SIZE);
const blankHashes = new Set(blankPrefix.map((item) => item.contentHash));
assert.equal(availableRemainder.length, SOURCE_QUEUE_SIZE - BLANK_V2_PREFIX_SIZE);
assert.equal(
  availableRemainder.some((item) => blankHashes.has(item.contentHash)),
  false,
);

const conservativePassRate = clopperPearsonLowerBound(
  OBSERVED_GRAMMAR_PASSES,
  OBSERVED_GRAMMAR_ROWS,
  ONE_SIDED_CONFIDENCE,
);
const requiredCandidates = minimumQueueSize(
  TARGET_DUAL_LENS_PASSES,
  conservativePassRate,
  REQUIRED_REACH_PROBABILITY,
);
const achievedReachProbability = binomialReachProbability(
  requiredCandidates,
  TARGET_DUAL_LENS_PASSES,
  conservativePassRate,
);
const previousSizeReachProbability = binomialReachProbability(
  requiredCandidates - 1,
  TARGET_DUAL_LENS_PASSES,
  conservativePassRate,
);
const availableReachProbability = binomialReachProbability(
  availableRemainder.length,
  TARGET_DUAL_LENS_PASSES,
  conservativePassRate,
);
assert.equal(requiredCandidates, 186);
assert.ok(achievedReachProbability >= REQUIRED_REACH_PROBABILITY);
assert.ok(previousSizeReachProbability < REQUIRED_REACH_PROBABILITY);
assert.ok(availableRemainder.length < requiredCandidates);

const publicRows = availableRemainder.map((item, index) => ({
  supplyRowId: `grammar-supply-v1-${String(index + 1).padStart(3, "0")}`,
  contentHash: item.contentHash,
  queueSequence: item.queueSequence,
  sourceKind: item.sourceKind ?? null,
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
  automaticEligibility:
    "PASS_V3_FOCUS_GRAMMAR_SOURCE_GATE_REMAINDER_UNREVIEWED",
  manualSourceIntegrity: "UNREVIEWED",
  manualGrammarDesignSuitability: "UNREVIEWED",
  reviewActivation: "BLOCKED_SUPPLY_SHORTAGE",
  rightsRecord: "NOT_PRESENT_IN_SNAPSHOT",
  campaignEligible: false,
}));

const discourse = countBy(publicRows.map((row) => row.discourse));
const topic = countBy(publicRows.map((row) => row.topic));
const wordBand = countBy(publicRows.map((row) => row.wordBand));
const shortfall = requiredCandidates - availableRemainder.length;
assert.equal(shortfall, 36);

const bindingCore = {
  schemaVersion: 1,
  status: "HARD_BLOCK_SUPPLY_SHORTAGE",
  sourceSnapshotHash: snapshot.snapshotHash,
  sourceSnapshotFileSha256: sha256(snapshotRaw),
  sourceBlankFrameBindingHash: blankFrame.bindingHash,
  selectionVersion: "2026-07-15-cross-type-grammar-source-frame-v1",
  framePolicy:
    "Use the immutable v3 focus-grammar-killer queue remainder after the exact 157-row blank-supply-v2 prefix; preserve sequence; no replacement, top-up, target reduction, or outcome-aware selection.",
  sampleSizeBasis: {
    observedDualLensPasses: OBSERVED_GRAMMAR_PASSES,
    observedRows: OBSERVED_GRAMMAR_ROWS,
    oneSidedConfidence: ONE_SIDED_CONFIDENCE,
    clopperPearsonLowerPassRate: conservativePassRate,
    targetDualLensPasses: TARGET_DUAL_LENS_PASSES,
    requiredReachProbability: REQUIRED_REACH_PROBABILITY,
    requiredCandidates,
    achievedReachProbability,
    previousSizeReachProbability,
    availableRemainderReachProbability: availableReachProbability,
  },
  supply: {
    frozenSourceQueueRows: SOURCE_QUEUE_SIZE,
    consumedByBlankSupplyV2Prefix: BLANK_V2_PREFIX_SIZE,
    availableRemainderRows: availableRemainder.length,
    requiredCandidates,
    shortfall,
    operationalReviewFrameRows: 0,
    reviewActivated: false,
  },
  authorization:
    "HARD_BLOCK: the immutable disjoint remainder cannot fill the preregistered 186-row review frame. The 150 bound rows are shortage evidence, not an operational review frame. Rights, current history, and provider controls remain separate holds.",
  availableRows: publicRows,
};
const bindingHash = sha256(stableStringify(bindingCore));
const publicOutput = {
  ...bindingCore,
  bindingHash,
  aggregate: {
    availableCount: publicRows.length,
    blankSupplyV2ExactOverlap: publicRows.filter((row) => blankHashes.has(row.contentHash))
      .length,
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
    manualReviewsUnreviewed: publicRows.length,
    operationalReviewFrameRows: 0,
    campaignEligible: 0,
    rightsRecordAbsent: publicRows.length,
  },
  privacy: {
    containsPassageText: false,
    containsCandidateId: false,
    containsSourceRecordId: false,
    containsDocumentKey: false,
    containsSourceDocumentId: false,
  },
  safety: {
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
    fullQuestionCandidatesGenerated: 0,
    passageTextManuallyInspectedByFrameBuilder: false,
  },
};

const privateOutput = {
  schemaVersion: 1,
  status: "PRIVATE_BLOCKED_SUPPLY_BINDING",
  confidentiality:
    "PRIVATE: contains passage text and source identifiers; never publish or add to git.",
  bindingHash,
  sourceSnapshotHash: snapshot.snapshotHash,
  operationalReviewFrameRows: [],
  availableRows: availableRemainder.map((item, index) => ({
    supplyRowId: publicRows[index].supplyRowId,
    contentHash: item.contentHash,
    passageText: item.text,
    candidateId: item.id,
    sourceRecordId: item.sourceRecordId,
    documentKey: item.document.documentKey,
    sourceDocumentId: item.document.sourceId,
  })),
};

mkdirSync(path.dirname(privatePath), { recursive: true });
writeFileSync(publicPath, `${JSON.stringify(publicOutput, null, 2)}\n`, "utf8");
writeFileSync(privatePath, `${JSON.stringify(privateOutput, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({
    verdict: "HARD_BLOCK_SUPPLY_SHORTAGE",
    bindingHash,
    conservativePassRate,
    requiredCandidates,
    availableRemainderRows: availableRemainder.length,
    shortfall,
    operationalReviewFrameRows: 0,
    campaignEligible: 0,
    modelApiCalls: 0,
  })}\n`,
);
