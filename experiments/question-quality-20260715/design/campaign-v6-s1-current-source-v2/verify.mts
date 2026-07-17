import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  CONNECTIVITY_STATUS,
  DRIFT_PATHS,
  MANIFEST_FILES,
  PRIVATE_QUEUE_FILE_SHA256,
  PRIVATE_QUEUE_SEMANTIC_SHA256,
  STATUS,
  TYPE_BINDING_AUDIT_MANIFEST_SHA256,
  TYPE_BINDING_SUBJECT_MANIFEST_SHA256,
  assertExactResealBytes,
  buildCurrentSourceReseal,
  fileSha256,
  here,
  paths,
  repoRoot,
  sha256,
  stableJson,
} from "./build.mjs";

function verifyManifest(): void {
  const lines = readFileSync(paths.manifest, "utf8").trim().split(/\r?\n/u);
  assert.equal(lines.length, MANIFEST_FILES.length);
  assert.deepEqual(
    lines.map((line) => line.replace(/^[a-f0-9]{64}  /u, "")),
    [...MANIFEST_FILES],
  );
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `invalid manifest line: ${line}`);
    assert.equal(fileSha256(path.join(here, match[2])), match[1]);
  }
  assert.equal(readFileSync(paths.manifest, "utf8").includes("s1-queue-v6.json"), false);
}

function verifyPrivateIgnored(): void {
  const relative = path.relative(repoRoot, paths.privateQueue).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", relative], {
    cwd: repoRoot,
    windowsHide: true,
  });
  assert.equal(ignored.status, 0, "private queue must be gitignored");
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relative], {
    cwd: repoRoot,
    windowsHide: true,
  });
  assert.notEqual(tracked.status, 0, "private queue must not be tracked");
}

function verifyOfflineCodeBoundary(): void {
  const scripts = ["build.mts", "verify.mts", "hostile-tests.mts"];
  const combined = scripts.map((name) => readFileSync(path.join(here, name), "utf8")).join("\n");
  for (const forbidden of [
    new RegExp("\\b" + "fe" + "tch\\s*\\(", "u"),
    new RegExp("ht" + "tps?://", "u"),
    new RegExp(["OPEN", "ROUTER", "_API_KEY"].join(""), "u"),
    new RegExp(["GEM", "INI", "_API_KEY"].join(""), "u"),
    new RegExp("\\.e" + "nv(?:\\.|[/'\"])", "u"),
    new RegExp("budget" + "-ledger\\.json", "u"),
  ]) assert.equal(forbidden.test(combined), false, `offline boundary violation: ${forbidden}`);
}

function verifyTypeScriptInputs(): void {
  const tsconfigPath = path.join(here, "tsconfig.json");
  const localConfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as Record<string, any>;
  assert.equal(localConfig.extends, "../../../../tsconfig.json");
  assert.deepEqual(localConfig.compilerOptions, {
    noEmit: true,
    incremental: false,
    types: ["node"],
  });
  assert.deepEqual(localConfig.include, ["*.mts"]);
  assert.deepEqual(localConfig.exclude, []);

  const tscBin = path.join(repoRoot, "node_modules/typescript/bin/tsc");
  assert.equal(existsSync(tscBin), true, "local TypeScript compiler is missing");
  const shown = spawnSync(process.execPath, [tscBin, "-p", tsconfigPath, "--showConfig"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(shown.status, 0, `tsc --showConfig failed: ${shown.stderr}`);
  const resolved = JSON.parse(shown.stdout) as Record<string, any>;
  assert.deepEqual(resolved.exclude, []);
  assert.equal(resolved.compilerOptions.noEmit, true);
  assert.equal(resolved.compilerOptions.incremental, false);
  const files = (resolved.files as string[]).map((file) =>
    path.basename(file).toLowerCase()).sort();
  assert.deepEqual(files, ["build.mts", "hostile-tests.mts", "verify.mts"]);
  assert(files.length > 0, "TypeScript input set must never be empty");
}

verifyManifest();
verifyPrivateIgnored();
verifyOfflineCodeBoundary();
verifyTypeScriptInputs();
assert.equal(existsSync(path.join(here, "tsconfig.tsbuildinfo")), false);

const privateRaw = readFileSync(paths.privateQueue, "utf8");
const oldPrivateRaw = readFileSync(paths.oldPrivateQueue, "utf8");
const publicRaw = readFileSync(paths.publicArtifact, "utf8");
assert.equal(privateRaw, oldPrivateRaw, "new private queue is not byte-identical");
assert.equal(sha256(privateRaw), PRIVATE_QUEUE_FILE_SHA256);
const queue = JSON.parse(privateRaw) as Record<string, any>;
assert.equal(queue.privateQueueSemanticSha256, PRIVATE_QUEUE_SEMANTIC_SHA256);
const queueCore = { ...queue };
delete queueCore.privateQueueSemanticSha256;
assert.equal(sha256(stableJson(queueCore)), PRIVATE_QUEUE_SEMANTIC_SHA256);

assertExactResealBytes(publicRaw, privateRaw);
const rebuilt = buildCurrentSourceReseal();
const artifact = JSON.parse(publicRaw) as Record<string, any>;
assert.deepEqual(artifact, rebuilt.publicArtifact);
assert.equal(artifact.status, STATUS);
assert.equal(artifact.preparationOnly, true);
assert.equal(artifact.immutableQueuePreservation.privateQueueFileSha256, PRIVATE_QUEUE_FILE_SHA256);
assert.equal(
  artifact.immutableQueuePreservation.privateQueueSemanticSha256,
  PRIVATE_QUEUE_SEMANTIC_SHA256,
);
assert.equal(artifact.immutableQueuePreservation.byteIdenticalToSourceQueue, true);
assert.equal(artifact.immutableQueuePreservation.semanticIdenticalToSourceQueue, true);
assert.equal(artifact.immutableQueuePreservation.assignments, 180);
assert.equal(artifact.immutableQueuePreservation.passages, 12);
assert.equal(artifact.immutableQueuePreservation.reassignmentAllowed, false);
assert.equal(artifact.immutableQueuePreservation.replacementAllowed, false);
assert.equal(artifact.immutableQueuePreservation.topUpAllowed, false);

assert.deepEqual(artifact.exactExperimentContract.byType, {
  BLANK_INFERENCE: 84,
  GRAMMAR_ERROR: 96,
});
assert.deepEqual(artifact.exactExperimentContract.byPlan, { PREMIUM: 84, STANDARD: 96 });
assert.deepEqual(artifact.exactExperimentContract.byDifficulty, {
  INTERMEDIATE: 90,
  KILLER: 90,
});
assert.equal(artifact.exactExperimentContract.candidateOpportunityPerAssignment, 1);
assert.equal(artifact.exactExperimentContract.physicalFetchPerAssignment, 1);
assert.equal(artifact.exactExperimentContract.semanticQuestionPerAssignment, 1);
assert.equal(artifact.exactExperimentContract.outerAttemptPerAssignment, 1);
assert.equal(artifact.exactExperimentContract.sdkRetryPerAssignment, 0);
assert.deepEqual(artifact.exactExperimentContract.models, {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview",
});
assert.deepEqual(artifact.exactExperimentContract.providerRouting, {
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
});
assert.deepEqual(artifact.exactExperimentContract.reasoning, {
  enabled: false,
  effort: "none",
  exclude: true,
});

assert.equal(artifact.corpusRightsAndPii.unchangedFromImmutableQueue, true);
assert.equal(artifact.corpusRightsAndPii.rowLevelOriginalAuthorshipBound, true);
assert.equal(artifact.corpusRightsAndPii.rowLevelNoPiiObservedBound, true);
assert.equal(artifact.corpusRightsAndPii.rowLevelExternalModelProcessingScopeBound, true);
assert.equal(artifact.currentSourceClosure.membershipRows, 55);
assert.equal(artifact.currentSourceClosure.driftFromOldSeal.count, 7);
assert.deepEqual(artifact.currentSourceClosure.driftFromOldSeal.exactExpectedPaths, DRIFT_PATHS);
assert.deepEqual(
  artifact.currentSourceClosure.driftFromOldSeal.rows.map((row: Record<string, any>) => row.path),
  DRIFT_PATHS,
);
for (const row of artifact.currentSourceClosure.driftFromOldSeal.rows as Record<string, any>[]) {
  assert.equal(row.git.porcelainV1, `?? ${row.path}`);
  assert.equal(row.git.trackedInIndex, false);
  assert.equal(row.git.indexBlobOid, null);
  assert.equal(row.git.headBlobOid, null);
  assert.deepEqual(row.git.recentPathHistory, []);
  assert.equal(row.git.interpretation, "UNTRACKED_WHOLE_FILE_DIFF_AGAINST_ABSENT_HEAD_AND_INDEX");
}

assert.equal(
  artifact.productionTypeAuthority.subjectManifestSha256,
  TYPE_BINDING_SUBJECT_MANIFEST_SHA256,
);
assert.equal(
  artifact.productionTypeAuthority.independentAuditManifestSha256,
  TYPE_BINDING_AUDIT_MANIFEST_SHA256,
);
assert.equal(artifact.productionTypeAuthority.independentAuditVerdict, "PASS_NO_BLOCKERS");
assert.equal(artifact.connectivityAuthority.status, CONNECTIVITY_STATUS);
assert.equal(artifact.connectivityAuthority.version, 6);
assert.equal(artifact.connectivityAuthority.subjectManifestSha256, null);
assert.equal(artifact.connectivityAuthority.independentAuditManifestSha256, null);
assert.equal(artifact.connectivityAuthority.v5AcceptedAsAuthority, false);
assert.equal(artifact.connectivityAuthority.placeholderHashAccepted, false);
assert.equal(artifact.connectivityAuthority.executionBlocked, true);
assert.equal(artifact.authorization.status, "BLOCKED");
assert.equal(artifact.authorization.frozenForExecution, false);
assert.equal(artifact.authorization.generationAuthorized, false);
assert.equal(artifact.authorization.campaignEligibleAssignments, 0);
assert.equal(artifact.authorization.requiredNextEvidence, CONNECTIVITY_STATUS);
assert.equal(artifact.authorization.laterSeparateAuthorizationArtifactRequired, true);
assert.deepEqual(artifact.safety, {
  networkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  apiCalls: 0,
  databaseCalls: 0,
  secretReads: 0,
  budgetLedgerReads: 0,
  budgetLedgerWrites: 0,
  apiCandidatesConsumed: 0,
});
const publicRelease = [
  publicRaw,
  readFileSync(path.join(here, "README.md"), "utf8"),
  readFileSync(paths.manifest, "utf8"),
].join("\n");
for (const passage of queue.passages as Record<string, any>[]) {
  for (const secret of [
    passage.publicId,
    passage.passageToken,
    passage.passageContentExact,
    passage.passageUtf8Sha256,
    passage.fullPrivateRowCommitmentSha256,
    passage.rights.rightsRecordHash,
    passage.rights.sourceRightsEvidenceHash,
    passage.rights.rightsProvenanceCommitmentSha256,
  ]) assert.equal(publicRelease.includes(secret), false, "public release leaked private passage data");
}
for (const row of queue.assignments as Record<string, any>[]) {
  for (const secret of [row.assignmentId, row.assignmentKey, row.orderRank]) {
    assert.equal(publicRelease.includes(secret), false, "public release leaked assignment membership");
  }
}
for (const forbiddenField of [
  '"passageContentExact"',
  '"passageToken"',
  '"publicId"',
  '"assignmentId"',
  '"assignmentKey"',
  '"orderRank"',
  '"rightsRecordHash"',
]) assert.equal(publicRaw.includes(forbiddenField), false);
assert.equal(publicRaw.includes("connectivity-pilot-v5"), false);
assert.equal(publicRaw.includes('"subjectManifestSha256": "PENDING'), false);
assert.equal(publicRaw.includes('"independentAuditManifestSha256": "PENDING'), false);

process.stdout.write(`${JSON.stringify({
  verdict: "PASS_CURRENT_SOURCE_RESEAL_V2_PREPARED_EXECUTION_BLOCKED",
  privateQueueByteIdentical: true,
  assignments: 180,
  passages: 12,
  currentSourceRows: 55,
  expectedDriftRows: 7,
  productionTypeBindingV4Pinned: true,
  connectivity: CONNECTIVITY_STATUS,
  generationAuthorized: false,
  apiCandidatesConsumed: 0,
  manifestSha256: fileSha256(paths.manifest),
}, null, 2)}\n`);
