import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Decision = "PASS" | "EXCLUDE" | "DOMAIN_REVIEW";
type Level = "HIGH" | "MEDIUM" | "LOW";
type Integrity = "CLEAR" | "STRUCTURAL_LIMIT" | "DOMAIN_CHECK";

type ReviewRow = {
  frameId: string;
  decision: Decision;
  primaryReasonCode: string;
  supportingReasonCodes: string[];
  dimensions: {
    centralSpan: Level;
    synthesis: Level;
    optionHeadroom: Level;
    answerDeterminacy: Level;
    pairedArms: Level;
    localCueRisk: Level;
    sourceIntegrity: Integrity;
  };
  note: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const privateReviewPath = path.join(here, "private/reviewer-b.json");
const publicSummaryPath = path.join(here, "reviewer-b-summary.json");
const publicFramePath = path.join(here, "source-frame-public.json");
const privateFramePath = path.join(here, "private/source-frame-private.json");
const snapshotPath = path.resolve(here, "../v3/private/input-snapshot.json");
const manifestPath = path.join(here, "REVIEWER-B-MANIFEST.sha256");

const privateReviewRaw = readFileSync(privateReviewPath, "utf8");
const publicSummaryRaw = readFileSync(publicSummaryPath, "utf8");
const privateReview = JSON.parse(privateReviewRaw) as {
  schemaVersion: string;
  reviewer: string;
  lens: string;
  sourceBindingHash: string;
  independence: {
    reviewerARead: boolean;
    sampled: boolean;
    manualRowsReviewed: number;
  };
  enums: {
    decisions: Decision[];
    levels: Level[];
    localCueRisk: Level[];
    sourceIntegrity: Integrity[];
    reasonCodes: string[];
  };
  rows: ReviewRow[];
  safety: Record<string, number>;
};
const publicSummary = JSON.parse(publicSummaryRaw) as Record<string, unknown> & {
  sourceBindingHash: string;
  coverage: Record<string, number | boolean>;
  decisions: Record<Decision, number>;
  primaryReasonCounts: Record<string, number>;
  dimensionCounts: Record<string, Record<string, number>>;
  decisionByDiscourse: Record<string, Record<Decision, number>>;
  decisionByTopic: Record<string, Record<Decision, number>>;
  authorization: Record<string, number | boolean>;
  privacy: Record<string, boolean>;
  safety: Record<string, number>;
};
const publicFrame = JSON.parse(readFileSync(publicFramePath, "utf8")) as {
  bindingHash: string;
  rows: Array<{
    frameId: string;
    discourse: string;
    topic: string;
    campaignEligible: boolean;
  }>;
};
const privateFrame = JSON.parse(readFileSync(privateFramePath, "utf8")) as {
  rows: Array<{
    frameId: string;
    candidateId: string;
    sourceRecordId: string | null;
    documentKey: string | null;
    sourceId: string | null;
  }>;
};
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
  candidates: Array<{ id: string; text: string }>;
};

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const decisions: Decision[] = ["PASS", "EXCLUDE", "DOMAIN_REVIEW"];
const levels: Level[] = ["HIGH", "MEDIUM", "LOW"];
const localCueValues: Level[] = ["LOW", "MEDIUM", "HIGH"];
const integrityValues: Integrity[] = ["CLEAR", "STRUCTURAL_LIMIT", "DOMAIN_CHECK"];

assert.equal(privateReview.schemaVersion, "strict-blank-reviewer-b-v1");
assert.equal(privateReview.reviewer, "independent-reviewer-b");
assert.equal(privateReview.lens, "experimental-and-item-design-suitability");
assert.equal(privateReview.sourceBindingHash, publicFrame.bindingHash);
assert.equal(publicSummary.sourceBindingHash, publicFrame.bindingHash);
assert.deepEqual(privateReview.enums.decisions, decisions);
assert.deepEqual(privateReview.enums.levels, levels);
assert.deepEqual(privateReview.enums.localCueRisk, localCueValues);
assert.deepEqual(privateReview.enums.sourceIntegrity, integrityValues);
assert.equal(privateReview.independence.reviewerARead, false);
assert.equal(privateReview.independence.sampled, false);
assert.equal(privateReview.independence.manualRowsReviewed, 59);
assert.equal(privateReview.rows.length, 59);
assert.equal(publicFrame.rows.length, 59);
assert.equal(privateFrame.rows.length, 59);

const allowedReasons = new Set(privateReview.enums.reasonCodes);
const allowedLevels = new Set(levels);
const allowedIntegrity = new Set(integrityValues);
const notes = new Set<string>();
for (let index = 0; index < 59; index += 1) {
  const expectedFrameId = `strict-blank-${String(index + 1).padStart(3, "0")}`;
  const row = privateReview.rows[index];
  assert.equal(row.frameId, expectedFrameId);
  assert.equal(publicFrame.rows[index]?.frameId, expectedFrameId);
  assert.equal(privateFrame.rows[index]?.frameId, expectedFrameId);
  assert.ok(decisions.includes(row.decision));
  assert.ok(allowedReasons.has(row.primaryReasonCode));
  assert.ok(row.supportingReasonCodes.every((code) => allowedReasons.has(code)));
  assert.equal(new Set(row.supportingReasonCodes).size, row.supportingReasonCodes.length);
  assert.ok(!row.supportingReasonCodes.includes(row.primaryReasonCode));
  assert.ok(allowedLevels.has(row.dimensions.centralSpan));
  assert.ok(allowedLevels.has(row.dimensions.synthesis));
  assert.ok(allowedLevels.has(row.dimensions.optionHeadroom));
  assert.ok(allowedLevels.has(row.dimensions.answerDeterminacy));
  assert.ok(allowedLevels.has(row.dimensions.pairedArms));
  assert.ok(allowedLevels.has(row.dimensions.localCueRisk));
  assert.ok(allowedIntegrity.has(row.dimensions.sourceIntegrity));
  assert.ok(row.note.length >= 60 && row.note.length <= 260);
  assert.ok(!/["“”]/u.test(row.note));
  assert.ok(!notes.has(row.note));
  notes.add(row.note);

  if (row.decision === "PASS") {
    assert.match(row.primaryReasonCode, /^PASS_/u);
    assert.equal(row.dimensions.sourceIntegrity, "CLEAR");
    assert.notEqual(row.dimensions.pairedArms, "LOW");
  } else if (row.decision === "EXCLUDE") {
    assert.match(row.primaryReasonCode, /^EXCLUDE_/u);
    assert.equal(row.dimensions.pairedArms, "LOW");
    assert.ok(
      row.dimensions.synthesis === "LOW" ||
        row.dimensions.centralSpan === "LOW" ||
        row.dimensions.optionHeadroom === "LOW",
    );
  } else {
    assert.match(row.primaryReasonCode, /^DOMAIN_CHECK_/u);
    assert.equal(row.dimensions.sourceIntegrity, "DOMAIN_CHECK");
  }
}

const tokens = (value: string) => value.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
const hasContiguousOverlap = (left: string, right: string, width: number) => {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const rightRuns = new Set<string>();
  for (let index = 0; index <= rightTokens.length - width; index += 1) {
    rightRuns.add(rightTokens.slice(index, index + width).join(" "));
  }
  for (let index = 0; index <= leftTokens.length - width; index += 1) {
    if (rightRuns.has(leftTokens.slice(index, index + width).join(" "))) return true;
  }
  return false;
};

const candidateById = new Map(snapshot.candidates.map((candidate) => [candidate.id, candidate]));
for (let index = 0; index < 59; index += 1) {
  const mapRow = privateFrame.rows[index];
  const candidate = candidateById.get(mapRow.candidateId);
  assert.ok(candidate, `missing private snapshot candidate for row ${index + 1}`);
  assert.ok(
    !hasContiguousOverlap(privateReview.rows[index].note, candidate.text, 6),
    `private note contains a six-token verbatim source run: ${privateReview.rows[index].frameId}`,
  );
  assert.ok(!hasContiguousOverlap(publicSummaryRaw, candidate.text, 6));
}

assert.ok(
  !/"(?:candidateId|sourceRecordId|sourceId|documentKey|text|passage)"\s*:/u.test(
    privateReviewRaw,
  ),
);
for (const mapRow of privateFrame.rows) {
  for (const privateValue of [
    mapRow.candidateId,
    mapRow.sourceRecordId,
    mapRow.documentKey,
    mapRow.sourceId,
  ]) {
    if (privateValue) assert.ok(!privateReviewRaw.includes(privateValue));
  }
}
assert.ok(!/strict-blank-\d{3}/u.test(publicSummaryRaw));
assert.ok(!/"frameId"\s*:/u.test(publicSummaryRaw));
assert.ok(
  !/"(?:candidateId|sourceRecordId|sourceId|documentKey|text|passage|contentHash)"\s*:/u.test(
    publicSummaryRaw,
  ),
);

const countBy = <T extends string>(values: T[], universe: T[]) =>
  Object.fromEntries(universe.map((value) => [value, values.filter((item) => item === value).length]));
assert.deepEqual(
  publicSummary.decisions,
  countBy(
    privateReview.rows.map((row) => row.decision),
    decisions,
  ),
);

const primaryReasonCounts: Record<string, number> = {};
for (const row of privateReview.rows) {
  primaryReasonCounts[row.primaryReasonCode] =
    (primaryReasonCounts[row.primaryReasonCode] ?? 0) + 1;
}
assert.deepEqual(publicSummary.primaryReasonCounts, primaryReasonCounts);

const dimensionCounts = {
  centralSpan: countBy(privateReview.rows.map((row) => row.dimensions.centralSpan), levels),
  synthesis: countBy(privateReview.rows.map((row) => row.dimensions.synthesis), levels),
  optionHeadroom: countBy(privateReview.rows.map((row) => row.dimensions.optionHeadroom), levels),
  answerDeterminacy: countBy(
    privateReview.rows.map((row) => row.dimensions.answerDeterminacy),
    levels,
  ),
  pairedArms: countBy(privateReview.rows.map((row) => row.dimensions.pairedArms), levels),
  localCueRisk: countBy(privateReview.rows.map((row) => row.dimensions.localCueRisk), levels),
  sourceIntegrity: countBy(
    privateReview.rows.map((row) => row.dimensions.sourceIntegrity),
    integrityValues,
  ),
};
assert.deepEqual(publicSummary.dimensionCounts, dimensionCounts);

const aggregateDecisionBy = (field: "discourse" | "topic") => {
  const values = [...new Set(publicFrame.rows.map((row) => row[field]))].sort();
  return Object.fromEntries(
    values.map((value) => {
      const rowDecisions = privateReview.rows
        .filter((_, index) => publicFrame.rows[index]?.[field] === value)
        .map((row) => row.decision);
      return [value, countBy(rowDecisions, decisions)];
    }),
  );
};
assert.deepEqual(publicSummary.decisionByDiscourse, aggregateDecisionBy("discourse"));
assert.deepEqual(publicSummary.decisionByTopic, aggregateDecisionBy("topic"));

assert.deepEqual(publicSummary.coverage, {
  frameRows: 59,
  manuallyReviewedRows: 59,
  sampledRows: 0,
  unreviewedRows: 0,
  reviewerARead: false,
});
assert.ok(publicFrame.rows.every((row) => row.campaignEligible === false));
assert.deepEqual(publicSummary.authorization, {
  campaignEligibleRows: 0,
  silentReplacementAllowed: false,
  queueRedesignRequired: true,
  domainReviewCountsAsPass: false,
  rightsRecordStillSeparate: true,
});
assert.deepEqual(publicSummary.privacy, {
  containsPassageText: false,
  containsPrivateIds: false,
  containsRowLevelNotes: false,
  containsRowLevelDecisions: false,
});
assert.deepEqual(privateReview.safety, {
  modelApiCalls: 0,
  networkCalls: 0,
  databaseCalls: 0,
  fullQuestionCandidatesGenerated: 0,
});
assert.deepEqual(publicSummary.safety, privateReview.safety);

const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
assert.equal(manifestLines.length, 4);
for (const line of manifestLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed reviewer-B manifest line: ${line}`);
  const [, expected, relativePath] = match;
  assert.equal(
    sha256(readFileSync(path.join(repoRoot, relativePath))),
    expected,
    `reviewer-B hash mismatch: ${relativePath}`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "PASS_REVIEWER_B_MANUAL_FRAME_ONLY_NOT_CAMPAIGN_AUTHORIZATION",
      sourceBindingHash: privateReview.sourceBindingHash,
      rowsReviewed: 59,
      decisions: publicSummary.decisions,
      campaignEligibleRows: 0,
      manifestEntries: manifestLines.length,
      privacy: publicSummary.privacy,
      safety: publicSummary.safety,
    },
    null,
    2,
  )}\n`,
);
