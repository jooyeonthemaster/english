import { createHash } from "node:crypto";

export type PilotPlan = "STANDARD" | "PREMIUM";
export type JsonRecord = Record<string, unknown>;

export interface ProtocolAssignmentV2 {
  ordinal: 1 | 2;
  plan: PilotPlan;
  modelId: string;
  exactWireBodyUtf8Bytes: number;
  maxOutputTokens: 4000;
  emergencyInputUsdPer1M: number;
  emergencyOutputUsdPer1M: number;
  calculatedWorstCaseUsdCap: number;
  v1CapUsd: number;
  v1CapSufficient: false;
}

export interface ConnectivityPilotProtocolV2 extends JsonRecord {
  schemaVersion: "question-quality-v6-connectivity-pilot-protocol-v2";
  artifactId: "campaign-v6-connectivity-pilot-v2";
  status: "OFFLINE_RUNNER_SEALED_EXECUTION_BLOCKED_PENDING_HOSTILE_AUDIT";
  amends: JsonRecord;
  authorityCommitment: {
    authoritySemanticSha256: string;
    originalProtocolV1Sha256: string;
    originalPublicCorpusSha256: string;
    originalRowPublicId: "OCVP-B01";
    originalQuestionType: "BLANK_INFERENCE";
    v1MojibakeSurfaceRejected: true;
    v2UnicodeSurfaceAuthoritative: true;
  };
  exactWireSeal: JsonRecord & {
    publicArtifactSha256: string;
    privateArtifactSha256: string;
  };
  completeProductionInput: JsonRecord & {
    questionType: "BLANK_INFERENCE";
    planItem: {
      subType: "BLANK_INFERENCE";
      count: 1;
      reason: string;
      targetPoints: [];
    };
    schoolType: "고등학교";
    gradeInfo: "2학년";
    difficulty: "INTERMEDIATE";
    profileId: "B0_CURRENT_CONTROL";
    teacherIntentBlock: "";
    analysisContext: "";
    customPrompt: "";
    qualityMode: "strict";
    attemptIndex: 0;
  };
  exactProviderContract: JsonRecord & {
    endpoint: string;
    endpointTag: string;
    provider: JsonRecord;
    reasoning: JsonRecord;
    completionCount: 1;
    strictJsonSchema: true;
    semanticCandidateMaximum: 1;
  };
  pricingAmendment: JsonRecord & {
    serverTokenOverheadUpperBound: number;
    safetyMultiplier: number;
    assignments: ProtocolAssignmentV2[];
    totalCalculatedWorstCaseUsdCap: number;
    v1TotalCapUsd: number;
    v1TotalCapSufficient: false;
    silentUnderReservationAllowed: false;
  };
  freshPricingAndCapabilityProof: JsonRecord & {
    maximumAgeMsAtEveryLease: number;
    publicEndpointSupportedParametersRequired: string[];
  };
  durableBounds: JsonRecord & {
    sharedBatchCandidateOpportunityCap: 2;
    sharedBatchPhysicalFetchCap: 2;
    sharedBatchCostCapUsd: number;
    concurrency: 1;
    serialOrder: ["STANDARD", "PREMIUM"];
    retryAllowed: false;
    repairAllowed: false;
    fallbackAllowed: false;
    replacementAllowed: false;
    topUpAllowed: false;
    timeoutMsByPlan: Record<PilotPlan, number>;
  };
  credentialException: JsonRecord;
  routerMetadataEvidence: JsonRecord;
  privatePersistence: JsonRecord;
  controllerSourceFreeze: {
    schemaVersion: "question-quality-connectivity-pilot-controller-source-freeze-v1";
    files: Array<{ path: string; sha256: string }>;
    closureSha256: string;
  };
  liveIsolationContract: JsonRecord;
  publicResultAllowlist: string[];
  publicResultForbidden: string[];
  authorization: JsonRecord & {
    liveExecutionAuthorized: false;
    hostileAuditPassed: false;
    dispatchCommandPresent: false;
  };
}

export interface PricingSnapshotV2 extends JsonRecord {
  schemaVersion: 2;
  fetchedAt: string;
  source: string;
  routingContract: {
    allowedEndpointTags: ["google-vertex/global"];
    emergencyCeilingScope: "all-active-model-endpoints";
  };
  chargeDimensions: JsonRecord;
  models: Array<{
    id: string;
    canonicalSlug: string;
    endpointRates: Array<{
      provider: string;
      endpointName: string;
      tag: string;
      status: "active" | "inactive";
      contextLength: number;
      promptUsdPerToken: number;
      completionUsdPerToken: number;
      supportedParameters: string[];
      structuredOutputs?: boolean;
      overrides: Array<{
        minPromptTokens: number;
        promptUsdPerToken: number;
        completionUsdPerToken: number;
      }>;
    }>;
  }>;
  snapshotSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(label, "must be an object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(label, "must be plain JSON data");
  }
  return value as JsonRecord;
}

function exactKeys(value: unknown, label: string, keys: readonly string[]): JsonRecord {
  const result = record(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `keys differ; expected ${expected.join(",")}, got ${actual.join(",")}`);
  }
  return result;
}

function keysSubset(
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = [],
): JsonRecord {
  const result = record(value, label);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) fail(label, `unknown key ${key}`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(result, key)) fail(label, `missing key ${key}`);
  }
  return result;
}

function string(value: unknown, label: string, nonEmpty = true): asserts value is string {
  if (typeof value !== "string" || (nonEmpty && !value.trim())) fail(label, "must be a string");
}

function number(value: unknown, label: string, options: { integer?: boolean; min?: number } = {}): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(label, "must be finite");
  if (options.integer && !Number.isSafeInteger(value)) fail(label, "must be a safe integer");
  if (options.min !== undefined && value < options.min) fail(label, `must be >= ${options.min}`);
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): asserts value is T {
  if (value !== expected) fail(label, `must equal ${JSON.stringify(expected)}`);
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(label, "must be an array");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) fail(label, "must not be sparse");
  }
  return value;
}

function strings(value: unknown, label: string, unique = true): string[] {
  const values = array(value, label);
  values.forEach((entry, index) => string(entry, `${label}[${index}]`));
  if (unique && new Set(values).size !== values.length) fail(label, "must be unique");
  return values as string[];
}

function hash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) fail(label, "must be SHA-256 hex");
}

function canonicalUtc(value: unknown, label: string): number {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) fail(label, "must be canonical UTC");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(label, "must be a real canonical UTC instant");
  }
  return parsed;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonRecord)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, stableValue(child)]));
  }
  return value;
}

export function stablePilotJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256Pilot(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function protocolAuthorityMaterial(protocol: ConnectivityPilotProtocolV2): JsonRecord {
  return {
    artifactId: protocol.artifactId,
    amends: protocol.amends,
    originalProtocolV1Sha256: protocol.authorityCommitment.originalProtocolV1Sha256,
    originalPublicCorpusSha256: protocol.authorityCommitment.originalPublicCorpusSha256,
    originalRowPublicId: protocol.authorityCommitment.originalRowPublicId,
    originalQuestionType: protocol.authorityCommitment.originalQuestionType,
    completeProductionInput: protocol.completeProductionInput,
    exactProviderContract: protocol.exactProviderContract,
    assignments: protocol.pricingAmendment.assignments.map((assignment) => ({
      ordinal: assignment.ordinal,
      plan: assignment.plan,
      modelId: assignment.modelId,
      maxOutputTokens: assignment.maxOutputTokens,
    })),
    durableTopology: {
      sharedBatchCandidateOpportunityCap: protocol.durableBounds.sharedBatchCandidateOpportunityCap,
      sharedBatchPhysicalFetchCap: protocol.durableBounds.sharedBatchPhysicalFetchCap,
      serialOrder: protocol.durableBounds.serialOrder,
      retryAllowed: protocol.durableBounds.retryAllowed,
      repairAllowed: protocol.durableBounds.repairAllowed,
      fallbackAllowed: protocol.durableBounds.fallbackAllowed,
      replacementAllowed: protocol.durableBounds.replacementAllowed,
      topUpAllowed: protocol.durableBounds.topUpAllowed,
    },
  };
}

export function protocolAuthoritySha256(protocol: ConnectivityPilotProtocolV2): string {
  return sha256Pilot(stablePilotJson(protocolAuthorityMaterial(protocol)));
}

function validateAmends(value: unknown): void {
  const row = exactKeys(value, "protocol.amends", ["artifactId", "path", "scope", "unchanged"]);
  literal(row.artifactId, "campaign-v6-connectivity-pilot-v1", "protocol.amends.artifactId");
  literal(row.path, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v1/protocol.json", "protocol.amends.path");
  literal(row.scope, "Cost ceilings, complete production input, pricing/capability evidence, durable runner, and privacy output contract only.", "protocol.amends.scope");
  const unchanged = [
    "OCVP-B01 PII-free original source",
    "STANDARD then PREMIUM serial order",
    "B0_CURRENT_CONTROL",
    "INTERMEDIATE",
    "one candidate and one physical fetch maximum per assignment",
    "no retry, repair, fallback, replacement, or top-up",
    "two-row result cannot support a quality or reliability comparison",
  ];
  if (JSON.stringify(row.unchanged) !== JSON.stringify(unchanged)) fail("protocol.amends.unchanged", "must preserve the exact seven v1 commitments");
}

function validateAuthority(value: unknown): void {
  const row = exactKeys(value, "protocol.authorityCommitment", [
    "authoritySemanticSha256", "originalProtocolV1Sha256", "originalPublicCorpusSha256",
    "originalRowPublicId", "originalQuestionType", "v1MojibakeSurfaceRejected",
    "v2UnicodeSurfaceAuthoritative",
  ]);
  hash(row.authoritySemanticSha256, "protocol.authorityCommitment.authoritySemanticSha256");
  hash(row.originalProtocolV1Sha256, "protocol.authorityCommitment.originalProtocolV1Sha256");
  hash(row.originalPublicCorpusSha256, "protocol.authorityCommitment.originalPublicCorpusSha256");
  literal(row.originalRowPublicId, "OCVP-B01", "protocol.authorityCommitment.originalRowPublicId");
  literal(row.originalQuestionType, "BLANK_INFERENCE", "protocol.authorityCommitment.originalQuestionType");
  literal(row.v1MojibakeSurfaceRejected, true, "protocol.authorityCommitment.v1MojibakeSurfaceRejected");
  literal(row.v2UnicodeSurfaceAuthoritative, true, "protocol.authorityCommitment.v2UnicodeSurfaceAuthoritative");
}

function validateExactWireSeal(value: unknown): void {
  const row = exactKeys(value, "protocol.exactWireSeal", [
    "publicArtifactPath", "publicArtifactSha256", "privateArtifactPath", "privateArtifactSha256",
    "privateArtifactGitIgnored", "productionModulesImportedAfterNetworkDenyGuard",
    "locallyInterceptedFetches", "externalNetworkCalls", "providerCalls", "modelCalls",
    "apiCandidatesConsumed",
  ]);
  literal(row.publicArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/offline-exact-wire-seal-v2.json", "protocol.exactWireSeal.publicArtifactPath");
  literal(row.privateArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/private/exact-wire-v2.private.json", "protocol.exactWireSeal.privateArtifactPath");
  hash(row.publicArtifactSha256, "protocol.exactWireSeal.publicArtifactSha256");
  hash(row.privateArtifactSha256, "protocol.exactWireSeal.privateArtifactSha256");
  literal(row.privateArtifactGitIgnored, true, "protocol.exactWireSeal.privateArtifactGitIgnored");
  literal(row.productionModulesImportedAfterNetworkDenyGuard, true, "protocol.exactWireSeal.productionModulesImportedAfterNetworkDenyGuard");
  literal(row.locallyInterceptedFetches, 2, "protocol.exactWireSeal.locallyInterceptedFetches");
  for (const key of ["externalNetworkCalls", "providerCalls", "modelCalls", "apiCandidatesConsumed"] as const) {
    literal(row[key], 0, `protocol.exactWireSeal.${key}`);
  }
}

function validateProductionInput(value: unknown): void {
  const row = exactKeys(value, "protocol.completeProductionInput", [
    "questionType", "planItem", "schoolType", "gradeInfo", "difficulty", "profileId",
    "teacherIntentBlock", "analysisContext", "customPrompt", "qualityMode", "attemptIndex",
    "typeSettingsPresent", "diversityPresent", "passageSource",
  ]);
  literal(row.questionType, "BLANK_INFERENCE", "protocol.completeProductionInput.questionType");
  const plan = exactKeys(row.planItem, "protocol.completeProductionInput.planItem", ["subType", "count", "reason", "targetPoints"]);
  literal(plan.subType, "BLANK_INFERENCE", "protocol.completeProductionInput.planItem.subType");
  literal(plan.count, 1, "protocol.completeProductionInput.planItem.count");
  string(plan.reason, "protocol.completeProductionInput.planItem.reason");
  if (array(plan.targetPoints, "protocol.completeProductionInput.planItem.targetPoints").length !== 0) fail("protocol.completeProductionInput.planItem.targetPoints", "must be empty");
  literal(row.schoolType, "고등학교", "protocol.completeProductionInput.schoolType");
  literal(row.gradeInfo, "2학년", "protocol.completeProductionInput.gradeInfo");
  literal(row.difficulty, "INTERMEDIATE", "protocol.completeProductionInput.difficulty");
  literal(row.profileId, "B0_CURRENT_CONTROL", "protocol.completeProductionInput.profileId");
  for (const key of ["teacherIntentBlock", "analysisContext", "customPrompt"] as const) literal(row[key], "", `protocol.completeProductionInput.${key}`);
  literal(row.qualityMode, "strict", "protocol.completeProductionInput.qualityMode");
  literal(row.attemptIndex, 0, "protocol.completeProductionInput.attemptIndex");
  literal(row.typeSettingsPresent, false, "protocol.completeProductionInput.typeSettingsPresent");
  literal(row.diversityPresent, false, "protocol.completeProductionInput.diversityPresent");
  literal(row.passageSource, "PRIVATE_COMMITMENT_CHECKED_OCVP_B01", "protocol.completeProductionInput.passageSource");
}

function validateProviderContract(value: unknown): void {
  const row = exactKeys(value, "protocol.exactProviderContract", [
    "endpoint", "endpointTag", "provider", "reasoning", "completionCount", "strictJsonSchema",
    "semanticCandidateMaximum",
  ]);
  literal(row.endpoint, "https://openrouter.ai/api/v1/chat/completions", "protocol.exactProviderContract.endpoint");
  literal(row.endpointTag, "google-vertex/global", "protocol.exactProviderContract.endpointTag");
  const provider = exactKeys(row.provider, "protocol.exactProviderContract.provider", ["order", "only", "allow_fallbacks", "require_parameters", "data_collection", "zdr"]);
  if (JSON.stringify(provider.order) !== JSON.stringify(["google-vertex/global"]) || JSON.stringify(provider.only) !== JSON.stringify(["google-vertex/global"])) fail("protocol.exactProviderContract.provider", "must pin the exact tag once");
  literal(provider.allow_fallbacks, false, "protocol.exactProviderContract.provider.allow_fallbacks");
  literal(provider.require_parameters, true, "protocol.exactProviderContract.provider.require_parameters");
  literal(provider.data_collection, "deny", "protocol.exactProviderContract.provider.data_collection");
  literal(provider.zdr, true, "protocol.exactProviderContract.provider.zdr");
  const reasoning = exactKeys(row.reasoning, "protocol.exactProviderContract.reasoning", ["enabled", "effort", "exclude"]);
  literal(reasoning.enabled, false, "protocol.exactProviderContract.reasoning.enabled");
  literal(reasoning.effort, "none", "protocol.exactProviderContract.reasoning.effort");
  literal(reasoning.exclude, true, "protocol.exactProviderContract.reasoning.exclude");
  literal(row.completionCount, 1, "protocol.exactProviderContract.completionCount");
  literal(row.strictJsonSchema, true, "protocol.exactProviderContract.strictJsonSchema");
  literal(row.semanticCandidateMaximum, 1, "protocol.exactProviderContract.semanticCandidateMaximum");
}

function validatePricingAmendment(value: unknown): ProtocolAssignmentV2[] {
  const row = exactKeys(value, "protocol.pricingAmendment", [
    "amendmentRequired", "reason", "formula", "inputAccountingRule", "serverTokenOverheadUpperBound",
    "safetyMultiplier", "currency", "rateCeilingScope", "assignments",
    "totalCalculatedWorstCaseUsdCap", "v1TotalCapUsd", "v1TotalCapSufficient",
    "silentUnderReservationAllowed", "futureFreshProofAboveAnyFrozenRateCeiling",
  ]);
  literal(row.amendmentRequired, true, "protocol.pricingAmendment.amendmentRequired");
  string(row.reason, "protocol.pricingAmendment.reason");
  string(row.formula, "protocol.pricingAmendment.formula");
  string(row.inputAccountingRule, "protocol.pricingAmendment.inputAccountingRule");
  number(row.serverTokenOverheadUpperBound, "protocol.pricingAmendment.serverTokenOverheadUpperBound", { integer: true, min: 1 });
  number(row.safetyMultiplier, "protocol.pricingAmendment.safetyMultiplier", { min: 1 });
  literal(row.currency, "USD", "protocol.pricingAmendment.currency");
  literal(row.rateCeilingScope, "ALL_ACTIVE_MODEL_ENDPOINTS_AND_OVERRIDES", "protocol.pricingAmendment.rateCeilingScope");
  const rows = array(row.assignments, "protocol.pricingAmendment.assignments");
  if (rows.length !== 2) fail("protocol.pricingAmendment.assignments", "must have two rows");
  const assignments = rows.map((value, index) => {
    const assignment = exactKeys(value, `protocol.pricingAmendment.assignments[${index}]`, [
      "ordinal", "plan", "modelId", "exactWireBodyUtf8Bytes", "maxOutputTokens",
      "emergencyInputUsdPer1M", "emergencyOutputUsdPer1M", "calculatedWorstCaseUsdCap",
      "v1CapUsd", "v1CapSufficient",
    ]);
    literal(assignment.ordinal, index + 1, `protocol.pricingAmendment.assignments[${index}].ordinal`);
    literal(assignment.plan, index === 0 ? "STANDARD" : "PREMIUM", `protocol.pricingAmendment.assignments[${index}].plan`);
    literal(assignment.modelId, index === 0 ? "google/gemini-3.5-flash" : "google/gemini-3.1-pro-preview", `protocol.pricingAmendment.assignments[${index}].modelId`);
    number(assignment.exactWireBodyUtf8Bytes, `protocol.pricingAmendment.assignments[${index}].exactWireBodyUtf8Bytes`, { integer: true, min: 1 });
    literal(assignment.maxOutputTokens, 4000, `protocol.pricingAmendment.assignments[${index}].maxOutputTokens`);
    for (const key of ["emergencyInputUsdPer1M", "emergencyOutputUsdPer1M", "calculatedWorstCaseUsdCap", "v1CapUsd"] as const) number(assignment[key], `protocol.pricingAmendment.assignments[${index}].${key}`, { min: Number.MIN_VALUE });
    literal(assignment.v1CapSufficient, false, `protocol.pricingAmendment.assignments[${index}].v1CapSufficient`);
    return assignment as unknown as ProtocolAssignmentV2;
  });
  number(row.totalCalculatedWorstCaseUsdCap, "protocol.pricingAmendment.totalCalculatedWorstCaseUsdCap", { min: Number.MIN_VALUE });
  number(row.v1TotalCapUsd, "protocol.pricingAmendment.v1TotalCapUsd", { min: Number.MIN_VALUE });
  literal(row.v1TotalCapSufficient, false, "protocol.pricingAmendment.v1TotalCapSufficient");
  literal(row.silentUnderReservationAllowed, false, "protocol.pricingAmendment.silentUnderReservationAllowed");
  literal(row.futureFreshProofAboveAnyFrozenRateCeiling, "BLOCK_AND_REQUIRE_NEW_PROTOCOL_VERSION", "protocol.pricingAmendment.futureFreshProofAboveAnyFrozenRateCeiling");
  return assignments;
}

function validateFreshProof(value: unknown): void {
  const row = exactKeys(value, "protocol.freshPricingAndCapabilityProof", [
    "schemaVersionRequired", "maximumAgeMsAtEveryLease", "exactEndpointTagRequired",
    "exactTagCardinalityPerModel", "allActiveEmergencyCeilingRequired",
    "publicEndpointSupportedParametersRequired", "structuredOutputsFlagRecordedWhenPresent",
    "capabilityClaimScope", "routerRequestEvidenceSeparatelyRequires",
    "actualParameterAcceptanceClaim", "priceAndCapabilityClaimsMustRemainSeparate",
    "canonicalServedModelRequired", "rollingAttestationRequiredAtEveryLease",
  ]);
  literal(row.schemaVersionRequired, 2, "protocol.freshPricingAndCapabilityProof.schemaVersionRequired");
  literal(row.maximumAgeMsAtEveryLease, 900000, "protocol.freshPricingAndCapabilityProof.maximumAgeMsAtEveryLease");
  literal(row.exactEndpointTagRequired, "google-vertex/global", "protocol.freshPricingAndCapabilityProof.exactEndpointTagRequired");
  literal(row.exactTagCardinalityPerModel, 1, "protocol.freshPricingAndCapabilityProof.exactTagCardinalityPerModel");
  literal(row.allActiveEmergencyCeilingRequired, true, "protocol.freshPricingAndCapabilityProof.allActiveEmergencyCeilingRequired");
  const required = strings(row.publicEndpointSupportedParametersRequired, "protocol.freshPricingAndCapabilityProof.publicEndpointSupportedParametersRequired");
  if (JSON.stringify([...required].sort()) !== JSON.stringify(["max_tokens", "response_format"])) fail("protocol.freshPricingAndCapabilityProof.publicEndpointSupportedParametersRequired", "must require max_tokens and response_format");
  literal(row.structuredOutputsFlagRecordedWhenPresent, true, "protocol.freshPricingAndCapabilityProof.structuredOutputsFlagRecordedWhenPresent");
  literal(row.capabilityClaimScope, "PUBLIC_ENDPOINT_DECLARATION_ONLY", "protocol.freshPricingAndCapabilityProof.capabilityClaimScope");
  const routerRequirements = [
    "provider.only", "provider.order", "provider.allow_fallbacks=false",
    "provider.require_parameters=true", "provider.data_collection=deny", "provider.zdr=true",
  ];
  if (JSON.stringify(row.routerRequestEvidenceSeparatelyRequires) !== JSON.stringify(routerRequirements)) fail("protocol.freshPricingAndCapabilityProof.routerRequestEvidenceSeparatelyRequires", "must preserve the exact route proof list");
  literal(row.actualParameterAcceptanceClaim, "ONLY_AFTER_A_SUCCESSFUL_LIVE_RESPONSE_WITH_VALID_ROUTER_METADATA_AND_STRUCTURED_RESPONSE", "protocol.freshPricingAndCapabilityProof.actualParameterAcceptanceClaim");
  literal(row.priceAndCapabilityClaimsMustRemainSeparate, true, "protocol.freshPricingAndCapabilityProof.priceAndCapabilityClaimsMustRemainSeparate");
  literal(row.canonicalServedModelRequired, true, "protocol.freshPricingAndCapabilityProof.canonicalServedModelRequired");
  literal(row.rollingAttestationRequiredAtEveryLease, true, "protocol.freshPricingAndCapabilityProof.rollingAttestationRequiredAtEveryLease");
}

function validateDurableBounds(value: unknown): void {
  const row = exactKeys(value, "protocol.durableBounds", [
    "sharedBatchCandidateOpportunityCap", "sharedBatchPhysicalFetchCap", "sharedBatchCostCapUsd",
    "perAssignmentCandidateOpportunityCap", "perAssignmentPhysicalFetchCap", "perAssignmentOuterAttemptCap",
    "perAssignmentSdkRetryCap", "concurrency", "serialOrder", "candidateDebitedBeforeNetworkSend",
    "retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed",
    "timeoutMsByPlan", "ambiguousPostSendOutcomeConsumesReservationAndCannotReplay",
  ]);
  for (const key of ["sharedBatchCandidateOpportunityCap", "sharedBatchPhysicalFetchCap"] as const) literal(row[key], 2, `protocol.durableBounds.${key}`);
  number(row.sharedBatchCostCapUsd, "protocol.durableBounds.sharedBatchCostCapUsd", { min: Number.MIN_VALUE });
  for (const key of ["perAssignmentCandidateOpportunityCap", "perAssignmentPhysicalFetchCap", "perAssignmentOuterAttemptCap"] as const) literal(row[key], 1, `protocol.durableBounds.${key}`);
  literal(row.perAssignmentSdkRetryCap, 0, "protocol.durableBounds.perAssignmentSdkRetryCap");
  literal(row.concurrency, 1, "protocol.durableBounds.concurrency");
  if (JSON.stringify(row.serialOrder) !== JSON.stringify(["STANDARD", "PREMIUM"])) fail("protocol.durableBounds.serialOrder", "must be exact");
  literal(row.candidateDebitedBeforeNetworkSend, true, "protocol.durableBounds.candidateDebitedBeforeNetworkSend");
  for (const key of ["retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed"] as const) literal(row[key], false, `protocol.durableBounds.${key}`);
  const timeout = exactKeys(row.timeoutMsByPlan, "protocol.durableBounds.timeoutMsByPlan", ["STANDARD", "PREMIUM"]);
  literal(timeout.STANDARD, 60000, "protocol.durableBounds.timeoutMsByPlan.STANDARD");
  literal(timeout.PREMIUM, 180000, "protocol.durableBounds.timeoutMsByPlan.PREMIUM");
  literal(row.ambiguousPostSendOutcomeConsumesReservationAndCannotReplay, true, "protocol.durableBounds.ambiguousPostSendOutcomeConsumesReservationAndCannotReplay");
}

function validateCredential(value: unknown): void {
  const row = exactKeys(value, "protocol.credentialException", [
    "sourceEnvironmentName", "existingGenericCredentialAllowed", "scope", "inheritedByS1",
    "alternateCredentialSourcesAllowed", "credentialValueMayBePrinted", "credentialValueMayBeHashed",
    "credentialValueMayBePersisted", "childEnvironmentIsMinimalAllowlist",
  ]);
  literal(row.sourceEnvironmentName, "OPENROUTER_API_KEY", "protocol.credentialException.sourceEnvironmentName");
  literal(row.existingGenericCredentialAllowed, true, "protocol.credentialException.existingGenericCredentialAllowed");
  literal(row.scope, "THIS_TWO_CALL_PII_FREE_CONNECTIVITY_PILOT_ONLY", "protocol.credentialException.scope");
  for (const key of ["inheritedByS1", "alternateCredentialSourcesAllowed", "credentialValueMayBePrinted", "credentialValueMayBeHashed", "credentialValueMayBePersisted"] as const) literal(row[key], false, `protocol.credentialException.${key}`);
  literal(row.childEnvironmentIsMinimalAllowlist, true, "protocol.credentialException.childEnvironmentIsMinimalAllowlist");
}

function validateRouterMetadata(value: unknown): void {
  const row = exactKeys(value, "protocol.routerMetadataEvidence", [
    "requiredForEverySuccessfulResponse", "strategy", "mandatoryAttempt", "isByok",
    "selectedEndpointCount", "selectedModelMustEqualRequestedModel",
    "topLevelServedModelMayBeExactOrCanonicalDatedSlug", "attemptsArray",
    "cacheHitWithoutMetadata", "unknownAdditiveMetadataAllowed",
  ]);
  literal(row.requiredForEverySuccessfulResponse, true, "protocol.routerMetadataEvidence.requiredForEverySuccessfulResponse");
  literal(row.strategy, "direct", "protocol.routerMetadataEvidence.strategy");
  literal(row.mandatoryAttempt, 1, "protocol.routerMetadataEvidence.mandatoryAttempt");
  literal(row.isByok, false, "protocol.routerMetadataEvidence.isByok");
  literal(row.selectedEndpointCount, 1, "protocol.routerMetadataEvidence.selectedEndpointCount");
  literal(row.selectedModelMustEqualRequestedModel, true, "protocol.routerMetadataEvidence.selectedModelMustEqualRequestedModel");
  literal(row.topLevelServedModelMayBeExactOrCanonicalDatedSlug, true, "protocol.routerMetadataEvidence.topLevelServedModelMayBeExactOrCanonicalDatedSlug");
  literal(row.attemptsArray, "OPTIONAL_BUT_IF_PRESENT_EXACTLY_ONE_SUCCESS_WITH_SAME_PROVIDER_AND_REQUESTED_MODEL", "protocol.routerMetadataEvidence.attemptsArray");
  literal(row.cacheHitWithoutMetadata, "QUARANTINE_NO_REPLAY", "protocol.routerMetadataEvidence.cacheHitWithoutMetadata");
  literal(row.unknownAdditiveMetadataAllowed, true, "protocol.routerMetadataEvidence.unknownAdditiveMetadataAllowed");
}

function validatePersistence(value: unknown): void {
  const row = exactKeys(value, "protocol.privatePersistence", [
    "root", "gitIgnored", "rawRequestAndResponsePrivate", "providerGenerationIdPrivate",
    "durableSqlitePrivate", "executionDirectoryMustBeNewAndEmpty", "existingDatabaseMayBeReused",
  ]);
  literal(row.root, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/private", "protocol.privatePersistence.root");
  for (const key of ["gitIgnored", "rawRequestAndResponsePrivate", "providerGenerationIdPrivate", "durableSqlitePrivate", "executionDirectoryMustBeNewAndEmpty"] as const) literal(row[key], true, `protocol.privatePersistence.${key}`);
  literal(row.existingDatabaseMayBeReused, false, "protocol.privatePersistence.existingDatabaseMayBeReused");
}

function validateControllerFreeze(value: unknown): void {
  const row = exactKeys(value, "protocol.controllerSourceFreeze", ["schemaVersion", "files", "closureSha256"]);
  literal(row.schemaVersion, "question-quality-connectivity-pilot-controller-source-freeze-v1", "protocol.controllerSourceFreeze.schemaVersion");
  const files = array(row.files, "protocol.controllerSourceFreeze.files");
  if (files.length < 4) fail("protocol.controllerSourceFreeze.files", "must bind controller, ledger, parser, and S1 manifest");
  const seen = new Set<string>();
  for (const [index, value] of files.entries()) {
    const file = exactKeys(value, `protocol.controllerSourceFreeze.files[${index}]`, ["path", "sha256"]);
    string(file.path, `protocol.controllerSourceFreeze.files[${index}].path`);
    hash(file.sha256, `protocol.controllerSourceFreeze.files[${index}].sha256`);
    if (seen.has(file.path as string)) fail("protocol.controllerSourceFreeze.files", "duplicate path");
    seen.add(file.path as string);
  }
  hash(row.closureSha256, "protocol.controllerSourceFreeze.closureSha256");
  if (sha256Pilot(stablePilotJson(files)) !== row.closureSha256) fail("protocol.controllerSourceFreeze.closureSha256", "does not bind files");
}

function validateLiveIsolation(value: unknown): void {
  const row = exactKeys(value, "protocol.liveIsolationContract", [
    "launcherSeparateFile", "isolatedChildRequired", "childCwdUnderPrivateNewExecutionDirectory",
    "inheritedEnvironmentAllowlist", "forbiddenEnvironmentNames", "forbiddenRepositoryEnvFiles",
    "forbiddenLoaders", "credentialReadLocation", "offlineTransportCannotMintLiveCapability",
    "currentLauncherMustFailClosed",
  ]);
  literal(row.launcherSeparateFile, true, "protocol.liveIsolationContract.launcherSeparateFile");
  literal(row.isolatedChildRequired, true, "protocol.liveIsolationContract.isolatedChildRequired");
  literal(row.childCwdUnderPrivateNewExecutionDirectory, true, "protocol.liveIsolationContract.childCwdUnderPrivateNewExecutionDirectory");
  const inheritedAllowlist = [
    "SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC", "OPENROUTER_API_KEY",
  ];
  if (JSON.stringify(row.inheritedEnvironmentAllowlist) !== JSON.stringify(inheritedAllowlist)) fail("protocol.liveIsolationContract.inheritedEnvironmentAllowlist", "must be the exact minimal allowlist");
  const forbidden = strings(row.forbiddenEnvironmentNames, "protocol.liveIsolationContract.forbiddenEnvironmentNames");
  if (JSON.stringify(forbidden) !== JSON.stringify(["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"])) fail("protocol.liveIsolationContract.forbiddenEnvironmentNames", "must be exact");
  if (JSON.stringify(row.forbiddenRepositoryEnvFiles) !== JSON.stringify([".env", ".env.local", ".env.development", ".env.production"])) fail("protocol.liveIsolationContract.forbiddenRepositoryEnvFiles", "must be exact");
  if (JSON.stringify(row.forbiddenLoaders) !== JSON.stringify(["dotenv", "loadEnvConfig", "@next/env"])) fail("protocol.liveIsolationContract.forbiddenLoaders", "must be exact");
  literal(row.credentialReadLocation, "ISOLATED_LAUNCHER_CAPABILITY_TO_CHILD_PROCESS_ENV_ONLY", "protocol.liveIsolationContract.credentialReadLocation");
  literal(row.offlineTransportCannotMintLiveCapability, true, "protocol.liveIsolationContract.offlineTransportCannotMintLiveCapability");
  literal(row.currentLauncherMustFailClosed, true, "protocol.liveIsolationContract.currentLauncherMustFailClosed");
}

function validateAuthorization(value: unknown): void {
  const row = exactKeys(value, "protocol.authorization", [
    "liveExecutionAuthorized", "hostileAuditPassed", "dispatchCommandPresent", "networkCallsDuringSeal",
    "modelCallsDuringSeal", "providerCallsDuringSeal", "apiCandidatesConsumedDuringSeal",
  ]);
  for (const key of ["liveExecutionAuthorized", "hostileAuditPassed", "dispatchCommandPresent"] as const) literal(row[key], false, `protocol.authorization.${key}`);
  for (const key of ["networkCallsDuringSeal", "modelCallsDuringSeal", "providerCallsDuringSeal", "apiCandidatesConsumedDuringSeal"] as const) literal(row[key], 0, `protocol.authorization.${key}`);
}

export function validateConnectivityPilotProtocolV2(value: unknown): ConnectivityPilotProtocolV2 {
  const root = exactKeys(value, "protocol", [
    "schemaVersion", "artifactId", "status", "amends", "authorityCommitment", "exactWireSeal",
    "completeProductionInput", "exactProviderContract", "pricingAmendment",
    "freshPricingAndCapabilityProof", "durableBounds", "credentialException",
    "routerMetadataEvidence", "privatePersistence", "controllerSourceFreeze",
    "liveIsolationContract", "publicResultAllowlist", "publicResultForbidden", "authorization",
  ]);
  literal(root.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v2", "protocol.schemaVersion");
  literal(root.artifactId, "campaign-v6-connectivity-pilot-v2", "protocol.artifactId");
  literal(root.status, "OFFLINE_RUNNER_SEALED_EXECUTION_BLOCKED_PENDING_HOSTILE_AUDIT", "protocol.status");
  validateAmends(root.amends);
  validateAuthority(root.authorityCommitment);
  validateExactWireSeal(root.exactWireSeal);
  validateProductionInput(root.completeProductionInput);
  validateProviderContract(root.exactProviderContract);
  validatePricingAmendment(root.pricingAmendment);
  validateFreshProof(root.freshPricingAndCapabilityProof);
  validateDurableBounds(root.durableBounds);
  validateCredential(root.credentialException);
  validateRouterMetadata(root.routerMetadataEvidence);
  validatePersistence(root.privatePersistence);
  validateControllerFreeze(root.controllerSourceFreeze);
  validateLiveIsolation(root.liveIsolationContract);
  const allowlist = strings(root.publicResultAllowlist, "protocol.publicResultAllowlist");
  const expectedAllowlist = [
    "schemaVersion", "status", "startedAssignments", "settledAssignments", "successfulAssignments",
    "candidateOpportunitiesConsumed", "physicalFetches", "actualCostUsd", "effectiveCostUsd",
    "usageEvidenceComplete", "routeEvidenceComplete", "parserEvidenceComplete", "batchBreached",
    "auditHeadHash", "executionArtifactSha256",
  ].sort();
  if (JSON.stringify([...allowlist].sort()) !== JSON.stringify(expectedAllowlist)) fail("protocol.publicResultAllowlist", "differs from the exhaustive public result schema");
  const expectedForbidden = [
    "prompt", "passage", "question", "options", "answer", "explanation", "response body",
    "raw metadata", "provider generation id", "credential value", "credential hash",
  ];
  if (JSON.stringify(root.publicResultForbidden) !== JSON.stringify(expectedForbidden)) fail("protocol.publicResultForbidden", "differs from the exhaustive private-data list");
  validateAuthorization(root.authorization);
  const protocol = root as unknown as ConnectivityPilotProtocolV2;
  if (protocolAuthoritySha256(protocol) !== protocol.authorityCommitment.authoritySemanticSha256) {
    fail("protocol.authorityCommitment.authoritySemanticSha256", "does not bind the v2 authority surface");
  }
  return protocol;
}

export function validatePricingSnapshotV2(value: unknown): PricingSnapshotV2 {
  const root = exactKeys(value, "pricingSnapshot", [
    "schemaVersion", "fetchedAt", "source", "routingContract", "chargeDimensions", "models", "snapshotSha256",
  ]);
  literal(root.schemaVersion, 2, "pricingSnapshot.schemaVersion");
  canonicalUtc(root.fetchedAt, "pricingSnapshot.fetchedAt");
  string(root.source, "pricingSnapshot.source");
  const routing = exactKeys(root.routingContract, "pricingSnapshot.routingContract", ["allowedEndpointTags", "emergencyCeilingScope"]);
  if (JSON.stringify(routing.allowedEndpointTags) !== JSON.stringify(["google-vertex/global"])) fail("pricingSnapshot.routingContract.allowedEndpointTags", "must contain the exact tag only");
  literal(routing.emergencyCeilingScope, "all-active-model-endpoints", "pricingSnapshot.routingContract.emergencyCeilingScope");
  const dimensions = exactKeys(root.chargeDimensions, "pricingSnapshot.chargeDimensions", [
    "textInputTokens", "textOutputTokens", "cachedInputTokens", "reasoningTokens", "imageTokens",
    "webSearch", "fixedRequestFees", "unknownDimensions",
  ]);
  const expectedDimensions = {
    textInputTokens: "MODELED_BY_PROMPT_RATE", textOutputTokens: "MODELED_BY_COMPLETION_RATE",
    cachedInputTokens: "INAPPLICABLE_NO_CACHE", reasoningTokens: "INAPPLICABLE_REASONING_DISABLED",
    imageTokens: "INAPPLICABLE_TEXT_ONLY", webSearch: "INAPPLICABLE_NO_WEB_PLUGIN",
    fixedRequestFees: "NONE", unknownDimensions: "REJECT",
  };
  if (stablePilotJson(dimensions) !== stablePilotJson(expectedDimensions)) fail("pricingSnapshot.chargeDimensions", "unsupported charge dimension");
  const models = array(root.models, "pricingSnapshot.models");
  if (models.length !== 2) fail("pricingSnapshot.models", "must contain exactly the two pilot models");
  const expectedModels = ["google/gemini-3.5-flash", "google/gemini-3.1-pro-preview"];
  for (const [modelIndex, value] of models.entries()) {
    const model = exactKeys(value, `pricingSnapshot.models[${modelIndex}]`, ["id", "canonicalSlug", "endpointRates"]);
    literal(model.id, expectedModels[modelIndex]!, `pricingSnapshot.models[${modelIndex}].id`);
    string(model.canonicalSlug, `pricingSnapshot.models[${modelIndex}].canonicalSlug`);
    const canonicalPrefix = `${model.id}-`;
    if (
      !(model.canonicalSlug as string).startsWith(canonicalPrefix) ||
      !/^\d{8}$/u.test((model.canonicalSlug as string).slice(canonicalPrefix.length))
    ) fail(`pricingSnapshot.models[${modelIndex}].canonicalSlug`, "must be a canonical YYYYMMDD slug for the requested model");
    const endpoints = array(model.endpointRates, `pricingSnapshot.models[${modelIndex}].endpointRates`);
    if (endpoints.length === 0) fail(`pricingSnapshot.models[${modelIndex}].endpointRates`, "must not be empty");
    const tags = new Set<string>();
    let exactActive = 0;
    for (const [endpointIndex, endpointValue] of endpoints.entries()) {
      const endpoint = keysSubset(endpointValue, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}]`, [
        "provider", "endpointName", "tag", "status", "contextLength", "promptUsdPerToken",
        "completionUsdPerToken", "supportedParameters", "overrides",
      ], ["structuredOutputs"]);
      for (const key of ["provider", "endpointName", "tag"] as const) string(endpoint[key], `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].${key}`);
      if (tags.has(endpoint.tag as string)) fail(`pricingSnapshot.models[${modelIndex}].endpointRates`, "tags must be unique");
      tags.add(endpoint.tag as string);
      if (endpoint.status !== "active" && endpoint.status !== "inactive") fail(`pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].status`, "invalid status");
      number(endpoint.contextLength, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].contextLength`, { integer: true, min: 1 });
      number(endpoint.promptUsdPerToken, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].promptUsdPerToken`, { min: Number.MIN_VALUE });
      number(endpoint.completionUsdPerToken, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].completionUsdPerToken`, { min: Number.MIN_VALUE });
      const supported = strings(endpoint.supportedParameters, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].supportedParameters`);
      if (endpoint.structuredOutputs !== undefined && typeof endpoint.structuredOutputs !== "boolean") fail(`pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].structuredOutputs`, "must be boolean");
      if (endpoint.tag === "google-vertex/global" && endpoint.status === "active") {
        exactActive += 1;
        literal(endpoint.provider, "Google", `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].provider`);
        for (const required of ["response_format", "max_tokens"]) if (!supported.includes(required)) fail(`pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].supportedParameters`, `missing ${required}`);
      }
      for (const [overrideIndex, overrideValue] of array(endpoint.overrides, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].overrides`).entries()) {
        const override = exactKeys(overrideValue, `pricingSnapshot.models[${modelIndex}].endpointRates[${endpointIndex}].overrides[${overrideIndex}]`, ["minPromptTokens", "promptUsdPerToken", "completionUsdPerToken"]);
        number(override.minPromptTokens, "pricing override minPromptTokens", { integer: true, min: 1 });
        number(override.promptUsdPerToken, "pricing override promptUsdPerToken", { min: Number.MIN_VALUE });
        number(override.completionUsdPerToken, "pricing override completionUsdPerToken", { min: Number.MIN_VALUE });
      }
    }
    if (exactActive !== 1) fail(`pricingSnapshot.models[${modelIndex}]`, "requires exactly one active exact-tag endpoint");
  }
  hash(root.snapshotSha256, "pricingSnapshot.snapshotSha256");
  const content = { ...root };
  delete content.snapshotSha256;
  if (sha256Pilot(JSON.stringify(content)) !== root.snapshotSha256) fail("pricingSnapshot.snapshotSha256", "does not bind exact JSON content/order");
  return root as unknown as PricingSnapshotV2;
}

export function validatePilotPublicResultShape(value: unknown): void {
  const row = exactKeys(value, "publicResult", [
    "schemaVersion", "status", "startedAssignments", "settledAssignments", "successfulAssignments",
    "candidateOpportunitiesConsumed", "physicalFetches", "actualCostUsd", "effectiveCostUsd",
    "usageEvidenceComplete", "routeEvidenceComplete", "parserEvidenceComplete", "batchBreached",
    "auditHeadHash", "executionArtifactSha256",
  ]);
  literal(row.schemaVersion, "question-quality-v6-connectivity-pilot-public-result-v2", "publicResult.schemaVersion");
  if (row.status !== "PARTIAL_OR_BLOCKED" && row.status !== "COMPLETED_BOUNDED_CONNECTIVITY_PILOT") fail("publicResult.status", "invalid");
  for (const key of ["startedAssignments", "settledAssignments", "successfulAssignments", "candidateOpportunitiesConsumed", "physicalFetches"] as const) number(row[key], `publicResult.${key}`, { integer: true, min: 0 });
  for (const key of ["actualCostUsd", "effectiveCostUsd"] as const) number(row[key], `publicResult.${key}`, { min: 0 });
  for (const key of ["usageEvidenceComplete", "routeEvidenceComplete", "parserEvidenceComplete", "batchBreached"] as const) if (typeof row[key] !== "boolean") fail(`publicResult.${key}`, "must be boolean");
  hash(row.auditHeadHash, "publicResult.auditHeadHash");
  hash(row.executionArtifactSha256, "publicResult.executionArtifactSha256");
  if (
    (row.startedAssignments as number) > 2 ||
    (row.settledAssignments as number) > (row.startedAssignments as number) ||
    (row.successfulAssignments as number) > (row.settledAssignments as number) ||
    (row.candidateOpportunitiesConsumed as number) > 2 ||
    (row.physicalFetches as number) > 2 ||
    (row.actualCostUsd as number) > (row.effectiveCostUsd as number)
  ) fail("publicResult", "violates the two-opportunity monotonic bounds");
  const completedBarrier =
    row.startedAssignments === 2 &&
    row.settledAssignments === 2 &&
    row.successfulAssignments === 2 &&
    row.candidateOpportunitiesConsumed === 2 &&
    row.physicalFetches === 2 &&
    row.usageEvidenceComplete === true &&
    row.routeEvidenceComplete === true &&
    row.parserEvidenceComplete === true &&
    row.batchBreached === false;
  if ((row.status === "COMPLETED_BOUNDED_CONNECTIVITY_PILOT") !== completedBarrier) {
    fail("publicResult.status", "does not match the exact non-vacuous completion barrier");
  }
  const core = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "executionArtifactSha256"));
  if (sha256Pilot(stablePilotJson(core)) !== row.executionArtifactSha256) {
    fail("publicResult.executionArtifactSha256", "does not bind the complete public result core");
  }
}
