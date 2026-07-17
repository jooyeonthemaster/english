import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as controllerModule from "../../harness/atlas-controller";
import * as buildFixtureModule from "./build-fixture";
import * as materializeModule from "./materialize";
import type { S1MaterializedCampaign } from "./materialize";

const controllerExports =
  (controllerModule as unknown as { default?: typeof controllerModule }).default ??
  controllerModule;
const buildFixtureExports =
  (buildFixtureModule as unknown as { default?: typeof buildFixtureModule }).default ??
  buildFixtureModule;
const materializeExports =
  (materializeModule as unknown as { default?: typeof materializeModule }).default ??
  materializeModule;
const { verifyAtlasControllerRegistry } = controllerExports;
const { buildFixtureArtifacts, collectS1LocalSourceClosure } = buildFixtureExports;
const {
  S1_ASSIGNMENT_COUNT,
  S1_EXACT_ROUTE_TAG,
  S1_OUTPUT_CAP_BY_TYPE,
  S1_PROVIDER_ROUTING,
  sha256,
  stableJson,
} = materializeExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(here, "fixture/controller-bundle-v1.json");
const publicPath = path.join(here, "controller-materialization-fixture-v1.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

const expected = buildFixtureArtifacts();
const bundle = readJson<S1MaterializedCampaign>(bundlePath);
const publicArtifact = readJson<typeof expected.publicArtifact>(publicPath);

assert.equal(stableJson(bundle), stableJson(expected.bundle));
assert.equal(stableJson(publicArtifact), stableJson(expected.publicArtifact));
assert.equal(bundle.status, "DRY_RUN_ONLY_EXECUTION_BLOCKED");
assert.equal(
  bundle.schemaVersion,
  "question-quality-s1-v6-durable-controller-bundle-v1.2",
);
assert.equal(bundle.designAuthorization.status, "BLOCKED_FIXTURE");
assert.match(bundle.durableBatchIdentitySha256, /^[a-f0-9]{64}$/);
assert.match(bundle.frozenPricingEnvelopeSha256, /^[a-f0-9]{64}$/);
assert.equal(
  publicArtifact.durableBatchIdentitySha256,
  bundle.durableBatchIdentitySha256,
);
assert.equal(
  publicArtifact.frozenPricingEnvelopeSha256,
  bundle.frozenPricingEnvelopeSha256,
);
assert.deepEqual(bundle.pricingRefreshPolicy, {
  rollingAttestationRequiredPerRuntime: true,
  frozenEnvelopeMayNeverIncrease: true,
  campaignAndBatchIdentityRemainStable: true,
  maximumAttestationAgeMs: 15 * 60 * 1_000,
});
assert.equal(bundle.assignments.length, S1_ASSIGNMENT_COUNT);
assert.equal(bundle.globalEnvelope.candidateOpportunityCap, 180);
assert.equal(bundle.globalEnvelope.physicalFetchCap, 180);
assert.equal(bundle.globalEnvelope.oneDurableBatchOnly, true);
assert.equal(bundle.globalEnvelope.queueTopUpAllowed, false);
assert.equal(bundle.batchReservation.maxCostUsd, bundle.globalEnvelope.maxCostUsd);
assert.equal(
  bundle.experimentRegistryPhase.maxCostUsd,
  bundle.globalEnvelope.maxCostUsd,
);
assert.deepEqual(bundle.transportPolicy.providerRouting, S1_PROVIDER_ROUTING);
assert.equal(bundle.transportPolicy.routerMetadataHeader, "X-OpenRouter-Metadata: enabled");
assert.equal(bundle.transportPolicy.selectedTierTagReturnedByMetadata, false);
assert.equal(bundle.priceProof.schemaVersion, 2);
assert.equal(bundle.priceProof.exactRouteTag, S1_EXACT_ROUTE_TAG);
assert.equal(bundle.priceProof.admissionBasis, "EXACT_TAG_RATE");
assert.equal(
  bundle.priceProof.reservationBasis,
  "ALL_ACTIVE_ENDPOINT_EMERGENCY_CEILING",
);
assert.equal(bundle.safety.externalNetworkCallsDuringMaterialization, 0);
assert.equal(bundle.safety.providerCallsDuringMaterialization, 0);
assert.equal(bundle.safety.apiCandidatesConsumedDuringMaterialization, 0);
assert.equal(
  publicArtifact.schemaVersion,
  "question-quality-s1-v6-durable-controller-fixture-public-v1.2",
);
assert.deepEqual(publicArtifact.counts.byType, {
  BLANK_INFERENCE: 84,
  GRAMMAR_ERROR: 96,
});
assert.deepEqual(publicArtifact.counts.byPlan, { PREMIUM: 84, STANDARD: 96 });
assert.deepEqual(publicArtifact.counts.byDifficulty, {
  INTERMEDIATE: 90,
  KILLER: 90,
});
assert.deepEqual(publicArtifact.counts.byProfile, {
  B0_CURRENT_CONTROL: 24,
  B1_TYPE_SCOPED_TAIL: 12,
  B2_POSITIVE_COMPACT: 24,
  B3_OPTION_INTENT_LEDGER: 24,
  G0_CURRENT_CONTROL: 24,
  G1_FINAL_CHECKLIST_ABLATION: 24,
  G2_POSITIVE_COMPACT: 24,
  G3_SITE_CERTIFICATE: 24,
});
assert.equal(publicArtifact.counts.distinctPassageTokens, 12);
assert.equal(publicArtifact.counts.b1Premium, 0);
assert.equal(new Set(Object.values(bundle.profileArtifactManifest.profiles)).size, 8);
assert.equal(bundle.profileArtifactManifest.aliasesAllowed, false);
assert.equal(new Set(bundle.assignments.map(
  (row) => row.registry.entries[0]!.provenance.corpus!.passageHash,
)).size, 12);

const registryHashes = new Set<string>();
let summedCost = 0;
for (const assignment of bundle.assignments) {
  const registry = verifyAtlasControllerRegistry(assignment.registry);
  assert.equal(registry.entries.length, 1);
  assert.equal(registry.assignmentContracts.length, 1);
  assert.equal(registry.transitions.length, 1);
  assert.equal(registry.entries[0]!.maxUsesPerAssignment, 1);
  assert.equal(registry.entries[0]!.pricing.proofSchemaVersion, 2);
  assert.equal(registry.entries[0]!.pricing.exactRouteTag, S1_EXACT_ROUTE_TAG);
  assert.equal(registry.entries[0]!.pricing.exactRouteProvider, "Google");
  assert.match(
    registry.entries[0]!.pricing.servedModelAllowlistHash ?? "",
    /^[a-f0-9]{64}$/,
  );
  assert.equal(registry.assignmentContracts[0]!.maxPhysicalCalls, 1);
  assert.equal(registry.assignmentContracts[0]!.maxCandidateOutputs, 1);
  assert.equal(registry.assignmentContracts[0]!.maxCostUsd, assignment.conservativeMaxCostUsd);
  assert.equal(registry.transitions[0]!.fromEntryId, null);
  assert.equal(registry.transitions[0]!.toEntryId, assignment.rootEntryId);
  assert.ok(assignment.operationId.startsWith(registry.operationIdPrefix));
  assert.equal(assignment.exactWire.routerMetadataHeaderRequired, true);
  assert.match(assignment.exactWire.requestEnvelopeSha256, /^[a-f0-9]{64}$/);
  assert.match(assignment.exactWire.promptProfileArtifactHash, /^[a-f0-9]{64}$/);
  assert.equal(
    registry.entries[0]!.wire.maxOutputTokens,
    S1_OUTPUT_CAP_BY_TYPE[assignment.questionType],
  );
  assert.equal(
    registry.entries[0]!.provenance.requestEnvelopeHash,
    assignment.exactWire.requestEnvelopeSha256,
  );
  assert.equal(
    registry.entries[0]!.provenance.promptProfileArtifactHash,
    assignment.exactWire.promptProfileArtifactHash,
  );
  assert.equal(
    assignment.exactWire.providerRoutingSha256,
    sha256(stableJson(S1_PROVIDER_ROUTING)),
  );
  assert.ok(!registryHashes.has(registry.registryHash));
  registryHashes.add(registry.registryHash);
  summedCost += assignment.conservativeMaxCostUsd;
}
assert.equal(registryHashes.size, 180);
assert.equal(
  Math.ceil(summedCost * 1e9) / 1e9,
  bundle.globalEnvelope.maxCostUsd,
);

const serializedArtifacts = `${readFileSync(bundlePath, "utf8")}\n${readFileSync(publicPath, "utf8")}`;
for (const forbidden of [
  "OPENROUTER_API_KEY=",
  "OPENROUTER_S1_API_KEY=",
  "Authorization: Bearer",
  "AIza",
] as const) {
  assert.equal(serializedArtifacts.includes(forbidden), false, `forbidden secret marker: ${forbidden}`);
}

const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/);
assert.ok(manifestLines.length >= 10);
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  assert.ok(match, `invalid manifest line: ${line}`);
  const [, expectedHash, relativePath] = match;
  assert.equal(
    sha256(readFileSync(path.join(here, relativePath!))),
    expectedHash,
    `manifest mismatch: ${relativePath}`,
  );
}

const boundarySource = readFileSync(
  path.resolve(here, "../../../../src/lib/atlas-research-fetch-boundary.ts"),
  "utf8",
);
assert.match(boundarySource, /headers\.set\("X-OpenRouter-Metadata", "enabled"\)/);
assert.match(boundarySource, /if \(!internal\)[\s\S]*return delegate\(input, init\)/);
const controllerSource = readFileSync(
  path.resolve(here, "../../harness/atlas-controller.ts"),
  "utf8",
);
assert.match(controllerSource, /schema-v2 endpoint tag is required/);
assert.match(controllerSource, /schema-v2 endpoint tags must be unique per model/);
assert.match(controllerSource, /chargeDimensions/);
assert.match(controllerSource, /allowedServedModels/);
assert.doesNotMatch(controllerSource, /requestedModel\.replace[\s\S]{0,200}\\d\{8\}/);
assert.match(controllerSource, /CONTROLLER_ROUTER_METADATA_INVALID/);
assert.match(controllerSource, /CONTROLLER_RESPONSE_CONTRACT_DRIFT/);
assert.match(controllerSource, /rollingPricingAttestationHash/);
assert.match(
  controllerSource,
  /preFetchLease\(request:[\s\S]{0,2500}this\.assertPricingProofCurrent\(entry\)/,
);
const runtimeSource = readFileSync(path.join(here, "runtime.ts"), "utf8");
assert.match(runtimeSource, /const SAFE_CHILD_ENV_KEYS = Object\.freeze/);
assert.doesNotMatch(runtimeSource, /const child[^=]*=\s*{\s*\.\.\.env/);
for (const forbiddenChildEnv of ["HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMDATA"]) {
  assert.doesNotMatch(
    runtimeSource.match(/const SAFE_CHILD_ENV_KEYS[\s\S]*?as const\);/)?.[0] ?? "",
    new RegExp(`"${forbiddenChildEnv}"`),
  );
}
assert.match(runtimeSource, /reserveS1CampaignBatchInternal[\s\S]{0,900}Date\.now\(\)/);
assert.match(runtimeSource, /createS1AssignmentRuntimeInternal[\s\S]{0,1200}executionAuthority/);
assert.match(runtimeSource, /createS1OpenRouterQuestionParser/);
assert.doesNotMatch(
  runtimeSource,
  /ForTesting|createS1Test|TEST_MODE_ENV|runtime\.test-support/,
);
assert.match(runtimeSource, /PLACEHOLDER ONLY/);
assert.match(runtimeSource, /expiresAtMs/);
assert.match(runtimeSource, /durableBatchIdentitySha256/);
assert.match(runtimeSource, /rollingPricingAttestation/);
const testSupportSource = readFileSync(path.join(here, "runtime.test-support.ts"), "utf8");
assert.match(testSupportSource, /OFFLINE TEST SUPPORT ONLY/);
assert.match(testSupportSource, /OFFLINE_FAKE_TRANSPORT_TEMP_STORE_ONLY/);
assert.match(testSupportSource, /only a module-created OS-temp test store is accepted/);
assert.doesNotMatch(
  testSupportSource,
  /atlas-research-fetch-boundary|QuestionGenerationCallsiteAdapter|globalThis\.fetch|FetchDelegate/,
);
assert.equal(
  collectS1LocalSourceClosure().some((entry) => entry.endsWith("runtime.test-support.ts")),
  false,
  "production source closure imported offline test support",
);
const parserSource = readFileSync(path.join(here, "openrouter-question-parser.ts"), "utf8");
assert.match(parserSource, /choices\.length !== 1/);
assert.match(parserSource, /response_contract_drift_choices_cardinality_/);

process.stdout.write(`${JSON.stringify({
  verdict: "PASS_OFFLINE_FIXTURE_ONLY_EXECUTION_BLOCKED",
  assignments: bundle.assignments.length,
  uniqueRegistries: registryHashes.size,
  globalCandidateCap: bundle.globalEnvelope.candidateOpportunityCap,
  globalPhysicalFetchCap: bundle.globalEnvelope.physicalFetchCap,
  globalMaxCostUsd: bundle.globalEnvelope.maxCostUsd,
  tagBoundPricingSchema: bundle.priceProof.schemaVersion,
  exactRouteTag: bundle.priceProof.exactRouteTag,
  routerMetadataHeader: bundle.transportPolicy.routerMetadataHeader,
  exactMatrix: publicArtifact.counts,
  externalNetworkCalls: 0,
  providerCalls: 0,
  apiCandidatesConsumed: 0,
  campaignSemanticSha256: bundle.campaignSemanticSha256,
  durableBatchIdentitySha256: bundle.durableBatchIdentitySha256,
  publicArtifactSha256: sha256(readFileSync(publicPath)),
  manifestSha256: sha256(readFileSync(manifestPath)),
}, null, 2)}\n`);
