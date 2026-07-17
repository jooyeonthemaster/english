import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const snapshotPath = path.resolve(here, "../v3/private/input-snapshot.json");
const blankMembershipPath = path.resolve(
  here,
  "../cross-type-blank-source-frame-v2/private/reconciliation-and-split-v2.json",
);
const nearDuplicateSourcePath = path.resolve(here, "../v2/selector-core-v2.ts");
const comparisonSourcePath = path.resolve(here, "../v2/history-index.ts");
const publicPath = path.join(here, "source-frame-public.json");
const privatePath = path.join(here, "private/source-frame-private.json");
const expectedSnapshotHash =
  "c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13";
const SOURCE_QUEUE_SIZE = 307;
const BLANK_OPERATIONAL_ROWS = 38;
const TARGET_DUAL_LENS_PASSES = 38;
const ONE_SIDED_CONFIDENCE = 0.95;
const REQUIRED_REACH_PROBABILITY = 0.95;
const OBSERVED_GRAMMAR_PASSES = 19;
const OBSERVED_GRAMMAR_ROWS = 52;
const COLLISION_CODES = [
  "EXACT_NORMALIZED_HASH",
  "MARKUP_STRIPPED_EXACT",
  "SOURCE_RANGE_OVERLAP",
  "SEQUENTIAL_DOCUMENT_FRAGMENT",
  "FIVE_GRAM_SIMILARITY",
  "LONG_CONTIGUOUS_OVERLAP",
] as const;

type QueueRow = ReturnType<typeof buildCorpusV3>["selected"]["focus-grammar-killer"][number];
type BlankOperationalMembership = {
  selection: {
    rows: Array<{ contentHash: string }>;
  };
};

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

function collisionClosure(
  queue: readonly QueueRow[],
  seedContentHashes: ReadonlySet<string>,
) {
  const cluster = new Set(seedContentHashes);
  const expansionRounds: Array<{
    round: number;
    addedRows: number;
    collisionCodes: Record<string, number>;
  }> = [];
  const totalCollisionCodes = Object.fromEntries(
    COLLISION_CODES.map((code) => [code, 0]),
  ) as Record<(typeof COLLISION_CODES)[number], number>;

  for (let round = 1; ; round += 1) {
    const index = new NearDuplicateIndex();
    for (const item of queue) {
      if (!cluster.has(item.contentHash)) continue;
      index.add({
        id: item.id,
        text: item.text,
        source: "blank-v2-operational-membership-cluster",
        document: item.document,
      });
    }

    const additions: Array<{
      contentHash: string;
      code: (typeof COLLISION_CODES)[number];
    }> = [];
    const roundCodes = Object.fromEntries(
      COLLISION_CODES.map((code) => [code, 0]),
    ) as Record<(typeof COLLISION_CODES)[number], number>;
    for (const item of queue) {
      if (cluster.has(item.contentHash)) continue;
      const evidence = index.query(item as never);
      if (!evidence) continue;
      assert.ok(
        COLLISION_CODES.includes(evidence.code),
        `unknown collision code: ${evidence.code}`,
      );
      additions.push({
        contentHash: item.contentHash,
        code: evidence.code,
      });
      roundCodes[evidence.code] += 1;
      totalCollisionCodes[evidence.code] += 1;
    }
    for (const addition of additions) cluster.add(addition.contentHash);
    expansionRounds.push({
      round,
      addedRows: additions.length,
      collisionCodes: roundCodes,
    });
    if (additions.length === 0) break;
  }

  return { cluster, expansionRounds, totalCollisionCodes };
}

const snapshotRaw = readFileSync(snapshotPath, "utf8");
const snapshot = JSON.parse(snapshotRaw) as V3PinnedSnapshot;
assert.equal(snapshot.snapshotHash, expectedSnapshotHash);
const membershipRaw = readFileSync(blankMembershipPath, "utf8");
const membershipSource = JSON.parse(membershipRaw) as BlankOperationalMembership;

// The blank artifact contributes only this membership projection. Reviewer
// verdicts, reasons, notes, passage text, split labels, and item outcomes are
// not loaded from it. Queue text is used only by the mandatory frozen
// collision-exclusion engine, never as a positive inclusion/ranking feature.
const blankOperationalContentHashes = membershipSource.selection.rows.map(
  (row) => row.contentHash,
);
assert.equal(blankOperationalContentHashes.length, BLANK_OPERATIONAL_ROWS);
assert.equal(
  new Set(blankOperationalContentHashes).size,
  BLANK_OPERATIONAL_ROWS,
);
const membershipProjection = [...blankOperationalContentHashes].sort((a, b) =>
  a.localeCompare(b, "en"),
);
const membershipSet = new Set(membershipProjection);

const selection = buildCorpusV3(snapshot);
const grammarQueue = selection.selected["focus-grammar-killer"];
assert.equal(grammarQueue.length, SOURCE_QUEUE_SIZE);
assert.equal(new Set(grammarQueue.map((item) => item.contentHash)).size, SOURCE_QUEUE_SIZE);
assert.equal(
  grammarQueue.filter((item) => membershipSet.has(item.contentHash)).length,
  BLANK_OPERATIONAL_ROWS,
);

const closure = collisionClosure(grammarQueue, membershipSet);
assert.ok(closure.cluster.size >= membershipSet.size);
for (const hash of membershipSet) assert.ok(closure.cluster.has(hash));
const eligibleRemainder = grammarQueue.filter(
  (item) => !closure.cluster.has(item.contentHash),
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
assert.equal(requiredCandidates, 186);
assert.ok(achievedReachProbability >= REQUIRED_REACH_PROBABILITY);
assert.ok(previousSizeReachProbability < REQUIRED_REACH_PROBABILITY);
assert.ok(eligibleRemainder.length >= requiredCandidates);

// Preserve immutable v3 queue order after membership-cluster exclusion. No
// passage, metadata cell, or reviewer outcome participates in this exact cut.
const boundFrame = eligibleRemainder.slice(0, requiredCandidates);
assert.equal(boundFrame.length, requiredCandidates);
assert.equal(
  boundFrame.some((item) => closure.cluster.has(item.contentHash)),
  false,
);

const publicRows = boundFrame.map((item, index) => ({
  frameId: `grammar-frame-v2-${String(index + 1).padStart(3, "0")}`,
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
    "PASS_V3_FOCUS_GRAMMAR_SOURCE_GATE_CLUSTER_DISJOINT_UNREVIEWED",
  manualSourceIntegrity: "UNREVIEWED",
  manualGrammarDesignSuitability: "UNREVIEWED",
  rightsRecord: "NOT_PRESENT_IN_SNAPSHOT",
  campaignEligible: false,
}));
const discourse = countBy(publicRows.map((row) => row.discourse));
const topic = countBy(publicRows.map((row) => row.topic));
const wordBand = countBy(publicRows.map((row) => row.wordBand));

const bindingCore = {
  schemaVersion: 2,
  status: "BOUND_REVIEW_FRAME_NOT_AUTHORIZED",
  sourceSnapshotHash: snapshot.snapshotHash,
  sourceSnapshotFileSha256: sha256(snapshotRaw),
  sourceBlankOperationalMembershipFileSha256: sha256(membershipRaw),
  sourceBlankOperationalMembershipProjectionSha256: sha256(
    stableStringify(membershipProjection),
  ),
  nearDuplicatePolicySourceSha256: sha256(readFileSync(nearDuplicateSourcePath)),
  comparisonPolicySourceSha256: sha256(readFileSync(comparisonSourcePath)),
  selectionVersion: "2026-07-15-cross-type-grammar-source-frame-v2",
  populationPolicy:
    "From the immutable 307-row v3 focus-grammar-killer queue, exclude only the 38 frozen blank-v2 operational dev/confirmatory/reserve memberships and the complete transitive cluster under the frozen exact/normalized/near-duplicate policy; then preserve queue order.",
  inclusionProvenance: {
    fieldsReadFromBlankOperationalSelection: ["contentHash"],
    reviewerVerdictsUsed: false,
    reviewerReasonsUsed: false,
    reviewerNotesUsed: false,
    blankMembershipArtifactPassageTextUsed: false,
    passageTextUsedAsPositiveInclusionFeature: false,
    passageTextUsedOnlyByFrozenCollisionExclusion: true,
    splitLabelsUsedForInclusion: false,
    metadataUsedForInclusion: false,
    outcomeAwareSelection: false,
  },
  collisionPolicy: {
    algorithm:
      "Transitive closure: seed the 38 exact memberships; query every remaining queue row against the current cluster using frozen NearDuplicateIndex; add all collisions simultaneously; repeat until zero additions.",
    codes: COLLISION_CODES,
    seedMembershipRows: membershipSet.size,
    clusterRows: closure.cluster.size,
    additionalClusterCollisionRows: closure.cluster.size - membershipSet.size,
    expansionRounds: closure.expansionRounds,
    additionalCollisionCodeCounts: closure.totalCollisionCodes,
  },
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
  },
  supply: {
    frozenSourceQueueRows: SOURCE_QUEUE_SIZE,
    excludedMembershipClusterRows: closure.cluster.size,
    remainingAfterClusterExclusion: eligibleRemainder.length,
    boundReviewFrameRows: boundFrame.length,
    unboundEligibleRemainderRows: eligibleRemainder.length - boundFrame.length,
    shortfall: 0,
  },
  framePolicy:
    "Bind exactly the first 186 cluster-disjoint rows in immutable v3 queue order; no replacement, top-up, reordering, or post-review selection.",
  authorization:
    "BOUND_NOT_AUTHORIZED: every row requires both independent full-census reviews. Rights, refreshed history/exposure, provider/retry/cost controls, reconciliation, and sealed generation assignment remain separate holds.",
  rows: publicRows,
};
const bindingHash = sha256(stableStringify(bindingCore));
const publicOutput = {
  ...bindingCore,
  bindingHash,
  aggregate: {
    count: publicRows.length,
    blankOperationalMembershipExactOverlap: publicRows.filter((row) =>
      membershipSet.has(row.contentHash),
    ).length,
    blankOperationalCollisionClusterOverlap: publicRows.filter((row) =>
      closure.cluster.has(row.contentHash),
    ).length,
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
    campaignEligible: 0,
    rightsRecordAbsent: publicRows.length,
  },
  privacy: {
    containsPassageText: false,
    containsCandidateId: false,
    containsSourceRecordId: false,
    containsDocumentKey: false,
    containsSourceDocumentId: false,
    exposesBlankOperationalMembershipRows: false,
  },
  safety: {
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
    secretAccesses: 0,
    fullQuestionCandidatesGenerated: 0,
    passageTextManuallyInspectedByFrameBuilder: false,
  },
};

const privateOutput = {
  schemaVersion: 2,
  status: "PRIVATE_BOUND_REVIEW_FRAME_NOT_AUTHORIZED",
  confidentiality:
    "PRIVATE: contains passage text and source identifiers; never publish or add to git.",
  bindingHash,
  sourceSnapshotHash: snapshot.snapshotHash,
  rows: boundFrame.map((item, index) => ({
    frameId: publicRows[index].frameId,
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
    verdict: "BOUND_REVIEW_FRAME_NOT_AUTHORIZED",
    bindingHash,
    conservativePassRate,
    requiredCandidates,
    blankOperationalMembershipRows: membershipSet.size,
    collisionClusterRows: closure.cluster.size,
    remainingAfterClusterExclusion: eligibleRemainder.length,
    boundReviewFrameRows: boundFrame.length,
    campaignEligible: 0,
    modelApiCalls: 0,
  })}\n`,
);
