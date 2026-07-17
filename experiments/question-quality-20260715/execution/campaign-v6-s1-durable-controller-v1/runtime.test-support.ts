/**
 * OFFLINE TEST SUPPORT ONLY.
 *
 * This module is deliberately absent from runtime.ts and from the production
 * source-import closure. It owns a separate permit brand, accepts only stores
 * created under an OS-temp fixture brand, never holds a credential secret,
 * never builds an Authorization header/child environment, and exposes no
 * transport delegate. It can exercise durable controller state transitions;
 * it cannot dispatch a provider request or mint a production permit.
 */
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  deriveAtlasControllerPricingSnapshotProof,
  DurableAtlasResearchController,
  verifyAtlasControllerRegistry,
  verifyAtlasControllerRollingPricingAttestation,
  type AtlasControllerRollingPricingAttestation,
} from "../../harness/atlas-controller";
import { BudgetStore, openTestBudgetStore } from "../../harness/ledger";
import {
  S1_EXACT_ROUTE_TAG,
  S1_PRICE_PROOF_MAX_AGE_MS,
  computeS1DurableBatchIdentitySha256,
  deepFreezeS1,
  sha256,
  stableJson,
  type S1MaterializedAssignment,
  type S1MaterializedCampaign,
} from "./materialize";
import { createS1OpenRouterQuestionParser } from "./openrouter-question-parser";
import type { S1LiveAuthorizationRecord } from "./runtime";

const here = path.dirname(fileURLToPath(import.meta.url));
const parserSourcePath = path.join(here, "openrouter-question-parser.ts");
const OFFLINE_PERMIT = Symbol("s1-v6-offline-test-permit");
const OFFLINE_TRUST_ROOT = Symbol("s1-v6-offline-test-trust-root");
const OFFLINE_CREDENTIAL = Symbol("s1-v6-offline-test-credential-evidence");
const OFFLINE_STORE_FIXTURE = Symbol("s1-v6-offline-test-store-fixture");
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const EPSILON = 1e-9;

const trustedPublicKeys = new WeakMap<object, string>();
const safeStores = new WeakSet<object>();

export interface S1OfflineTestTrustRoot {
  readonly operatorKeyId: string;
  readonly [OFFLINE_TRUST_ROOT]: true;
}

export interface S1OfflineTestCredentialEvidence {
  readonly credentialPublicId: string;
  readonly metadataArtifactSha256: string;
  readonly metadataFetchedAt: string;
  readonly metadataValidThrough: string;
  readonly usageUsd: number;
  readonly providerHardLimitUsd: number;
  readonly providerRemainingUsd: number;
  readonly [OFFLINE_CREDENTIAL]: true;
}

export interface S1OfflineTestPermit {
  readonly [OFFLINE_PERMIT]: true;
  readonly mode: "OFFLINE_FAKE_TRANSPORT_TEMP_STORE_ONLY";
  readonly campaignSemanticSha256: string;
  readonly validFromMs: number;
  readonly expiresAtMs: number;
  readonly windowOrdinal: number;
  readonly previousAuthorizationRecordSha256: string | null;
  readonly authorizationRecordSha256: string;
  readonly credentialPublicId: string;
  readonly providerUsageUsd: number;
  readonly providerRemainingUsd: number;
  readonly providerHardLimitUsd: number;
  readonly rollingPricingAttestation: Readonly<AtlasControllerRollingPricingAttestation>;
}

export interface S1OfflineTestStoreFixture {
  readonly [OFFLINE_STORE_FIXTURE]: true;
  readonly rootPath: string;
  readonly storePath: string;
  readonly registryPath: string;
  readonly store: BudgetStore;
}

function blocked(message: string): never {
  throw new Error(`S1_V6_OFFLINE_TEST_BLOCKED: ${message}`);
}

function canonicalUtc(value: string, label: string): number {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    blocked(`${label} is not canonical UTC`);
  }
  return timestamp;
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    blocked(`${label} must be a lowercase SHA-256`);
  }
}

function assertFinite(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    blocked(`${label} must be finite and >= ${minimum}`);
  }
}

function isUnderOsTemp(target: string): boolean {
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertOfflineStore(store: BudgetStore): void {
  if (
    !safeStores.has(store as object) ||
    !isUnderOsTemp(store.storePath) ||
    !isUnderOsTemp(store.registryPath)
  ) {
    blocked("only a module-created OS-temp test store is accepted");
  }
}

function registryDocument(campaign: S1MaterializedCampaign): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    status: "preregistering",
    registeredExperiments: [{
      id: campaign.experimentId,
      status: "registered",
      phases: [{
        id: campaign.phaseId,
        status: "registered",
        apiCandidateBudget: 180,
        maxPhysicalProviderCalls: 180,
        maxCostUsd: campaign.globalEnvelope.maxCostUsd,
      }],
    }],
  }, null, 2)}\n`;
}

export function createS1OfflineTestStoreFixture(
  campaign: S1MaterializedCampaign,
  prefix = "s1-v6-offline-store-",
): Readonly<S1OfflineTestStoreFixture> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(prefix)) {
    blocked("test-store prefix must be one safe path segment");
  }
  const rootPath = mkdtempSync(path.join(tmpdir(), prefix));
  const registryPath = path.join(rootPath, "registry.json");
  const storePath = path.join(rootPath, "budget.sqlite");
  writeFileSync(registryPath, registryDocument(campaign), "utf8");
  const store = openTestBudgetStore(storePath, registryPath);
  safeStores.add(store as object);
  return Object.freeze({
    [OFFLINE_STORE_FIXTURE]: true as const,
    rootPath,
    registryPath,
    storePath,
    store,
  });
}

export function reopenS1OfflineTestStore(
  fixture: S1OfflineTestStoreFixture,
): BudgetStore {
  if (
    fixture?.[OFFLINE_STORE_FIXTURE] !== true ||
    !isUnderOsTemp(fixture.storePath) ||
    !isUnderOsTemp(fixture.registryPath) ||
    path.dirname(fixture.storePath) !== fixture.rootPath ||
    path.dirname(fixture.registryPath) !== fixture.rootPath
  ) {
    blocked("test-store fixture provenance is invalid");
  }
  const store = openTestBudgetStore(fixture.storePath, fixture.registryPath);
  safeStores.add(store as object);
  return store;
}

export function createS1OfflineTestTrustRoot(
  publicKeyPem: string,
): Readonly<S1OfflineTestTrustRoot> {
  createPublicKey(publicKeyPem);
  const root = Object.freeze({
    operatorKeyId: sha256(publicKeyPem),
    [OFFLINE_TRUST_ROOT]: true as const,
  });
  trustedPublicKeys.set(root, publicKeyPem);
  return root;
}

export function createS1OfflineTestCredentialEvidence(input: {
  credentialPublicId: string;
  metadataArtifactSha256: string;
  metadataFetchedAt: string;
  metadataValidThrough: string;
  usageUsd: number;
  providerHardLimitUsd: number;
  providerRemainingUsd: number;
}): Readonly<S1OfflineTestCredentialEvidence> {
  if (!SAFE_ID.test(input.credentialPublicId)) blocked("test credential evidence is malformed");
  assertHash(input.metadataArtifactSha256, "credential.metadataArtifactSha256");
  canonicalUtc(input.metadataFetchedAt, "credential.metadataFetchedAt");
  canonicalUtc(input.metadataValidThrough, "credential.metadataValidThrough");
  assertFinite(input.usageUsd, "credential.usageUsd");
  assertFinite(input.providerHardLimitUsd, "credential.providerHardLimitUsd", EPSILON);
  assertFinite(input.providerRemainingUsd, "credential.providerRemainingUsd");
  return Object.freeze({ ...input, [OFFLINE_CREDENTIAL]: true as const });
}

function signedMaterial(
  record: S1LiveAuthorizationRecord,
): Omit<S1LiveAuthorizationRecord, "authorizationRecordSha256" | "operatorSignatureBase64"> {
  const { authorizationRecordSha256, operatorSignatureBase64, ...material } = record;
  void authorizationRecordSha256;
  void operatorSignatureBase64;
  return material;
}

function assertCampaignIntegrity(campaign: S1MaterializedCampaign): void {
  const { campaignSemanticSha256, ...core } = campaign;
  if (
    campaign.schemaVersion !== "question-quality-s1-v6-durable-controller-bundle-v1.2" ||
    sha256(stableJson(core)) !== campaignSemanticSha256 ||
    campaign.assignments.length !== 180 ||
    campaign.globalEnvelope.candidateOpportunityCap !== 180 ||
    campaign.globalEnvelope.physicalFetchCap !== 180
  ) {
    blocked("materialized campaign structure or semantic hash is invalid");
  }
  const durableIdentity = computeS1DurableBatchIdentitySha256({
    campaignId: campaign.campaignId,
    experimentId: campaign.experimentId,
    phaseId: campaign.phaseId,
    batchId: campaign.batchId,
    preflightSemanticSha256: campaign.preflightSemanticSha256,
    preflightArtifactSha256: campaign.preflightArtifactSha256,
    parser: campaign.parser,
    profileArtifactManifest: campaign.profileArtifactManifest,
    designAuthorization: campaign.designAuthorization,
    assignments: campaign.assignments,
    frozenPricingEnvelopeSha256: campaign.frozenPricingEnvelopeSha256,
  });
  if (
    durableIdentity !== campaign.durableBatchIdentitySha256 ||
    sha256(readFileSync(parserSourcePath)) !== campaign.parser.parserArtifactHash
  ) {
    blocked("campaign durable identity or parser binding is invalid");
  }
  for (const assignment of campaign.assignments) verifyAtlasControllerRegistry(assignment.registry);
  deepFreezeS1(campaign);
}

function assertRollingPricingWithinFrozenCampaign(
  campaign: S1MaterializedCampaign,
  attestation: Readonly<AtlasControllerRollingPricingAttestation>,
): void {
  const proof = deriveAtlasControllerPricingSnapshotProof(
    attestation.priceSnapshotId,
    attestation.snapshot,
  );
  const checked = new Set<string>();
  for (const assignment of campaign.assignments) {
    if (checked.has(assignment.modelId)) continue;
    checked.add(assignment.modelId);
    const model = proof.models[assignment.modelId];
    const pricing = assignment.registry.entries[0]!.pricing;
    if (
      proof.schemaVersion !== 2 ||
      !model ||
      model.exactRouteTag !== S1_EXACT_ROUTE_TAG ||
      model.exactRouteTag !== pricing.exactRouteTag ||
      model.maxInputUsdPer1M - pricing.inputUsdPer1M > EPSILON ||
      model.maxOutputUsdPer1M - pricing.outputUsdPer1M > EPSILON
    ) {
      blocked("rolling price exceeds or diverges from the frozen campaign envelope");
    }
  }
}

export function authorizeS1OfflineTestExecution(input: {
  campaign: S1MaterializedCampaign;
  authorization: S1LiveAuthorizationRecord;
  credential: S1OfflineTestCredentialEvidence;
  store: BudgetStore;
  trustRoot: S1OfflineTestTrustRoot;
  now?: number;
}): Readonly<S1OfflineTestPermit> {
  assertOfflineStore(input.store);
  assertCampaignIntegrity(input.campaign);
  const now = input.now ?? Date.now();
  assertFinite(now, "authorization clock", 1);
  const record = input.authorization;
  const credential = record.dedicatedCredential;
  for (const [label, hash] of [
    ["campaignSemanticSha256", record.campaignSemanticSha256],
    ["designAuthorizationRecordHash", record.designAuthorizationRecordHash],
    ["credential.metadataArtifactSha256", credential.metadataArtifactSha256],
    ["independentAuditArtifactSha256", record.independentAuditArtifactSha256],
    ["authorizationRecordSha256", record.authorizationRecordSha256],
    ["authorization.operatorKeyId", record.operatorKeyId],
  ] as const) assertHash(hash, label);
  if (
    record.schemaVersion !== "question-quality-s1-v6-live-authorization-v1.2" ||
    record.status !== "AUTHORIZED" ||
    input.campaign.status !== "SEALED_PENDING_LIVE_AUTHORIZATION" ||
    input.campaign.designAuthorization.status !== "AUTHORIZED" ||
    record.campaignSemanticSha256 !== input.campaign.campaignSemanticSha256 ||
    record.designAuthorizationRecordHash !== input.campaign.designAuthorization.authorizationRecordHash
  ) {
    blocked("live authorization is absent, stale, or bound to another campaign");
  }
  if (!Number.isSafeInteger(record.windowOrdinal) || record.windowOrdinal <= 0) {
    blocked("authorization.windowOrdinal must be a positive safe integer");
  }
  if (record.windowOrdinal === 1) {
    if (record.previousAuthorizationRecordSha256 !== null) {
      blocked("the first authorization window cannot name a predecessor");
    }
  } else {
    assertHash(record.previousAuthorizationRecordSha256, "previousAuthorizationRecordSha256");
  }
  const publicKey = trustedPublicKeys.get(input.trustRoot as object);
  const signature = Buffer.from(record.operatorSignatureBase64, "base64");
  if (
    input.trustRoot?.[OFFLINE_TRUST_ROOT] !== true ||
    !publicKey ||
    input.trustRoot.operatorKeyId !== record.operatorKeyId ||
    signature.length === 0 ||
    signature.toString("base64") !== record.operatorSignatureBase64 ||
    !verifySignature(
      null,
      Buffer.from(stableJson(signedMaterial(record)), "utf8"),
      publicKey,
      signature,
    ) ||
    sha256(stableJson({
      signedMaterial: signedMaterial(record),
      operatorSignatureBase64: record.operatorSignatureBase64,
    })) !== record.authorizationRecordSha256
  ) {
    blocked("operator signature or authorization record hash is invalid");
  }
  assertFinite(credential.usageUsd, "credential.usageUsd");
  assertFinite(credential.providerHardLimitUsd, "credential.providerHardLimitUsd", EPSILON);
  assertFinite(credential.providerRemainingUsd, "credential.providerRemainingUsd");
  const evidence = input.credential;
  if (
    evidence?.[OFFLINE_CREDENTIAL] !== true ||
    evidence.credentialPublicId !== credential.credentialPublicId ||
    evidence.metadataArtifactSha256 !== credential.metadataArtifactSha256 ||
    evidence.metadataFetchedAt !== credential.metadataFetchedAt ||
    evidence.metadataValidThrough !== credential.metadataValidThrough ||
    Math.abs(evidence.usageUsd - credential.usageUsd) > EPSILON ||
    Math.abs(evidence.providerHardLimitUsd - credential.providerHardLimitUsd) > EPSILON ||
    Math.abs(evidence.providerRemainingUsd - credential.providerRemainingUsd) > EPSILON
  ) {
    blocked("signed key metadata is not bound to the introspected dedicated credential");
  }
  if (
    credential.sourceEnvName !== "OPENROUTER_S1_API_KEY" ||
    credential.campaignLabel !== input.campaign.campaignId ||
    !SAFE_ID.test(credential.credentialPublicId) ||
    credential.byokEnabled !== false ||
    credential.accountDataPolicyVerified !== true ||
    credential.exactRouteZdrSupportVerified !== true ||
    credential.secretOrSecretHashPersisted !== false ||
    (record.windowOrdinal === 1 && credential.usageUsd !== 0)
  ) {
    blocked("dedicated key metadata does not satisfy zero-use privacy/cost policy");
  }
  const metadataFetchedAt = canonicalUtc(credential.metadataFetchedAt, "credential.metadataFetchedAt");
  const metadataValidThrough = canonicalUtc(
    credential.metadataValidThrough,
    "credential.metadataValidThrough",
  );
  if (
    now < metadataFetchedAt ||
    now > metadataValidThrough ||
    metadataValidThrough <= metadataFetchedAt ||
    metadataValidThrough - metadataFetchedAt > S1_PRICE_PROOF_MAX_AGE_MS
  ) {
    blocked("dedicated key metadata proof is outside its 15-minute validity window");
  }
  const cap = input.campaign.globalEnvelope.maxCostUsd;
  if (
    Math.abs(credential.providerHardLimitUsd - cap) > EPSILON ||
    Math.abs(credential.providerRemainingUsd + credential.usageUsd - cap) > EPSILON
  ) {
    blocked("provider hard limit/usage/remaining do not reconcile to the frozen campaign cap");
  }
  const reconciliation = record.providerUsageReconciliation;
  const pollStartedAt = canonicalUtc(reconciliation.pollStartedAt, "providerUsageReconciliation.pollStartedAt");
  const pollCompletedAt = canonicalUtc(
    reconciliation.pollCompletedAt,
    "providerUsageReconciliation.pollCompletedAt",
  );
  if (
    reconciliation.status !== "RECONCILED_AFTER_BOUNDED_POLL" ||
    !Number.isSafeInteger(reconciliation.pollAttempts) ||
    reconciliation.pollAttempts <= 0 ||
    reconciliation.pollAttempts > 60 ||
    !Number.isSafeInteger(reconciliation.maximumPollDurationMs) ||
    reconciliation.maximumPollDurationMs <= 0 ||
    reconciliation.maximumPollDurationMs > 60_000 ||
    pollCompletedAt < pollStartedAt ||
    pollCompletedAt - pollStartedAt > reconciliation.maximumPollDurationMs ||
    pollCompletedAt !== metadataFetchedAt
  ) {
    blocked("provider usage reconciliation lacks a bounded completed polling proof");
  }
  const financial = input.store.getBatchFinancialView({
    experimentId: input.campaign.experimentId,
    phaseId: input.campaign.phaseId,
    batchId: input.campaign.batchId,
  });
  const actual = financial?.actualCostUsd ?? 0;
  const effective = financial?.effectiveCostUsd ?? 0;
  if (
    Math.abs(reconciliation.localActualCostUsd - actual) > EPSILON ||
    Math.abs(reconciliation.localEffectiveCostUsd - effective) > EPSILON ||
    Math.abs(credential.usageUsd - actual) > EPSILON ||
    effective - cap > EPSILON
  ) {
    blocked("provider usage/remaining does not reconcile to durable local cost and remainder");
  }
  const rolling = verifyAtlasControllerRollingPricingAttestation(record.rollingPricingAttestation);
  assertRollingPricingWithinFrozenCampaign(input.campaign, rolling);
  const priceProof = deriveAtlasControllerPricingSnapshotProof(rolling.priceSnapshotId, rolling.snapshot);
  const priceFetchedAt = canonicalUtc(priceProof.fetchedAt, "rollingPriceProof.fetchedAt");
  const priceValidThrough = canonicalUtc(rolling.validThrough, "rollingPriceProof.validThrough");
  const validFromMs = Math.max(metadataFetchedAt, priceFetchedAt);
  const expiresAtMs = Math.min(metadataValidThrough, priceValidThrough);
  if (now < priceFetchedAt || now > priceValidThrough || validFromMs > expiresAtMs) {
    blocked("rolling tag-bound pricing proof is not current at execution authorization");
  }
  input.store.acceptControllerAuthorizationWindow({
    campaignSemanticSha256: input.campaign.campaignSemanticSha256,
    credentialPublicId: credential.credentialPublicId,
    windowOrdinal: record.windowOrdinal,
    previousAuthorizationRecordSha256: record.previousAuthorizationRecordSha256,
    authorizationRecordSha256: record.authorizationRecordSha256,
    providerUsageUsd: credential.usageUsd,
    providerRemainingUsd: credential.providerRemainingUsd,
    providerHardLimitUsd: credential.providerHardLimitUsd,
  });
  return Object.freeze({
    [OFFLINE_PERMIT]: true as const,
    mode: "OFFLINE_FAKE_TRANSPORT_TEMP_STORE_ONLY" as const,
    campaignSemanticSha256: input.campaign.campaignSemanticSha256,
    validFromMs,
    expiresAtMs,
    windowOrdinal: record.windowOrdinal,
    previousAuthorizationRecordSha256: record.previousAuthorizationRecordSha256,
    authorizationRecordSha256: record.authorizationRecordSha256,
    credentialPublicId: credential.credentialPublicId,
    providerUsageUsd: credential.usageUsd,
    providerRemainingUsd: credential.providerRemainingUsd,
    providerHardLimitUsd: credential.providerHardLimitUsd,
    rollingPricingAttestation: rolling,
  });
}

function assertPermitAndAuthority(input: {
  campaign: S1MaterializedCampaign;
  permit: S1OfflineTestPermit;
  store: BudgetStore;
  now: number;
  batchMayBeAbsent?: boolean;
}): void {
  assertOfflineStore(input.store);
  assertCampaignIntegrity(input.campaign);
  assertFinite(input.now, "permit validation clock", 1);
  if (
    input.permit?.[OFFLINE_PERMIT] !== true ||
    input.permit.mode !== "OFFLINE_FAKE_TRANSPORT_TEMP_STORE_ONLY" ||
    input.permit.campaignSemanticSha256 !== input.campaign.campaignSemanticSha256 ||
    input.now < input.permit.validFromMs ||
    input.now > input.permit.expiresAtMs
  ) {
    blocked("a matching, currently valid offline test permit is required");
  }
  input.store.assertControllerAuthorizationWindowHead({
    campaignSemanticSha256: input.campaign.campaignSemanticSha256,
    credentialPublicId: input.permit.credentialPublicId,
    windowOrdinal: input.permit.windowOrdinal,
    previousAuthorizationRecordSha256: input.permit.previousAuthorizationRecordSha256,
    authorizationRecordSha256: input.permit.authorizationRecordSha256,
    providerUsageUsd: input.permit.providerUsageUsd,
    providerRemainingUsd: input.permit.providerRemainingUsd,
    providerHardLimitUsd: input.permit.providerHardLimitUsd,
  });
  const financial = input.store.getBatchFinancialView({
    experimentId: input.campaign.experimentId,
    phaseId: input.campaign.phaseId,
    batchId: input.campaign.batchId,
  });
  if (!financial && !input.batchMayBeAbsent) blocked("sealed durable batch is absent");
  const actual = financial?.actualCostUsd ?? 0;
  const effective = financial?.effectiveCostUsd ?? 0;
  const cap = input.campaign.globalEnvelope.maxCostUsd;
  if (
    Math.abs(actual - input.permit.providerUsageUsd) > EPSILON ||
    Math.abs(input.permit.providerHardLimitUsd - cap) > EPSILON ||
    Math.abs(input.permit.providerRemainingUsd - (cap - actual)) > EPSILON ||
    effective - cap > EPSILON
  ) {
    blocked("permit provider usage/remaining is stale against durable local financial state");
  }
}

export function validateS1OfflineTestPermitAt(
  campaign: S1MaterializedCampaign,
  permit: S1OfflineTestPermit,
  store: BudgetStore,
  now: number,
): void {
  assertPermitAndAuthority({ campaign, permit, store, now, batchMayBeAbsent: true });
}

export function reserveS1OfflineTestCampaignBatch(input: {
  campaign: S1MaterializedCampaign;
  permit: S1OfflineTestPermit;
  store: BudgetStore;
  now?: number;
}): void {
  assertPermitAndAuthority({
    ...input,
    now: input.now ?? Date.now(),
    batchMayBeAbsent: true,
  });
  const expectedAssignmentIds = input.campaign.assignments
    .map((assignment) => assignment.assignmentId)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const receipt = input.store.reserveBatch({
    ...input.campaign.batchReservation,
    idempotencyKey: `reserve:${input.campaign.durableBatchIdentitySha256.slice(0, 32)}`,
    sealedControllerCampaign: {
      campaignSemanticSha256: input.campaign.campaignSemanticSha256,
      durableBatchIdentitySha256: input.campaign.durableBatchIdentitySha256,
      expectedAssignmentIds,
      expectedAssignmentSetSha256: sha256(stableJson(expectedAssignmentIds)),
    },
  }, { apply: true });
  if (
    receipt.value.allocatedCandidateSlots !== 180 ||
    receipt.value.maxProviderCalls !== 180 ||
    Math.abs(receipt.value.maxCostUsd - input.campaign.globalEnvelope.maxCostUsd) > EPSILON
  ) {
    blocked("durable batch differs from the sealed campaign-wide envelope");
  }
}

function assignmentById(
  campaign: S1MaterializedCampaign,
  assignmentId: string,
): S1MaterializedAssignment {
  const matches = campaign.assignments.filter((row) => row.assignmentId === assignmentId);
  if (matches.length !== 1) blocked("assignment is absent or ambiguous in the sealed bundle");
  return matches[0]!;
}

export function createS1OfflineTestAssignmentController(input: {
  campaign: S1MaterializedCampaign;
  permit: S1OfflineTestPermit;
  store: BudgetStore;
  assignmentId: string;
  now?: () => number;
}): {
  assignment: S1MaterializedAssignment;
  controller: DurableAtlasResearchController;
  transportMode: "OFFLINE_FAKE_ONLY_NO_DELEGATE";
} {
  const now = input.now ?? Date.now;
  const executionAuthority = (): void => assertPermitAndAuthority({
    campaign: input.campaign,
    permit: input.permit,
    store: input.store,
    now: now(),
  });
  executionAuthority();
  const assignment = assignmentById(input.campaign, input.assignmentId);
  const parser = createS1OpenRouterQuestionParser(input.campaign.parser.parserArtifactHash);
  const controller = new DurableAtlasResearchController({
    store: input.store,
    registry: assignment.registry,
    parsers: { [input.campaign.parser.attestationId]: parser },
    pricingSnapshots: input.campaign.pricingSnapshots,
    rollingPricingAttestation: input.permit.rollingPricingAttestation,
    executionAuthority,
    now,
  });
  return { assignment, controller, transportMode: "OFFLINE_FAKE_ONLY_NO_DELEGATE" };
}

export function finalizeS1OfflineTestCampaign(input: {
  campaign: S1MaterializedCampaign;
  permit: S1OfflineTestPermit;
  store: BudgetStore;
  terminalStatus: "COMPLETE" | "ABORTED_INCOMPLETE";
  now?: number;
}): void {
  assertPermitAndAuthority({ ...input, now: input.now ?? Date.now() });
  input.store.finalizeBatch({
    experimentId: input.campaign.experimentId,
    phaseId: input.campaign.phaseId,
    batchId: input.campaign.batchId,
    idempotencyKey: `finalize:${input.campaign.durableBatchIdentitySha256.slice(0, 32)}`,
    sealedTerminalStatus: input.terminalStatus,
  }, { apply: true });
}
