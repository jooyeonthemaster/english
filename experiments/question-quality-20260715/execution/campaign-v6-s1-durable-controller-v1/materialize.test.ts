import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { AtlasResearchLeaseRequest } from "@/lib/atlas-research-fetch-boundary";

import {
  deriveAtlasControllerPricingSnapshotProof,
  sealAtlasControllerRollingPricingAttestation,
  validateAtlasControllerSchemaV2RouterMetadata,
} from "../../harness/atlas-controller";
import { openTestBudgetStore, type BudgetStore } from "../../harness/ledger";
import { buildFixtureInput, collectS1LocalSourceClosure } from "./build-fixture";
import {
  S1_ASSIGNMENT_COUNT,
  S1_BLANK_PROFILES,
  S1_EXACT_ROUTE_TAG,
  S1_GRAMMAR_PROFILES,
  S1_OUTPUT_CAP_BY_TYPE,
  S1_PROVIDER_ROUTING,
  materializeS1Campaign,
  sha256,
  stableJson,
  type S1ExactWireRow,
  type S1MaterializedAssignment,
  type S1MaterializedCampaign,
  type S1MaterializationInput,
} from "./materialize";
import { createS1OpenRouterQuestionParser } from "./openrouter-question-parser";
import {
  authorizeS1OfflineTestExecution as authorizeS1ExecutionForTesting,
  createS1OfflineTestAssignmentController as createS1AssignmentRuntime,
  createS1OfflineTestCredentialEvidence,
  createS1OfflineTestStoreFixture,
  createS1OfflineTestTrustRoot,
  finalizeS1OfflineTestCampaign as finalizeS1Campaign,
  reopenS1OfflineTestStore,
  reserveS1OfflineTestCampaignBatch as reserveS1CampaignBatch,
  validateS1OfflineTestPermitAt,
  type S1OfflineTestPermit,
} from "./runtime.test-support";
import * as testSupport from "./runtime.test-support";
import * as productionRuntime from "./runtime";
import {
  authorizeS1Execution as authorizeS1ExecutionProduction,
  buildDedicatedOpenRouterChildEnv as buildDedicatedOpenRouterChildEnvProduction,
  createS1AssignmentRuntime as createS1AssignmentRuntimeProduction,
  reserveS1CampaignBatch as reserveS1CampaignBatchProduction,
  finalizeS1Campaign as finalizeS1CampaignProduction,
  type S1DedicatedCredentialCapability,
  type S1ExecutionPermit,
  type S1LiveAuthorizationRecord,
} from "./runtime";

const here = path.dirname(fileURLToPath(import.meta.url));
// This only unlocks the ledger's OS-temp constructor. Production runtime has
// no TEST export, and test support additionally requires its own WeakSet brand.
process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";
const signingKeys = generateKeyPairSync("ed25519");
const testPublicKeyPem = signingKeys.publicKey.export({
  type: "spki",
  format: "pem",
}).toString();
const testTrustRoot = createS1OfflineTestTrustRoot(testPublicKeyPem);
const permitStores = new WeakMap<object, BudgetStore>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotRecord(input: S1MaterializationInput): Record<string, unknown> {
  return input.pricing.snapshot as Record<string, unknown>;
}

function endpointRows(input: S1MaterializationInput, modelIndex = 0): Array<Record<string, unknown>> {
  const models = snapshotRecord(input).models as Array<Record<string, unknown>>;
  return models[modelIndex]!.endpointRates as Array<Record<string, unknown>>;
}

function resignSnapshot(input: S1MaterializationInput): void {
  const snapshot = snapshotRecord(input);
  const content = { ...snapshot };
  delete content.snapshotSha256;
  snapshot.snapshotSha256 = sha256(JSON.stringify(content));
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function authorizedCampaign(): S1MaterializedCampaign {
  const input = buildFixtureInput();
  input.designAuthorization = {
    status: "AUTHORIZED",
    authorizationRecordHash: sha256("fixture-design-authorization"),
  };
  return materializeS1Campaign(input);
}

function liveAuthorization(
  campaign: S1MaterializedCampaign,
  options: {
    windowOrdinal?: number;
    previousAuthorizationRecordSha256?: string | null;
    metadataFetchedAt?: string;
    metadataValidThrough?: string;
    priceFetchedAt?: string;
    priceValidThrough?: string;
    priceMultiplier?: number;
    usageUsd?: number;
  } = {},
): S1LiveAuthorizationRecord {
  const windowOrdinal = options.windowOrdinal ?? 1;
  const usageUsd = options.usageUsd ?? 0;
  const metadataFetchedAt =
    options.metadataFetchedAt ?? "2026-07-15T00:00:00.000Z";
  const record = {
    schemaVersion: "question-quality-s1-v6-live-authorization-v1.2",
    status: "AUTHORIZED",
    operatorKeyId: sha256(testPublicKeyPem),
    windowOrdinal,
    previousAuthorizationRecordSha256:
      options.previousAuthorizationRecordSha256 ?? null,
    campaignSemanticSha256: campaign.campaignSemanticSha256,
    designAuthorizationRecordHash:
      campaign.designAuthorization.authorizationRecordHash!,
    dedicatedCredential: {
      sourceEnvName: "OPENROUTER_S1_API_KEY",
      campaignLabel: campaign.campaignId,
      credentialPublicId: "openrouter-s1-test-key",
      metadataArtifactSha256: sha256("fixture-provider-key-metadata"),
      metadataFetchedAt,
      metadataValidThrough:
        options.metadataValidThrough ?? "2026-07-15T00:10:00.000Z",
      usageUsd,
      providerHardLimitUsd: campaign.globalEnvelope.maxCostUsd,
      providerRemainingUsd: campaign.globalEnvelope.maxCostUsd - usageUsd,
      byokEnabled: false,
      accountDataPolicyVerified: true,
      exactRouteZdrSupportVerified: true,
      secretOrSecretHashPersisted: false,
    },
    providerUsageReconciliation: {
      status: "RECONCILED_AFTER_BOUNDED_POLL",
      localActualCostUsd: usageUsd,
      localEffectiveCostUsd: usageUsd,
      pollStartedAt: metadataFetchedAt,
      pollCompletedAt: metadataFetchedAt,
      pollAttempts: 1,
      maximumPollDurationMs: 1_000,
    },
    rollingPricingAttestation: rollingPricingAttestation(campaign, {
      fetchedAt: options.priceFetchedAt ?? "2026-07-15T00:00:00.000Z",
      validThrough: options.priceValidThrough ?? "2026-07-15T00:10:00.000Z",
      multiplier: options.priceMultiplier ?? 1,
    }),
    independentAuditArtifactSha256: sha256("fixture-independent-audit"),
    operatorSignatureBase64: "",
    authorizationRecordSha256: "",
  } as S1LiveAuthorizationRecord;
  resignAuthorization(record);
  return record;
}

function rollingPricingAttestation(
  campaign: S1MaterializedCampaign,
  options: { fetchedAt: string; validThrough: string; multiplier: number },
) {
  const snapshot = clone(Object.values(campaign.pricingSnapshots)[0]) as Record<string, unknown>;
  snapshot.fetchedAt = options.fetchedAt;
  if (options.multiplier !== 1) {
    const models = snapshot.models as Array<Record<string, unknown>>;
    for (const model of models) {
      const endpoints = model.endpointRates as Array<Record<string, unknown>>;
      for (const endpoint of endpoints) {
        endpoint.promptUsdPerToken =
          (endpoint.promptUsdPerToken as number) * options.multiplier;
        endpoint.completionUsdPerToken =
          (endpoint.completionUsdPerToken as number) * options.multiplier;
        for (const override of endpoint.overrides as Array<Record<string, unknown>>) {
          override.promptUsdPerToken =
            (override.promptUsdPerToken as number) * options.multiplier;
          override.completionUsdPerToken =
            (override.completionUsdPerToken as number) * options.multiplier;
        }
      }
    }
  }
  const content = { ...snapshot };
  delete content.snapshotSha256;
  snapshot.snapshotSha256 = sha256(JSON.stringify(content));
  return sealAtlasControllerRollingPricingAttestation({
    priceSnapshotId: `rolling-${sha256(stableJson(options)).slice(0, 20)}`,
    snapshot,
    validThrough: options.validThrough,
  });
}

function resignAuthorization(record: S1LiveAuthorizationRecord): void {
  const signedMaterial = { ...record } as Record<string, unknown>;
  delete signedMaterial.authorizationRecordSha256;
  delete signedMaterial.operatorSignatureBase64;
  record.operatorSignatureBase64 = sign(
    null,
    Buffer.from(stableJson(signedMaterial), "utf8"),
    signingKeys.privateKey,
  ).toString("base64");
  record.authorizationRecordSha256 = sha256(stableJson({
    signedMaterial,
    operatorSignatureBase64: record.operatorSignatureBase64,
  }));
}

function openCampaignTestStore(campaign: S1MaterializedCampaign): BudgetStore {
  return createS1OfflineTestStoreFixture(campaign, "s1-v6-auth-store-").store;
}

function authorizeS1Execution(input: {
  campaign: S1MaterializedCampaign;
  authorization: S1LiveAuthorizationRecord;
  env: Record<string, string | undefined>;
  store?: BudgetStore;
  now?: number;
}) {
  const metadata = input.authorization.dedicatedCredential;
  const capability = createS1OfflineTestCredentialEvidence({
    credentialPublicId: metadata.credentialPublicId,
    metadataArtifactSha256: metadata.metadataArtifactSha256,
    metadataFetchedAt: metadata.metadataFetchedAt,
    metadataValidThrough: metadata.metadataValidThrough,
    usageUsd: metadata.usageUsd,
    providerHardLimitUsd: metadata.providerHardLimitUsd,
    providerRemainingUsd: metadata.providerRemainingUsd,
  });
  const store = input.store ?? openCampaignTestStore(input.campaign);
  const permit = authorizeS1ExecutionForTesting({
    campaign: input.campaign,
    authorization: input.authorization,
    credential: capability,
    store,
    trustRoot: testTrustRoot,
    now: input.now,
  });
  permitStores.set(permit as object, store);
  return permit;
}

function validateS1ExecutionPermitAt(
  campaign: S1MaterializedCampaign,
  permit: S1OfflineTestPermit,
  now: number,
): void {
  const store = permitStores.get(permit as object);
  assert(store, "offline permit must retain its branded temp store");
  validateS1OfflineTestPermitAt(campaign, permit, store, now);
}

function replaceRowCell(
  target: S1ExactWireRow,
  source: S1ExactWireRow,
): void {
  target.questionType = source.questionType;
  target.profileId = source.profileId;
  target.plan = source.plan;
  target.difficulty = source.difficulty;
  target.modelId = source.modelId;
  target.maxOutputTokens = source.maxOutputTokens;
  target.promptProfileArtifactHash = source.promptProfileArtifactHash;
  target.wireSchemaSha256 = source.wireSchemaSha256;
}

function exactLeaseRequest(
  assignment: S1MaterializedAssignment,
  physicalOrdinal = 1,
): AtlasResearchLeaseRequest {
  const entry = assignment.registry.entries[0]!;
  return {
    operationId: assignment.operationId,
    physicalCallId: `${assignment.operationId}:http:${physicalOrdinal}`,
    physicalOrdinal,
    purpose: "candidate",
    parentPhysicalCallId: null,
    derivationIntent: null,
    candidateOutputs: 1,
    provenance: entry.provenance,
    request: {
      method: "POST",
      endpointOrigin: "https://openrouter.ai",
      endpointPath: "/api/v1/chat/completions",
      endpointHash: entry.wire.endpointHash,
      wireBodyHash: entry.wire.wireBodyHash!,
      requestBodyUtf8Bytes: entry.wire.maxRequestBodyUtf8Bytes,
      canonicalRequestHash: sha256(`canonical:${assignment.assignmentId}`),
      wirePromptHash: entry.wire.wirePromptHash!,
      wireSchemaHash: entry.wire.wireSchemaHash,
      model: assignment.modelId,
      completionCount: 1,
      stream: false,
      outputShape: "json-schema-object",
      structurallyFixedOutputsPerCompletion: 1,
      maxTokens: null,
      maxCompletionTokens: null,
      maxOutputTokens: entry.wire.maxOutputTokens,
    },
  };
}

test("materializer emits 180 independent one-call registries under one global batch", () => {
  const bundle = materializeS1Campaign(buildFixtureInput());
  assert.equal(bundle.assignments.length, S1_ASSIGNMENT_COUNT);
  assert.equal(new Set(bundle.assignments.map((row) => row.registry.registryHash)).size, 180);
  assert.equal(new Set(bundle.assignments.map((row) => row.operationId)).size, 180);
  assert.deepEqual(bundle.transportPolicy.providerRouting, S1_PROVIDER_ROUTING);
  assert.equal(bundle.transportPolicy.routerMetadataHeader, "X-OpenRouter-Metadata: enabled");
  assert.equal(bundle.globalEnvelope.candidateOpportunityCap, 180);
  assert.equal(bundle.globalEnvelope.physicalFetchCap, 180);
  assert.equal(bundle.batchReservation.maxCostUsd, bundle.globalEnvelope.maxCostUsd);
  assert.equal(bundle.experimentRegistryPhase.maxCostUsd, bundle.globalEnvelope.maxCostUsd);
  assert.deepEqual(countBy(bundle.assignments.map((row) => row.questionType)), {
    BLANK_INFERENCE: 84,
    GRAMMAR_ERROR: 96,
  });
  assert.deepEqual(countBy(bundle.assignments.map((row) => row.plan)), {
    PREMIUM: 84,
    STANDARD: 96,
  });
  assert.deepEqual(countBy(bundle.assignments.map((row) => row.difficulty)), {
    INTERMEDIATE: 90,
    KILLER: 90,
  });
  assert.deepEqual(countBy(bundle.assignments.map((row) => row.profileId)), {
    B0_CURRENT_CONTROL: 24,
    B1_TYPE_SCOPED_TAIL: 12,
    B2_POSITIVE_COMPACT: 24,
    B3_OPTION_INTENT_LEDGER: 24,
    G0_CURRENT_CONTROL: 24,
    G1_FINAL_CHECKLIST_ABLATION: 24,
    G2_POSITIVE_COMPACT: 24,
    G3_SITE_CERTIFICATE: 24,
  });
  assert.equal(
    new Set(bundle.assignments.map(
      (row) => row.registry.entries[0]!.provenance.corpus!.rowId,
    )).size,
    12,
  );
  assert.equal(
    bundle.assignments.some(
      (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
    ),
    false,
  );
  assert.equal(
    bundle.globalEnvelope.maxCostUsd,
    Math.ceil(bundle.assignments.reduce(
      (sum, row) => sum + row.conservativeMaxCostUsd,
      0,
    ) * 1e9) / 1e9,
  );
  for (const assignment of bundle.assignments) {
    assert.equal(assignment.registry.entries.length, 1);
    assert.equal(assignment.registry.entries[0]!.maxUsesPerAssignment, 1);
    assert.equal(assignment.registry.entries[0]!.pricing.proofSchemaVersion, 2);
    assert.equal(
      assignment.registry.entries[0]!.pricing.exactRouteTag,
      S1_EXACT_ROUTE_TAG,
    );
    assert.equal(assignment.registry.assignmentContracts.length, 1);
    assert.equal(assignment.registry.assignmentContracts[0]!.maxPhysicalCalls, 1);
    assert.equal(assignment.registry.assignmentContracts[0]!.maxCandidateOutputs, 1);
    assert.equal(assignment.registry.transitions.length, 1);
    assert.equal(assignment.registry.transitions[0]!.fromEntryId, null);
    const entry = assignment.registry.entries[0]!;
    assert.equal(
      entry.wire.maxOutputTokens,
      S1_OUTPUT_CAP_BY_TYPE[assignment.questionType],
    );
    assert.equal(
      entry.provenance.requestEnvelopeHash,
      assignment.exactWire.requestEnvelopeSha256,
    );
    assert.equal(
      entry.provenance.promptProfileArtifactHash,
      assignment.exactWire.promptProfileArtifactHash,
    );
  }
  const flashPricing = bundle.assignments.find((row) => row.plan === "STANDARD")!
    .registry.entries[0]!.pricing;
  assert.equal(flashPricing.exactRouteInputUsdPer1M, 1.5);
  assert.equal(flashPricing.exactRouteOutputUsdPer1M, 9);
  assert.equal(flashPricing.emergencyInputUsdPer1M, 2.7);
  assert.equal(flashPricing.emergencyOutputUsdPer1M, 16.2);
  assert.equal(flashPricing.inputUsdPer1M, 2.7);
  assert.equal(flashPricing.outputUsdPer1M, 16.2);
});

test("runtime enums, profile compatibility, B1 plan, and output caps fail closed", () => {
  for (const [field, invalid, pattern] of [
    ["questionType", "SUMMARY", /unknown questionType/],
    ["plan", "FREE", /unknown plan/],
    ["difficulty", "EASY", /unknown difficulty/],
  ] as const) {
    const input = buildFixtureInput();
    (input.assignments[0] as unknown as Record<string, unknown>)[field] = invalid;
    assert.throws(() => materializeS1Campaign(input), pattern);
  }

  const incompatible = buildFixtureInput();
  incompatible.assignments[0]!.profileId = S1_BLANK_PROFILES[0];
  assert.throws(() => materializeS1Campaign(incompatible), /profile is incompatible/);

  const wrongCap = buildFixtureInput();
  wrongCap.assignments[0]!.maxOutputTokens = 4_000;
  assert.throws(() => materializeS1Campaign(wrongCap), /frozen GRAMMAR_ERROR cap 6000/);

  const b1Premium = buildFixtureInput();
  const b1 = b1Premium.assignments.find(
    (row) => row.profileId === "B1_TYPE_SCOPED_TAIL",
  )!;
  b1.plan = "PREMIUM";
  b1.modelId = "google/gemini-3.1-pro-preview";
  assert.throws(() => materializeS1Campaign(b1Premium), /B1 is frozen to STANDARD only/);
});

test("the exact 180-cell passage matrix rejects missing, duplicate, and cross-type cells", () => {
  const missingCell = buildFixtureInput();
  replaceRowCell(missingCell.assignments[1]!, missingCell.assignments[0]!);
  assert.throws(
    () => materializeS1Campaign(missingCell),
    /complete unique frozen profile\/plan\/difficulty cross/,
  );

  const duplicatePassage = buildFixtureInput();
  const source = duplicatePassage.assignments.find(
    (row) => row.passageToken === "original-grammar-05",
  )!;
  for (const row of duplicatePassage.assignments.filter(
    (candidate) => candidate.passageToken === "original-grammar-06",
  )) {
    row.passageToken = source.passageToken;
    row.rights = clone(source.rights);
  }
  assert.throws(
    () => materializeS1Campaign(duplicatePassage),
    /exactly six distinct grammar and six distinct blank passages/,
  );

  const crossType = buildFixtureInput();
  const blank = crossType.assignments.find(
    (row) => row.questionType === "BLANK_INFERENCE",
  )!;
  blank.passageToken = "original-grammar-01";
  assert.throws(
    () => materializeS1Campaign(crossType),
    /cross-type or inconsistent passage\/rights provenance/,
  );
});

test("passage and profile provenance is internally consistent and content-bound", () => {
  const rightsContent = buildFixtureInput();
  rightsContent.assignments[0]!.rights.passageUtf8Sha256 = sha256("tampered-passage");
  assert.throws(
    () => materializeS1Campaign(rightsContent),
    /rights record hash does not match its content/,
  );

  const inconsistentProfile = buildFixtureInput();
  inconsistentProfile.assignments[1]!.promptProfileArtifactHash = sha256("other-profile-artifact");
  assert.throws(
    () => materializeS1Campaign(inconsistentProfile),
    /inconsistent profile artifact hashes/,
  );

  assert.deepEqual([...S1_GRAMMAR_PROFILES], [
    "G0_CURRENT_CONTROL",
    "G1_FINAL_CHECKLIST_ABLATION",
    "G2_POSITIVE_COMPACT",
    "G3_SITE_CERTIFICATE",
  ]);

  const duplicateContent = buildFixtureInput();
  const sourceRights = clone(duplicateContent.assignments.find(
    (row) => row.passageToken === "original-grammar-05",
  )!.rights);
  for (const row of duplicateContent.assignments.filter(
    (candidate) => candidate.passageToken === "original-grammar-06",
  )) {
    row.rights = clone(sourceRights);
  }
  assert.throws(
    () => materializeS1Campaign(duplicateContent),
    /12 distinct passage hashes and 12 distinct rights hashes/,
  );

  const profileCollision = buildFixtureInput();
  profileCollision.profileArtifactManifest.profiles.B0_CURRENT_CONTROL =
    profileCollision.profileArtifactManifest.profiles.G0_CURRENT_CONTROL;
  const { manifestSha256, ...manifestMaterial } = profileCollision.profileArtifactManifest;
  void manifestSha256;
  profileCollision.profileArtifactManifest.manifestSha256 = sha256(stableJson(manifestMaterial));
  assert.throws(
    () => materializeS1Campaign(profileCollision),
    /distinct treatment profile IDs cannot share an artifact hash/,
  );
});

test("materializer canonical-clones and recursively freezes shallow-frozen inputs", () => {
  const input = buildFixtureInput();
  const callerProfiles = input.profileArtifactManifest.profiles;
  const callerSnapshot = input.pricing.snapshot as Record<string, unknown>;
  const callerModels = callerSnapshot.models as Array<Record<string, unknown>>;
  Object.freeze(input.profileArtifactManifest);
  Object.freeze(callerSnapshot);
  const campaign = materializeS1Campaign(input);
  assert.equal(Object.isFrozen(campaign.profileArtifactManifest.profiles), true);
  assert.equal(Object.isFrozen(campaign.pricingSnapshots), true);
  assert.equal(Object.isFrozen(Object.values(campaign.pricingSnapshots)[0]!), true);
  const sealedProfileHash = campaign.profileArtifactManifest.profiles.G0_CURRENT_CONTROL;
  const sealedCanonicalSlug = (
    (Object.values(campaign.pricingSnapshots)[0] as Record<string, unknown>)
      .models as Array<Record<string, unknown>>
  )[0]!.canonicalSlug;
  callerProfiles.G0_CURRENT_CONTROL = sha256("caller-mutation-after-materialization");
  callerModels[0]!.canonicalSlug = "attacker/model";
  assert.equal(campaign.profileArtifactManifest.profiles.G0_CURRENT_CONTROL, sealedProfileHash);
  assert.equal((
    (Object.values(campaign.pricingSnapshots)[0] as Record<string, unknown>)
      .models as Array<Record<string, unknown>>
  )[0]!.canonicalSlug, sealedCanonicalSlug);
  assert.throws(
    () => {
      (campaign.profileArtifactManifest.profiles as Record<string, string>)
        .G0_CURRENT_CONTROL = sha256("nested-mutation");
    },
    TypeError,
  );
});

test("generated source closure contains the transitive production assignment boundary", () => {
  const closure = collectS1LocalSourceClosure();
  for (const required of [
    "src/lib/question-generation-research-runtime.ts",
    "src/lib/atlas-production-assignment-fetch-boundary.ts",
    "src/lib/atlas-fetch-scope-coordinator.ts",
  ]) {
    assert.equal(closure.includes(required), true, `${required} missing from source closure`);
  }
  assert.equal(
    closure.some((entry) => entry.endsWith("runtime.test-support.ts")),
    false,
    "production source closure must not import offline test support",
  );
  assert.doesNotMatch(
    readFileSync(path.join(here, "runtime.ts"), "utf8"),
    /runtime\.test-support|ForTesting|createS1Test|TEST_MODE_ENV/,
  );
});

test("materializer is deterministic and binds the parser source artifact", () => {
  const first = materializeS1Campaign(buildFixtureInput());
  const second = materializeS1Campaign(buildFixtureInput());
  assert.equal(stableJson(first), stableJson(second));
  assert.equal(first.campaignSemanticSha256, second.campaignSemanticSha256);
  assert.equal(
    first.parser.parserArtifactHash,
    sha256(readFileSync(path.join(here, "openrouter-question-parser.ts"))),
  );
});

test("rights, route, count, and one-dispatch mutations fail closed", () => {
  const rights = buildFixtureInput();
  (rights.assignments[0]!.rights as { externalModelProcessingAuthorized: boolean })
    .externalModelProcessingAuthorized = false;
  assert.throws(
    () => materializeS1Campaign(rights),
    /rights record hash does not match|rights closure/,
  );

  const route = clone(buildFixtureInput());
  (route.assignments[0]!.providerRouting as unknown as { only: string[] }).only = [
    "google-vertex/global/flex",
  ];
  assert.throws(() => materializeS1Campaign(route), /provider routing/);

  const count = buildFixtureInput();
  count.assignments.pop();
  assert.throws(() => materializeS1Campaign(count), /exactly 180/);

  const dispatch = buildFixtureInput();
  (dispatch.assignments[0] as { completionCount: number }).completionCount = 2;
  assert.throws(() => materializeS1Campaign(dispatch), /one exact structured/);
});

test("schema-v2 price proof rejects endpoint tag omission and duplication", () => {
  const omitted = buildFixtureInput();
  delete endpointRows(omitted)[0]!.tag;
  resignSnapshot(omitted);
  assert.throws(() => materializeS1Campaign(omitted), /endpoint tag is required/);

  const duplicate = buildFixtureInput();
  endpointRows(duplicate)[1]!.tag = "google-vertex/global";
  resignSnapshot(duplicate);
  assert.throws(() => materializeS1Campaign(duplicate), /tags must be unique/);
});

test("schema-v2 pricing fails closed on malformed rates and unmodeled charge dimensions", () => {
  const mutations: Array<(input: S1MaterializationInput) => void> = [
    (input) => { endpointRows(input)[0]!.promptUsdPerToken = null; },
    (input) => { endpointRows(input)[0]!.completionUsdPerToken = "0.1"; },
    (input) => { endpointRows(input)[0]!.promptUsdPerToken = Number.NaN; },
    (input) => { delete endpointRows(input)[0]!.completionUsdPerToken; },
    (input) => {
      delete (snapshotRecord(input).chargeDimensions as Record<string, unknown>).webSearch;
    },
    (input) => {
      delete (snapshotRecord(input).models as Array<Record<string, unknown>>)[0]!.canonicalSlug;
    },
  ];
  for (const mutate of mutations) {
    const input = buildFixtureInput();
    mutate(input);
    resignSnapshot(input);
    input.pricing.expectedSnapshotSha256 = snapshotRecord(input).snapshotSha256 as string;
    assert.throws(
      () => materializeS1Campaign(input),
      /pricing|endpoint|charge|canonicalSlug|non-finite/i,
    );
  }

  const explicitInheritance = buildFixtureInput();
  const override = (
    endpointRows(explicitInheritance, 1)[0]!.overrides as Array<Record<string, unknown>>
  )[0]!;
  delete override.completionUsdPerToken;
  resignSnapshot(explicitInheritance);
  explicitInheritance.pricing.expectedSnapshotSha256 =
    snapshotRecord(explicitInheritance).snapshotSha256 as string;
  const campaign = materializeS1Campaign(explicitInheritance);
  assert.equal(campaign.assignments.length, 180);
});

test("tag swap changes the exact-route rate proof and violates the preregistered snapshot hash", () => {
  const original = buildFixtureInput();
  const originalProof = deriveAtlasControllerPricingSnapshotProof(
    original.pricing.priceSnapshotId,
    original.pricing.snapshot,
  );
  const swapped = clone(original);
  const rows = endpointRows(swapped);
  const globalTag = rows[0]!.tag;
  rows[0]!.tag = rows[1]!.tag;
  rows[1]!.tag = globalTag;
  resignSnapshot(swapped);
  const swappedProof = deriveAtlasControllerPricingSnapshotProof(
    swapped.pricing.priceSnapshotId,
    swapped.pricing.snapshot,
  );
  assert.notEqual(
    originalProof.models["google/gemini-3.5-flash"].exactRouteRateHash,
    swappedProof.models["google/gemini-3.5-flash"].exactRouteRateHash,
  );
  assert.throws(
    () => materializeS1Campaign(swapped),
    /externally preregistered hash/,
  );
});

test("price validity longer than 15 minutes is rejected", () => {
  const input = buildFixtureInput();
  input.pricing.validThrough = "2026-07-15T00:15:00.001Z";
  assert.throws(() => materializeS1Campaign(input), /no longer than 15 minutes/);
});

test("durable batch identity ignores price timestamps but binds the frozen rate envelope", () => {
  const baseline = materializeS1Campaign(buildFixtureInput());

  const refreshedTimestamp = buildFixtureInput();
  snapshotRecord(refreshedTimestamp).fetchedAt = "2026-07-15T01:00:00.000Z";
  refreshedTimestamp.pricing.validThrough = "2026-07-15T01:15:00.000Z";
  resignSnapshot(refreshedTimestamp);
  refreshedTimestamp.pricing.expectedSnapshotSha256 =
    snapshotRecord(refreshedTimestamp).snapshotSha256 as string;
  const refreshedBundle = materializeS1Campaign(refreshedTimestamp);
  assert.equal(
    refreshedBundle.durableBatchIdentitySha256,
    baseline.durableBatchIdentitySha256,
  );
  assert.equal(
    refreshedBundle.frozenPricingEnvelopeSha256,
    baseline.frozenPricingEnvelopeSha256,
  );
  assert.notEqual(
    refreshedBundle.campaignSemanticSha256,
    baseline.campaignSemanticSha256,
  );

  const raisedEnvelope = buildFixtureInput();
  const priority = endpointRows(raisedEnvelope)[2]!;
  priority.promptUsdPerToken = (priority.promptUsdPerToken as number) * 1.25;
  priority.completionUsdPerToken = (priority.completionUsdPerToken as number) * 1.25;
  resignSnapshot(raisedEnvelope);
  raisedEnvelope.pricing.expectedSnapshotSha256 =
    snapshotRecord(raisedEnvelope).snapshotSha256 as string;
  const raisedBundle = materializeS1Campaign(raisedEnvelope);
  assert.notEqual(
    raisedBundle.frozenPricingEnvelopeSha256,
    baseline.frozenPricingEnvelopeSha256,
  );
  assert.notEqual(
    raisedBundle.durableBatchIdentitySha256,
    baseline.durableBatchIdentitySha256,
  );
});

test("offline test support cannot emit credentials or a child execution environment", () => {
  const campaign = authorizedCampaign();
  const permit = authorizeS1Execution({
    campaign,
    authorization: liveAuthorization(campaign),
    env: { OPENROUTER_S1_API_KEY: "dedicated-fixture-secret" },
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  });
  assert.deepEqual(Object.keys(permit).sort(), [
    "authorizationRecordSha256",
    "campaignSemanticSha256",
    "credentialPublicId",
    "expiresAtMs",
    "mode",
    "previousAuthorizationRecordSha256",
    "providerHardLimitUsd",
    "providerRemainingUsd",
    "providerUsageUsd",
    "rollingPricingAttestation",
    "validFromMs",
    "windowOrdinal",
  ]);
  assert.equal(JSON.stringify(permit).includes("dedicated-fixture-secret"), false);
  const supportExports = Object.keys(testSupport);
  assert.equal(supportExports.some((name) => /childenv|authorizationheader|delegate|fetch/iu.test(name)), false);
});

test("live authorization is hash-bound, finite, canonical, and expires at the tighter proof", () => {
  const campaign = authorizedCampaign();
  const authorization = liveAuthorization(campaign);
  const permit = authorizeS1Execution({
    campaign,
    authorization,
    env: { OPENROUTER_S1_API_KEY: "fixture-secret-never-persisted" },
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  });
  assert.equal(permit.validFromMs, Date.parse("2026-07-15T00:00:00.000Z"));
  assert.equal(permit.expiresAtMs, Date.parse("2026-07-15T00:10:00.000Z"));
  validateS1ExecutionPermitAt(
    campaign,
    permit,
    Date.parse("2026-07-15T00:10:00.000Z"),
  );
  assert.throws(
    () => validateS1ExecutionPermitAt(
      campaign,
      permit,
      Date.parse("2026-07-15T00:10:00.001Z"),
    ),
    /currently valid offline test permit/,
  );
  assert.throws(
    () => authorizeS1Execution({
      campaign,
      authorization,
      env: { OPENROUTER_S1_API_KEY: "fixture-secret" },
      now: Number.NaN,
    }),
    /authorization clock must be finite/,
  );

  for (const field of ["providerHardLimitUsd", "providerRemainingUsd"] as const) {
    const nonFinite = liveAuthorization(campaign);
    nonFinite.dedicatedCredential[field] = Number.NaN;
    resignAuthorization(nonFinite);
    assert.throws(
      () => authorizeS1Execution({
        campaign,
        authorization: nonFinite,
        env: { OPENROUTER_S1_API_KEY: "fixture-secret" },
        now: Date.parse("2026-07-15T00:05:00.000Z"),
      }),
      new RegExp(`${field} must be finite`),
    );
  }
});

test("live authorization rejects malformed hashes, time spellings, and stale permits", () => {
  const campaign = authorizedCampaign();
  for (const mutate of [
    (record: S1LiveAuthorizationRecord) => {
      record.dedicatedCredential.metadataArtifactSha256 = "not-a-hash";
    },
    (record: S1LiveAuthorizationRecord) => {
      record.independentAuditArtifactSha256 = "A".repeat(64);
    },
  ]) {
    const record = liveAuthorization(campaign);
    mutate(record);
    resignAuthorization(record);
    assert.throws(
      () => authorizeS1Execution({
        campaign,
        authorization: record,
        env: { OPENROUTER_S1_API_KEY: "fixture-secret" },
        now: Date.parse("2026-07-15T00:05:00.000Z"),
      }),
      /must be a lowercase SHA-256/,
    );
  }

  const malformedTime = liveAuthorization(campaign);
  malformedTime.dedicatedCredential.metadataFetchedAt = "2026-07-15T00:00:00Z";
  resignAuthorization(malformedTime);
  assert.throws(
    () => authorizeS1Execution({
      campaign,
      authorization: malformedTime,
      env: { OPENROUTER_S1_API_KEY: "fixture-secret" },
      now: Date.parse("2026-07-15T00:05:00.000Z"),
    }),
    /metadataFetchedAt is not canonical UTC/,
  );
});

test("env toggles expose no production TEST seam and offline permits fail every production mutation", () => {
  const campaign = authorizedCampaign();
  const store = openCampaignTestStore(campaign);
  const authorization = liveAuthorization(campaign);
  const metadata = authorization.dedicatedCredential;
  const capability = createS1OfflineTestCredentialEvidence({
    credentialPublicId: metadata.credentialPublicId,
    metadataArtifactSha256: metadata.metadataArtifactSha256,
    metadataFetchedAt: metadata.metadataFetchedAt,
    metadataValidThrough: metadata.metadataValidThrough,
    usageUsd: metadata.usageUsd,
    providerHardLimitUsd: metadata.providerHardLimitUsd,
    providerRemainingUsd: metadata.providerRemainingUsd,
  });
  const previous = process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE;
  process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = "1";
  assert.deepEqual(
    Object.keys(productionRuntime).filter((name) => /test|offline/iu.test(name)),
    [],
  );
  assert.throws(() => authorizeS1ExecutionProduction({
    campaign,
    authorization,
    credential: capability as unknown as S1DedicatedCredentialCapability,
    store,
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  }), /trusted operator key/);
  const permit = authorizeS1Execution({
    campaign,
    authorization,
    env: { OPENROUTER_S1_API_KEY: "attacker-test-secret" },
    store,
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  });
  const forgedProductionPermit = permit as unknown as S1ExecutionPermit;
  assert.throws(
    () => buildDedicatedOpenRouterChildEnvProduction(forgedProductionPermit, {}),
    /permit class mismatch/,
  );
  assert.throws(
    () => reserveS1CampaignBatchProduction({ campaign, permit: forgedProductionPermit, store }),
    /currently valid live execution permit/,
  );
  assert.throws(
    () => createS1AssignmentRuntimeProduction({
      campaign,
      permit: forgedProductionPermit,
      store,
      assignmentId: campaign.assignments[0]!.assignmentId,
    }),
    /currently valid live execution permit/,
  );
  assert.throws(() => finalizeS1CampaignProduction({
    campaign,
    permit: forgedProductionPermit,
    store,
    terminalStatus: "ABORTED_INCOMPLETE",
  }), /currently valid live execution permit/);
  if (previous === undefined) delete process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE;
  else process.env.QUESTION_QUALITY_BUDGET_GUARD_TEST_MODE = previous;
  store.close();
});

test("offline test chain rejects unbranded stores and cannot invoke native fetch or a delegate", async () => {
  const campaign = authorizedCampaign();
  const authorization = liveAuthorization(campaign);
  const metadata = authorization.dedicatedCredential;
  const credential = createS1OfflineTestCredentialEvidence({
    credentialPublicId: metadata.credentialPublicId,
    metadataArtifactSha256: metadata.metadataArtifactSha256,
    metadataFetchedAt: metadata.metadataFetchedAt,
    metadataValidThrough: metadata.metadataValidThrough,
    usageUsd: metadata.usageUsd,
    providerHardLimitUsd: metadata.providerHardLimitUsd,
    providerRemainingUsd: metadata.providerRemainingUsd,
  });
  const unbrandedFixture = createS1OfflineTestStoreFixture(
    campaign,
    "s1-v6-hostile-unbranded-",
  );
  unbrandedFixture.store.close();
  const unbrandedTempStore = openTestBudgetStore(
    unbrandedFixture.storePath,
    unbrandedFixture.registryPath,
  );
  assert.throws(() => authorizeS1ExecutionForTesting({
    campaign,
    authorization,
    credential,
    store: unbrandedTempStore,
    trustRoot: testTrustRoot,
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  }), /only a module-created OS-temp test store is accepted/);
  unbrandedTempStore.close();

  for (const forbiddenPath of [
    path.resolve(here, "../../../../.question-quality-budget.sqlite"),
    path.resolve(here, "../campaign-v6-connectivity-pilot-v2/private/pilot.sqlite"),
  ]) {
    const forgedStore = {
      storePath: forbiddenPath,
      registryPath: `${forbiddenPath}.registry.json`,
    } as unknown as BudgetStore;
    assert.throws(() => authorizeS1ExecutionForTesting({
      campaign,
      authorization,
      credential,
      store: forgedStore,
      trustRoot: testTrustRoot,
      now: Date.parse("2026-07-15T00:05:00.000Z"),
    }), /only a module-created OS-temp test store is accepted/);
  }

  const fixture = createS1OfflineTestStoreFixture(campaign, "s1-v6-hostile-fetch-");
  const permit = authorizeS1Execution({
    campaign,
    authorization,
    env: { OPENROUTER_S1_API_KEY: "must-never-enter-test-support" },
    store: fixture.store,
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  });
  reserveS1CampaignBatch({
    campaign,
    permit,
    store: fixture.store,
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  });
  const originalFetch = globalThis.fetch;
  let nativeFetchCalls = 0;
  globalThis.fetch = (async () => {
    nativeFetchCalls += 1;
    throw new Error("HOSTILE_NATIVE_FETCH_MUST_NOT_RUN");
  }) as typeof fetch;
  try {
    const offline = createS1AssignmentRuntime({
      campaign,
      permit,
      store: fixture.store,
      assignmentId: campaign.assignments[0]!.assignmentId,
      now: () => Date.parse("2026-07-15T00:05:00.000Z"),
    });
    assert.equal(offline.transportMode, "OFFLINE_FAKE_ONLY_NO_DELEGATE");
    offline.controller.admitAssignment({
      operationId: offline.assignment.operationId,
      assignmentId: offline.assignment.assignmentId,
      contractId: offline.assignment.assignmentContractId,
    });
    const lease = exactLeaseRequest(offline.assignment);
    offline.controller.preFetchLease(lease);
    offline.controller.recoverAmbiguousCall({
      physicalCallId: lease.physicalCallId,
      disposition: "never_sent",
      reason: "hostile proof uses bookkeeping only; no transport exists",
    });
    await offline.controller.closeAssignment(offline.assignment.assignmentId);
  } finally {
    globalThis.fetch = originalFetch;
    fixture.store.close();
  }
  assert.equal(nativeFetchCalls, 0);
  const supportSource = readFileSync(path.join(here, "runtime.test-support.ts"), "utf8");
  assert.doesNotMatch(
    supportSource,
    /atlas-research-fetch-boundary|QuestionGenerationCallsiteAdapter|globalThis\.fetch|FetchDelegate/,
  );
  assert.equal(JSON.stringify(credential).includes("must-never-enter-test-support"), false);
});

test("authorization windows form one signed monotonic credential chain", () => {
  const campaign = authorizedCampaign();
  const store = openCampaignTestStore(campaign);
  const first = liveAuthorization(campaign);
  authorizeS1Execution({
    campaign,
    authorization: first,
    env: { OPENROUTER_S1_API_KEY: "chain-secret" },
    store,
    now: Date.parse("2026-07-15T00:05:00.000Z"),
  });
  const fork = liveAuthorization(campaign, {
    windowOrdinal: 2,
    previousAuthorizationRecordSha256: sha256("not-the-durable-head"),
    metadataFetchedAt: "2026-07-15T00:06:00.000Z",
    metadataValidThrough: "2026-07-15T00:15:00.000Z",
    priceFetchedAt: "2026-07-15T00:06:00.000Z",
    priceValidThrough: "2026-07-15T00:15:00.000Z",
  });
  assert.throws(
    () => authorizeS1Execution({
      campaign,
      authorization: fork,
      env: { OPENROUTER_S1_API_KEY: "chain-secret" },
      store,
      now: Date.parse("2026-07-15T00:07:00.000Z"),
    }),
    /Authorization must extend the unique credential\/usage chain monotonically/,
  );
  const mismatchedCapability = createS1OfflineTestCredentialEvidence({
    credentialPublicId: "different-public-id",
    metadataArtifactSha256: first.dedicatedCredential.metadataArtifactSha256,
    metadataFetchedAt: first.dedicatedCredential.metadataFetchedAt,
    metadataValidThrough: first.dedicatedCredential.metadataValidThrough,
    usageUsd: 0,
    providerHardLimitUsd: campaign.globalEnvelope.maxCostUsd,
    providerRemainingUsd: campaign.globalEnvelope.maxCostUsd,
  });
  assert.throws(
    () => authorizeS1ExecutionForTesting({
      campaign,
      authorization: first,
      credential: mismatchedCapability,
      store,
      trustRoot: testTrustRoot,
      now: Date.parse("2026-07-15T00:05:00.000Z"),
    }),
    /not bound to the introspected dedicated credential/,
  );
  store.close();
});

test("permit expiry is rechecked at assignment admission and immediately before a lease", () => {
  const campaign = authorizedCampaign();
  const store = openCampaignTestStore(campaign);
  const issuedAt = Date.parse("2026-07-15T00:05:00.000Z");
  const expiredAt = Date.parse("2026-07-15T00:10:00.001Z");
  const permit = authorizeS1Execution({
    campaign,
    authorization: liveAuthorization(campaign),
    env: { OPENROUTER_S1_API_KEY: "expiry-secret" },
    store,
    now: issuedAt,
  });
  reserveS1CampaignBatch({ campaign, permit, store, now: issuedAt });

  let clock = issuedAt;
  const admissionRuntime = createS1AssignmentRuntime({
    campaign,
    permit,
    store,
    assignmentId: campaign.assignments[0]!.assignmentId,
    now: () => clock,
  });
  clock = expiredAt;
  assert.throws(
    () => admissionRuntime.controller.admitAssignment({
      operationId: admissionRuntime.assignment.operationId,
      assignmentId: admissionRuntime.assignment.assignmentId,
      contractId: admissionRuntime.assignment.assignmentContractId,
    }),
    /currently valid offline test permit/,
  );

  clock = issuedAt;
  const leaseRuntime = createS1AssignmentRuntime({
    campaign,
    permit,
    store,
    assignmentId: campaign.assignments[1]!.assignmentId,
    now: () => clock,
  });
  leaseRuntime.controller.admitAssignment({
    operationId: leaseRuntime.assignment.operationId,
    assignmentId: leaseRuntime.assignment.assignmentId,
    contractId: leaseRuntime.assignment.assignmentContractId,
  });
  clock = expiredAt;
  assert.throws(
    () => leaseRuntime.controller.preFetchLease(exactLeaseRequest(leaseRuntime.assignment)),
    /currently valid offline test permit/,
  );
  store.close();
});

test("sealed campaigns reject zero-dispatch closure and distinguish COMPLETE from abort", async () => {
  const now = Date.parse("2026-07-15T00:05:00.000Z");
  const campaign = authorizedCampaign();
  const incompleteStore = openCampaignTestStore(campaign);
  const incompletePermit = authorizeS1Execution({
    campaign,
    authorization: liveAuthorization(campaign),
    env: { OPENROUTER_S1_API_KEY: "completion-barrier-secret" },
    store: incompleteStore,
    now,
  });
  reserveS1CampaignBatch({ campaign, permit: incompletePermit, store: incompleteStore, now });
  const runtime = createS1AssignmentRuntime({
    campaign,
    permit: incompletePermit,
    store: incompleteStore,
    assignmentId: campaign.assignments[0]!.assignmentId,
    now: () => now,
  });
  runtime.controller.admitAssignment({
    operationId: runtime.assignment.operationId,
    assignmentId: runtime.assignment.assignmentId,
    contractId: runtime.assignment.assignmentContractId,
  });
  await assert.rejects(
    runtime.controller.closeAssignment(runtime.assignment.assignmentId),
    /cannot close without consuming its frozen dispatch/,
  );
  assert.throws(
    () => finalizeS1Campaign({
      campaign,
      permit: incompletePermit,
      store: incompleteStore,
      terminalStatus: "COMPLETE",
      now,
    }),
    /COMPLETE requires every frozen assignment closed with exactly one consumed dispatch/,
  );
  incompleteStore.close();

  const abortedStore = openCampaignTestStore(campaign);
  const abortedAuthorization = liveAuthorization(campaign);
  const abortedPermit = authorizeS1Execution({
    campaign,
    authorization: abortedAuthorization,
    env: { OPENROUTER_S1_API_KEY: "aborted-barrier-secret" },
    store: abortedStore,
    now,
  });
  reserveS1CampaignBatch({ campaign, permit: abortedPermit, store: abortedStore, now });
  finalizeS1Campaign({
    campaign,
    permit: abortedPermit,
    store: abortedStore,
    terminalStatus: "ABORTED_INCOMPLETE",
    now,
  });
  assert.equal(abortedStore.getBatchFinancialView({
    experimentId: campaign.experimentId,
    phaseId: campaign.phaseId,
    batchId: campaign.batchId,
  })?.actualCostUsd, 0);
  abortedStore.close();
});

test("legacy schema-v4 stores receive the nullable rolling-pricing evidence column", async () => {
  const campaign = authorizedCampaign();
  const fixture = createS1OfflineTestStoreFixture(campaign, "s1-v6-v4-column-migration-");
  const root = fixture.rootPath;
  const storePath = fixture.storePath;
  const realDateNow = Date.now;
  const now = Date.parse("2026-07-15T00:05:00.000Z");
  Date.now = () => now;
  try {
    fixture.store.close();

    const legacy = new DatabaseSync(storePath);
    legacy.exec(
      "ALTER TABLE controller_call_contracts DROP COLUMN rolling_pricing_attestation_hash",
    );
    legacy.close();

    const migrated = reopenS1OfflineTestStore(fixture);
    const permit = authorizeS1Execution({
      campaign,
      authorization: liveAuthorization(campaign),
      env: { OPENROUTER_S1_API_KEY: "migration-proof-secret" },
      store: migrated,
      now,
    });
    reserveS1CampaignBatch({ campaign, permit, store: migrated });
    const runtime = createS1AssignmentRuntime({
      campaign,
      permit,
      store: migrated,
      assignmentId: campaign.assignments[0]!.assignmentId,
    });
    runtime.controller.admitAssignment({
      operationId: runtime.assignment.operationId,
      assignmentId: runtime.assignment.assignmentId,
      contractId: runtime.assignment.assignmentContractId,
    });
    const request = exactLeaseRequest(runtime.assignment);
    runtime.controller.preFetchLease(request);
    runtime.controller.recoverAmbiguousCall({
      physicalCallId: request.physicalCallId,
      disposition: "never_sent",
      reason: "legacy-column migration write proof",
    });
    assert.equal(
      runtime.controller.recoverAssignment(runtime.assignment.assignmentId).calls[0]!
        .contract.rollingPricingAttestationHash,
      permit.rollingPricingAttestation.attestationHash,
    );
    migrated.close();
  } finally {
    Date.now = realDateNow;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
});

test("reopen rejects look-alike triggers and tampered durable registry hashes", async () => {
  const campaign = authorizedCampaign();
  const now = Date.parse("2026-07-15T00:05:00.000Z");

  const lookalikeStore = openCampaignTestStore(campaign);
  const lookalikeStorePath = lookalikeStore.storePath;
  const lookalikeRegistryPath = lookalikeStore.registryPath;
  const lookalikeRoot = path.dirname(lookalikeStorePath);
  lookalikeStore.close();
  const lookalikeDb = new DatabaseSync(lookalikeStorePath);
  lookalikeDb.exec(`
    DROP TRIGGER controller_authorization_windows_no_update;
    CREATE TRIGGER controller_authorization_windows_no_update
    BEFORE UPDATE ON controller_authorization_windows BEGIN SELECT 1; END;
  `);
  lookalikeDb.close();
  assert.throws(
    () => openTestBudgetStore(lookalikeStorePath, lookalikeRegistryPath),
    /look-alike trigger/,
  );
  await rm(lookalikeRoot, { recursive: true, force: true });

  const recoveryStore = openCampaignTestStore(campaign);
  const recoveryStorePath = recoveryStore.storePath;
  const recoveryRegistryPath = recoveryStore.registryPath;
  const recoveryRoot = path.dirname(recoveryStorePath);
  const permit = authorizeS1Execution({
    campaign,
    authorization: liveAuthorization(campaign),
    env: { OPENROUTER_S1_API_KEY: "recovery-corruption-secret" },
    store: recoveryStore,
    now,
  });
  reserveS1CampaignBatch({ campaign, permit, store: recoveryStore, now });
  const runtime = createS1AssignmentRuntime({
    campaign,
    permit,
    store: recoveryStore,
    assignmentId: campaign.assignments[0]!.assignmentId,
    now: () => now,
  });
  runtime.controller.admitAssignment({
    operationId: runtime.assignment.operationId,
    assignmentId: runtime.assignment.assignmentId,
    contractId: runtime.assignment.assignmentContractId,
  });
  const request = exactLeaseRequest(runtime.assignment);
  runtime.controller.preFetchLease(request);
  runtime.controller.recoverAmbiguousCall({
    physicalCallId: request.physicalCallId,
    disposition: "never_sent",
    reason: "build durable recovery fixture",
  });
  await runtime.controller.closeAssignment(runtime.assignment.assignmentId);
  recoveryStore.close();

  const corruptDb = new DatabaseSync(recoveryStorePath);
  corruptDb.exec(`
    DROP TRIGGER controller_registries_no_update;
    UPDATE controller_registries SET registry_content_json = '{}';
    CREATE TRIGGER controller_registries_no_update
    BEFORE UPDATE ON controller_registries BEGIN
      SELECT RAISE(ABORT, 'controller_registries is append-only');
    END;
  `);
  corruptDb.close();
  assert.throws(
    () => openTestBudgetStore(recoveryStorePath, recoveryRegistryPath),
    /Durable registry canonical JSON\/hash is invalid/,
  );
  await rm(recoveryRoot, { recursive: true, force: true });
});

test("rolling attestations resume one immutable durable batch without replay or cap growth", async () => {
  const campaign = authorizedCampaign();
  const fixture = createS1OfflineTestStoreFixture(campaign, "s1-v6-rolling-window-");
  const root = fixture.rootPath;
  const store = fixture.store;
  const parser = createS1OpenRouterQuestionParser(campaign.parser.parserArtifactHash);
  const realDateNow = Date.now;
  let now = Date.parse("2026-07-15T00:05:00.000Z");
  Date.now = () => now;
  try {
    const authorization1 = liveAuthorization(campaign);
    const permit1 = authorizeS1Execution({
      campaign,
      authorization: authorization1,
      env: { OPENROUTER_S1_API_KEY: "window-1-secret" },
      store,
      now,
    });
    reserveS1CampaignBatch({ campaign, permit: permit1, store });
    const first = createS1AssignmentRuntime({
      campaign,
      permit: permit1,
      store,
      assignmentId: campaign.assignments[0]!.assignmentId,
    });
    const firstAdmitted = first.controller.admitAssignment({
      operationId: first.assignment.operationId,
      assignmentId: first.assignment.assignmentId,
      contractId: first.assignment.assignmentContractId,
    });
    assert.equal(firstAdmitted.state, "open");
    const firstLeaseRequest = exactLeaseRequest(first.assignment);
    first.controller.preFetchLease(firstLeaseRequest);
    first.controller.recoverAmbiguousCall({
      physicalCallId: firstLeaseRequest.physicalCallId,
      disposition: "never_sent",
      reason: "offline fake-clock interruption proof",
    });
    assert.equal(
      first.controller.recoverAssignment(first.assignment.assignmentId).calls[0]!
        .contract.rollingPricingAttestationHash,
      permit1.rollingPricingAttestation.attestationHash,
    );
    assert.equal(
      (await first.controller.closeAssignment(first.assignment.assignmentId)).state,
      "closed",
    );

    now = Date.parse("2026-07-15T00:12:00.000Z");
    assert.throws(
      () => createS1AssignmentRuntime({
        campaign,
        permit: permit1,
        store,
        assignmentId: campaign.assignments[1]!.assignmentId,
      }),
      /currently valid offline test permit/,
    );

    const authorization2 = liveAuthorization(campaign, {
      windowOrdinal: 2,
      previousAuthorizationRecordSha256: authorization1.authorizationRecordSha256,
      metadataFetchedAt: "2026-07-15T00:10:00.000Z",
      metadataValidThrough: "2026-07-15T00:25:00.000Z",
      priceFetchedAt: "2026-07-15T00:10:00.000Z",
      priceValidThrough: "2026-07-15T00:25:00.000Z",
      usageUsd: 0,
    });
    const permit2 = authorizeS1Execution({
      campaign,
      authorization: authorization2,
      env: { OPENROUTER_S1_API_KEY: "window-2-secret" },
      store,
      now,
    });
    assert.equal(permit2.campaignSemanticSha256, permit1.campaignSemanticSha256);
    assert.equal(permit2.windowOrdinal, 2);
    reserveS1CampaignBatch({ campaign, permit: permit2, store });

    const replay = createS1AssignmentRuntime({
      campaign,
      permit: permit2,
      store,
      assignmentId: first.assignment.assignmentId,
    });
    const recovered = replay.controller.admitAssignment({
      operationId: replay.assignment.operationId,
      assignmentId: replay.assignment.assignmentId,
      contractId: replay.assignment.assignmentContractId,
    });
    assert.equal(recovered.state, "closed");
    assert.throws(
      () => replay.controller.preFetchLease(firstLeaseRequest),
      /whole-assignment envelope must be durably admitted|physical call was already leased/,
    );

    const second = createS1AssignmentRuntime({
      campaign,
      permit: permit2,
      store,
      assignmentId: campaign.assignments[1]!.assignmentId,
    });
    second.controller.admitAssignment({
      operationId: second.assignment.operationId,
      assignmentId: second.assignment.assignmentId,
      contractId: second.assignment.assignmentContractId,
    });
    const secondLeaseRequest = exactLeaseRequest(second.assignment);
    second.controller.preFetchLease(secondLeaseRequest);
    second.controller.recoverAmbiguousCall({
      physicalCallId: secondLeaseRequest.physicalCallId,
      disposition: "never_sent",
      reason: "offline fake-clock resumed window proof",
    });
    await second.controller.closeAssignment(second.assignment.assignmentId);
    const summary = store.summary();
    assert.equal(summary.batches, 1);
    assert.equal(summary.usedAttemptSlots + summary.reservedAttemptSlots, 180);
    assert.equal(summary.usedAttemptSlots, 2);
    assert.equal(summary.providerCalls, 2);

    now = Date.parse("2026-07-15T00:20:00.000Z");
    const priceIncrease = liveAuthorization(campaign, {
      windowOrdinal: 3,
      previousAuthorizationRecordSha256: authorization2.authorizationRecordSha256,
      metadataFetchedAt: "2026-07-15T00:20:00.000Z",
      metadataValidThrough: "2026-07-15T00:30:00.000Z",
      priceFetchedAt: "2026-07-15T00:20:00.000Z",
      priceValidThrough: "2026-07-15T00:30:00.000Z",
      priceMultiplier: 2,
      usageUsd: 0,
    });
    assert.throws(
      () => authorizeS1Execution({
        campaign,
        authorization: priceIncrease,
        env: { OPENROUTER_S1_API_KEY: "window-3-secret" },
        store,
        now,
      }),
      /rolling price exceeds or diverges from the frozen campaign envelope/,
    );
  } finally {
    Date.now = realDateNow;
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("never-sent recovery is forbidden once clone/body evidence exists", async () => {
  const campaign = authorizedCampaign();
  const store = openCampaignTestStore(campaign);
  const now = Date.parse("2026-07-15T00:05:00.000Z");
  const permit = authorizeS1Execution({
    campaign,
    authorization: liveAuthorization(campaign),
    env: { OPENROUTER_S1_API_KEY: "never-sent-contradiction-secret" },
    store,
    now,
  });
  reserveS1CampaignBatch({ campaign, permit, store, now });
  const assignment = campaign.assignments.find((row) => row.plan === "STANDARD")!;
  const runtime = createS1AssignmentRuntime({
    campaign,
    permit,
    store,
    assignmentId: assignment.assignmentId,
    now: () => now,
  });
  runtime.controller.admitAssignment({
    operationId: assignment.operationId,
    assignmentId: assignment.assignmentId,
    contractId: assignment.assignmentContractId,
  });
  const request = exactLeaseRequest(assignment);
  const lease = runtime.controller.preFetchLease(request);
  const generationId = "generation-never-sent-contradiction";
  const body = new TextEncoder().encode(JSON.stringify({
    id: generationId,
    model: assignment.modelId,
    provider: "Google",
    openrouter_metadata: {
      requested: assignment.modelId,
      strategy: "direct",
      attempt: 1,
      is_byok: false,
      endpoints: { available: [{ provider: "Google", model: assignment.modelId, selected: true }] },
      attempts: [{ provider: "Google", model: assignment.modelId, status: 200 }],
    },
    choices: [{ message: { content: JSON.stringify({ questions: [{ id: 1 }] }) } }],
  }));
  await runtime.controller.observeClone(lease, {
    operationId: request.operationId,
    physicalCallId: request.physicalCallId,
    physicalOrdinal: request.physicalOrdinal,
    parseState: "json",
    responseBodyHash: sha256(body),
    generationId,
    servedModel: assignment.modelId,
    upstreamProvider: "Google",
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    costState: "reported",
    costUsd: 0,
    rawUsageCostUsd: 0,
    upstreamInferenceCostUsd: null,
    capturedResponseBody: body,
  });
  assert.throws(
    () => runtime.controller.recoverAmbiguousCall({
      physicalCallId: request.physicalCallId,
      disposition: "never_sent",
      reason: "hostile contradiction",
    }),
    /never-sent recovery contradicted durable response evidence/,
  );
  const recovery = runtime.controller.recoverAssignment(assignment.assignmentId);
  assert.equal(recovery.assignment.state, "quarantined");
  assert.equal(recovery.calls[0]!.call.outcome, "unknown");
  assert.equal(recovery.calls[0]!.call.usageFinal, true);
  assert.equal(recovery.calls[0]!.call.providerRequestId, generationId);
  assert.equal(recovery.calls[0]!.candidateSlots[0]!.outcome, "unknown_after_send");
  assert.throws(
    () => store.reconcileCallUsage({
      idempotencyKey: "hostile-final-usage-overwrite",
      callId: request.physicalCallId,
      inputTokens: 99,
      outputTokens: 99,
      costUsd: 0,
      usageFinal: true,
      providerRequestId: generationId,
    }, { apply: true }),
    /Final provider usage is immutable/,
  );
  store.close();
});

test("response parser counts every semantic object so overflow cannot be hidden", async () => {
  const parser = createS1OpenRouterQuestionParser("a".repeat(64));
  const envelope = JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({ questions: [{ id: 1 }, { id: 2 }] }),
      },
    }],
  });
  const parsed = await parser.parseResponseBody(envelope);
  assert.equal(parsed.disposition, "parsed");
  assert.equal(parsed.normalizedSemanticCandidates.length, 2);

  const twoChoices = await parser.parseResponseBody(JSON.stringify({
    choices: [
      { message: { content: JSON.stringify({ questions: [{ id: 1 }] }) } },
      { message: { content: JSON.stringify({ questions: [{ id: 2 }] }) } },
    ],
  }));
  assert.equal(twoChoices.disposition, "no_candidate");
  assert.match(twoChoices.dispositionReason, /response_contract_drift_choices_cardinality_2/);

  const validPlusMalformed = await parser.parseResponseBody(JSON.stringify({
    choices: [
      { message: { content: JSON.stringify({ questions: [{ id: 1 }] }) } },
      { malformed: true },
    ],
  }));
  assert.equal(validPlusMalformed.disposition, "no_candidate");
  assert.match(
    validPlusMalformed.dispositionReason,
    /response_contract_drift_choices_cardinality_2/,
  );
});

test("multi-choice drift and one-choice semantic overflow quarantine without recycling", async () => {
  const campaign = authorizedCampaign();
  const fixture = createS1OfflineTestStoreFixture(campaign, "s1-v6-parser-drift-");
  const root = fixture.rootPath;
  const store = fixture.store;
  const parser = createS1OpenRouterQuestionParser(campaign.parser.parserArtifactHash);
  const realDateNow = Date.now;
  const now = Date.parse("2026-07-15T00:05:00.000Z");
  Date.now = () => now;
  try {
    const permit = authorizeS1Execution({
      campaign,
      authorization: liveAuthorization(campaign),
      env: { OPENROUTER_S1_API_KEY: "parser-drift-fixture-secret" },
      store,
      now,
    });
    reserveS1CampaignBatch({ campaign, permit, store });
    const response = (choices: unknown[]) => JSON.stringify({
      id: "generation-parser-drift",
      model: "google/gemini-3.5-flash",
      provider: "Google",
      openrouter_metadata: {
        requested: "google/gemini-3.5-flash",
        strategy: "direct",
        attempt: 1,
        is_byok: false,
        endpoints: {
          total: 1,
          available: [{
            provider: "Google",
            model: "google/gemini-3.5-flash",
            selected: true,
          }],
        },
        attempts: [{
          provider: "Google",
          model: "google/gemini-3.5-flash",
          status: 200,
        }],
      },
      choices,
    });
    const cases = [
      {
        assignment: campaign.assignments.find(
          (row) => row.plan === "STANDARD",
        )!,
        body: response([
          { message: { content: JSON.stringify({ questions: [{ id: 1 }] }) } },
          { message: { content: JSON.stringify({ questions: [{ id: 2 }] }) } },
        ]),
        code: "CONTROLLER_RESPONSE_CONTRACT_DRIFT",
        generationId: "generation-parser-drift" as string | null,
      },
      {
        assignment: campaign.assignments.filter(
          (row) => row.plan === "STANDARD",
        )[1]!,
        body: response([{
          message: { content: JSON.stringify({ questions: [{ id: 1 }, { id: 2 }] }) },
        }]),
        code: "CONTROLLER_SEMANTIC_OUTPUT_OVERFLOW",
        generationId: "generation-parser-drift" as string | null,
      },
      ...([null, " ", "mismatched-generation-id"] as const).map(
        (generationId, index) => ({
          assignment: campaign.assignments.filter(
            (row) => row.plan === "STANDARD",
          )[index + 2]!,
          body: response([{
            message: { content: JSON.stringify({ questions: [{ id: 1 }] }) },
          }]),
          code: "CONTROLLER_GENERATION_ID_INVALID",
          generationId,
        }),
      ),
    ];
    // Overflow deliberately breaches the shared batch, so exercise all other
    // quarantine paths first and leave the overflow case last.
    cases.push(cases.splice(1, 1)[0]!);
    for (const fixtureCase of cases) {
      const runtime = createS1AssignmentRuntime({
        campaign,
        permit,
        store,
        assignmentId: fixtureCase.assignment.assignmentId,
      });
      runtime.controller.admitAssignment({
        operationId: runtime.assignment.operationId,
        assignmentId: runtime.assignment.assignmentId,
        contractId: runtime.assignment.assignmentContractId,
      });
      const request = exactLeaseRequest(runtime.assignment);
      const lease = runtime.controller.preFetchLease(request);
      const bytes = new TextEncoder().encode(fixtureCase.body);
      await runtime.controller.observeClone(lease, {
        operationId: request.operationId,
        physicalCallId: request.physicalCallId,
        physicalOrdinal: request.physicalOrdinal,
        parseState: "json",
        responseBodyHash: sha256(bytes),
        generationId: fixtureCase.generationId,
        servedModel: runtime.assignment.modelId,
        upstreamProvider: "Google",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costState: "reported",
        costUsd: 0,
        rawUsageCostUsd: 0,
        upstreamInferenceCostUsd: null,
        capturedResponseBody: bytes,
      });
      await assert.rejects(
        runtime.controller.observeResponse(lease, {
          operationId: request.operationId,
          physicalCallId: request.physicalCallId,
          physicalOrdinal: request.physicalOrdinal,
          status: 200,
          ok: true,
          terminalKind: "http-response",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          (error as { code: string }).code === fixtureCase.code,
      );
      assert.equal(
        runtime.controller.recoverAssignment(runtime.assignment.assignmentId)
          .assignment.state,
        "quarantined",
      );
      assert.throws(
        () => runtime.controller.preFetchLease(request),
        /physical call was already leased/,
      );
    }
    const summary = store.summary();
    assert.equal(summary.usedAttemptSlots, cases.length);
    assert.equal(summary.reservedAttemptSlots, 180 - cases.length);
    assert.equal(summary.usedAttemptSlots + summary.reservedAttemptSlots, 180);
    assert.equal(summary.providerCalls, cases.length);
  } finally {
    Date.now = realDateNow;
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("schema-v2 router metadata admits optional attempt details but binds direct route and model", () => {
  const valid = {
    id: "generation-fixture",
    model: "google/gemini-3.5-flash",
    provider: "Google",
    openrouter_metadata: {
      requested: "google/gemini-3.5-flash",
      strategy: "direct",
      attempt: 1,
      is_byok: false,
      endpoints: {
        total: 1,
        available: [{
          provider: "Google",
          model: "google/gemini-3.5-flash",
          selected: true,
        }],
      },
      attempts: [{
        provider: "Google",
        model: "google/gemini-3.5-flash",
        status: 200,
      }],
    },
  };
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(valid),
      "google/gemini-3.5-flash",
    ),
    null,
  );
  const noAttemptDetails = clone(valid);
  delete (noAttemptDetails.openrouter_metadata as { attempts?: unknown }).attempts;
  (noAttemptDetails.openrouter_metadata as Record<string, unknown>).future_pipeline = {
    additive: true,
  };
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(noAttemptDetails),
      "google/gemini-3.5-flash",
    ),
    null,
  );
  const canonicalServedSlug = clone(valid);
  canonicalServedSlug.model = "google/gemini-3.5-flash-20260519";
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(canonicalServedSlug),
      "google/gemini-3.5-flash",
      {
        allowedServedModels: [
          "google/gemini-3.5-flash",
          "google/gemini-3.5-flash-20260519",
        ],
        expectedProvider: "Google",
      },
    ),
    null,
  );
  const missing = clone(valid) as Record<string, unknown>;
  delete missing.openrouter_metadata;
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(missing),
      "google/gemini-3.5-flash",
    ),
    "router_metadata_missing",
  );
  const fallback = clone(valid);
  fallback.openrouter_metadata.attempt = 2;
  fallback.openrouter_metadata.attempts.push({
    provider: "Other",
    model: "other/model",
    status: 500,
  });
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(fallback),
      "google/gemini-3.5-flash",
    ),
    "router_metadata_direct_contract_mismatch",
  );
  const selectedModelDrift = clone(valid);
  selectedModelDrift.openrouter_metadata.endpoints.available[0]!.model = "other/model";
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(selectedModelDrift),
      "google/gemini-3.5-flash",
    ),
    "router_metadata_selected_provider_or_model_mismatch",
  );
  const servedModelDrift = clone(valid);
  servedModelDrift.model = "other/model";
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(servedModelDrift),
      "google/gemini-3.5-flash",
    ),
    "router_metadata_served_model_mismatch",
  );
  const arbitraryDatedSlug = clone(valid);
  arbitraryDatedSlug.model = "google/gemini-3.5-flash-20260715";
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(arbitraryDatedSlug),
      "google/gemini-3.5-flash",
      {
        allowedServedModels: [
          "google/gemini-3.5-flash",
          "google/gemini-3.5-flash-20260519",
        ],
        expectedProvider: "Google",
      },
    ),
    "router_metadata_served_model_mismatch",
  );
  const providerDrift = clone(valid);
  providerDrift.provider = "Other";
  providerDrift.openrouter_metadata.endpoints.available[0]!.provider = "Other";
  providerDrift.openrouter_metadata.attempts[0]!.provider = "Other";
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(providerDrift),
      "google/gemini-3.5-flash",
      {
        allowedServedModels: ["google/gemini-3.5-flash"],
        expectedProvider: "Google",
      },
    ),
    "router_metadata_selected_provider_or_model_mismatch",
  );
  const attemptModelDrift = clone(valid);
  attemptModelDrift.openrouter_metadata.attempts[0]!.model = "other/model";
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(attemptModelDrift),
      "google/gemini-3.5-flash",
    ),
    "router_metadata_attempts_invalid",
  );
  const attemptStatusDrift = clone(valid);
  attemptStatusDrift.openrouter_metadata.attempts[0]!.status = 500;
  assert.equal(
    validateAtlasControllerSchemaV2RouterMetadata(
      bytes(attemptStatusDrift),
      "google/gemini-3.5-flash",
    ),
    "router_metadata_attempts_invalid",
  );
});
