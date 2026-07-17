import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(here, relativePath), "utf8"));
const sha256File = (relativePath) =>
  createHash("sha256")
    .update(readFileSync(path.join(here, relativePath)))
    .digest("hex");
const sha256Value = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const increment = (record, key, amount = 1) => {
  record[key] = (record[key] ?? 0) + amount;
};

const selectionSeed =
  "cross-type-blank-v2-dual-pass-balanced-split-20260715-v1";

// Frozen before row selection. The quota table deliberately balances all four
// discourse classes while retaining all five available topic classes. A row is
// chosen only by metadata cell plus a seeded content-hash order; passage text,
// reviewer notes, and any prospective item score never enter selection.
const splitCellQuotas = {
  development: [
    ["argumentative", "humanities", 1],
    ["argumentative", "science", 1],
    ["expository", "art-culture", 1],
    ["expository", "social", 1],
    ["narrative", "narrative-practical", 1],
    ["practical", "narrative-practical", 1],
  ],
  confirmatory: [
    ["argumentative", "art-culture", 2],
    ["argumentative", "humanities", 1],
    ["argumentative", "science", 1],
    ["argumentative", "social", 1],
    ["expository", "art-culture", 1],
    ["expository", "humanities", 2],
    ["expository", "science", 1],
    ["expository", "social", 1],
    ["narrative", "narrative-practical", 5],
    ["practical", "narrative-practical", 5],
  ],
  reserve: [
    ["argumentative", "art-culture", 1],
    ["argumentative", "humanities", 1],
    ["argumentative", "social", 1],
    ["expository", "science", 2],
    ["expository", "social", 1],
    ["narrative", "narrative-practical", 4],
    ["practical", "narrative-practical", 2],
  ],
};

function distribution(rows, key) {
  const out = {};
  for (const row of rows) increment(out, row[key]);
  return out;
}

function selectBalancedRows(eligibleRows) {
  const selectedFrameIds = new Set();
  const selections = [];
  for (const [split, cells] of Object.entries(splitCellQuotas)) {
    for (const [discourse, topic, count] of cells) {
      const candidates = eligibleRows
        .filter(
          (row) =>
            row.discourse === discourse &&
            row.topic === topic &&
            !selectedFrameIds.has(row.frameId),
        )
        .map((row) => ({
          row,
          rank: sha256Value(
            `${selectionSeed}|${split}|${discourse}|${topic}|${row.contentHash}`,
          ),
        }))
        .sort((left, right) =>
          left.rank.localeCompare(right.rank) ||
          left.row.frameId.localeCompare(right.row.frameId),
        );
      if (candidates.length < count) {
        throw new Error(
          `insufficient dual-pass rows for ${split}/${discourse}/${topic}: ${candidates.length} < ${count}`,
        );
      }
      for (const { row, rank } of candidates.slice(0, count)) {
        selectedFrameIds.add(row.frameId);
        selections.push({
          frameId: row.frameId,
          contentHash: row.contentHash,
          split,
          discourse,
          topic,
          wordBand: row.wordBand,
          deterministicRank: rank,
        });
      }
    }
  }
  return selections;
}

export function computeReviewerReconciliationAndSplit() {
  const frame = readJson("source-frame-public.json");
  const reviewerA = readJson("private/reviewer-a.json");
  const reviewerB = readJson("private/reviewer-b.json");
  if (
    reviewerA.frameBindingHash !== frame.bindingHash ||
    reviewerB.frameBindingHash !== frame.bindingHash
  ) {
    throw new Error("reviewer/source-frame binding mismatch");
  }

  const aById = new Map(reviewerA.rows.map((row) => [row.frameId, row]));
  const bById = new Map(reviewerB.rows.map((row) => [row.frameId, row]));
  const pairMatrix = {};
  const dispositionCounts = {
    FRAME_PASS_BOTH_LENSES: 0,
    EXCLUDE: 0,
    DOMAIN_REVIEW: 0,
  };
  const privateRows = [];
  const eligibleRows = [];

  for (const frameRow of frame.rows) {
    const a = aById.get(frameRow.frameId);
    const b = bById.get(frameRow.frameId);
    if (!a || !b) throw new Error(`missing reviewer row: ${frameRow.frameId}`);
    increment(pairMatrix, `A_${a.verdict}__B_${b.verdict}`);
    let disposition;
    const blockers = [];
    if (a.verdict === "EXCLUDE" || b.verdict === "EXCLUDE") {
      disposition = "EXCLUDE";
      if (a.verdict === "EXCLUDE") {
        blockers.push(...a.reasonCodes.map((code) => `A:${code}`));
      }
      if (b.verdict === "EXCLUDE") {
        blockers.push(...b.reasonCodes.map((code) => `B:${code}`));
      }
    } else if (
      a.verdict === "DOMAIN_REVIEW" ||
      b.verdict === "DOMAIN_REVIEW"
    ) {
      disposition = "DOMAIN_REVIEW";
      if (a.verdict === "DOMAIN_REVIEW") {
        blockers.push(...a.reasonCodes.map((code) => `A:${code}`));
      }
      if (b.verdict === "DOMAIN_REVIEW") {
        blockers.push(...b.reasonCodes.map((code) => `B:${code}`));
      }
    } else {
      disposition = "FRAME_PASS_BOTH_LENSES";
      eligibleRows.push(frameRow);
    }
    increment(dispositionCounts, disposition);
    privateRows.push({
      frameId: frameRow.frameId,
      contentHash: frameRow.contentHash,
      reviewerAVerdict: a.verdict,
      reviewerBVerdict: b.verdict,
      disposition,
      blockers,
      selectedSplit: null,
      rightsRecord: frameRow.rightsRecord,
      campaignEligible: false,
    });
  }

  const selections = selectBalancedRows(eligibleRows);
  const selectionById = new Map(selections.map((row) => [row.frameId, row]));
  for (const row of privateRows) {
    row.selectedSplit = selectionById.get(row.frameId)?.split ?? null;
  }

  const selectedRows = selections.map((selection) => {
    const frameRow = eligibleRows.find((row) => row.frameId === selection.frameId);
    if (!frameRow) throw new Error("selected row lost from eligible frame");
    return { ...frameRow, selectedSplit: selection.split };
  });
  const splitSummary = {};
  for (const split of Object.keys(splitCellQuotas)) {
    const rows = selectedRows.filter((row) => row.selectedSplit === split);
    splitSummary[split] = {
      rows: rows.length,
      discourse: distribution(rows, "discourse"),
      topic: distribution(rows, "topic"),
      wordBand: distribution(rows, "wordBand"),
    };
  }

  const privateOutput = {
    schemaVersion: "cross-type-blank-v2-reconciliation-private-v1",
    sourceBindingHash: frame.bindingHash,
    policy:
      "EXCLUDE if either lens excludes; DOMAIN_REVIEW if neither excludes and either lens defers; dual-pass only if both pass.",
    selection: {
      seed: selectionSeed,
      splitCellQuotas,
      rows: selections,
    },
    rows: privateRows,
  };
  const privateBytes = stableJson(privateOutput);

  const publicOutput = {
    schemaVersion: "cross-type-blank-v2-reconciliation-summary-v1",
    reviewDate: "2026-07-15",
    sourceBindingHash: frame.bindingHash,
    inputs: {
      reviewerAManifestFileSha256: sha256File("REVIEWER-A-MANIFEST.sha256"),
      reviewerBManifestFileSha256: sha256File("REVIEWER-B-MANIFEST.sha256"),
      reviewerAPrivateRowsSha256: sha256File("private/reviewer-a.json"),
      reviewerBPrivateRowsSha256: sha256File("private/reviewer-b.json"),
    },
    reconciliationPolicy: {
      exclusionPrecedence: true,
      bothIndependentLensesRequiredForFramePass: true,
      domainReviewNeverCountsAsPass: true,
    },
    pairMatrix,
    dispositions: dispositionCounts,
    dualPassDistribution: {
      discourse: distribution(eligibleRows, "discourse"),
      topic: distribution(eligibleRows, "topic"),
      wordBand: distribution(eligibleRows, "wordBand"),
    },
    frozenBalancedSplit: {
      targetRows: 38,
      selectedRows: selectedRows.length,
      developmentRows: 6,
      confirmatoryRows: 20,
      reserveRows: 12,
      selectionMethod:
        "fixed discourse/topic cell quotas, then seeded SHA-256 order of content hashes; no passage text, notes, or item outcome used",
      splitSummary,
      noPostOutcomeTopUp: true,
    },
    remainingHolds: {
      rightsReview: "SEPARATE_NOT_PERFORMED",
      refreshedGenerationHistory: "REQUIRED_IMMEDIATELY_BEFORE_QUEUE_SEAL",
      providerAndRetryEnvelope: "REQUIRED",
      operationalQueueBinding: "NOT_YET_SEALED",
    },
    authorization: {
      campaignEligibleRows: 0,
      reason:
        "The 38-row source/design frame is sufficient and frozen, but rights, refreshed history, provider controls, and the operational queue remain open.",
    },
    privateReconciliationSha256: sha256Value(privateBytes),
    privacy: {
      containsFrameIds: false,
      containsContentHashes: false,
      containsPassageText: false,
      containsRowLevelDecisions: false,
    },
    safety: {
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      secretAccesses: 0,
      fullQuestionCandidatesGenerated: 0,
    },
  };
  return {
    privateOutput,
    privateBytes,
    publicOutput,
    publicBytes: stableJson(publicOutput),
  };
}

if (process.argv.includes("--write")) {
  const output = computeReviewerReconciliationAndSplit();
  writeFileSync(
    path.join(here, "private/reconciliation-and-split-v2.json"),
    output.privateBytes,
  );
  writeFileSync(
    path.join(here, "reviewer-reconciliation-summary.json"),
    output.publicBytes,
  );
  process.stdout.write(
    `${JSON.stringify({
      verdict: "FRAME_SUPPLY_SUFFICIENT_BALANCED_SPLIT_FROZEN_NOT_AUTHORIZED",
      dispositions: output.publicOutput.dispositions,
      split: output.publicOutput.frozenBalancedSplit,
      campaignEligibleRows: 0,
    }, null, 2)}\n`,
  );
}

