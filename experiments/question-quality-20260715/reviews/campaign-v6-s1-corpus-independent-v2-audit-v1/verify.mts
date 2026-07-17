import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { buildRepoOverlapCapture } from "./capture-repo-overlap.mjs";
import {
  MANIFEST_PATHS,
  fileSha256,
  here,
  loadAuditInputs,
  manifestBytes,
  paths,
  publicArtifactBytes,
  repoRoot,
  sha256,
  stableJson,
} from "./core.mjs";

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? []).map((token) =>
    token.replace(/^'+|'+$/gu, ""),
  );
}

function twelveTokenWindows(text: string): string[] {
  const tokens = words(text);
  const windows: string[] = [];
  for (let index = 0; index + 12 <= tokens.length; index += 1) {
    windows.push(tokens.slice(index, index + 12).join(" "));
  }
  return windows;
}

const manifestRaw = readFileSync(paths.manifest, "utf8");
const lines = manifestRaw.trim().split(/\r?\n/u);
assert.equal(lines.length, MANIFEST_PATHS.length);
assert.deepEqual(
  lines.map((line) => line.replace(/^[a-f0-9]{64}  /u, "")),
  [...MANIFEST_PATHS],
);
for (const line of lines) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert(match, `malformed manifest line: ${line}`);
  assert.equal(fileSha256(path.join(here, match[2])), match[1]);
}

for (const privatePath of [paths.manualAdjudication, paths.repoOverlapCapture]) {
  const relative = path.relative(repoRoot, privatePath).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "-q", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, `${relative} must be ignored`);
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, `${relative} must not be tracked`);
}

const publicRaw = readFileSync(paths.publicArtifact, "utf8");
const expectedPublic = publicArtifactBytes();
assert.equal(publicRaw, expectedPublic, "public audit is not reproducible");
assert.equal(manifestRaw, manifestBytes(expectedPublic), "manifest is not reproducible");
const artifact = JSON.parse(publicRaw) as Record<string, unknown>;
assert.equal(
  artifact.schemaVersion,
  "question-quality-s1-v6-corpus-independent-v2-audit-public-v1",
);
assert.equal(
  artifact.verdict,
  "PASS_INDEPENDENT_V2_CORPUS_AUDIT_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
);
const manual = artifact.manualReview as Record<string, unknown>;
assert.equal(manual.exactPassages, 12);
assert.equal(manual.sentences, 127);
assert.equal(manual.grammarBindingsReviewed, 30);
assert.equal(manual.grammarBindingsPassed, 30);
assert.equal(manual.blankRowsReviewed, 6);
assert.equal(manual.blankIntermediateViabilityPass, 6);
assert.equal(manual.blankKillerViabilityPass, 6);
assert.equal(manual.blankAnswerUniquenessPass, 6);
assert.equal(manual.blankPostTargetSemanticRestatementFailures, 0);
assert.deepEqual(manual.blankPositionCounts, { INTERNAL: 5, TERMINAL: 1 });
assert.equal(manual.internalContrastOrCounterexample, 3);
assert.equal(manual.internalAnaphoricOrCausalBridge, 1);
const originality = artifact.originalityAndLeakage as Record<string, unknown>;
assert.equal(originality.crossRowSharedFiveGrams, 0);
assert.equal(originality.localFixtureExactNormalizedDuplicates, 0);
assert.equal(originality.localFixtureSharedEightTokenHashes, 0);
assert.equal(originality.independentRepositoryHitFiles, 0);
assert.equal(originality.independentRepositoryHitFileRowPairs, 0);
assert.equal(originality.sourceAndRemediationPublicTwelveTokenLeakWindows, 0);
assert.equal(originality.auditPublicExactTextOrRowMembershipExposed, false);
const hermeticity = artifact.hermeticity as Record<string, unknown>;
const upstreamReproduction = hermeticity.upstreamReproduction as Array<
  Record<string, unknown>
>;
const legacyRemediationVerifier = upstreamReproduction.find(
  (row) => row.label === "remediation-legacy-overlap-verifier",
);
assert(legacyRemediationVerifier);
assert.equal(
  legacyRemediationVerifier.status,
  "SUPERSEDED_FOR_POST_DERIVATION_REPRODUCTION",
);
assert.equal(legacyRemediationVerifier.exitCode, null);
const tamper = artifact.tamperTests as Record<string, unknown>;
assert.equal(tamper.attempted, 10);
assert.equal(tamper.rejected, 10);
const safety = artifact.safety as Record<string, unknown>;
assert.deepEqual(safety, {
  externalNetworkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  databaseCalls: 0,
  secretReads: 0,
  apiCandidatesConsumed: 0,
  externalDispatchAuthorized: false,
});
const { publicArtifactSemanticSha256, ...publicCore } = artifact;
assert.equal(publicArtifactSemanticSha256, sha256(stableJson(publicCore)));

const inputs = loadAuditInputs();
const publicRelease = [publicRaw, readFileSync(path.join(here, "README.md"), "utf8"), manifestRaw]
  .join("\n")
  .toLowerCase();
for (const row of inputs.corpus.rows) {
  assert.equal(publicRelease.includes(row.publicId.toLowerCase()), false, "public audit leaks row ID");
  assert.equal(publicRelease.includes(row.passageText.toLowerCase()), false, "public audit leaks passage");
  assert.equal(publicRelease.includes(sha256(row.passageText)), false, "public audit leaks row hash");
  for (const window of twelveTokenWindows(row.passageText)) {
    assert.equal(publicRelease.includes(window), false, "public audit leaks a 12-token source window");
  }
}

let rescanSummary: null | {
  status: string;
  hitFiles: number;
  hitFileRowPairs: number;
  inventoryIdentityReproduced: boolean;
  currentInventoryCommitmentSha256: string;
} = null;
if (process.argv.includes("--rescan")) {
  const stored = JSON.parse(readFileSync(paths.repoOverlapCapture, "utf8")) as Record<string, unknown>;
  const rescanned = buildRepoOverlapCapture();
  assert.equal(rescanned.schemaVersion, stored.schemaVersion);
  assert.equal(rescanned.sourcePrivateArtifactSha256, stored.sourcePrivateArtifactSha256);
  assert.deepEqual(rescanned.method, stored.method, "repository scan method/policy drifted");
  assert.equal(rescanned.status, "PASS_ZERO_REPOSITORY_EIGHT_TOKEN_HITS");
  assert.equal(rescanned.counts.hitFiles, 0);
  assert.equal(rescanned.counts.hitFileRowPairs, 0);
  assert.deepEqual(rescanned.hits, []);
  const storedCounts = stored.counts as Record<string, number>;
  assert.equal(rescanned.counts.sourceRows, storedCounts.sourceRows);
  assert.equal(
    rescanned.counts.distinctTargetNgramHashes,
    storedCounts.distinctTargetNgramHashes,
  );
  const inventoryIdentityReproduced =
    rescanned.inventoryCommitmentSha256 === stored.inventoryCommitmentSha256 &&
    rescanned.counts.scannedTextFiles === storedCounts.scannedTextFiles &&
    rescanned.counts.scannedUtf8Bytes === storedCounts.scannedUtf8Bytes;
  if (process.argv.includes("--require-inventory-identity")) {
    assert(inventoryIdentityReproduced, "capture-time repository inventory has changed");
  }
  rescanSummary = {
    status: rescanned.status,
    hitFiles: rescanned.counts.hitFiles,
    hitFileRowPairs: rescanned.counts.hitFileRowPairs,
    inventoryIdentityReproduced,
    currentInventoryCommitmentSha256: rescanned.inventoryCommitmentSha256,
  };
}

process.stdout.write(`${JSON.stringify({
  verdict: artifact.verdict,
  exactPassagesReviewed: 12,
  grammarBindingsReviewed: 30,
  blankRowsReviewed: 6,
  tamperTestsRejected: 10,
  repoOverlapHits: 0,
  publicLeakWindows: 0,
  externalNetworkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  databaseCalls: 0,
  secretReads: 0,
  apiCandidatesConsumed: 0,
  rescan: rescanSummary,
  publicArtifactSha256: fileSha256(paths.publicArtifact),
  manifestSha256: fileSha256(paths.manifest),
}, null, 2)}\n`);
