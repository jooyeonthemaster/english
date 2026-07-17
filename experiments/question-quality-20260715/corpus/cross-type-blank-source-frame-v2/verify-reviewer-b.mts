import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as selectorCoreModule from "../selector-core";
import * as selectorV3Module from "../v3/selector-core-v3";

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
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const read = (relativePath: string) =>
  readFileSync(path.resolve(here, relativePath), "utf8");

const protocolRaw = read("REVIEW-PROTOCOL.md");
const publicFrameRaw = read("source-frame-public.json");
const privateFrameRaw = read("private/source-frame-private.json");
const snapshotRaw = read("../v3/private/input-snapshot.json");
const reviewRaw = read("private/reviewer-b.json");
const summaryRaw = read("reviewer-b-summary.json");
const auditRaw = read("REVIEWER-B-AUDIT.md");
const publicFrame = JSON.parse(publicFrameRaw);
const privateFrame = JSON.parse(privateFrameRaw);
const snapshot = JSON.parse(snapshotRaw);
const review = JSON.parse(reviewRaw);
const summary = JSON.parse(summaryRaw);

assert.equal(publicFrame.rows.length, 157);
assert.equal(privateFrame.rows.length, 157);
assert.equal(review.rows.length, 157);
assert.equal(review.method.expectedRows, 157);
assert.equal(review.method.reviewedRows, 157);
assert.equal(review.method.fullCensus, true);
assert.equal(review.method.rawPassageReadForEveryRow, true);
for (const forbiddenMethod of [
  "sampling",
  "delegation",
  "replacement",
  "topUp",
  "otherReviewerArtifactsRead",
]) {
  assert.equal(review.method[forbiddenMethod], false, forbiddenMethod);
}
for (const zeroMethod of [
  "questionCandidatesGenerated",
  "modelApiCalls",
  "networkCalls",
  "databaseCalls",
]) {
  assert.equal(review.method[zeroMethod], 0, zeroMethod);
}

assert.equal(review.reviewer, "B");
assert.equal(review.lens, "paired-item-design-and-killer-headroom");
assert.equal(review.status, "FROZEN_INDEPENDENT_FULL_CENSUS");
assert.equal(review.protocolSha256, sha256(protocolRaw));
assert.equal(review.frameBindingHash, publicFrame.bindingHash);
assert.equal(review.sourceSnapshotHash, snapshot.snapshotHash);
assert.equal(review.sourceSnapshotFileSha256, sha256(snapshotRaw));
assert.equal(review.sourceFramePublicFileSha256, sha256(publicFrameRaw));
assert.equal(review.sourceFramePrivateFileSha256, sha256(privateFrameRaw));
assert.equal(privateFrame.bindingHash, publicFrame.bindingHash);
assert.equal(privateFrame.sourceSnapshotHash, snapshot.snapshotHash);

const reviewCore = Object.fromEntries(
  Object.entries(review).filter(([key]) => key !== "reviewHash"),
);
assert.equal(review.reviewHash, sha256(stableStringify(reviewCore)));

const selected = buildCorpusV3(snapshot).selected["focus-grammar-killer"].slice(0, 157);
assert.equal(selected.length, 157);
assert.deepEqual(
  publicFrame.rows.map((row: { contentHash: string }) => row.contentHash),
  selected.map((row) => row.contentHash),
);

const fixedCriterionOrder = [
  "c1AnswerTarget",
  "c2PairedItems",
  "c3KillerSynthesis",
  "c4Distractors",
  "c5MisconceptionAxes",
  "c6SurfaceGiveawayRisk",
  "c7FactualPremise",
];
assert.deepEqual(review.fixedCriterionOrder, fixedCriterionOrder);

const levels = new Set(["HIGH", "MEDIUM", "LOW"]);
const surfaceLevels = new Set(["LOW", "MEDIUM", "HIGH"]);
const factualLevels = new Set(["CLEAR", "NEEDS_DOMAIN_EVIDENCE"]);
const allowedAxes = new Set([
  "actor-target",
  "polarity",
  "condition-modality",
  "causal-relation-direction",
  "scope-quantifier",
  "stance",
  "timing",
  "half-true-relation",
]);
const allowedVerdicts = new Set(["PASS", "EXCLUDE", "DOMAIN_REVIEW"]);
const seenFrames = new Set<string>();
const seenContent = new Set<string>();
const seenCandidates = new Set<string>();

for (let index = 0; index < 157; index += 1) {
  const row = review.rows[index];
  const publicRow = publicFrame.rows[index];
  const privateRow = privateFrame.rows[index];
  const selectedRow = selected[index];
  assert.equal(row.sequence, index + 1);
  assert.equal(row.frameId, publicRow.frameId);
  assert.equal(row.frameId, privateRow.frameId);
  assert.equal(row.contentHash, publicRow.contentHash);
  assert.equal(row.contentHash, privateRow.contentHash);
  assert.equal(row.contentHash, selectedRow.contentHash);
  assert.equal(row.candidateId, privateRow.candidateId);
  assert.equal(row.candidateId, selectedRow.id);
  assert.equal(row.sourceRecordId, privateRow.sourceRecordId);
  assert.equal(row.sourceRecordId, selectedRow.sourceRecordId);
  assert.equal(row.documentKey, privateRow.documentKey);
  assert.equal(row.documentKey, selectedRow.document.documentKey);
  assert.equal(row.sourceId, privateRow.sourceId);
  assert.equal(row.sourceId, selectedRow.document.sourceId);
  assert.ok(selectedRow.text.trim().length > 0);
  assert.equal(seenFrames.has(row.frameId), false);
  assert.equal(seenContent.has(row.contentHash), false);
  assert.equal(seenCandidates.has(row.candidateId), false);
  seenFrames.add(row.frameId);
  seenContent.add(row.contentHash);
  seenCandidates.add(row.candidateId);

  assert.deepEqual(Object.keys(row.criteria).sort(), [...fixedCriterionOrder].sort());
  assert.deepEqual(
    Object.keys(row.criteria.c1AnswerTarget).sort(),
    ["answerDeterminacy", "targetCentrality"],
  );
  assert.ok(levels.has(row.criteria.c1AnswerTarget.answerDeterminacy));
  assert.ok(levels.has(row.criteria.c1AnswerTarget.targetCentrality));
  assert.ok(levels.has(row.criteria.c2PairedItems));
  assert.ok(levels.has(row.criteria.c3KillerSynthesis));
  assert.ok(levels.has(row.criteria.c4Distractors));
  assert.ok(surfaceLevels.has(row.criteria.c6SurfaceGiveawayRisk));
  assert.ok(factualLevels.has(row.criteria.c7FactualPremise));
  assert.ok(Array.isArray(row.criteria.c5MisconceptionAxes.axes));
  assert.equal(
    new Set(row.criteria.c5MisconceptionAxes.axes).size,
    row.criteria.c5MisconceptionAxes.axes.length,
  );
  assert.equal(
    row.criteria.c5MisconceptionAxes.count,
    row.criteria.c5MisconceptionAxes.axes.length,
  );
  for (const axis of row.criteria.c5MisconceptionAxes.axes) {
    assert.ok(allowedAxes.has(axis), axis);
  }
  assert.equal(
    row.criteria.c5MisconceptionAxes.rating,
    row.criteria.c5MisconceptionAxes.count >= 4 ? "PASS" : "FAIL",
  );
  assert.ok(allowedVerdicts.has(row.verdict));
  assert.ok(Array.isArray(row.reasonCodes) && row.reasonCodes.length > 0);
  assert.equal(new Set(row.reasonCodes).size, row.reasonCodes.length);
  assert.equal(typeof row.note, "string");
  assert.ok(row.note.length >= 20 && row.note.length <= 300);
  assert.equal(/[\r\n]/u.test(row.note), false);

  const designPass =
    row.criteria.c1AnswerTarget.answerDeterminacy === "HIGH" &&
    row.criteria.c1AnswerTarget.targetCentrality !== "LOW" &&
    row.criteria.c2PairedItems !== "LOW" &&
    row.criteria.c3KillerSynthesis !== "LOW" &&
    row.criteria.c4Distractors !== "LOW" &&
    row.criteria.c5MisconceptionAxes.rating === "PASS" &&
    row.criteria.c6SurfaceGiveawayRisk !== "HIGH";
  const expectedVerdict = !designPass
    ? "EXCLUDE"
    : row.criteria.c7FactualPremise === "NEEDS_DOMAIN_EVIDENCE"
      ? "DOMAIN_REVIEW"
      : "PASS";
  assert.equal(row.verdict, expectedVerdict);

  if (row.verdict === "PASS") {
    assert.ok(row.reasonCodes.includes("B_UNIQUE_CENTRAL_ANSWER"));
    assert.ok(row.reasonCodes.includes("B_PAIRED_ARMS_SAME_READING"));
    assert.ok(row.reasonCodes.includes("B_MULTI_CLUE_OPTION_HEADROOM"));
    assert.equal(
      row.reasonCodes.includes("B_FACTUAL_PREMISE_REQUIRES_DOMAIN_EVIDENCE"),
      false,
    );
  } else if (row.verdict === "DOMAIN_REVIEW") {
    assert.ok(row.reasonCodes.includes("B_FACTUAL_PREMISE_REQUIRES_DOMAIN_EVIDENCE"));
  } else {
    assert.ok(row.reasonCodes.includes("B_LOW_ANSWER_DETERMINACY"));
    assert.ok(row.reasonCodes.includes("B_PAIRED_ARM_COLLAPSE"));
    assert.ok(row.reasonCodes.includes("B_INSUFFICIENT_OPTION_HEADROOM"));
  }
}

const countBy = (values: string[]) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((value) => [value, values.filter((item) => item === value).length]),
  );
const aggregate = {
  verdicts: countBy(review.rows.map((row: any) => row.verdict)),
  c1AnswerDeterminacy: countBy(
    review.rows.map((row: any) => row.criteria.c1AnswerTarget.answerDeterminacy),
  ),
  c1TargetCentrality: countBy(
    review.rows.map((row: any) => row.criteria.c1AnswerTarget.targetCentrality),
  ),
  c2PairedItems: countBy(review.rows.map((row: any) => row.criteria.c2PairedItems)),
  c3KillerSynthesis: countBy(
    review.rows.map((row: any) => row.criteria.c3KillerSynthesis),
  ),
  c4Distractors: countBy(review.rows.map((row: any) => row.criteria.c4Distractors)),
  c5MisconceptionAxes: countBy(
    review.rows.map((row: any) => row.criteria.c5MisconceptionAxes.rating),
  ),
  c6SurfaceGiveawayRisk: countBy(
    review.rows.map((row: any) => row.criteria.c6SurfaceGiveawayRisk),
  ),
  c7FactualPremise: countBy(
    review.rows.map((row: any) => row.criteria.c7FactualPremise),
  ),
  reasonCodes: countBy(review.rows.flatMap((row: any) => row.reasonCodes)),
  campaignEligible: 0,
  rightsReviewed: false,
};
assert.deepEqual(review.aggregate, aggregate);

assert.equal(summary.schemaVersion, 1);
assert.equal(summary.reviewer, "B");
assert.equal(summary.status, "FROZEN_INDEPENDENT_FULL_CENSUS");
assert.equal(summary.method.frameRows, 157);
assert.equal(summary.method.reviewedRows, 157);
assert.equal(summary.method.rawPassageReadForEveryRow, true);
for (const forbiddenMethod of [
  "sampling",
  "delegation",
  "replacement",
  "topUp",
  "otherReviewerArtifactsRead",
]) {
  assert.equal(summary.method[forbiddenMethod], false, forbiddenMethod);
}
for (const zeroMethod of [
  "questionCandidatesGenerated",
  "modelApiCalls",
  "networkCalls",
  "databaseCalls",
]) {
  assert.equal(summary.method[zeroMethod], 0, zeroMethod);
}
assert.deepEqual(summary.verdictDistribution, {
  PASS: aggregate.verdicts.PASS,
  EXCLUDE: aggregate.verdicts.EXCLUDE,
  DOMAIN_REVIEW: aggregate.verdicts.DOMAIN_REVIEW,
});
assert.deepEqual(summary.criterionDistributions, {
  answerDeterminacy: aggregate.c1AnswerDeterminacy,
  targetCentrality: aggregate.c1TargetCentrality,
  pairedItems: aggregate.c2PairedItems,
  killerSynthesis: aggregate.c3KillerSynthesis,
  distractors: aggregate.c4Distractors,
  misconceptionAxes: aggregate.c5MisconceptionAxes,
  surfaceGiveawayRisk: aggregate.c6SurfaceGiveawayRisk,
  factualPremise: aggregate.c7FactualPremise,
});
assert.deepEqual(summary.reasonCodeDistribution, aggregate.reasonCodes);

const publicByFrame = new Map(publicFrame.rows.map((row: any) => [row.frameId, row]));
const crossTab = (field: string) =>
  Object.fromEntries(
    [...new Set<string>(publicFrame.rows.map((row: any) => String(row[field])))]
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((value) => [
        value,
        countBy(
          review.rows
            .filter((row: any) => String((publicByFrame.get(row.frameId) as any)[field]) === value)
            .map((row: any) => row.verdict),
        ),
      ]),
  );
assert.deepEqual(summary.verdictByDiscourse, crossTab("discourse"));
assert.deepEqual(summary.verdictByTopic, crossTab("topic"));
assert.deepEqual(summary.verdictByWordBand, crossTab("wordBand"));
assert.equal(summary.authorization.campaignApproval, "NONE");
assert.equal(summary.authorization.campaignEligible, 0);
assert.equal(summary.authorization.rightsReview, "SEPARATE_NOT_PERFORMED");
assert.equal(summary.authorization.reconciliationPerformed, false);
assert.deepEqual(summary.privacy, {
  containsPassageText: false,
  containsFrameIdentifiers: false,
  containsPassageContentHashes: false,
  containsPrivateIdentifiers: false,
  containsCandidateSpans: false,
  containsRowLevelDecisions: false,
});

const publicDisclosure = `${summaryRaw}\n${auditRaw}`;
assert.equal(/[a-f0-9]{64}/u.test(publicDisclosure), false, "64-hex value in public review");
for (const row of review.rows) {
  for (const value of [
    row.frameId,
    row.contentHash,
    row.candidateId,
    row.sourceRecordId,
    row.documentKey,
    row.sourceId,
    row.note,
  ]) {
    if (typeof value === "string" && value.length >= 8) {
      assert.equal(publicDisclosure.includes(value), false, `private disclosure: ${value}`);
    }
  }
}
for (const selectedRow of selected) {
  assert.equal(publicDisclosure.includes(selectedRow.text), false, "full passage disclosure");
  const words = selectedRow.text.replace(/\s+/gu, " ").trim().split(" ");
  for (let index = 0; index + 12 <= words.length; index += 1) {
    const window = words.slice(index, index + 12).join(" ");
    assert.equal(publicDisclosure.includes(window), false, "passage-span disclosure");
  }
}
assert.equal(Object.hasOwn(summary, "rows"), false);

const manifestLines = read("REVIEWER-B-MANIFEST.sha256").trim().split(/\r?\n/u);
const expectedManifestPaths = [
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/REVIEW-PROTOCOL.md",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/private/reviewer-b.json",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/reviewer-b-summary.json",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/REVIEWER-B-AUDIT.md",
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/verify-reviewer-b.mts",
].sort((a, b) => a.localeCompare(b, "en"));
assert.equal(manifestLines.length, expectedManifestPaths.length);
const actualManifestPaths: string[] = [];
for (const line of manifestLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  actualManifestPaths.push(relativePath);
  const actual = sha256(readFileSync(path.join(repoRoot, relativePath)));
  assert.equal(actual, expected, `manifest mismatch: ${relativePath}`);
}
assert.deepEqual(actualManifestPaths.sort((a, b) => a.localeCompare(b, "en")), expectedManifestPaths);

process.stdout.write(
  `${JSON.stringify({
    verdict: "REVIEWER_B_FULL_CENSUS_FROZEN_NOT_AUTHORIZED",
    rows: review.rows.length,
    outcomes: summary.verdictDistribution,
    publicLeakChecks: "PASS",
    manifestEntries: manifestLines.length,
    campaignEligible: 0,
    rightsReview: "SEPARATE_NOT_PERFORMED",
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
    fullQuestionCandidatesGenerated: 0,
  }, null, 2)}\n`,
);
