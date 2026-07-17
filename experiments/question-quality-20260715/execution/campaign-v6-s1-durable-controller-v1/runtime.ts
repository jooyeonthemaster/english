import { verify as verifySignature } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  deriveAtlasControllerPricingSnapshotProof,
  DurableAtlasResearchController,
  verifyAtlasControllerRegistry,
  verifyAtlasControllerRollingPricingAttestation,
  type AtlasControllerRollingPricingAttestation,
} from "../../harness/atlas-controller";
import { type BudgetStore } from "../../harness/ledger";
import { QuestionGenerationCallsiteAdapter } from "../../harness/question-generation-callsite-adapter";

import {
  S1_EXACT_ENDPOINT,
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

const PERMIT = Symbol("campaign-v6-s1-live-execution-permit");
const TRUST_ROOT = Symbol("campaign-v6-s1-authorization-trust-root");
const CREDENTIAL = Symbol("campaign-v6-s1-introspected-credential");
const EPSILON = 1e-9;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/;
const SAFE_CHILD_ENV_KEYS = Object.freeze([
  "PATH",
  "Path",
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
] as const);
// PLACEHOLDER ONLY. Its private half was deliberately discarded. Production
// authorization remains blocked until a separately sealed amendment pins the
// audited live signer public key; no signing private key belongs in this repo.
const PLACEHOLDER_PRODUCTION_OPERATOR_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaG8uMtDEblXMjzycqX60OOAbH0yXtgI1hfyTZ2d9vdc=
-----END PUBLIC KEY-----\n`;
const PLACEHOLDER_PRODUCTION_OPERATOR_KEY_ID = sha256(
  PLACEHOLDER_PRODUCTION_OPERATOR_PUBLIC_KEY_PEM,
);
const PARSER_SOURCE_PATH = fileURLToPath(new URL("./openrouter-question-parser.ts", import.meta.url));
export type S1ProcessEnvironment = Record<string, string | undefined>;

export interface S1LiveAuthorizationRecord {
  schemaVersion: "question-quality-s1-v6-live-authorization-v1.2";
  status: "AUTHORIZED";
  operatorKeyId: string;
  windowOrdinal: number;
  previousAuthorizationRecordSha256: string | null;
  campaignSemanticSha256: string;
  designAuthorizationRecordHash: string;
  dedicatedCredential: {
    sourceEnvName: "OPENROUTER_S1_API_KEY";
    campaignLabel: string;
    credentialPublicId: string;
    metadataArtifactSha256: string;
    metadataFetchedAt: string;
    metadataValidThrough: string;
    usageUsd: number;
    providerHardLimitUsd: number;
    providerRemainingUsd: number;
    byokEnabled: false;
    accountDataPolicyVerified: true;
    exactRouteZdrSupportVerified: true;
    secretOrSecretHashPersisted: false;
  };
  providerUsageReconciliation: {
    status: "RECONCILED_AFTER_BOUNDED_POLL";
    localActualCostUsd: number;
    localEffectiveCostUsd: number;
    pollStartedAt: string;
    pollCompletedAt: string;
    pollAttempts: number;
    maximumPollDurationMs: number;
  };
  rollingPricingAttestation: AtlasControllerRollingPricingAttestation;
  independentAuditArtifactSha256: string;
  operatorSignatureBase64: string;
  authorizationRecordSha256: string;
}

interface S1AuthorizationTrustRoot {
  readonly operatorKeyId: string;
  readonly [TRUST_ROOT]: true;
}

export interface S1DedicatedCredentialCapability {
  readonly credentialPublicId: string;
  readonly metadataArtifactSha256: string;
  readonly metadataFetchedAt: string;
  readonly metadataValidThrough: string;
  readonly usageUsd: number;
  readonly providerHardLimitUsd: number;
  readonly providerRemainingUsd: number;
  readonly [CREDENTIAL]: true;
}

export interface S1ExecutionPermit {
  readonly [PERMIT]: true;
  readonly permitClass: "PRODUCTION";
  readonly campaignSemanticSha256: string;
  readonly authorizedAtMs: number;
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

const trustRootPublicKeys = new WeakMap<object, string>();
const credentialSecrets = new WeakMap<object, string>();
const permitSecrets = new WeakMap<object, string>();

const productionTrustRoot: S1AuthorizationTrustRoot = Object.freeze({
  operatorKeyId: PLACEHOLDER_PRODUCTION_OPERATOR_KEY_ID,
  [TRUST_ROOT]: true as const,
});
trustRootPublicKeys.set(productionTrustRoot, PLACEHOLDER_PRODUCTION_OPERATOR_PUBLIC_KEY_PEM);

function fail(message: string): never {
  throw new Error(`S1_V6_EXECUTION_BLOCKED: ${message}`);
}

function canonicalUtc(value: string, label: string): number {
  if (typeof value !== "string") fail(`${label} is not canonical UTC`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    fail(`${label} is not canonical UTC`);
  }
  return timestamp;
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${label} must be a lowercase SHA-256`);
  }
}

function assertFinite(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    fail(`${label} must be finite and >= ${minimum}`);
  }
}

function authorizationSignedMaterial(
  record: S1LiveAuthorizationRecord,
): Omit<S1LiveAuthorizationRecord, "authorizationRecordSha256" | "operatorSignatureBase64"> {
  const { authorizationRecordSha256, operatorSignatureBase64, ...material } = record;
  void authorizationRecordSha256;
  void operatorSignatureBase64;
  return material;
}

function authorizationRecordMaterial(record: S1LiveAuthorizationRecord): unknown {
  return {
    signedMaterial: authorizationSignedMaterial(record),
    operatorSignatureBase64: record.operatorSignatureBase64,
  };
}

function assertRollingPricingWithinFrozenCampaign(
  campaign: S1MaterializedCampaign,
  attestation: Readonly<AtlasControllerRollingPricingAttestation>,
): void {
  const proof = deriveAtlasControllerPricingSnapshotProof(
    attestation.priceSnapshotId,
    attestation.snapshot,
  );
  const checkedModels = new Set<string>();
  for (const assignment of campaign.assignments) {
    if (checkedModels.has(assignment.modelId)) continue;
    checkedModels.add(assignment.modelId);
    const entry = assignment.registry.entries[0]!;
    const model = proof.models[assignment.modelId];
    if (
      proof.schemaVersion !== 2 ||
      !model ||
      model.exactRouteTag !== S1_EXACT_ROUTE_TAG
    ) {
      fail("rolling pricing proof lacks a required model or schema-v2 route evidence");
    }
    if (
      model.exactRouteTag !== entry.pricing.exactRouteTag ||
      model.maxInputUsdPer1M - entry.pricing.inputUsdPer1M > EPSILON ||
      model.maxOutputUsdPer1M - entry.pricing.outputUsdPer1M > EPSILON
    ) {
      fail("rolling price exceeds or diverges from the frozen campaign envelope");
    }
  }
}

const verifiedCampaigns = new WeakSet<object>();

function assertS1CampaignIntegrity(campaign: S1MaterializedCampaign): void {
  if (verifiedCampaigns.has(campaign as object)) return;
  const { campaignSemanticSha256, ...core } = campaign;
  if (
    campaign.schemaVersion !== "question-quality-s1-v6-durable-controller-bundle-v1.2" ||
    sha256(stableJson(core)) !== campaignSemanticSha256 ||
    campaign.assignments.length !== 180 ||
    campaign.globalEnvelope.candidateOpportunityCap !== 180 ||
    campaign.globalEnvelope.physicalFetchCap !== 180 ||
    campaign.batchReservation.candidateSlots !== 180 ||
    campaign.batchReservation.maxProviderCalls !== 180
  ) {
    fail("materialized campaign structure or semantic hash is invalid");
  }
  const recomputedDurableIdentity = computeS1DurableBatchIdentitySha256({
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
  if (recomputedDurableIdentity !== campaign.durableBatchIdentitySha256) {
    fail("durable batch identity does not match the materialized campaign");
  }
  if (sha256(readFileSync(PARSER_SOURCE_PATH)) !== campaign.parser.parserArtifactHash) {
    fail("frozen parser artifact differs from the runtime parser source");
  }
  const assignmentIds = new Set<string>();
  const operationIds = new Set<string>();
  const registryHashes = new Set<string>();
  for (const [index, assignment] of campaign.assignments.entries()) {
    if (
      assignment.queueOrdinal !== index + 1 ||
      assignmentIds.has(assignment.assignmentId) ||
      operationIds.has(assignment.operationId) ||
      registryHashes.has(assignment.registry.registryHash)
    ) {
      fail("campaign assignment identity map is duplicate or out of order");
    }
    assignmentIds.add(assignment.assignmentId);
    operationIds.add(assignment.operationId);
    registryHashes.add(assignment.registry.registryHash);
    const registry = verifyAtlasControllerRegistry(assignment.registry);
    const entry = registry.entries[0];
    const contract = registry.assignmentContracts[0];
    if (
      registry.registryHash !== assignment.registry.registryHash ||
      registry.entries.length !== 1 ||
      registry.assignmentContracts.length !== 1 ||
      registry.transitions.length !== 1 ||
      !assignment.operationId.startsWith(registry.operationIdPrefix) ||
      contract?.contractId !== assignment.assignmentContractId ||
      entry?.entryId !== assignment.rootEntryId ||
      entry.maxUsesPerAssignment !== 1 ||
      contract.maxPhysicalCalls !== 1 ||
      contract.maxCandidateOutputs !== 1 ||
      entry.provenance.effectiveModel !== assignment.modelId ||
      entry.provenance.promptProfileArtifactHash !==
        campaign.profileArtifactManifest.profiles[assignment.profileId]
    ) {
      fail(`assignment ${assignment.assignmentId} differs from its frozen registry`);
    }
  }
  deepFreezeS1(campaign);
  verifiedCampaigns.add(campaign as object);
}

/**
 * Creates the only capability accepted by mutating runtime helpers. This does
 * not contact OpenRouter. A separate, fresh provider-key metadata capture and
 * independent audit must have produced the sealed authorization record.
 */
function authorizeS1ExecutionInternal(input: {
  campaign: S1MaterializedCampaign;
  authorization: S1LiveAuthorizationRecord;
  credential: S1DedicatedCredentialCapability;
  store: BudgetStore;
  trustRoot: S1AuthorizationTrustRoot;
  now?: number;
}): S1ExecutionPermit {
  const now = input.now ?? Date.now();
  const campaign = input.campaign;
  const authorization = input.authorization;
  assertS1CampaignIntegrity(campaign);
  assertFinite(now, "authorization clock", 1);
  assertHash(campaign.campaignSemanticSha256, "campaignSemanticSha256");
  assertHash(
    campaign.designAuthorization.authorizationRecordHash,
    "designAuthorization.authorizationRecordHash",
  );
  assertHash(authorization.campaignSemanticSha256, "authorization.campaignSemanticSha256");
  assertHash(
    authorization.designAuthorizationRecordHash,
    "authorization.designAuthorizationRecordHash",
  );
  assertHash(
    authorization.dedicatedCredential.metadataArtifactSha256,
    "credential.metadataArtifactSha256",
  );
  assertHash(
    authorization.independentAuditArtifactSha256,
    "independentAuditArtifactSha256",
  );
  assertHash(authorization.authorizationRecordSha256, "authorizationRecordSha256");
  assertHash(authorization.operatorKeyId, "authorization.operatorKeyId");
  if (
    !Number.isSafeInteger(authorization.windowOrdinal) ||
    authorization.windowOrdinal <= 0
  ) {
    fail("authorization.windowOrdinal must be a positive safe integer");
  }
  if (authorization.windowOrdinal === 1) {
    if (authorization.previousAuthorizationRecordSha256 !== null) {
      fail("the first authorization window cannot name a predecessor");
    }
  } else {
    assertHash(
      authorization.previousAuthorizationRecordSha256,
      "previousAuthorizationRecordSha256",
    );
  }
  if (
    campaign.status !== "SEALED_PENDING_LIVE_AUTHORIZATION" ||
    campaign.designAuthorization.status !== "AUTHORIZED" ||
    !campaign.designAuthorization.authorizationRecordHash
  ) {
    fail("materialized campaign itself is not design-authorized");
  }
  if (
    authorization.schemaVersion !== "question-quality-s1-v6-live-authorization-v1.2" ||
    authorization.status !== "AUTHORIZED" ||
    authorization.campaignSemanticSha256 !== campaign.campaignSemanticSha256 ||
    authorization.designAuthorizationRecordHash !==
      campaign.designAuthorization.authorizationRecordHash
  ) {
    fail("live authorization is absent, stale, or bound to another campaign");
  }
  const trustRoot = input.trustRoot;
  const publicKeyPem = trustRootPublicKeys.get(trustRoot as object);
  if (
    trustRoot[TRUST_ROOT] !== true ||
    !publicKeyPem ||
    authorization.operatorKeyId !== trustRoot.operatorKeyId
  ) {
    fail("live authorization is not rooted in the trusted operator key");
  }
  let signature: Buffer;
  try {
    signature = Buffer.from(authorization.operatorSignatureBase64, "base64");
  } catch {
    fail("operator signature is not canonical base64");
  }
  if (
    signature.length === 0 ||
    signature.toString("base64") !== authorization.operatorSignatureBase64 ||
    !verifySignature(
      null,
      Buffer.from(stableJson(authorizationSignedMaterial(authorization)), "utf8"),
      publicKeyPem,
      signature,
    )
  ) {
    fail("operator signature does not authenticate the authorization record");
  }
  if (
    sha256(stableJson(authorizationRecordMaterial(authorization))) !==
    authorization.authorizationRecordSha256
  ) {
    fail("live authorization record hash does not match its content");
  }
  const credential = authorization.dedicatedCredential;
  assertFinite(credential.usageUsd, "credential.usageUsd");
  assertFinite(credential.providerHardLimitUsd, "credential.providerHardLimitUsd", EPSILON);
  assertFinite(credential.providerRemainingUsd, "credential.providerRemainingUsd");
  if (
    credential.sourceEnvName !== "OPENROUTER_S1_API_KEY" ||
    credential.campaignLabel !== campaign.campaignId ||
    !SAFE_ID.test(credential.credentialPublicId) ||
    credential.byokEnabled !== false ||
    credential.accountDataPolicyVerified !== true ||
    credential.exactRouteZdrSupportVerified !== true ||
    credential.secretOrSecretHashPersisted !== false
  ) {
    fail("dedicated key metadata does not satisfy zero-use privacy/cost policy");
  }
  const introspectedCredential = input.credential;
  const dedicatedSecret = credentialSecrets.get(introspectedCredential as object);
  if (
    introspectedCredential[CREDENTIAL] !== true ||
    !dedicatedSecret ||
    introspectedCredential.credentialPublicId !== credential.credentialPublicId ||
    introspectedCredential.metadataArtifactSha256 !== credential.metadataArtifactSha256 ||
    introspectedCredential.metadataFetchedAt !== credential.metadataFetchedAt ||
    introspectedCredential.metadataValidThrough !== credential.metadataValidThrough ||
    Math.abs(introspectedCredential.usageUsd - credential.usageUsd) > EPSILON ||
    Math.abs(introspectedCredential.providerHardLimitUsd - credential.providerHardLimitUsd) >
      EPSILON ||
    Math.abs(introspectedCredential.providerRemainingUsd - credential.providerRemainingUsd) >
      EPSILON
  ) {
    fail("signed key metadata is not bound to the introspected dedicated credential");
  }
  if (authorization.windowOrdinal === 1 && credential.usageUsd !== 0) {
    fail("the first dedicated-key authorization window must prove zero usage");
  }
  const metadataFetchedAt = canonicalUtc(
    credential.metadataFetchedAt,
    "credential.metadataFetchedAt",
  );
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
    fail("dedicated key metadata proof is outside its 15-minute validity window");
  }
  const requiredCap = campaign.globalEnvelope.maxCostUsd;
  assertFinite(requiredCap, "campaign.globalEnvelope.maxCostUsd", EPSILON);
  if (
    Math.abs(credential.providerHardLimitUsd - requiredCap) > EPSILON ||
    credential.usageUsd - requiredCap > EPSILON ||
    Math.abs(
      credential.providerRemainingUsd + credential.usageUsd - requiredCap
    ) > EPSILON
  ) {
    fail("provider hard limit/usage/remaining do not reconcile to the frozen campaign cap");
  }
  const reconciliation = authorization.providerUsageReconciliation;
  const pollStartedAt = canonicalUtc(
    reconciliation.pollStartedAt,
    "providerUsageReconciliation.pollStartedAt",
  );
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
    fail("provider usage reconciliation lacks a bounded completed polling proof");
  }
  assertFinite(reconciliation.localActualCostUsd, "reconciliation.localActualCostUsd");
  assertFinite(reconciliation.localEffectiveCostUsd, "reconciliation.localEffectiveCostUsd");
  const localFinancial = input.store.getBatchFinancialView({
    experimentId: campaign.experimentId,
    phaseId: campaign.phaseId,
    batchId: campaign.batchId,
  });
  const localActualCostUsd = localFinancial?.actualCostUsd ?? 0;
  const localEffectiveCostUsd = localFinancial?.effectiveCostUsd ?? 0;
  if (
    Math.abs(reconciliation.localActualCostUsd - localActualCostUsd) > EPSILON ||
    Math.abs(reconciliation.localEffectiveCostUsd - localEffectiveCostUsd) > EPSILON ||
    Math.abs(credential.usageUsd - localActualCostUsd) > EPSILON ||
    credential.providerRemainingUsd + EPSILON < requiredCap - localActualCostUsd ||
    localEffectiveCostUsd - requiredCap > EPSILON
  ) {
    fail("provider usage/remaining does not reconcile to durable local cost and remainder");
  }
  let rollingPricingAttestation: Readonly<AtlasControllerRollingPricingAttestation>;
  try {
    rollingPricingAttestation = verifyAtlasControllerRollingPricingAttestation(
      authorization.rollingPricingAttestation,
    );
  } catch (error) {
    fail(
      `rolling pricing attestation is invalid (${error instanceof Error ? error.message : "unknown"})`,
    );
  }
  assertRollingPricingWithinFrozenCampaign(campaign, rollingPricingAttestation);
  const rollingProof = deriveAtlasControllerPricingSnapshotProof(
    rollingPricingAttestation.priceSnapshotId,
    rollingPricingAttestation.snapshot,
  );
  const priceFetchedAt = canonicalUtc(rollingProof.fetchedAt, "rollingPriceProof.fetchedAt");
  const priceValidThrough = canonicalUtc(
    rollingPricingAttestation.validThrough,
    "rollingPriceProof.validThrough",
  );
  if (now < priceFetchedAt || now > priceValidThrough) {
    fail("rolling tag-bound pricing proof is not current at execution authorization");
  }
  const validFromMs = Math.max(metadataFetchedAt, priceFetchedAt);
  const expiresAtMs = Math.min(metadataValidThrough, priceValidThrough);
  if (validFromMs > expiresAtMs) {
    fail("credential and pricing validity windows do not overlap");
  }
  input.store.acceptControllerAuthorizationWindow({
    campaignSemanticSha256: campaign.campaignSemanticSha256,
    credentialPublicId: credential.credentialPublicId,
    windowOrdinal: authorization.windowOrdinal,
    previousAuthorizationRecordSha256: authorization.previousAuthorizationRecordSha256,
    authorizationRecordSha256: authorization.authorizationRecordSha256,
    providerUsageUsd: credential.usageUsd,
    providerRemainingUsd: credential.providerRemainingUsd,
    providerHardLimitUsd: credential.providerHardLimitUsd,
  });
  const permit: S1ExecutionPermit = Object.freeze({
    [PERMIT]: true as const,
    permitClass: "PRODUCTION" as const,
    campaignSemanticSha256: campaign.campaignSemanticSha256,
    authorizedAtMs: now,
    validFromMs,
    expiresAtMs,
    windowOrdinal: authorization.windowOrdinal,
    previousAuthorizationRecordSha256: authorization.previousAuthorizationRecordSha256,
    authorizationRecordSha256: authorization.authorizationRecordSha256,
    credentialPublicId: credential.credentialPublicId,
    providerUsageUsd: credential.usageUsd,
    providerRemainingUsd: credential.providerRemainingUsd,
    providerHardLimitUsd: credential.providerHardLimitUsd,
    rollingPricingAttestation,
  });
  permitSecrets.set(permit, dedicatedSecret);
  return permit;
}

/**
 * Production-only authorization entrypoint. The pinned key is intentionally a
 * non-signable placeholder, so this remains fail-closed until a separately
 * sealed live-key amendment replaces it. Test mode can never weaken it.
 */
export function authorizeS1Execution(input: {
  campaign: S1MaterializedCampaign;
  authorization: S1LiveAuthorizationRecord;
  credential: S1DedicatedCredentialCapability;
  store: BudgetStore;
  now?: number;
}): S1ExecutionPermit {
  return authorizeS1ExecutionInternal({
    ...input,
    trustRoot: productionTrustRoot,
  });
}

function assertPermit(
  campaign: S1MaterializedCampaign,
  permit: S1ExecutionPermit,
  now: number,
): void {
  assertFinite(now, "permit validation clock", 1);
  if (
    permit?.[PERMIT] !== true ||
    permit.permitClass !== "PRODUCTION" ||
    permit.campaignSemanticSha256 !== campaign.campaignSemanticSha256 ||
    !Number.isFinite(permit.validFromMs) ||
    !Number.isFinite(permit.expiresAtMs) ||
    now < permit.validFromMs ||
    now > permit.expiresAtMs
  ) {
    fail("a matching, currently valid live execution permit is required");
  }
}

function assertPermitAndDurableAuthority(input: {
  campaign: S1MaterializedCampaign;
  permit: S1ExecutionPermit;
  store: BudgetStore;
  now: number;
  batchMayBeAbsent?: boolean;
}): void {
  assertS1CampaignIntegrity(input.campaign);
  assertPermit(input.campaign, input.permit, input.now);
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
  if (!financial && !input.batchMayBeAbsent) fail("sealed durable batch is absent");
  const actual = financial?.actualCostUsd ?? 0;
  const effective = financial?.effectiveCostUsd ?? 0;
  const cap = input.campaign.globalEnvelope.maxCostUsd;
  if (
    Math.abs(actual - input.permit.providerUsageUsd) > EPSILON ||
    Math.abs(input.permit.providerHardLimitUsd - cap) > EPSILON ||
    Math.abs(input.permit.providerRemainingUsd - (cap - actual)) > EPSILON ||
    effective - cap > EPSILON
  ) {
    fail("permit provider usage/remaining is stale against durable local financial state");
  }
}

/** Pure inspection seam; mutating helpers always validate against Date.now(). */
export function validateS1ExecutionPermitAt(
  campaign: S1MaterializedCampaign,
  permit: S1ExecutionPermit,
  now: number,
): void {
  assertS1CampaignIntegrity(campaign);
  assertPermit(campaign, permit, now);
}

/**
 * Builds a minimal child-process environment from an explicit non-secret
 * runtime allowlist. The production SDK's OPENROUTER_API_KEY is populated
 * exclusively from OPENROUTER_S1_API_KEY. No unknown parent variable crosses
 * the process boundary.
 */
function buildDedicatedOpenRouterChildEnvInternal(
  permit: S1ExecutionPermit,
  env: S1ProcessEnvironment,
): S1ProcessEnvironment {
  if (permit.permitClass !== "PRODUCTION") fail("credential env permit class mismatch");
  const dedicated = permitSecrets.get(permit as object);
  if (!dedicated) {
    fail("permit has no introspected dedicated credential; generic fallback is forbidden");
  }
  const child: S1ProcessEnvironment = {};
  for (const key of SAFE_CHILD_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string") child[key] = value;
  }
  child.OPENROUTER_API_KEY = dedicated;
  child.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
  child.OPENROUTER_GEMINI_REASONING_EFFORT = "none";
  child.OPENROUTER_STANDARD_MODEL = "google/gemini-3.5-flash";
  child.PREMIUM_QGEN_MODEL_ID = "google/gemini-3.1-pro-preview";
  return child;
}

export function buildDedicatedOpenRouterChildEnv(
  permit: S1ExecutionPermit,
  env: S1ProcessEnvironment,
): S1ProcessEnvironment {
  return buildDedicatedOpenRouterChildEnvInternal(permit, env);
}

/** Reserves the single campaign-wide batch that all 180 registries share. */
function reserveS1CampaignBatchInternal(input: {
  campaign: S1MaterializedCampaign;
  permit: S1ExecutionPermit;
  store: BudgetStore;
  now?: number;
}): void {
  assertPermitAndDurableAuthority({
    ...input,
    now: input.now ?? Date.now(),
    batchMayBeAbsent: true,
  });
  const reservation = input.campaign.batchReservation;
  const expectedAssignmentIds = input.campaign.assignments
    .map((assignment) => assignment.assignmentId)
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const receipt = input.store.reserveBatch(
    {
      ...reservation,
      idempotencyKey:
        `reserve:${input.campaign.durableBatchIdentitySha256.slice(0, 32)}`,
      sealedControllerCampaign: {
        campaignSemanticSha256: input.campaign.campaignSemanticSha256,
        durableBatchIdentitySha256: input.campaign.durableBatchIdentitySha256,
        expectedAssignmentIds,
        expectedAssignmentSetSha256: sha256(stableJson(expectedAssignmentIds)),
      },
    },
    { apply: true },
  );
  if (
    receipt.value.allocatedCandidateSlots !== reservation.candidateSlots ||
    receipt.value.maxProviderCalls !== reservation.maxProviderCalls ||
    Math.abs(receipt.value.maxCostUsd - reservation.maxCostUsd) > EPSILON
  ) {
    fail("durable batch differs from the sealed campaign-wide envelope");
  }
}


export function reserveS1CampaignBatch(input: {
  campaign: S1MaterializedCampaign;
  permit: S1ExecutionPermit;
  store: BudgetStore;
}): void {
  reserveS1CampaignBatchInternal(input);
}

function assignmentById(
  campaign: S1MaterializedCampaign,
  assignmentId: string,
): S1MaterializedAssignment {
  const matches = campaign.assignments.filter((row) => row.assignmentId === assignmentId);
  if (matches.length !== 1) fail("assignment is absent or ambiguous in the sealed bundle");
  return matches[0]!;
}

/**
 * Constructs one controller/runtime pair. Each pair has one registry entry,
 * one root transition, one candidate slot, and one physical-call allowance;
 * all pairs still debit the same BudgetStore batch reserved above.
 */
function createS1AssignmentRuntimeInternal(input: {
  campaign: S1MaterializedCampaign;
  permit: S1ExecutionPermit;
  store: BudgetStore;
  assignmentId: string;
  now?: () => number;
}): {
  assignment: S1MaterializedAssignment;
  controller: DurableAtlasResearchController;
  runtime: QuestionGenerationCallsiteAdapter;
} {
  const now = input.now ?? Date.now;
  const executionAuthority = (): void => assertPermitAndDurableAuthority({
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
  const runtime = new QuestionGenerationCallsiteAdapter({
    runtimeId: `s1v6-runtime-${String(assignment.queueOrdinal).padStart(3, "0")}`,
    controller,
    registry: assignment.registry,
    expectedEndpoint: S1_EXACT_ENDPOINT,
    operationId: assignment.operationId,
    assignmentId: assignment.assignmentId,
    assignmentContractId: assignment.assignmentContractId,
    rootEntryId: assignment.rootEntryId,
    childEntryIds: {},
  });
  return { assignment, controller, runtime };
}


export function createS1AssignmentRuntime(input: {
  campaign: S1MaterializedCampaign;
  permit: S1ExecutionPermit;
  store: BudgetStore;
  assignmentId: string;
}): {
  assignment: S1MaterializedAssignment;
  controller: DurableAtlasResearchController;
  runtime: QuestionGenerationCallsiteAdapter;
} {
  return createS1AssignmentRuntimeInternal(input);
}

export function finalizeS1Campaign(input: {
  campaign: S1MaterializedCampaign;
  permit: S1ExecutionPermit;
  store: BudgetStore;
  terminalStatus: "COMPLETE" | "ABORTED_INCOMPLETE";
}): void {
  assertPermitAndDurableAuthority({
    ...input,
    now: Date.now(),
  });
  input.store.finalizeBatch({
    experimentId: input.campaign.experimentId,
    phaseId: input.campaign.phaseId,
    batchId: input.campaign.batchId,
    idempotencyKey: `finalize:${input.campaign.durableBatchIdentitySha256.slice(0, 32)}`,
    sealedTerminalStatus: input.terminalStatus,
  }, { apply: true });
}
