import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Verdict = "PASS" | "EXCLUDE" | "DOMAIN_REVIEW";

type ReviewRow = {
  recordType: "row";
  ordinal: number;
  verdict: Verdict;
  ratings: Record<string, boolean>;
  decoys: string[];
  answer: {
    source: string;
    mutation: string;
    dependency: string;
    alternative: string;
    explanation: string;
  };
  intermediate: string;
  killer: string;
  evidence: string;
};

type SourceRow = {
  frameId: string;
  contentHash: string;
  passageText: string;
  candidateId: string;
  sourceRecordId: string;
  documentKey: string;
  sourceDocumentId: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const privateReviewPath = path.join(here, "private/reviewer-b-review.json");
const sourceFramePath = path.join(here, "private/source-frame-private.json");
const publicPath = path.join(here, "reviewer-b-public.json");
const protocolPath = path.join(here, "REVIEW-PROTOCOL.md");
const verifierPath = path.join(here, "verify-reviewer-b.mts");
const manifestPath = path.join(here, "REVIEWER-B-MANIFEST.sha256");

const sha256Buffer = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex");
const sha256File = (filePath: string): string =>
  sha256Buffer(readFileSync(filePath));
const nonempty = (value: unknown, label: string, minimum = 1): void => {
  assert.equal(typeof value, "string", `${label}: expected string`);
  assert.ok((value as string).trim().length >= minimum, `${label}: too short`);
};

const binding = JSON.parse(readFileSync(sourceFramePath, "utf8")) as {
  bindingHash: string;
  rows: SourceRow[];
};
const publicRaw = readFileSync(publicPath, "utf8");
const publicArtifact = JSON.parse(publicRaw) as {
  status: string;
  reviewer: string;
  lens: string;
  bindingHash: string;
  protocolSha256: string;
  privateReviewArtifactSha256: string;
  aggregate: {
    boundRows: number;
    personallyInspectedRows: number;
    pass: number;
    exclude: number;
    domainReview: number;
    unresolved: number;
    campaignEligible: number;
  };
  audit: Record<string, unknown>;
  privacy: Record<string, unknown>;
  authorization: Record<string, unknown>;
};

const privateReviewRaw = readFileSync(privateReviewPath, "utf8");
const records = privateReviewRaw
  .trim()
  .split(/\r?\n/u)
  .map((line, index) => {
    try {
      return JSON.parse(line) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`invalid private review JSON at line ${index + 1}: ${String(error)}`);
    }
  });

assert.equal(binding.rows.length, 186);
assert.equal(records.length, 187);
const [header, ...rowRecords] = records;
assert.deepEqual(header, {
  recordType: "header",
  schemaVersion: 1,
  serialization: "NDJSON",
  status: "SEALED_REVIEWER_B_INDEPENDENT_SOURCE_REVIEW_NOT_CAMPAIGN_AUTHORIZATION",
  reviewer: "B",
  bindingHash: binding.bindingHash,
  protocolSha256: sha256File(protocolPath),
  expectedRows: 186,
  lens: "PAIRED_ITEM_KILLER_HEADROOM",
  confidentiality:
    "PRIVATE: contains row-level decisions, short source cues, candidate sites, mutations, and reasoning; never publish or add to git.",
});

const ratingKeys = [
  "authenticDecoys",
  "closedRule",
  "fourDecoys",
  "killerNonlocal",
  "pairedFeasible",
  "singleError",
  "variedDecoys",
].sort((a, b) => a.localeCompare(b, "en"));
const answerKeys = [
  "alternative",
  "dependency",
  "explanation",
  "mutation",
  "source",
].sort((a, b) => a.localeCompare(b, "en"));
const verdicts = new Set<Verdict>(["PASS", "EXCLUDE", "DOMAIN_REVIEW"]);
const rows = rowRecords as unknown as ReviewRow[];

for (const [index, row] of rows.entries()) {
  const label = `row ${index + 1}`;
  assert.equal(row.recordType, "row", `${label}: recordType`);
  assert.equal(row.ordinal, index + 1, `${label}: frozen-order ordinal`);
  assert.ok(verdicts.has(row.verdict), `${label}: verdict`);
  assert.deepEqual(
    Object.keys(row.ratings).sort((a, b) => a.localeCompare(b, "en")),
    ratingKeys,
    `${label}: fixed ratings`,
  );
  for (const ratingKey of ratingKeys) {
    assert.equal(typeof row.ratings[ratingKey], "boolean", `${label}: ${ratingKey}`);
  }

  const allRatingsPass = ratingKeys.every((key) => row.ratings[key] === true);
  assert.equal(
    row.verdict === "PASS",
    allRatingsPass,
    `${label}: PASS iff all seven ratings pass`,
  );

  assert.ok(Array.isArray(row.decoys), `${label}: decoys`);
  assert.ok(row.decoys.length >= 4, `${label}: at least four decoys`);
  const normalizedDecoys = row.decoys.map((decoy, decoyIndex) => {
    nonempty(decoy, `${label}: decoy ${decoyIndex + 1}`, 12);
    return decoy.trim();
  });
  assert.equal(
    new Set(normalizedDecoys).size,
    normalizedDecoys.length,
    `${label}: distinct decoys`,
  );

  assert.deepEqual(
    Object.keys(row.answer).sort((a, b) => a.localeCompare(b, "en")),
    answerKeys,
    `${label}: answer evidence fields`,
  );
  for (const answerKey of answerKeys) {
    nonempty(row.answer[answerKey as keyof ReviewRow["answer"]], `${label}: ${answerKey}`, 8);
  }
  nonempty(row.intermediate, `${label}: intermediate`, 20);
  nonempty(row.killer, `${label}: killer`, 20);
  nonempty(row.evidence, `${label}: evidence`, 40);
}

const count = (verdict: Verdict): number =>
  rows.filter((row) => row.verdict === verdict).length;
const counts = {
  pass: count("PASS"),
  exclude: count("EXCLUDE"),
  domainReview: count("DOMAIN_REVIEW"),
};
assert.equal(counts.pass + counts.exclude + counts.domainReview, 186);

assert.equal(
  publicArtifact.status,
  "SEALED_REVIEWER_B_SOURCE_REVIEW_NOT_CAMPAIGN_AUTHORIZATION",
);
assert.equal(publicArtifact.reviewer, "B");
assert.equal(publicArtifact.lens, "FOUR_DECOY_PAIRED_ITEM_KILLER_CLOSED_RULE_HEADROOM");
assert.equal(publicArtifact.bindingHash, binding.bindingHash);
assert.equal(publicArtifact.protocolSha256, sha256File(protocolPath));
assert.equal(publicArtifact.privateReviewArtifactSha256, sha256File(privateReviewPath));
assert.deepEqual(publicArtifact.aggregate, {
  boundRows: 186,
  personallyInspectedRows: 186,
  pass: counts.pass,
  exclude: counts.exclude,
  domainReview: counts.domainReview,
  unresolved: 0,
  campaignEligible: 0,
});

assert.deepEqual(publicArtifact.audit, {
  inspectionMode: "FULL_CENSUS_IN_FROZEN_QUEUE_ORDER",
  reviewerLens: "REVIEWER_B_ONLY",
  sampledRows: 0,
  dividedRows: 0,
  delegatedRows: 0,
  automatedSemanticClassificationRows: 0,
  replacementRows: 0,
  topUpRows: 0,
  modelApiCalls: 0,
  networkCalls: 0,
  databaseCalls: 0,
  secretFileReads: 0,
  fullQuestionsGenerated: 0,
  otherReviewerArtifactsRead: 0,
  otherReviewerOutcomesRead: 0,
  reconciliationPerformed: false,
});
assert.deepEqual(publicArtifact.privacy, {
  containsPassageText: false,
  containsRowIdentifier: false,
  containsContentHash: false,
  containsSourceIdentifier: false,
  containsRowLevelDecision: false,
  containsCandidateSite: false,
  containsMutation: false,
  containsRowNotes: false,
  privateRowsGitIgnored: true,
});
assert.deepEqual(publicArtifact.authorization, {
  generationAuthorized: false,
  campaignEligibleRows: 0,
  reconciliationRequired: true,
  rightsReviewRequired: true,
  historyExposureRefreshRequired: true,
  providerControlsRequired: true,
  sealedGenerationAssignmentRequired: true,
});

for (const forbiddenKey of [
  "passageText",
  "frameId",
  "contentHash",
  "candidateId",
  "sourceRecordId",
  "documentKey",
  "sourceDocumentId",
  "ordinal",
  "verdict",
  "decoys",
  "answer",
  "evidence",
  "intermediate",
  "killer",
]) {
  assert.equal(
    new RegExp(`"${forbiddenKey}"\\s*:`, "u").test(publicRaw),
    false,
    `public row-level key leak: ${forbiddenKey}`,
  );
}
for (const sourceRow of binding.rows) {
  assert.equal(publicRaw.includes(sourceRow.passageText), false, "public passage-text leak");
  for (const privateValue of [
    sourceRow.frameId,
    sourceRow.contentHash,
    sourceRow.candidateId,
    sourceRow.sourceRecordId,
    sourceRow.documentKey,
    sourceRow.sourceDocumentId,
  ]) {
    assert.equal(publicRaw.includes(privateValue), false, "public private-identifier leak");
  }
}

for (const ignoredPath of [sourceFramePath, privateReviewPath]) {
  const relativePath = path.relative(repoRoot, ignoredPath).split(path.sep).join("/");
  assert.equal(
    spawnSync("git", ["check-ignore", "--quiet", relativePath], {
      cwd: repoRoot,
      windowsHide: true,
    }).status,
    0,
    `private file is not git-ignored: ${relativePath}`,
  );
}

const expectedManifestPaths = [
  "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/private/reviewer-b-review.json",
  "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/reviewer-b-public.json",
  "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/verify-reviewer-b.mts",
];
const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
assert.equal(manifestLines.length, expectedManifestPaths.length);
const manifestHashes = new Map<string, string>();
for (const [index, line] of manifestLines.entries()) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line ${index + 1}`);
  const [, expectedHash, relativePath] = match;
  assert.equal(relativePath, expectedManifestPaths[index], `manifest path ${index + 1}`);
  assert.equal(
    sha256File(path.join(repoRoot, relativePath)),
    expectedHash,
    `manifest hash: ${relativePath}`,
  );
  manifestHashes.set(relativePath, expectedHash);
}

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: publicArtifact.status,
      reviewer: "B",
      bindingHash: binding.bindingHash,
      aggregate: publicArtifact.aggregate,
      privateReviewArtifactSha256: sha256File(privateReviewPath),
      publicArtifactSha256: sha256File(publicPath),
      verifierSha256: sha256File(verifierPath),
      manifestSha256: sha256File(manifestPath),
      privateReviewGitIgnored: true,
      manifestEntries: manifestLines.length,
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      fullQuestionsGenerated: 0,
      reconciliationPerformed: false,
    },
    null,
    2,
  )}\n`,
);
