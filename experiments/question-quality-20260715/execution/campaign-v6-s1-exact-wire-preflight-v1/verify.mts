import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import type { PrivateQueue } from "../../design/campaign-v6-s1/build.mjs";
import * as materializeModule from "../campaign-v6-s1-durable-controller-v1/materialize";
import type { S1ExactWireRow } from "../campaign-v6-s1-durable-controller-v1/materialize";
import {
  MANIFEST_FILES,
  compileCampaignV6S1ExactWirePreflight,
  fileSha256,
  here,
  paths,
  repoRoot,
  sha256,
  stableJson,
  type ExactWirePrivateRow,
} from "./compile-exact-wire-preflight.mjs";

const materializeExports =
  (materializeModule as unknown as { default?: typeof materializeModule }).default ??
  materializeModule;
const {
  S1_EXACT_ENDPOINT,
  S1_OUTPUT_CAP_BY_TYPE,
  S1_PROVIDER_ROUTING,
  S1_ROOT_STAGE,
} = materializeExports;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

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
  assert.equal(readFileSync(paths.manifest, "utf8").includes("exact-wire-preflight-v1.json"), true);
  assert.equal(readFileSync(paths.manifest, "utf8").includes("private/exact-wire"), false);
}

function assertPrivateArtifactIgnored(): void {
  const relative = path.relative(repoRoot, paths.privateArtifact).replaceAll("\\", "/");
  const ignored = spawnSync("git", ["check-ignore", "-q", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(ignored.status, 0, "private preflight must be gitignored");
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", relative], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(tracked.status, 0, "private preflight must not be tracked");
}

verifyManifest();
assertPrivateArtifactIgnored();

const privateRaw = readFileSync(paths.privateArtifact, "utf8");
const publicRaw = readFileSync(paths.publicArtifact, "utf8");
const privateArtifact = JSON.parse(privateRaw) as Record<string, unknown>;
const publicArtifact = JSON.parse(publicRaw) as Record<string, unknown>;
assert.equal(
  privateArtifact.schemaVersion,
  "question-quality-s1-v6-exact-wire-preflight-private-v1",
);
assert.equal(
  privateArtifact.status,
  "OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED",
);
assert.equal(
  publicArtifact.schemaVersion,
  "question-quality-s1-v6-exact-wire-preflight-public-v1",
);
assert.equal(
  publicArtifact.status,
  "OFFLINE_PRODUCTION_CORE_REPLAY_EXECUTION_BLOCKED",
);
const publicProfileEvidence = publicArtifact.profileEvidence as Record<string, unknown>;
assert.equal(publicProfileEvidence.historicalIntegrationAuditRole, "HISTORICAL_BASELINE_ONLY");
assert.equal(
  publicProfileEvidence.currentNegativeEvidenceAuditVerdict,
  "PASS_REMEDIATED_OFFLINE",
);
assert(/^[a-f0-9]{64}$/u.test(String(
  publicProfileEvidence.currentNegativeEvidenceClosureSha256,
)));
assert(/^[a-f0-9]{64}$/u.test(String(
  publicProfileEvidence.currentNegativeEvidenceResultsSha256,
)));
assert.equal(publicProfileEvidence.liveQualityImprovementClaimed, false);
const expectedClaimBoundary = {
  provenSurface: "OFFLINE_PRODUCTION_CORE_REQUEST_CONSTRUCTION_REPLAY",
  candidateTopology: "DIRECT_SINGLE_DISPATCH_SINGLE_CANDIDATE_MECHANISM_SCREEN",
  productionCoreWireRootReplayed: true,
  fullProductionTopologyParityClaimed: false,
  premiumGrammarLadderPolicyParityClaimed: false,
  productionRetryRepairFallbackPolicyParityClaimed: false,
  productionQualityParityClaimed: false,
  parityRequiresSeparateVersionedTopologyAudit: true,
};
assert.deepEqual(privateArtifact.claimBoundary, expectedClaimBoundary);
assert.deepEqual(publicArtifact.claimBoundary, expectedClaimBoundary);
assert.equal(
  String(publicArtifact.status).includes("PARITY"),
  false,
  "a core-wire replay status must not claim production policy parity",
);

const binding = privateArtifact.durableControllerUnpricedBinding as Record<string, unknown>;
assert.equal(
  binding.bindingSchemaVersion,
  "question-quality-s1-v6-unpriced-materializer-binding-v1",
);
assert.equal(
  binding.status,
  "BLOCKED_AWAITING_FRESH_SCHEMA_V2_PRICE_AND_AUTHORIZATION",
);
assert.equal(binding.schemaVersion, "question-quality-s1-v6-materializer-input-v1.2");
assert.equal(Object.hasOwn(binding, "pricing"), false, "unpriced binding must not fake pricing");
assert.equal(Object.hasOwn(binding, "preflightSemanticSha256"), false);
assert.equal(Object.hasOwn(binding, "preflightArtifactSha256"), false);
assert.deepEqual(binding.requiredAtMaterialization, [
  "preflightSemanticSha256",
  "preflightArtifactSha256",
  "pricing",
  "designAuthorization",
]);
assert.deepEqual(binding.requiredBeforeLiveExecution, [
  "dedicatedCredentialAttestation",
  "providerHardLimitAttestation",
  "providerPrivacyReview",
  "independentPreDispatchAudit",
]);
const designAuthorization = binding.designAuthorization as Record<string, unknown>;
assert.equal(designAuthorization.status, "BLOCKED_FIXTURE");
assert.equal(designAuthorization.authorizationRecordHash, null);
const profileArtifactManifest = binding.profileArtifactManifest as {
  schemaVersion: string;
  aliasesAllowed: boolean;
  profiles: Record<string, string>;
  manifestSha256: string;
};
assert.equal(
  profileArtifactManifest.schemaVersion,
  "question-quality-s1-v6-profile-artifact-manifest-v1",
);
assert.equal(profileArtifactManifest.aliasesAllowed, false);
assert.equal(Object.keys(profileArtifactManifest.profiles).length, 8);
assert.equal(new Set(Object.values(profileArtifactManifest.profiles)).size, 8);
const { manifestSha256: profileManifestHash, ...profileManifestMaterial } =
  profileArtifactManifest;
assert.equal(profileManifestHash, sha256(stableJson(profileManifestMaterial)));

const rows = binding.assignments as ExactWirePrivateRow[];
const durableRows: S1ExactWireRow[] = rows;
assert.equal(durableRows.length, 180);
assert.equal(new Set(rows.map((row) => row.assignmentId)).size, 180);
assert.equal(new Set(rows.map((row) => row.assignmentKey)).size, 180);
assert.equal(new Set(rows.map((row) => row.wireBodySha256)).size, 180);
assert.equal(new Set(rows.map((row) => row.requestEnvelopeSha256)).size, 180);
assert.equal(rows.reduce((sum, row) => sum + row.observedInterceptedFetches, 0), 180);
assert.equal(rows.reduce((sum, row) => sum + row.candidateOutputsPerCompletion, 0), 180);
assert.equal(rows.reduce((sum, row) => sum + row.maxOutputTokens, 0), 912_000);
assert.deepEqual(countBy(rows.map((row) => row.questionType)), {
  BLANK_INFERENCE: 84,
  GRAMMAR_ERROR: 96,
});
assert.deepEqual(countBy(rows.map((row) => row.plan)), {
  PREMIUM: 84,
  STANDARD: 96,
});
assert.deepEqual(countBy(rows.map((row) => row.difficulty)), {
  INTERMEDIATE: 90,
  KILLER: 90,
});
assert.deepEqual(countBy(rows.map((row) => row.profileId)), {
  B0_CURRENT_CONTROL: 24,
  B1_TYPE_SCOPED_TAIL: 12,
  B2_POSITIVE_COMPACT: 24,
  B3_OPTION_INTENT_LEDGER: 24,
  G0_CURRENT_CONTROL: 24,
  G1_FINAL_CHECKLIST_ABLATION: 24,
  G2_POSITIVE_COMPACT: 24,
  G3_SITE_CERTIFICATE: 24,
});

const queue = readJson<PrivateQueue>(paths.privateQueue);
const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
const assignmentById = new Map(queue.assignments.map((row) => [row.assignmentId, row]));
assert.equal(passageByToken.size, 12);
assert.equal(assignmentById.size, 180);
const profileArtifactHashes = new Map<string, string>();
const gateHashes = new Map<string, string>();
for (const [index, row] of rows.entries()) {
  const assignment = assignmentById.get(row.assignmentId);
  const passage = passageByToken.get(row.passageToken);
  assert(assignment);
  assert(passage);
  assert.equal(row.queueOrdinal, index + 1);
  assert.equal(row.assignmentKey, assignment.assignmentKey);
  assert.equal(row.orderRank, assignment.orderRank);
  assert.equal(row.questionType, assignment.questionType);
  assert.equal(row.profileId, assignment.profileId);
  assert.equal(row.plan, assignment.plan);
  assert.equal(row.difficulty, assignment.difficulty);
  assert.equal(row.modelId, assignment.modelId);
  assert.equal(row.endpoint, S1_EXACT_ENDPOINT);
  assert.equal(row.endpointSha256, sha256(S1_EXACT_ENDPOINT));
  assert.equal(row.responseFormatType, "json_schema");
  assert.equal(row.completionCount, 1);
  assert.equal(row.candidateOutputsPerCompletion, 1);
  assert.deepEqual(row.providerRouting, S1_PROVIDER_ROUTING);
  assert.equal(row.providerRoutingSha256, sha256(stableJson(S1_PROVIDER_ROUTING)));
  assert.deepEqual(row.reasoning, { enabled: false, effort: "none", exclude: true });
  assert.equal(row.rootStage, S1_ROOT_STAGE);
  assert.equal(row.maxOutputTokens, S1_OUTPUT_CAP_BY_TYPE[row.questionType]);
  assert.equal(row.observedInterceptedFetches, 1);
  for (const digest of [
    row.requestEnvelopeSha256,
    row.wireBodySha256,
    row.wirePromptSha256,
    row.wireSchemaSha256,
    row.promptProfileArtifactHash,
    row.gateArtifactHash,
    row.policyArtifactHash,
  ]) assert(/^[a-f0-9]{64}$/u.test(digest));
  assert(row.wireBodyUtf8Bytes > 0);
  assert.equal(row.rights.rightsRecordHash, passage.rights.rightsRecordHash);
  assert.equal(row.rights.passageUtf8Sha256, passage.passageUtf8Sha256);
  assert.equal(row.rights.authorship, "CAMPAIGN_ORIGINAL");
  assert.equal(row.rights.externalModelProcessingAuthorized, true);
  assert.equal(row.rights.piiReview, "NO_PII_FOUND");
  const { rightsRecordHash, ...rightsMaterial } = row.rights;
  assert.equal(rightsRecordHash, sha256(stableJson(rightsMaterial)));
  const priorProfile = profileArtifactHashes.get(row.profileId);
  if (priorProfile) assert.equal(row.promptProfileArtifactHash, priorProfile);
  profileArtifactHashes.set(row.profileId, row.promptProfileArtifactHash);
  const priorGate = gateHashes.get(row.questionType);
  if (priorGate) assert.equal(row.gateArtifactHash, priorGate);
  gateHashes.set(row.questionType, row.gateArtifactHash);
}
assert.equal(profileArtifactHashes.size, 8);
assert.deepEqual(
  Object.fromEntries(
    [...profileArtifactHashes.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  ),
  profileArtifactManifest.profiles,
);
assert.equal(gateHashes.size, 2);

const safety = privateArtifact.safety as Record<string, unknown>;
assert.deepEqual(safety, {
  externalNetworkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  databaseCalls: 0,
  realSecretReads: 0,
  apiCandidatesConsumed: 0,
  compiledAssignments: 180,
  locallyInterceptedFetches: 180,
  unexpectedFetchAttempts: 0,
  blockedNonFetchTransportAttempts: 0,
  liveExecutionAuthorized: false,
  corpusRightsPiiScopeAttached: true,
  routePrivacyRequestAttached: true,
  independentProviderPrivacyReviewAttached: false,
  pricingAttached: false,
  dedicatedCredentialAttached: false,
});
const isolation = privateArtifact.environmentIsolation as Record<string, unknown>;
assert.equal(isolation.inheritedSecretValuesRead, 0);
assert.equal(isolation.everyOtherInheritedEnvironmentNameDeletedWithoutReadingItsValue, true);
assert.equal(isolation.nonSecretDummyCredentialInstalled, true);
assert.equal(isolation.productionModulesImportedAfterIsolation, true);
assert.equal(isolation.failClosedTransportGuardInstalledBeforeProductionModuleImport, true);
assert.deepEqual(isolation.guardedTransports, [
  "globalThis.fetch",
  "node:http.request/get",
  "node:https.request/get",
  "node:net.connect/createConnection",
  "node:tls.connect",
]);

const semanticDry = privateArtifact.durableControllerSemanticDryValidation as Record<
  string,
  unknown
>;
assert.equal(semanticDry.performed, true);
assert.equal(semanticDry.syntheticFixturePricingOnly, true);
assert.equal(semanticDry.syntheticFixturePricingIsExecutionAuthority, false);
assert.equal(semanticDry.materializerStatus, "DRY_RUN_ONLY_EXECUTION_BLOCKED");
assert.equal(semanticDry.materializedAssignments, 180);
assert.equal(semanticDry.candidateOpportunityCap, 180);
assert.equal(semanticDry.physicalFetchCap, 180);
assert(Number(semanticDry.conservativeMaxCostUsd) <= 100);
assert.equal(semanticDry.externalNetworkCalls, 0);
assert.equal(semanticDry.providerCalls, 0);
assert.equal(semanticDry.apiCandidatesConsumed, 0);
assert(/^[a-f0-9]{64}$/u.test(String(semanticDry.durableBindingSourceClosureSha256)));
assert.equal(semanticDry.syntheticPricingSchemaVersion, 2);
assert.equal(semanticDry.profileArtifactManifestSha256, profileManifestHash);
assert.equal(semanticDry.uniqueProfileArtifactHashes, 8);
const syntheticPricingBindings = semanticDry.syntheticPricingBindings as Array<
  Record<string, unknown>
>;
assert.deepEqual(
  syntheticPricingBindings.map(({ modelId, canonicalSlug, exactRouteProvider }) => ({
    modelId,
    canonicalSlug,
    exactRouteProvider,
  })),
  [
    {
      modelId: "google/gemini-3.1-pro-preview",
      canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
      exactRouteProvider: "Google",
    },
    {
      modelId: "google/gemini-3.5-flash",
      canonicalSlug: "google/gemini-3.5-flash-20260519",
      exactRouteProvider: "Google",
    },
  ],
);
assert(
  syntheticPricingBindings.every((bindingRow) =>
    /^[a-f0-9]{64}$/u.test(String(bindingRow.servedModelAllowlistHash)),
  ),
);

const counts = publicArtifact.counts as Record<string, unknown>;
assert.equal(counts.assignments, 180);
assert.equal(counts.locallyInterceptedFetches, 180);
assert.equal(counts.externalNetworkCalls, 0);
assert.equal(counts.physicalFetchCap, 180);
assert.equal(counts.candidateOpportunityCap, 180);
assert.equal(counts.uniqueWireBodies, 180);
assert.equal(counts.uniqueRequestEnvelopes, 180);
assert.equal(counts.b1PremiumAssignments, 0);
const wire = publicArtifact.wire as Record<string, unknown>;
assert.equal(wire.totalBodyUtf8Bytes, rows.reduce((sum, row) => sum + row.wireBodyUtf8Bytes, 0));
assert(Number(wire.totalBodyUtf8Bytes) <= 9_000_000);
assert.equal(wire.totalBodyUtf8BytesDesignCeiling, 9_000_000);
assert.equal(wire.totalOutputTokens, 912_000);
for (const field of [
  "profileArtifactSetSha256",
  "profileArtifactManifestSha256",
  "schemaArtifactSetSha256",
  "gateArtifactSetSha256",
  "policyArtifactSetSha256",
  "rightsAndPiiRecordSetSha256",
]) assert(/^[a-f0-9]{64}$/u.test(String(wire[field])), `${field} must be a SHA-256`);
for (const field of [
  "strictJsonSchemaRows",
  "completionCountOneRows",
  "candidateOutputsOneRows",
  "currentModelRows",
  "currentProfileBoundRows",
  "currentDifficultyBoundRows",
  "schemaBoundRows",
  "tokenCapBoundRows",
  "exactRoutingRows",
  "reasoningOffRows",
  "rightsBoundRows",
]) assert.equal(wire[field], 180, `${field} must cover all rows`);
const cost = publicArtifact.costPlanningCheck as Record<string, unknown>;
assert.equal(cost.executionPricingAttached, false);
assert.equal(cost.staleV5FlatCapsUsed, false);
assert.equal(cost.illustrativeEmergencyRatesAreExecutionAuthority, false);
assert.equal(cost.designCeilingUsd, 100);
assert.equal(cost.withinDesignCeiling, true);
assert(Number(cost.illustrativeMaximumUsd) <= 100);
assert.deepEqual(cost.emergencyRatesUsdPer1M, {
  STANDARD: { input: 2.7, output: 16.2 },
  PREMIUM: { input: 7.2, output: 32.4 },
});
assert.deepEqual(cost.outputTokensByPlan, { STANDARD: 480_000, PREMIUM: 432_000 });
assert.equal(cost.serverTokenOverheadUpperBoundPerAssignment, 4_096);
assert.equal(cost.safetyMultiplier, 1.1);
const durableBinding = publicArtifact.durableControllerBinding as Record<string, unknown>;
assert.equal(durableBinding.structurallyTypeCheckedRows, 180);
assert.equal(
  durableBinding.semanticallyMaterializedRowsWithOfflineSyntheticPriceFixture,
  180,
);
assert.equal(durableBinding.semanticMaterializerStatus, "DRY_RUN_ONLY_EXECUTION_BLOCKED");
assert.equal(durableBinding.semanticValidationSyntheticPricingIsExecutionAuthority, false);
assert.equal(
  durableBinding.materializerInputSchemaVersion,
  "question-quality-s1-v6-materializer-input-v1.2",
);
assert.equal(durableBinding.profileArtifactManifestSha256, profileManifestHash);
assert.equal(durableBinding.profileArtifactAliasesAllowed, false);
assert.equal(durableBinding.profileArtifactCount, 8);
assert.equal(durableBinding.syntheticPricingSchemaVersion, 2);
assert.deepEqual(durableBinding.syntheticExactRouteProviders, ["Google"]);
assert.deepEqual(durableBinding.syntheticCanonicalSlugBindings, [
  {
    modelId: "google/gemini-3.1-pro-preview",
    canonicalSlug: "google/gemini-3.1-pro-preview-20260219",
  },
  {
    modelId: "google/gemini-3.5-flash",
    canonicalSlug: "google/gemini-3.5-flash-20260519",
  },
]);
assert(/^[a-f0-9]{64}$/u.test(String(
  durableBinding.syntheticServedModelAllowlistHashSetSha256,
)));
assert.equal(
  durableBinding.durableBindingSourceClosureSha256,
  semanticDry.durableBindingSourceClosureSha256,
);
assert.equal(
  durableBinding.semanticMaterializerConservativeMaxCostUsd,
  cost.illustrativeMaximumUsd,
);
assert.equal(durableBinding.pricingPlaceholderPresent, false);
assert.equal(durableBinding.designAuthorizationStatus, "BLOCKED_FIXTURE");
assert.equal(durableBinding.liveMaterializationAuthorized, false);

const privateCore = { ...privateArtifact };
delete privateCore.preflightSemanticSha256;
assert.equal(privateArtifact.preflightSemanticSha256, sha256(stableJson(privateCore)));
assert.equal(publicArtifact.preflightSemanticSha256, privateArtifact.preflightSemanticSha256);
assert.equal(publicArtifact.privatePreflightArtifactSha256, fileSha256(paths.privateArtifact));
assert.equal(publicArtifact.campaignPrivateQueueFileSha256, fileSha256(paths.privateQueue));

const publicRelease = [
  publicRaw,
  readFileSync(path.join(here, "README.md"), "utf8"),
  readFileSync(paths.manifest, "utf8"),
].join("\n");
for (const passage of queue.passages) {
  for (const secret of [
    passage.publicId,
    passage.passageToken,
    passage.passageContentExact,
    passage.passageUtf8Sha256,
    passage.rights.rightsRecordHash,
  ]) assert.equal(publicRelease.includes(secret), false, "public preflight leaked row membership");
}
for (const row of rows) {
  for (const secret of [
    row.assignmentId,
    row.assignmentKey,
    row.orderRank,
    row.wireBodySha256,
    row.requestEnvelopeSha256,
    row.wirePromptSha256,
    row.wireSchemaSha256,
  ]) assert.equal(publicRelease.includes(secret), false, "public preflight leaked exact row wire data");
}
for (const forbiddenField of [
  '"assignmentId"',
  '"assignmentKey"',
  '"passageToken"',
  '"wireBodySha256"',
  '"requestEnvelopeSha256"',
]) assert.equal(publicRaw.includes(forbiddenField), false);

const reproduced = await compileCampaignV6S1ExactWirePreflight();
assert.equal(reproduced.privateBytes, privateRaw, "private exact-wire preflight drifted");
assert.equal(reproduced.publicBytes, publicRaw, "public exact-wire preflight drifted");

process.stdout.write(`${JSON.stringify({
  verdict: "PASS_OFFLINE_V6_S1_EXACT_WIRE_EXECUTION_BLOCKED",
  assignments: rows.length,
  locallyInterceptedFetches: 180,
  uniqueWireBodies: 180,
  uniqueRequestEnvelopes: 180,
  currentModelProfileDifficultySchemaTokenRouteRows: 180,
  externalNetworkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  apiCandidatesConsumed: 0,
  totalBodyUtf8Bytes: wire.totalBodyUtf8Bytes,
  illustrativeMaximumUsd: cost.illustrativeMaximumUsd,
  preflightSemanticSha256: privateArtifact.preflightSemanticSha256,
  privateArtifactSha256: fileSha256(paths.privateArtifact),
  publicArtifactSha256: fileSha256(paths.publicArtifact),
  manifestSha256: fileSha256(paths.manifest),
}, null, 2)}\n`);
