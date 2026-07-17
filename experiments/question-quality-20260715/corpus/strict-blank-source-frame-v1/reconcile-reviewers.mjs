import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(here, relativePath), "utf8"));
}

function sha256(relativePath) {
  return createHash("sha256")
    .update(readFileSync(path.join(here, relativePath)))
    .digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

export function computeReviewerReconciliation() {
  const frame = readJson("source-frame-public.json");
  const reviewerA = readJson("private/reviewer-a.json");
  const reviewerB = readJson("private/reviewer-b.json");
  if (
    reviewerA.sourceBindingHash !== frame.bindingHash ||
    reviewerB.sourceBindingHash !== frame.bindingHash
  ) {
    throw new Error("source binding mismatch");
  }

  const aById = new Map(reviewerA.rows.map((row) => [row.frameId, row]));
  const bById = new Map(reviewerB.rows.map((row) => [row.frameId, row]));
  const pairMatrix = {};
  const dispositionCounts = {
    FRAME_PASS_BOTH_LENSES: 0,
    EXCLUDE: 0,
    DOMAIN_REVIEW: 0,
  };
  const framePassDiscourse = {};
  const framePassTopic = {};
  const privateRows = [];

  for (const frameRow of frame.rows) {
    const a = aById.get(frameRow.frameId);
    const b = bById.get(frameRow.frameId);
    if (!a || !b) throw new Error(`missing review row: ${frameRow.frameId}`);
    increment(pairMatrix, `A_${a.verdict}__B_${b.decision}`);
    let disposition;
    const blockers = [];
    if (a.verdict === "EXCLUDE" || b.decision === "EXCLUDE") {
      disposition = "EXCLUDE";
      if (a.verdict === "EXCLUDE") blockers.push(...a.reasonCodes.map((code) => `A:${code}`));
      if (b.decision === "EXCLUDE") blockers.push(`B:${b.primaryReasonCode}`);
    } else if (a.verdict === "DOMAIN_REVIEW" || b.decision === "DOMAIN_REVIEW") {
      disposition = "DOMAIN_REVIEW";
      if (a.verdict === "DOMAIN_REVIEW") blockers.push(...a.reasonCodes.map((code) => `A:${code}`));
      if (b.decision === "DOMAIN_REVIEW") blockers.push(`B:${b.primaryReasonCode}`);
    } else {
      disposition = "FRAME_PASS_BOTH_LENSES";
      increment(framePassDiscourse, frameRow.discourse);
      increment(framePassTopic, frameRow.topic);
    }
    dispositionCounts[disposition] += 1;
    privateRows.push({
      frameId: frameRow.frameId,
      contentHash: frameRow.contentHash,
      reviewerAVerdict: a.verdict,
      reviewerBVerdict: b.decision,
      disposition,
      blockers,
      rightsRecord: frameRow.rightsRecord,
      campaignEligible: false,
    });
  }

  if (privateRows.length !== 59 || dispositionCounts.FRAME_PASS_BOTH_LENSES !== 24) {
    throw new Error("unexpected reconciliation counts");
  }

  const privateOutput = {
    schemaVersion: "strict-blank-reviewer-reconciliation-private-v1",
    sourceBindingHash: frame.bindingHash,
    policy:
      "EXCLUDE if either independent lens excludes; DOMAIN_REVIEW if neither excludes and either lens defers; frame-pass only if both pass.",
    rows: privateRows,
  };
  const privateBytes = stableJson(privateOutput);
  const publicOutput = {
    schemaVersion: "strict-blank-reviewer-reconciliation-summary-v1",
    reviewDate: "2026-07-15",
    sourceBindingHash: frame.bindingHash,
    inputs: {
      reviewerAManifestFileSha256: sha256("REVIEWER-A-MANIFEST.sha256"),
      reviewerBManifestFileSha256: sha256("REVIEWER-B-MANIFEST.sha256"),
      reviewerAPrivateRowsSha256: sha256("private/reviewer-a.json"),
      reviewerBPrivateRowsSha256: sha256("private/reviewer-b.json"),
    },
    policy: {
      exclusionPrecedence: true,
      bothIndependentLensesRequiredForFramePass: true,
      domainReviewNeverCountsAsPass: true,
      rightsReviewSeparate: true,
      noSilentTopUpOrReplacement: true,
    },
    pairMatrix,
    dispositions: dispositionCounts,
    framePassDistribution: {
      discourse: framePassDiscourse,
      topic: framePassTopic,
    },
    supplyConsequence: {
      sourceAndDesignFramePassRows: dispositionCounts.FRAME_PASS_BOTH_LENSES,
      frozenPromptDesignUniqueClustersRequired: 26,
      minimumShortfallBeforeRightsReview: 2,
      expositoryShare:
        framePassDiscourse.expository / dispositionCounts.FRAME_PASS_BOTH_LENSES,
      queueRedesignRequired: true,
    },
    authorization: {
      campaignEligibleRows: 0,
      reason: [
        "The frozen 26-cluster focus design cannot be filled from the 24 dual-lens frame passes.",
        "The dual-lens frame passes are discourse-skewed.",
        "The source snapshot contains no reviewed rights record.",
      ],
    },
    privateReconciliationSha256: createHash("sha256")
      .update(privateBytes)
      .digest("hex"),
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
  const outputs = computeReviewerReconciliation();
  writeFileSync(path.join(here, "private/reconciliation-v1.json"), outputs.privateBytes);
  writeFileSync(
    path.join(here, "reviewer-reconciliation-summary.json"),
    outputs.publicBytes,
  );
  process.stdout.write(
    `${JSON.stringify({
      verdict: "FRAME_BLOCKED_QUEUE_REDESIGN_REQUIRED",
      ...outputs.publicOutput.dispositions,
      campaignEligibleRows: 0,
    }, null, 2)}\n`,
  );
}
