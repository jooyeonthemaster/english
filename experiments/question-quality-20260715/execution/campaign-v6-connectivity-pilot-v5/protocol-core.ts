import { createHash } from "node:crypto";

import {
  METADATA_RESPONSE_BODY_MAX_BYTES_V5,
  MODEL_RESPONSE_BODY_MAX_BYTES_V5,
} from "./bounded-response-body";

export const MAX_PER_RESPONSE_ACTUAL_COST_USD_V5 = 1_000;
export const MAX_PER_RESPONSE_USAGE_TOKENS_V5 = 10_000_000;

export type PilotPlanV5 = "STANDARD" | "PREMIUM";
export type JsonObject = Record<string, unknown>;

export interface AssignmentV5 {
  ordinal: 1 | 2;
  plan: PilotPlanV5;
  modelId: string;
  exactWireBodyUtf8Bytes: number;
  exactWireBodySha256: string;
  maxOutputTokens: 4000;
  emergencyInputUsdPer1M: number;
  emergencyOutputUsdPer1M: number;
  emergencyRequestUsd: number;
  calculatedWorstCaseUsdCap: number;
  timeoutMs: number;
}

export interface ConnectivityPilotProtocolV5 extends JsonObject {
  schemaVersion: "question-quality-v6-connectivity-pilot-protocol-v5";
  artifactId: "campaign-v6-connectivity-pilot-v5";
  status: "OFFLINE_AUTHOR_FREEZE_LIVE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_AUDIT";
  lineage: JsonObject;
  fixedProductionInput: JsonObject;
  providerContract: JsonObject;
  durableBounds: JsonObject & {
    sharedCandidateCap: 2;
    sharedPhysicalFetchCap: 2;
    sharedCompletionCap: 2;
    serialOrder: ["STANDARD", "PREMIUM"];
    assignments: AssignmentV5[];
    sharedCostCapUsd: number;
  };
  pricingEvidenceContract: JsonObject;
  exactWireCommitment: JsonObject & {
    privateArtifactPath: string;
    privateArtifactSha256: string;
    publicArtifactPath: string;
    publicArtifactSha256: string;
  };
  compilerClosureContract: JsonObject & {
    artifactPath: string;
    artifactSha256: string;
    semanticSha256: string;
    exactSourceFiles: number;
    exactDynamicSourceInputs: number;
    exactDeclaredDataInputs: number;
    exactTotalFiles: number;
  };
  globalResearchLedger: JsonObject;
  liveClosureContract: JsonObject;
  frozenRuntimeContract: JsonObject;
  processIsolation: JsonObject;
  privatePersistence: JsonObject;
  publicResultContract: JsonObject;
  authorization: {
    liveExecutionAuthorized: false;
    metadataNetworkAuthorized: false;
    hostileAuditPassed: false;
    dispatchCommandPresent: false;
  };
  authorFreezeActivity: {
    externalNetworkCalls: 0;
    metadataNetworkCalls: 0;
    providerCalls: 0;
    modelCalls: 0;
    apiCandidatesConsumed: 0;
    productionDatabaseCalls: 0;
    realCredentialValuesRead: 0;
    globalLedgerReservationMutations: 0;
  };
}

export interface EndpointPriceV5 {
  provider: string;
  endpointName: string;
  tag: string;
  status: "active" | "inactive";
  contextLength: number;
  promptUsdPerToken: number;
  completionUsdPerToken: number;
  fixedRequestUsd: number;
  extraChargeUsdPerUnit: Record<string, number>;
  supportedParameters: string[];
  overrides: Array<{
    minPromptTokens: number;
    promptUsdPerToken: number;
    completionUsdPerToken: number;
    fixedRequestUsd: number;
    extraChargeUsdPerUnit: Record<string, number>;
  }>;
}

export interface PublicPriceSnapshotV5 extends JsonObject {
  schemaVersion: "question-quality-openrouter-public-price-snapshot-v5";
  fetchedAt: string;
  sources: {
    modelsUrl: "https://openrouter.ai/api/v1/models";
    endpointUrls: Record<string, string>;
    rawResponseCommitments: Array<{
      url: string;
      status: 200;
      contentType: string;
      bodyUtf8Bytes: number;
      bodySha256: string;
    }>;
  };
  routingContract: {
    exactEndpointTag: "google-vertex/global";
    emergencyCeilingScope: "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES";
    requestNonUseAndResponseAttestationContract: Record<string, string>;
  };
  chargeDimensions: string[];
  knownInapplicableUnitChargeDimensions: string[];
  knownBoundedInputTokenChargeDimensions: string[];
  knownBoundedOutputTokenChargeDimensions: string[];
  models: Array<{
    requestedModelId: string;
    canonicalSlug: string;
    topLevelPromptUsdPerToken: number;
    topLevelCompletionUsdPerToken: number;
    topLevelFixedRequestUsd: number;
    topLevelExtraChargeUsdPerUnit: Record<string, number>;
    endpointRates: EndpointPriceV5[];
  }>;
  contentSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MODELS: Record<PilotPlanV5, string> = {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview",
};
const KNOWN_EXTRA_UNIT_DIMENSIONS_V5 = [
  "image", "input_cache_read", "input_cache_write", "internal_reasoning", "web_search",
] as const;
const INAPPLICABLE_UNIT_DIMENSIONS_V5 = ["image", "web_search"] as const;
const BOUNDED_INPUT_TOKEN_DIMENSIONS_V5 = ["input_cache_read", "input_cache_write"] as const;
const BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V5 = ["internal_reasoning"] as const;
const REQUEST_NON_USE_CONTRACT_V5: Record<string, string> = {
  image: "TEXT_ONLY_MESSAGE_CONTENT",
  web_search: "NO_PLUGIN_OR_TOOL_SURFACE",
  internal_reasoning: "REQUEST_DISABLED_RESPONSE_REASONING_TOKENS_MUST_BE_ZERO_IF_PRESENT_AND_MAX_RATE_INCLUDED_IN_OUTPUT_CEILING",
  input_cache_read: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
  input_cache_write: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
};

export function stableValueV5(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValueV5);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, stableValueV5(child)]));
  }
  return value;
}

export function stableJsonV5(value: unknown): string {
  return JSON.stringify(stableValueV5(value));
}

export function sha256V5(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function metadataNetworkDispatchAuthorizedV5(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authorization = value as Record<string, unknown>;
  return authorization.metadataNetworkAuthorized === true &&
    authorization.hostileAuditPassed === true &&
    authorization.dispatchCommandPresent === true;
}

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(label, "must be plain JSON");
  return value as JsonObject;
}

function exactKeys(value: unknown, label: string, keys: readonly string[]): JsonObject {
  const row = object(value, label);
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `keys differ: ${actual.join(",")}`);
  }
  return row;
}

function stringValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) fail(label, "must be a non-empty string");
}

function numberValue(value: unknown, label: string, integer = false): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    fail(label, "must be a non-negative finite number");
  }
}

function hashValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) fail(label, "must be SHA-256 hex");
}

function literal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(label, `must equal ${JSON.stringify(expected)}`);
}

function exactStringArray(value: unknown, expected: readonly string[], label: string): void {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(label, `must equal ${JSON.stringify(expected)}`);
  }
}

export function conservativeCostV5(input: {
  bodyBytes: number;
  maxOutputTokens: number;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  fixedRequestUsd: number;
  serverTokenOverheadUpperBound: number;
  safetyMultiplier: number;
}): number {
  for (const [name, value] of Object.entries(input)) {
    const canBeZero = name === "fixedRequestUsd";
    if (!Number.isFinite(value) || value < 0 || (!canBeZero && value === 0)) {
      fail(name, canBeZero ? "must be non-negative" : "must be positive");
    }
  }
  const raw = ((input.bodyBytes + input.serverTokenOverheadUpperBound) * input.inputUsdPer1M +
    input.maxOutputTokens * input.outputUsdPer1M) / 1_000_000 + input.fixedRequestUsd;
  return Math.ceil(raw * input.safetyMultiplier * 1e9) / 1e9;
}

function validateAssignments(value: unknown, protocol: JsonObject): AssignmentV5[] {
  if (!Array.isArray(value) || value.length !== 2) fail("durableBounds.assignments", "must contain two rows");
  const pricing = object(protocol.pricingEvidenceContract, "pricingEvidenceContract");
  numberValue(pricing.serverTokenOverheadUpperBound, "pricingEvidenceContract.serverTokenOverheadUpperBound", true);
  numberValue(pricing.safetyMultiplier, "pricingEvidenceContract.safetyMultiplier");
  const rows = value.map((candidate, index) => {
    const row = exactKeys(candidate, `assignment[${index}]`, [
      "ordinal", "plan", "modelId", "exactWireBodyUtf8Bytes", "exactWireBodySha256",
      "maxOutputTokens", "emergencyInputUsdPer1M", "emergencyOutputUsdPer1M",
      "emergencyRequestUsd", "calculatedWorstCaseUsdCap", "timeoutMs",
    ]);
    const plan: PilotPlanV5 = index === 0 ? "STANDARD" : "PREMIUM";
    literal(row.ordinal, index + 1, `assignment[${index}].ordinal`);
    literal(row.plan, plan, `assignment[${index}].plan`);
    literal(row.modelId, MODELS[plan], `assignment[${index}].modelId`);
    numberValue(row.exactWireBodyUtf8Bytes, `assignment[${index}].exactWireBodyUtf8Bytes`, true);
    if ((row.exactWireBodyUtf8Bytes as number) < 1) fail(`assignment[${index}]`, "body bytes must be positive");
    hashValue(row.exactWireBodySha256, `assignment[${index}].exactWireBodySha256`);
    literal(row.maxOutputTokens, 4000, `assignment[${index}].maxOutputTokens`);
    numberValue(row.emergencyInputUsdPer1M, `assignment[${index}].emergencyInputUsdPer1M`);
    numberValue(row.emergencyOutputUsdPer1M, `assignment[${index}].emergencyOutputUsdPer1M`);
    numberValue(row.emergencyRequestUsd, `assignment[${index}].emergencyRequestUsd`);
    numberValue(row.calculatedWorstCaseUsdCap, `assignment[${index}].calculatedWorstCaseUsdCap`);
    numberValue(row.timeoutMs, `assignment[${index}].timeoutMs`, true);
    const expectedCost = conservativeCostV5({
      bodyBytes: row.exactWireBodyUtf8Bytes as number,
      maxOutputTokens: 4000,
      inputUsdPer1M: row.emergencyInputUsdPer1M as number,
      outputUsdPer1M: row.emergencyOutputUsdPer1M as number,
      fixedRequestUsd: row.emergencyRequestUsd as number,
      serverTokenOverheadUpperBound: pricing.serverTokenOverheadUpperBound as number,
      safetyMultiplier: pricing.safetyMultiplier as number,
    });
    literal(row.calculatedWorstCaseUsdCap, expectedCost, `assignment[${index}].calculatedWorstCaseUsdCap`);
    return row as unknown as AssignmentV5;
  });
  return rows;
}

export function validateProtocolV5(value: unknown): ConnectivityPilotProtocolV5 {
  const row = exactKeys(value, "protocol", [
    "schemaVersion", "artifactId", "status", "lineage", "fixedProductionInput",
    "providerContract", "durableBounds", "pricingEvidenceContract", "exactWireCommitment",
    "compilerClosureContract", "globalResearchLedger", "liveClosureContract", "frozenRuntimeContract",
    "processIsolation", "privatePersistence",
    "publicResultContract", "authorization", "authorFreezeActivity",
  ]);
  literal(row.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v5", "schemaVersion");
  literal(row.artifactId, "campaign-v6-connectivity-pilot-v5", "artifactId");
  literal(row.status, "OFFLINE_AUTHOR_FREEZE_LIVE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_AUDIT", "status");

  const lineage = exactKeys(row.lineage, "lineage", [
    "preserves", "replacesExecutionPackage", "v2Unmodified", "v3Unmodified", "v4Unmodified",
    "v2AuditDisposition", "v3AuditDisposition", "v4AuditDisposition", "v4IndependentAuditPins",
  ]);
  exactStringArray(
    lineage.preserves,
    ["campaign-v6-connectivity-pilot-v2", "campaign-v6-connectivity-pilot-v3", "campaign-v6-connectivity-pilot-v4"],
    "lineage.preserves",
  );
  literal(lineage.replacesExecutionPackage, true, "lineage.replacesExecutionPackage");
  literal(lineage.v2Unmodified, true, "lineage.v2Unmodified");
  literal(lineage.v3Unmodified, true, "lineage.v3Unmodified");
  literal(lineage.v4Unmodified, true, "lineage.v4Unmodified");
  literal(lineage.v2AuditDisposition, "REJECTED_TEST_TRANSPORT_SEAM_AND_INCOMPLETE_LIVE_CLOSURE", "lineage.v2AuditDisposition");
  literal(lineage.v3AuditDisposition, "REJECTED_INCOMPLETE_COMPILER_CLOSURE_AND_PERMISSIVE_RESPONSE_PARSER", "lineage.v3AuditDisposition");
  literal(lineage.v4AuditDisposition, "REJECTED_DYNAMIC_COMPILER_INPUTS_METADATA_GUARD_PARSER_BILLING_AND_RECONCILIATION_GAPS", "lineage.v4AuditDisposition");
  const v4Pins = exactKeys(lineage.v4IndependentAuditPins, "lineage.v4IndependentAuditPins", [
    "directory", "verdict", "protocolV4Sha256", "authorGatesSha256", "evidenceSha256",
    "reportSha256", "verifierSha256", "manifestFileSha256", "manifestRows",
  ]);
  literal(v4Pins.directory, "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1", "v4 audit directory");
  literal(v4Pins.verdict, "FAIL", "v4 audit verdict");
  const expectedV4Pins: Record<string, string> = {
    protocolV4Sha256: "18d7eb7c60fdfc1d4b49fb868ef887d64e62db6d217abf8eaec0fbbeab8ffec9",
    authorGatesSha256: "5b0346fb581b5cd12381484061fee8b4fc17e56a10882d7e29651ee8cbf613b0",
    evidenceSha256: "2aff0d69c81169f2f806dcd59f9053ce939927603d75cb7d7c2a60cab501f3b6",
    reportSha256: "8f135466efc5182843cf5a257c5bb361cafb2c91122798c29768839d0f31fae3",
    verifierSha256: "2211da72c2249c1302eddac8f138acf91c4c302a36fbb7810d24f20035c73dd0",
    manifestFileSha256: "2b7fb398cad98647698c7dd4120f819c50645116c71e8ffe79ccb53530ba0791",
  };
  for (const [key, expected] of Object.entries(expectedV4Pins)) literal(v4Pins[key], expected, `v4 audit ${key}`);
  literal(v4Pins.manifestRows, 9, "v4 audit manifestRows");

  const input = exactKeys(row.fixedProductionInput, "fixedProductionInput", [
    "sourcePublicId", "questionType", "profileId", "difficulty", "schoolType", "gradeInfo",
    "count", "qualityMode", "attemptIndex", "teacherIntentBlock", "analysisContext",
    "customPrompt", "targetPoints",
  ]);
  literal(input.sourcePublicId, "OCVP-B01", "fixedProductionInput.sourcePublicId");
  literal(input.questionType, "BLANK_INFERENCE", "fixedProductionInput.questionType");
  literal(input.profileId, "B0_CURRENT_CONTROL", "fixedProductionInput.profileId");
  literal(input.difficulty, "INTERMEDIATE", "fixedProductionInput.difficulty");
  literal(input.schoolType, "고등학교", "fixedProductionInput.schoolType");
  literal(input.gradeInfo, "2학년", "fixedProductionInput.gradeInfo");
  literal(input.count, 1, "fixedProductionInput.count");
  literal(input.qualityMode, "strict", "fixedProductionInput.qualityMode");
  literal(input.attemptIndex, 0, "fixedProductionInput.attemptIndex");
  literal(input.teacherIntentBlock, "", "fixedProductionInput.teacherIntentBlock");
  literal(input.analysisContext, "", "fixedProductionInput.analysisContext");
  literal(input.customPrompt, "", "fixedProductionInput.customPrompt");
  exactStringArray(input.targetPoints, [], "fixedProductionInput.targetPoints");

  const provider = exactKeys(row.providerContract, "providerContract", [
    "endpoint", "exactEndpointTag", "order", "only", "allowFallbacks", "requireParameters",
    "dataCollection", "zdr", "reasoning", "completionCount", "strictJsonSchema",
    "terminalFinishReasons", "fullResponseSchemaValidation", "safeIntegerUsageAndExactTotal",
    "maxResponseBodyUtf8Bytes", "maxActualCostUsdPerResponse", "maxUsageTokensPerResponse",
    "exactMessageShapeRequired", "independentBillingExtractionOnTerminalFailure",
    "duplicateJsonKeysRejected", "reasoningUsageMustBeZeroIfPresent",
    "cacheUsageMustBeZeroIfPresent", "rawCandidateCardinalityObserved",
    "globalCandidateQuarantineOnAffirmativeExcessOrValidJsonAmbiguity",
    "ordinaryInvalidTransportBodyDoesNotGlobalQuarantine",
    "exactRequestHasNoImageToolPluginOrCacheSurface",
    "byokUsageMustBeExplicitlyFalse", "incompletePostSendBodyObservationGlobalQuarantine",
    "postSendChargeConstructionFailureSynthesizesManualQuarantineCharge",
    "dispatchedAttemptCannotSettleWithZeroCharges",
  ]);
  literal(provider.endpoint, "https://openrouter.ai/api/v1/chat/completions", "providerContract.endpoint");
  literal(provider.exactEndpointTag, "google-vertex/global", "providerContract.exactEndpointTag");
  exactStringArray(provider.order, ["google-vertex/global"], "providerContract.order");
  exactStringArray(provider.only, ["google-vertex/global"], "providerContract.only");
  literal(provider.allowFallbacks, false, "providerContract.allowFallbacks");
  literal(provider.requireParameters, true, "providerContract.requireParameters");
  literal(provider.dataCollection, "deny", "providerContract.dataCollection");
  literal(provider.zdr, true, "providerContract.zdr");
  const reasoning = exactKeys(provider.reasoning, "providerContract.reasoning", ["enabled", "effort", "exclude"]);
  literal(reasoning.enabled, false, "reasoning.enabled");
  literal(reasoning.effort, "none", "reasoning.effort");
  literal(reasoning.exclude, true, "reasoning.exclude");
  literal(provider.completionCount, 1, "providerContract.completionCount");
  literal(provider.strictJsonSchema, true, "providerContract.strictJsonSchema");
  exactStringArray(provider.terminalFinishReasons, ["stop"], "providerContract.terminalFinishReasons");
  literal(provider.fullResponseSchemaValidation, true, "providerContract.fullResponseSchemaValidation");
  literal(provider.safeIntegerUsageAndExactTotal, true, "providerContract.safeIntegerUsageAndExactTotal");
  literal(provider.maxResponseBodyUtf8Bytes, MODEL_RESPONSE_BODY_MAX_BYTES_V5, "providerContract.maxResponseBodyUtf8Bytes");
  literal(provider.maxActualCostUsdPerResponse, MAX_PER_RESPONSE_ACTUAL_COST_USD_V5, "providerContract.maxActualCostUsdPerResponse");
  literal(provider.maxUsageTokensPerResponse, MAX_PER_RESPONSE_USAGE_TOKENS_V5, "providerContract.maxUsageTokensPerResponse");
  literal(provider.exactMessageShapeRequired, true, "providerContract.exactMessageShapeRequired");
  literal(provider.independentBillingExtractionOnTerminalFailure, true, "providerContract.independentBillingExtractionOnTerminalFailure");
  for (const key of [
    "duplicateJsonKeysRejected", "reasoningUsageMustBeZeroIfPresent", "cacheUsageMustBeZeroIfPresent",
    "rawCandidateCardinalityObserved", "globalCandidateQuarantineOnAffirmativeExcessOrValidJsonAmbiguity",
    "ordinaryInvalidTransportBodyDoesNotGlobalQuarantine", "exactRequestHasNoImageToolPluginOrCacheSurface",
    "byokUsageMustBeExplicitlyFalse", "incompletePostSendBodyObservationGlobalQuarantine",
    "postSendChargeConstructionFailureSynthesizesManualQuarantineCharge",
    "dispatchedAttemptCannotSettleWithZeroCharges",
  ] as const) literal(provider[key], true, `providerContract.${key}`);

  const bounds = exactKeys(row.durableBounds, "durableBounds", [
    "sharedCandidateCap", "sharedPhysicalFetchCap", "sharedCompletionCap", "concurrency",
    "serialOrder", "perAssignmentCandidateCap", "perAssignmentPhysicalFetchCap",
    "perAssignmentCompletionCap", "retryAllowed", "repairAllowed", "fallbackAllowed",
    "replacementAllowed", "topUpAllowed", "failureTimeoutUnknownTerminal", "reserveBeforeNetwork",
    "assignments", "sharedCostCapUsd",
  ]);
  for (const key of ["sharedCandidateCap", "sharedPhysicalFetchCap", "sharedCompletionCap"] as const) literal(bounds[key], 2, `durableBounds.${key}`);
  literal(bounds.concurrency, 1, "durableBounds.concurrency");
  exactStringArray(bounds.serialOrder, ["STANDARD", "PREMIUM"], "durableBounds.serialOrder");
  for (const key of ["perAssignmentCandidateCap", "perAssignmentPhysicalFetchCap", "perAssignmentCompletionCap"] as const) literal(bounds[key], 1, `durableBounds.${key}`);
  for (const key of ["retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed"] as const) literal(bounds[key], false, `durableBounds.${key}`);
  literal(bounds.failureTimeoutUnknownTerminal, true, "durableBounds.failureTimeoutUnknownTerminal");
  literal(bounds.reserveBeforeNetwork, true, "durableBounds.reserveBeforeNetwork");
  const assignments = validateAssignments(bounds.assignments, row);
  numberValue(bounds.sharedCostCapUsd, "durableBounds.sharedCostCapUsd");
  literal(bounds.sharedCostCapUsd, Math.ceil(assignments.reduce((sum, item) => sum + item.calculatedWorstCaseUsdCap, 0) * 1e9) / 1e9, "durableBounds.sharedCostCapUsd");

  const pricing = exactKeys(row.pricingEvidenceContract, "pricingEvidenceContract", [
    "schemaVersion", "maximumAgeMs", "exactEndpointCardinality", "requiredParameters",
    "canonicalSlugRequired", "allActiveEndpointsAndOverridesRequired", "chargeDimensionsRequired",
    "contentHashRequired", "serverTokenOverheadUpperBound", "safetyMultiplier",
    "maxMetadataResponseBodyUtf8Bytes", "fixedRequestFeesIncludedInReserve",
    "knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation", "unknownChargeDimensionsRejected",
    "rawHttpEvidenceBundleRequired", "rawHttpDuplicateKeysRejected", "omittedFixedRequestFeeAssumedZero",
    "privateBundlePreReadMaxBytes", "topLevelFixedRequestIncludedInEmergencyCeiling",
    "topLevelPromptAndCompletionIncludedInEmergencyCeiling",
    "cacheReadWriteRatesIncludedInEmergencyInputCeiling",
    "reasoningRatesIncludedInEmergencyOutputCeiling",
    "imageAndWebSearchZeroUseProvenByExactRequestShape",
    "privateBundleFdBoundExactReadRequired", "captureToLiveInMemoryFileAndBundleHashHandoffRequired",
  ]);
  literal(pricing.schemaVersion, "question-quality-openrouter-public-price-snapshot-v5", "pricingEvidenceContract.schemaVersion");
  literal(pricing.maximumAgeMs, 900000, "pricingEvidenceContract.maximumAgeMs");
  literal(pricing.exactEndpointCardinality, 1, "pricingEvidenceContract.exactEndpointCardinality");
  exactStringArray(pricing.requiredParameters, ["response_format", "structured_outputs"], "pricingEvidenceContract.requiredParameters");
  for (const key of ["canonicalSlugRequired", "allActiveEndpointsAndOverridesRequired", "chargeDimensionsRequired", "contentHashRequired"] as const) literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  numberValue(pricing.serverTokenOverheadUpperBound, "pricingEvidenceContract.serverTokenOverheadUpperBound", true);
  numberValue(pricing.safetyMultiplier, "pricingEvidenceContract.safetyMultiplier");
  literal(pricing.maxMetadataResponseBodyUtf8Bytes, METADATA_RESPONSE_BODY_MAX_BYTES_V5, "pricingEvidenceContract.maxMetadataResponseBodyUtf8Bytes");
  literal(pricing.fixedRequestFeesIncludedInReserve, true, "pricingEvidenceContract.fixedRequestFeesIncludedInReserve");
  literal(pricing.knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation, true, "pricingEvidenceContract.knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation");
  literal(pricing.unknownChargeDimensionsRejected, true, "pricingEvidenceContract.unknownChargeDimensionsRejected");
  for (const key of [
    "rawHttpEvidenceBundleRequired", "rawHttpDuplicateKeysRejected",
    "topLevelFixedRequestIncludedInEmergencyCeiling", "topLevelPromptAndCompletionIncludedInEmergencyCeiling",
    "cacheReadWriteRatesIncludedInEmergencyInputCeiling",
    "reasoningRatesIncludedInEmergencyOutputCeiling",
    "imageAndWebSearchZeroUseProvenByExactRequestShape",
    "privateBundleFdBoundExactReadRequired", "captureToLiveInMemoryFileAndBundleHashHandoffRequired",
  ] as const) literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  literal(pricing.omittedFixedRequestFeeAssumedZero, false, "pricingEvidenceContract.omittedFixedRequestFeeAssumedZero");
  literal(pricing.privateBundlePreReadMaxBytes, 306184192, "pricingEvidenceContract.privateBundlePreReadMaxBytes");

  const wire = exactKeys(row.exactWireCommitment, "exactWireCommitment", [
    "privateArtifactPath", "privateArtifactSha256", "publicArtifactPath", "publicArtifactSha256",
    "locallyInterceptedProductionCompilerFetches", "externalNetworkCalls", "providerCalls",
    "modelCalls", "apiCandidatesConsumed",
  ]);
  literal(wire.privateArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/private/exact-wire-v5.private.json", "exactWireCommitment.privateArtifactPath");
  literal(wire.publicArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/offline-exact-wire-seal-v5.json", "exactWireCommitment.publicArtifactPath");
  hashValue(wire.privateArtifactSha256, "exactWireCommitment.privateArtifactSha256");
  hashValue(wire.publicArtifactSha256, "exactWireCommitment.publicArtifactSha256");
  literal(wire.locallyInterceptedProductionCompilerFetches, 2, "exactWireCommitment.locallyInterceptedProductionCompilerFetches");
  for (const key of ["externalNetworkCalls", "providerCalls", "modelCalls", "apiCandidatesConsumed"] as const) literal(wire[key], 0, `exactWireCommitment.${key}`);

  const compilerClosure = exactKeys(row.compilerClosureContract, "compilerClosureContract", [
    "artifactPath", "artifactSha256", "semanticSha256", "algorithm", "entrypoints",
    "exactSourceFiles", "exactDynamicSourceInputs", "exactDeclaredDataInputs", "exactTotalFiles", "exactEqualityRequired",
    "zeroUnresolvedLocalRequired", "zeroNonliteralDynamicRequired", "minimumCountChecksForbidden",
    "inheritedThirtyTwoRowSubsetAuthority", "externalInputsExactEqualityRequired",
    "compilerFsReadSitesStaticallyEnumerated", "isolatedChildEnvironmentRequired",
  ]);
  literal(compilerClosure.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-closure-v5.json", "compilerClosureContract.artifactPath");
  hashValue(compilerClosure.artifactSha256, "compilerClosureContract.artifactSha256");
  hashValue(compilerClosure.semanticSha256, "compilerClosureContract.semanticSha256");
  literal(compilerClosure.algorithm, "INDEPENDENT_AST_PLUS_DYNAMIC_SOURCE_PLUS_DATA_PLUS_EXTERNAL_INPUTS_V3", "compilerClosureContract.algorithm");
  exactStringArray(compilerClosure.entrypoints, ["experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-child.mts"], "compilerClosureContract.entrypoints");
  numberValue(compilerClosure.exactSourceFiles, "compilerClosureContract.exactSourceFiles", true);
  literal(compilerClosure.exactDynamicSourceInputs, 3, "compilerClosureContract.exactDynamicSourceInputs");
  numberValue(compilerClosure.exactDeclaredDataInputs, "compilerClosureContract.exactDeclaredDataInputs", true);
  numberValue(compilerClosure.exactTotalFiles, "compilerClosureContract.exactTotalFiles", true);
  literal(
    compilerClosure.exactTotalFiles,
    (compilerClosure.exactSourceFiles as number) + (compilerClosure.exactDynamicSourceInputs as number) + (compilerClosure.exactDeclaredDataInputs as number),
    "compilerClosureContract.exactTotalFiles",
  );
  for (const key of [
    "exactEqualityRequired", "zeroUnresolvedLocalRequired", "zeroNonliteralDynamicRequired",
    "minimumCountChecksForbidden", "externalInputsExactEqualityRequired",
    "compilerFsReadSitesStaticallyEnumerated", "isolatedChildEnvironmentRequired",
  ] as const) literal(compilerClosure[key], true, `compilerClosureContract.${key}`);
  literal(compilerClosure.inheritedThirtyTwoRowSubsetAuthority, false, "compilerClosureContract.inheritedThirtyTwoRowSubsetAuthority");

  const ledger = exactKeys(row.globalResearchLedger, "globalResearchLedger", [
    "path", "globalCap", "requiredPreAuthorUsed", "requiredPreAuthorReserved", "liveReservation",
    "authorFreezeMutationAllowed", "privateStoreReservationAlsoRequired", "atomicLockRequired",
    "globalCapacityQuarantineOnCandidateExcessOrAmbiguity",
    "ordinaryInvalidBodySettlesSingleOpportunityWithoutGlobalQuarantine",
    "postCommitCleanupOutcomeRequired",
  ]);
  literal(ledger.path, "experiments/question-quality-20260715/budget-ledger.json", "globalResearchLedger.path");
  literal(ledger.globalCap, 1000, "globalResearchLedger.globalCap");
  literal(ledger.requiredPreAuthorUsed, 0, "globalResearchLedger.requiredPreAuthorUsed");
  literal(ledger.requiredPreAuthorReserved, 0, "globalResearchLedger.requiredPreAuthorReserved");
  literal(ledger.liveReservation, 2, "globalResearchLedger.liveReservation");
  literal(ledger.authorFreezeMutationAllowed, false, "globalResearchLedger.authorFreezeMutationAllowed");
  literal(ledger.privateStoreReservationAlsoRequired, true, "globalResearchLedger.privateStoreReservationAlsoRequired");
  literal(ledger.atomicLockRequired, true, "globalResearchLedger.atomicLockRequired");
  for (const key of [
    "globalCapacityQuarantineOnCandidateExcessOrAmbiguity",
    "ordinaryInvalidBodySettlesSingleOpportunityWithoutGlobalQuarantine",
    "postCommitCleanupOutcomeRequired",
  ] as const) literal(ledger[key], true, `globalResearchLedger.${key}`);

  const closure = exactKeys(row.liveClosureContract, "liveClosureContract", [
    "artifactPath", "algorithm", "exactEntrypointSetRequired", "exactTransitiveFileSetRequired",
    "exactBytesAndSha256Required", "literalDynamicImportsIncluded", "runtimeDataReadsClassified",
    "minimumCountChecksForbidden", "testSupportExcluded", "exactExpectedFiles",
    "declaredFrozenRuntimeArtifactsIncluded", "exactExpectedExternalFiles",
    "externalNodeExecutableIdentityRequired",
  ]);
  literal(closure.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-closure-v5.json", "liveClosureContract.artifactPath");
  literal(closure.algorithm, "TYPESCRIPT_AST_TRANSITIVE_IMPORTS_PLUS_DECLARED_RUNTIME_DATA_V1", "liveClosureContract.algorithm");
  for (const key of ["exactEntrypointSetRequired", "exactTransitiveFileSetRequired", "exactBytesAndSha256Required", "literalDynamicImportsIncluded", "runtimeDataReadsClassified", "testSupportExcluded"] as const) literal(closure[key], true, `liveClosureContract.${key}`);
  literal(closure.minimumCountChecksForbidden, true, "liveClosureContract.minimumCountChecksForbidden");
  literal(closure.exactExpectedFiles, 23, "liveClosureContract.exactExpectedFiles");
  literal(closure.declaredFrozenRuntimeArtifactsIncluded, true, "liveClosureContract.declaredFrozenRuntimeArtifactsIncluded");
  literal(closure.exactExpectedExternalFiles, 1, "liveClosureContract.exactExpectedExternalFiles");
  literal(closure.externalNodeExecutableIdentityRequired, true, "liveClosureContract.externalNodeExecutableIdentityRequired");

  const frozen = exactKeys(row.frozenRuntimeContract, "frozenRuntimeContract", [
    "artifactPath", "artifactSha256", "artifactContentSha256", "bundleSetSha256",
    "executionLoader", "entrypoints", "nodeVersion", "nodeExecutableSha256",
    "allBundleBytesRequired", "nodeExecutableIdentityRequired", "sourceTsxRuntimeAllowed",
    "externalRuntimePackagesAllowed", "authorFreezePermanentlyNoDispatch", "authorizationPackagePolicy",
  ]);
  literal(frozen.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-v5.json", "frozenRuntimeContract.artifactPath");
  for (const key of ["artifactSha256", "artifactContentSha256", "bundleSetSha256", "nodeExecutableSha256"] as const) hashValue(frozen[key], `frozenRuntimeContract.${key}`);
  literal(frozen.executionLoader, "PLAIN_NODE_ESM_BUNDLES", "frozenRuntimeContract.executionLoader");
  exactStringArray(frozen.entrypoints, [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/capture-price-snapshot-v5.bundle.mjs",
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/live-child-v5.bundle.mjs",
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/operator-wrapper-v5.bundle.mjs",
  ], "frozenRuntimeContract.entrypoints");
  stringValue(frozen.nodeVersion, "frozenRuntimeContract.nodeVersion");
  literal(frozen.allBundleBytesRequired, true, "frozenRuntimeContract.allBundleBytesRequired");
  literal(frozen.nodeExecutableIdentityRequired, true, "frozenRuntimeContract.nodeExecutableIdentityRequired");
  literal(frozen.sourceTsxRuntimeAllowed, false, "frozenRuntimeContract.sourceTsxRuntimeAllowed");
  literal(frozen.externalRuntimePackagesAllowed, false, "frozenRuntimeContract.externalRuntimePackagesAllowed");
  literal(frozen.authorFreezePermanentlyNoDispatch, true, "frozenRuntimeContract.authorFreezePermanentlyNoDispatch");
  literal(
    frozen.authorizationPackagePolicy,
    "SEPARATE_DIRECTORY_NEW_BUNDLES_SUBJECT_AND_INDEPENDENT_AUDIT_MANIFESTS_REQUIRED",
    "frozenRuntimeContract.authorizationPackagePolicy",
  );

  const isolation = exactKeys(row.processIsolation, "processIsolation", [
    "liveLauncherExplicitEnvironmentNames", "metadataLauncherExplicitEnvironmentNames",
    "windowsObservedAutoInjectedEnvironmentNames", "nonWindowsObservedAutoInjectedEnvironmentNames",
    "exactObservedNameSetRequired", "ambientPreloadNamesForbidden", "credentialNamesForbiddenExcept",
  ]);
  exactStringArray(isolation.liveLauncherExplicitEnvironmentNames, [
    "SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC",
    "OPENROUTER_API_KEY", "QUESTION_QUALITY_CONNECTIVITY_PILOT_V5_LIVE_CHILD",
  ], "processIsolation.liveLauncherExplicitEnvironmentNames");
  exactStringArray(isolation.metadataLauncherExplicitEnvironmentNames, [
    "SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC",
  ], "processIsolation.metadataLauncherExplicitEnvironmentNames");
  exactStringArray(isolation.windowsObservedAutoInjectedEnvironmentNames, [
    "HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "USERDOMAIN", "USERNAME", "USERPROFILE",
  ], "processIsolation.windowsObservedAutoInjectedEnvironmentNames");
  exactStringArray(isolation.nonWindowsObservedAutoInjectedEnvironmentNames, [], "processIsolation.nonWindowsObservedAutoInjectedEnvironmentNames");
  literal(isolation.exactObservedNameSetRequired, true, "processIsolation.exactObservedNameSetRequired");
  exactStringArray(isolation.ambientPreloadNamesForbidden, ["NODE_OPTIONS", "NODE_PATH"], "processIsolation.ambientPreloadNamesForbidden");
  exactStringArray(isolation.credentialNamesForbiddenExcept, ["OPENROUTER_API_KEY"], "processIsolation.credentialNamesForbiddenExcept");

  const persistence = exactKeys(row.privatePersistence, "privatePersistence", [
    "exclusiveNewRunDirectory", "durableEventJournal", "rawRequestAndResponsePrivateOnly",
    "credentialNeverPersisted", "unknownAfterSendNeverReplay", "publicAllowlistOnly",
    "terminalReconciliationIntentBeforeSettlement", "settlementFailureNoReplayEvidence",
    "absentOrMalformedBillingUsesReservedEffectiveCost", "durableNoReplayMarkerBeforeGlobalReservation",
    "boundedModelResponseBeforeMaterialization", "explicitPositiveUnrepresentableCostRequiresManualReconciliation",
    "rawPriceHttpEvidencePersisted", "privateInputsCanonicalRealRegularFiles",
    "privateOutputAncestorsRealDirectories", "priceEvidencePreReadBounded",
    "soleCredentialSourceCanonicalDirectRealRegularFile", "frozenPlainEsmRuntimeRequired",
    "credentialFdBoundExactReadAndPostAttestation", "mutableLedgerFdBoundDuplicateFreeNoBom",
    "mutableLedgerCommitTargetReattested", "priceCaptureFdBoundAndInMemoryHashHandoff",
    "postSendChargeCoverageEqualsDispatches", "byokNonFalseManualReconciliation",
  ]);
  for (const key of Object.keys(persistence)) literal(persistence[key], true, `privatePersistence.${key}`);
  const publicResult = exactKeys(row.publicResultContract, "publicResultContract", [
    "allowlist", "forbiddenNamePattern", "requiresTwoSuccessfulAssignments",
    "requiresUsageRouteParserEvidence", "twoRowsNotQualityComparison",
  ]);
  if (!Array.isArray(publicResult.allowlist) || publicResult.allowlist.length < 8) fail("publicResultContract.allowlist", "too short");
  stringValue(publicResult.forbiddenNamePattern, "publicResultContract.forbiddenNamePattern");
  literal(publicResult.requiresTwoSuccessfulAssignments, true, "publicResultContract.requiresTwoSuccessfulAssignments");
  literal(publicResult.requiresUsageRouteParserEvidence, true, "publicResultContract.requiresUsageRouteParserEvidence");
  literal(publicResult.twoRowsNotQualityComparison, true, "publicResultContract.twoRowsNotQualityComparison");

  const auth = exactKeys(row.authorization, "authorization", [
    "liveExecutionAuthorized", "metadataNetworkAuthorized", "hostileAuditPassed", "dispatchCommandPresent",
  ]);
  for (const key of Object.keys(auth)) literal(auth[key], false, `authorization.${key}`);
  const activity = exactKeys(row.authorFreezeActivity, "authorFreezeActivity", [
    "externalNetworkCalls", "metadataNetworkCalls", "providerCalls", "modelCalls", "apiCandidatesConsumed",
    "productionDatabaseCalls", "realCredentialValuesRead", "globalLedgerReservationMutations",
  ]);
  for (const key of Object.keys(activity)) literal(activity[key], 0, `authorFreezeActivity.${key}`);
  return row as unknown as ConnectivityPilotProtocolV5;
}

export function validatePriceSnapshotV5(value: unknown): PublicPriceSnapshotV5 {
  const row = exactKeys(value, "priceSnapshot", [
    "schemaVersion", "fetchedAt", "sources", "routingContract", "chargeDimensions",
    "knownInapplicableUnitChargeDimensions", "knownBoundedInputTokenChargeDimensions",
    "knownBoundedOutputTokenChargeDimensions",
    "models", "contentSha256",
  ]);
  literal(row.schemaVersion, "question-quality-openrouter-public-price-snapshot-v5", "priceSnapshot.schemaVersion");
  stringValue(row.fetchedAt, "priceSnapshot.fetchedAt");
  if (!UTC.test(row.fetchedAt) || new Date(Date.parse(row.fetchedAt)).toISOString() !== row.fetchedAt) fail("priceSnapshot.fetchedAt", "not canonical UTC");
  const sources = exactKeys(row.sources, "priceSnapshot.sources", ["modelsUrl", "endpointUrls", "rawResponseCommitments"]);
  literal(sources.modelsUrl, "https://openrouter.ai/api/v1/models", "priceSnapshot.sources.modelsUrl");
  const endpointUrls = object(sources.endpointUrls, "priceSnapshot.sources.endpointUrls");
  exactStringArray(Object.keys(endpointUrls).sort(), Object.values(MODELS).sort(), "priceSnapshot endpoint model set");
  for (const modelId of Object.values(MODELS)) {
    literal(endpointUrls[modelId], `https://openrouter.ai/api/v1/models/${modelId}/endpoints`, `endpointUrls.${modelId}`);
  }
  const expectedSourceUrls = [
    "https://openrouter.ai/api/v1/models",
    ...Object.values(MODELS).map((modelId) => `https://openrouter.ai/api/v1/models/${modelId}/endpoints`),
  ].sort();
  if (!Array.isArray(sources.rawResponseCommitments) || sources.rawResponseCommitments.length !== 3) {
    fail("priceSnapshot.sources.rawResponseCommitments", "must contain exactly three responses");
  }
  const observedSourceUrls: string[] = [];
  sources.rawResponseCommitments.forEach((candidate, index) => {
    const commitment = exactKeys(candidate, `rawResponseCommitments[${index}]`, [
      "url", "status", "contentType", "bodyUtf8Bytes", "bodySha256",
    ]);
    stringValue(commitment.url, `rawResponseCommitments[${index}].url`);
    observedSourceUrls.push(commitment.url);
    literal(commitment.status, 200, `rawResponseCommitments[${index}].status`);
    stringValue(commitment.contentType, `rawResponseCommitments[${index}].contentType`);
    if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(commitment.contentType.trim())) {
      fail(`rawResponseCommitments[${index}].contentType`, "must be JSON");
    }
    numberValue(commitment.bodyUtf8Bytes, `rawResponseCommitments[${index}].bodyUtf8Bytes`, true);
    if ((commitment.bodyUtf8Bytes as number) < 1 ||
        (commitment.bodyUtf8Bytes as number) > METADATA_RESPONSE_BODY_MAX_BYTES_V5) {
      fail(`rawResponseCommitments[${index}].bodyUtf8Bytes`, "outside metadata bound");
    }
    hashValue(commitment.bodySha256, `rawResponseCommitments[${index}].bodySha256`);
  });
  exactStringArray(observedSourceUrls, expectedSourceUrls, "rawResponseCommitments URL order");
  const routing = exactKeys(row.routingContract, "priceSnapshot.routingContract", [
    "exactEndpointTag", "emergencyCeilingScope", "requestNonUseAndResponseAttestationContract",
  ]);
  literal(routing.exactEndpointTag, "google-vertex/global", "routingContract.exactEndpointTag");
  literal(routing.emergencyCeilingScope, "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES", "routingContract.emergencyCeilingScope");
  const zeroUnitContract = exactKeys(
    routing.requestNonUseAndResponseAttestationContract,
    "routingContract.requestNonUseAndResponseAttestationContract",
    KNOWN_EXTRA_UNIT_DIMENSIONS_V5,
  );
  for (const [dimension, disposition] of Object.entries(REQUEST_NON_USE_CONTRACT_V5)) {
    literal(zeroUnitContract[dimension], disposition, `routingContract.requestNonUseAndResponseAttestationContract.${dimension}`);
  }
  if (!Array.isArray(row.chargeDimensions) || row.chargeDimensions.length === 0 || new Set(row.chargeDimensions).size !== row.chargeDimensions.length || row.chargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("chargeDimensions", "must be unique strings");
  if (!Array.isArray(row.knownInapplicableUnitChargeDimensions) || row.knownInapplicableUnitChargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("knownInapplicableUnitChargeDimensions", "must be strings");
  if (!Array.isArray(row.knownBoundedInputTokenChargeDimensions) || row.knownBoundedInputTokenChargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("knownBoundedInputTokenChargeDimensions", "must be strings");
  if (!Array.isArray(row.knownBoundedOutputTokenChargeDimensions) || row.knownBoundedOutputTokenChargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("knownBoundedOutputTokenChargeDimensions", "must be strings");
  if (!Array.isArray(row.models) || row.models.length !== 2) fail("models", "must have two models");
  const observedExtraDimensions = new Set<string>();
  const assertKnownExtraDimensions = (value: unknown, label: string): void => {
    const extras = object(value, label);
    for (const [dimension, rate] of Object.entries(extras)) {
      if (!(KNOWN_EXTRA_UNIT_DIMENSIONS_V5 as readonly string[]).includes(dimension)) {
        fail(label, `contains unknown charge dimension ${dimension}`);
      }
      numberValue(rate, `${label}.${dimension}`);
      observedExtraDimensions.add(dimension);
    }
  };
  const ordered = [MODELS.STANDARD, MODELS.PREMIUM];
  row.models.forEach((candidate, modelIndex) => {
    const model = exactKeys(candidate, `models[${modelIndex}]`, [
      "requestedModelId", "canonicalSlug", "topLevelPromptUsdPerToken", "topLevelCompletionUsdPerToken",
      "topLevelFixedRequestUsd", "topLevelExtraChargeUsdPerUnit", "endpointRates",
    ]);
    literal(model.requestedModelId, ordered[modelIndex], `models[${modelIndex}].requestedModelId`);
    stringValue(model.canonicalSlug, `models[${modelIndex}].canonicalSlug`);
    numberValue(model.topLevelPromptUsdPerToken, `models[${modelIndex}].topLevelPromptUsdPerToken`);
    numberValue(model.topLevelCompletionUsdPerToken, `models[${modelIndex}].topLevelCompletionUsdPerToken`);
    numberValue(model.topLevelFixedRequestUsd, `models[${modelIndex}].topLevelFixedRequestUsd`);
    assertKnownExtraDimensions(model.topLevelExtraChargeUsdPerUnit, `models[${modelIndex}].topLevelExtraChargeUsdPerUnit`);
    if (!Array.isArray(model.endpointRates) || model.endpointRates.length === 0) fail(`models[${modelIndex}].endpointRates`, "must be nonempty");
    let exactActive = 0;
    model.endpointRates.forEach((candidateEndpoint, endpointIndex) => {
      const endpoint = exactKeys(candidateEndpoint, `endpoint[${modelIndex}:${endpointIndex}]`, [
        "provider", "endpointName", "tag", "status", "contextLength", "promptUsdPerToken",
        "completionUsdPerToken", "fixedRequestUsd", "extraChargeUsdPerUnit", "supportedParameters", "overrides",
      ]);
      for (const key of ["provider", "endpointName", "tag"] as const) stringValue(endpoint[key], `endpoint.${key}`);
      if (endpoint.status !== "active" && endpoint.status !== "inactive") fail("endpoint.status", "invalid");
      numberValue(endpoint.contextLength, "endpoint.contextLength", true);
      numberValue(endpoint.promptUsdPerToken, "endpoint.promptUsdPerToken");
      numberValue(endpoint.completionUsdPerToken, "endpoint.completionUsdPerToken");
      numberValue(endpoint.fixedRequestUsd, "endpoint.fixedRequestUsd");
      assertKnownExtraDimensions(endpoint.extraChargeUsdPerUnit, `endpoint[${modelIndex}:${endpointIndex}].extraChargeUsdPerUnit`);
      if (!Array.isArray(endpoint.supportedParameters) || endpoint.supportedParameters.some((entry) => typeof entry !== "string")) fail("endpoint.supportedParameters", "invalid");
      if (!Array.isArray(endpoint.overrides)) fail("endpoint.overrides", "invalid");
      endpoint.overrides.forEach((candidateOverride) => {
        const override = exactKeys(candidateOverride, "endpoint.override", [
          "minPromptTokens", "promptUsdPerToken", "completionUsdPerToken", "fixedRequestUsd", "extraChargeUsdPerUnit",
        ]);
        numberValue(override.minPromptTokens, "override.minPromptTokens", true);
        numberValue(override.promptUsdPerToken, "override.promptUsdPerToken");
        numberValue(override.completionUsdPerToken, "override.completionUsdPerToken");
        numberValue(override.fixedRequestUsd, "override.fixedRequestUsd");
        assertKnownExtraDimensions(override.extraChargeUsdPerUnit, "override.extraChargeUsdPerUnit");
      });
      if (endpoint.tag === "google-vertex/global" && endpoint.status === "active") exactActive += 1;
    });
    literal(exactActive, 1, `models[${modelIndex}].exactActiveEndpointCount`);
  });
  const exactExtraDimensions = [...observedExtraDimensions].sort();
  exactStringArray(
    row.knownInapplicableUnitChargeDimensions,
    exactExtraDimensions.filter((dimension) => (INAPPLICABLE_UNIT_DIMENSIONS_V5 as readonly string[]).includes(dimension)),
    "knownInapplicableUnitChargeDimensions",
  );
  exactStringArray(
    row.knownBoundedInputTokenChargeDimensions,
    exactExtraDimensions.filter((dimension) => (BOUNDED_INPUT_TOKEN_DIMENSIONS_V5 as readonly string[]).includes(dimension)),
    "knownBoundedInputTokenChargeDimensions",
  );
  exactStringArray(
    row.knownBoundedOutputTokenChargeDimensions,
    exactExtraDimensions.filter((dimension) => (BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V5 as readonly string[]).includes(dimension)),
    "knownBoundedOutputTokenChargeDimensions",
  );
  exactStringArray(row.chargeDimensions, ["completion", ...exactExtraDimensions, "prompt", "request"].sort(), "chargeDimensions");
  hashValue(row.contentSha256, "priceSnapshot.contentSha256");
  const core = { ...row };
  delete core.contentSha256;
  literal(row.contentSha256, sha256V5(stableJsonV5(core)), "priceSnapshot.contentSha256");
  return row as unknown as PublicPriceSnapshotV5;
}

export function modelIdsV5(): readonly [string, string] {
  return [MODELS.STANDARD, MODELS.PREMIUM];
}
