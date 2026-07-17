import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as selectorV3Module from "../v3/selector-core-v3";
import type { V3PinnedSnapshot } from "../v3/types-v3";

const selectorV3 =
  (selectorV3Module as unknown as { default?: typeof selectorV3Module }).default ??
  selectorV3Module;
const { buildCorpusV3 } = selectorV3;
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(path.resolve(here, relativePath), "utf8"));
const fileSha256 = (absolutePath: string) =>
  createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
const contentHash = (text: string) => {
  const normalized = text
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n+ */gu, "\n")
    .replace(/\s+/gu, " ")
    .trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
};

const publicFrame = readJson("source-frame-public.json");
const privateMap = readJson("private/source-frame-private.json");
const review = readJson("private/reviewer-a.json");
const summary = readJson("reviewer-a-summary.json");
const audit = readFileSync(path.join(here, "REVIEWER-A-AUDIT.md"), "utf8");
const protocolPath = path.join(here, "REVIEW-PROTOCOL.md");
const snapshotPath = path.resolve(here, "../v3/private/input-snapshot.json");
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as V3PinnedSnapshot;
const strictFrame = readJson("../strict-blank-source-frame-v1/source-frame-public.json");

assert.equal(publicFrame.rows.length, 157);
assert.equal(privateMap.rows.length, 157);
assert.equal(review.rows.length, 157);
assert.equal(review.aggregate.reviewedRows, 157);
assert.equal(review.frameBindingHash, publicFrame.bindingHash);
assert.equal(privateMap.bindingHash, publicFrame.bindingHash);
assert.equal(summary.frameBindingHash, publicFrame.bindingHash);
assert.equal(review.reviewProtocolSha256, fileSha256(protocolPath));
assert.equal(summary.reviewProtocolSha256, fileSha256(protocolPath));
assert.equal(snapshot.snapshotHash, publicFrame.sourceSnapshotHash);
assert.equal(fileSha256(snapshotPath), publicFrame.sourceSnapshotFileSha256);

const selected = buildCorpusV3(snapshot).selected["focus-grammar-killer"].slice(0, 157);
assert.equal(selected.length, 157);
assert.deepEqual(
  selected.map((row) => row.contentHash),
  publicFrame.rows.map((row: { contentHash: string }) => row.contentHash),
);

const candidatesById = new Map(snapshot.candidates.map((row) => [row.id, row]));
const strictHashes = new Set(
  strictFrame.rows.map((row: { contentHash: string }) => row.contentHash),
);
const frameIds = new Set<string>();
for (let index = 0; index < 157; index += 1) {
  const publicRow = publicFrame.rows[index];
  const privateRow = privateMap.rows[index];
  const reviewRow = review.rows[index];
  assert.equal(privateRow.frameId, publicRow.frameId);
  assert.equal(reviewRow.frameId, publicRow.frameId);
  assert.equal(frameIds.has(publicRow.frameId), false);
  frameIds.add(publicRow.frameId);
  assert.equal(privateRow.contentHash, publicRow.contentHash);
  assert.equal(strictHashes.has(publicRow.contentHash), false);
  const candidate = candidatesById.get(privateRow.candidateId) as
    | { id: string; text: string }
    | undefined;
  assert.ok(candidate, `missing pinned-snapshot candidate at row ${index + 1}`);
  assert.equal(contentHash(candidate.text), publicRow.contentHash);
}

const criterionKeys = [
  "completeBoundaries",
  "textIntegrity",
  "contextCoherence",
  "centralBlankableUnit",
  "distributedEvidence",
  "targetFormEligibility",
  "historyDisjointness",
];
const criterionReasonPrefixes: Record<string, string> = {
  completeBoundaries: "A1_",
  textIntegrity: "A2_",
  contextCoherence: "A3_",
  centralBlankableUnit: "A4_",
  distributedEvidence: "A5_",
  targetFormEligibility: "A6_",
  historyDisjointness: "A7_",
};
const allowedVerdicts = new Set(["PASS", "EXCLUDE", "DOMAIN_REVIEW"]);
const knownReasonCodes = new Set(Object.keys(review.reasonCodeDefinitions));
for (const row of review.rows) {
  assert.deepEqual(Object.keys(row.criteria), criterionKeys);
  assert.deepEqual(Object.keys(row).sort(), [
    "criteria",
    "frameId",
    "privateNote",
    "reasonCodes",
    "verdict",
  ]);
  assert.ok(allowedVerdicts.has(row.verdict));
  for (const key of criterionKeys) assert.ok(["PASS", "FAIL"].includes(row.criteria[key]));
  assert.ok(Array.isArray(row.reasonCodes) && row.reasonCodes.length > 0);
  for (const code of row.reasonCodes) assert.ok(knownReasonCodes.has(code));
  assert.equal(typeof row.privateNote, "string");
  assert.ok(row.privateNote.length >= 20 && row.privateNote.length <= 240);
  assert.equal(/[\r\n]/u.test(row.privateNote), false);
  const failed = criterionKeys.filter((key) => row.criteria[key] === "FAIL");
  if (row.verdict === "PASS") {
    assert.equal(failed.length, 0);
    assert.deepEqual(row.reasonCodes, ["A0_ALL_CRITERIA_PASS"]);
  } else if (row.verdict === "EXCLUDE") {
    assert.ok(failed.length > 0);
    assert.equal(row.reasonCodes.includes("A0_ALL_CRITERIA_PASS"), false);
    for (const key of failed) {
      assert.ok(
        row.reasonCodes.some((code: string) => code.startsWith(criterionReasonPrefixes[key])),
        `missing reason family for ${key}`,
      );
    }
  } else {
    assert.ok(row.reasonCodes.some((code: string) => code.startsWith("DOMAIN_")));
  }
}

const verdictDistribution = {
  PASS: review.rows.filter((row: { verdict: string }) => row.verdict === "PASS").length,
  EXCLUDE: review.rows.filter((row: { verdict: string }) => row.verdict === "EXCLUDE").length,
  DOMAIN_REVIEW: review.rows.filter((row: { verdict: string }) => row.verdict === "DOMAIN_REVIEW")
    .length,
};
const criterionDistribution = Object.fromEntries(
  criterionKeys.map((key) => [
    key,
    {
      PASS: review.rows.filter((row: { criteria: Record<string, string> }) => row.criteria[key] === "PASS")
        .length,
      FAIL: review.rows.filter((row: { criteria: Record<string, string> }) => row.criteria[key] === "FAIL")
        .length,
    },
  ]),
);
const reasonCodeDistribution = Object.fromEntries(
  Object.keys(review.reasonCodeDefinitions)
    .map((code) => [
      code,
      review.rows.filter((row: { reasonCodes: string[] }) => row.reasonCodes.includes(code)).length,
    ])
    .filter(([, count]) => (count as number) > 0),
);
assert.deepEqual(verdictDistribution, { PASS: 134, EXCLUDE: 23, DOMAIN_REVIEW: 0 });
assert.deepEqual(review.aggregate.verdictDistribution, verdictDistribution);
assert.deepEqual(review.aggregate.criterionDistribution, criterionDistribution);
assert.deepEqual(review.aggregate.reasonCodeDistribution, reasonCodeDistribution);
assert.deepEqual(summary.verdictDistribution, verdictDistribution);
assert.deepEqual(summary.criterionDistribution, criterionDistribution);
assert.deepEqual(summary.reasonCodeDistribution, reasonCodeDistribution);

assert.equal(review.methodology.census, "FULL_157_OF_157_MANUAL_READ");
for (const key of ["sampling", "delegation", "replacement", "topUp"]) {
  assert.equal(review.methodology[key], false);
  assert.equal(summary.coverage[key], false);
}
assert.equal(review.methodology.otherReviewerArtifactsRead, 0);
assert.equal(summary.coverage.manuallyReadRows, 157);
assert.equal(summary.coverage.coverageRate, 1);
assert.equal(review.aggregate.campaignEligible, 0);
assert.equal(summary.authorization.campaignEligible, 0);
assert.equal(review.rights.reviewedByThisLens, false);
assert.equal(summary.authorization.rightsStatus, "SEPARATE_REVIEW_PENDING");
for (const value of Object.values(review.safety)) assert.equal(value, 0);
for (const value of Object.values(summary.safety)) assert.equal(value, 0);

const publicCombined = `${JSON.stringify(summary)}\n${audit}`;
assert.equal(Object.hasOwn(summary, "rows"), false);
assert.equal(publicCombined.includes("privateNote"), false);
for (let index = 0; index < 157; index += 1) {
  const publicRow = publicFrame.rows[index];
  const privateRow = privateMap.rows[index];
  const candidate = candidatesById.get(privateRow.candidateId) as { text: string };
  assert.equal(publicCombined.includes(publicRow.frameId), false, "public frame-ID leak");
  assert.equal(publicCombined.includes(publicRow.contentHash), false, "public content-hash leak");
  assert.equal(publicCombined.includes(candidate.text), false, "public passage leak");
  assert.equal(publicCombined.includes(review.rows[index].privateNote), false, "public note leak");
  for (const key of ["candidateId", "sourceRecordId", "documentKey", "sourceId"]) {
    if (typeof privateRow[key] === "string" && privateRow[key]) {
      assert.equal(publicCombined.includes(privateRow[key]), false, `public private-ID leak: ${key}`);
    }
  }
}
for (const [key, value] of Object.entries(summary.privacy)) {
  if (key.startsWith("contains")) assert.equal(value, false);
}
assert.match(audit, /134 `PASS`, 23 `EXCLUDE`, and 0 `DOMAIN_REVIEW`/u);
assert.match(audit, /Campaign-eligible rows remain 0/u);
assert.match(audit, /Rights\/licensing was not reviewed/u);

const manifest = readFileSync(path.join(here, "REVIEWER-A-MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
assert.equal(manifest.length, 9);
for (const line of manifest) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  const actual = fileSha256(path.join(repoRoot, relativePath));
  assert.equal(actual, expected, `hash mismatch: ${relativePath}`);
}

process.stdout.write(
  `${JSON.stringify({
    verdict: "REVIEWER_A_FROZEN_FULL_CENSUS_NOT_AUTHORIZED",
    reviewedRows: 157,
    verdictDistribution,
    campaignEligibleRows: 0,
    rightsReviewed: false,
    manifestEntries: manifest.length,
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
    secretAccesses: 0,
    fullQuestionCandidatesGenerated: 0,
  }, null, 2)}\n`,
);
