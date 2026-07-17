import { createHash } from "node:crypto";

import {
  METADATA_RESPONSE_BODY_MAX_BYTES_V6,
  MODEL_RESPONSE_BODY_MAX_BYTES_V6,
} from "./bounded-response-body";

export const MAX_PER_RESPONSE_ACTUAL_COST_USD_V6 = 1_000;
export const MAX_PER_RESPONSE_USAGE_TOKENS_V6 = 10_000_000;

export type PilotPlanV6 = "STANDARD" | "PREMIUM";
export type JsonObject = Record<string, unknown>;

export interface AssignmentV6 {
  ordinal: 1 | 2;
  plan: PilotPlanV6;
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

export interface ConnectivityPilotProtocolV6 extends JsonObject {
  schemaVersion: "question-quality-v6-connectivity-pilot-protocol-v6";
  artifactId: "campaign-v6-connectivity-pilot-v6";
  status: "SOURCE_REMEDIATION_S1_S5_IMPLEMENTED_S6_FREEZE_AND_EXECUTION_BLOCKED";
  systemAuditRemediation: JsonObject;
  lineage: JsonObject;
  fixedProductionInput: JsonObject;
  providerContract: JsonObject;
  durableBounds: JsonObject & {
    sharedCandidateCap: 2;
    sharedPhysicalFetchCap: 2;
    sharedCompletionCap: 2;
    serialOrder: ["STANDARD", "PREMIUM"];
    assignments: AssignmentV6[];
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
  transformerExecutionContract: JsonObject;
  deploymentRuntimeTrust: JsonObject;
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
    globalLedgerReadOnlyAttestations: 1;
    globalLedgerReservationMutations: 0;
  };
}

export interface EndpointPriceV6 {
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

export interface PublicPriceSnapshotV6 extends JsonObject {
  schemaVersion: "question-quality-openrouter-public-price-snapshot-v6";
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
    endpointRates: EndpointPriceV6[];
  }>;
  contentSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MODELS: Record<PilotPlanV6, string> = {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview",
};
const KNOWN_EXTRA_UNIT_DIMENSIONS_V6 = [
  "image",
  "input_cache_read",
  "input_cache_write",
  "internal_reasoning",
  "web_search",
] as const;
const INAPPLICABLE_UNIT_DIMENSIONS_V6 = ["image", "web_search"] as const;
const BOUNDED_INPUT_TOKEN_DIMENSIONS_V6 = [
  "input_cache_read",
  "input_cache_write",
] as const;
const BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V6 = ["internal_reasoning"] as const;
const REQUEST_NON_USE_CONTRACT_V6: Record<string, string> = {
  image: "TEXT_ONLY_MESSAGE_CONTENT",
  web_search: "NO_PLUGIN_OR_TOOL_SURFACE",
  internal_reasoning:
    "REQUEST_DISABLED_RESPONSE_REASONING_TOKENS_MUST_BE_ZERO_IF_PRESENT_AND_MAX_RATE_INCLUDED_IN_OUTPUT_CEILING",
  input_cache_read:
    "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
  input_cache_write:
    "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
};

export function stableValueV6(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValueV6);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonObject)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, stableValueV6(child)]),
    );
  }
  return value;
}

export function stableJsonV6(value: unknown): string {
  return JSON.stringify(stableValueV6(value));
}

export function sha256V6(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function metadataNetworkDispatchAuthorizedV6(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authorization = value as Record<string, unknown>;
  return (
    authorization.metadataNetworkAuthorized === true &&
    authorization.hostileAuditPassed === true &&
    authorization.dispatchCommandPresent === true
  );
}

function fail(label: string, detail: string): never {
  throw new Error(`${label}: ${detail}`);
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(label, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    fail(label, "must be plain JSON");
  return value as JsonObject;
}

function exactKeys(
  value: unknown,
  label: string,
  keys: readonly string[],
): JsonObject {
  const row = object(value, label);
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `keys differ: ${actual.join(",")}`);
  }
  return row;
}

function stringValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0)
    fail(label, "must be a non-empty string");
}

function numberValue(
  value: unknown,
  label: string,
  integer = false,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (integer && !Number.isSafeInteger(value))
  ) {
    fail(label, "must be a non-negative finite number");
  }
}

function hashValue(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value))
    fail(label, "must be SHA-256 hex");
}

function literal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(label, `must equal ${JSON.stringify(expected)}`);
}

function exactStringArray(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (
    !Array.isArray(value) ||
    JSON.stringify(value) !== JSON.stringify(expected)
  ) {
    fail(label, `must equal ${JSON.stringify(expected)}`);
  }
}

export function conservativeCostV6(input: {
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
  const raw =
    ((input.bodyBytes + input.serverTokenOverheadUpperBound) *
      input.inputUsdPer1M +
      input.maxOutputTokens * input.outputUsdPer1M) /
      1_000_000 +
    input.fixedRequestUsd;
  return Math.ceil(raw * input.safetyMultiplier * 1e9) / 1e9;
}

function validateAssignments(
  value: unknown,
  protocol: JsonObject,
): AssignmentV6[] {
  if (!Array.isArray(value) || value.length !== 2)
    fail("durableBounds.assignments", "must contain two rows");
  const pricing = object(
    protocol.pricingEvidenceContract,
    "pricingEvidenceContract",
  );
  numberValue(
    pricing.serverTokenOverheadUpperBound,
    "pricingEvidenceContract.serverTokenOverheadUpperBound",
    true,
  );
  numberValue(
    pricing.safetyMultiplier,
    "pricingEvidenceContract.safetyMultiplier",
  );
  const rows = value.map((candidate, index) => {
    const row = exactKeys(candidate, `assignment[${index}]`, [
      "ordinal",
      "plan",
      "modelId",
      "exactWireBodyUtf8Bytes",
      "exactWireBodySha256",
      "maxOutputTokens",
      "emergencyInputUsdPer1M",
      "emergencyOutputUsdPer1M",
      "emergencyRequestUsd",
      "calculatedWorstCaseUsdCap",
      "timeoutMs",
    ]);
    const plan: PilotPlanV6 = index === 0 ? "STANDARD" : "PREMIUM";
    literal(row.ordinal, index + 1, `assignment[${index}].ordinal`);
    literal(row.plan, plan, `assignment[${index}].plan`);
    literal(row.modelId, MODELS[plan], `assignment[${index}].modelId`);
    numberValue(
      row.exactWireBodyUtf8Bytes,
      `assignment[${index}].exactWireBodyUtf8Bytes`,
      true,
    );
    if ((row.exactWireBodyUtf8Bytes as number) < 1)
      fail(`assignment[${index}]`, "body bytes must be positive");
    hashValue(
      row.exactWireBodySha256,
      `assignment[${index}].exactWireBodySha256`,
    );
    literal(row.maxOutputTokens, 4000, `assignment[${index}].maxOutputTokens`);
    numberValue(
      row.emergencyInputUsdPer1M,
      `assignment[${index}].emergencyInputUsdPer1M`,
    );
    numberValue(
      row.emergencyOutputUsdPer1M,
      `assignment[${index}].emergencyOutputUsdPer1M`,
    );
    numberValue(
      row.emergencyRequestUsd,
      `assignment[${index}].emergencyRequestUsd`,
    );
    numberValue(
      row.calculatedWorstCaseUsdCap,
      `assignment[${index}].calculatedWorstCaseUsdCap`,
    );
    numberValue(row.timeoutMs, `assignment[${index}].timeoutMs`, true);
    const expectedCost = conservativeCostV6({
      bodyBytes: row.exactWireBodyUtf8Bytes as number,
      maxOutputTokens: 4000,
      inputUsdPer1M: row.emergencyInputUsdPer1M as number,
      outputUsdPer1M: row.emergencyOutputUsdPer1M as number,
      fixedRequestUsd: row.emergencyRequestUsd as number,
      serverTokenOverheadUpperBound:
        pricing.serverTokenOverheadUpperBound as number,
      safetyMultiplier: pricing.safetyMultiplier as number,
    });
    literal(
      row.calculatedWorstCaseUsdCap,
      expectedCost,
      `assignment[${index}].calculatedWorstCaseUsdCap`,
    );
    return row as unknown as AssignmentV6;
  });
  return rows;
}

export function validateProtocolV6(
  value: unknown,
): ConnectivityPilotProtocolV6 {
  const row = exactKeys(value, "protocol", [
    "schemaVersion",
    "artifactId",
    "status",
    "systemAuditRemediation",
    "lineage",
    "fixedProductionInput",
    "providerContract",
    "durableBounds",
    "pricingEvidenceContract",
    "exactWireCommitment",
    "compilerClosureContract",
    "transformerExecutionContract",
    "deploymentRuntimeTrust",
    "globalResearchLedger",
    "liveClosureContract",
    "frozenRuntimeContract",
    "processIsolation",
    "privatePersistence",
    "publicResultContract",
    "authorization",
    "authorFreezeActivity",
  ]);
  literal(
    row.schemaVersion,
    "question-quality-v6-connectivity-pilot-protocol-v6",
    "schemaVersion",
  );
  literal(row.artifactId, "campaign-v6-connectivity-pilot-v6", "artifactId");
  literal(
    row.status,
    "SOURCE_REMEDIATION_S1_S5_IMPLEMENTED_S6_FREEZE_AND_EXECUTION_BLOCKED",
    "status",
  );
  const remediation = exactKeys(
    row.systemAuditRemediation,
    "systemAuditRemediation",
    [
      "reviewDirectory",
      "reviewVerdict",
      "reviewFilesModified",
      "S1_PRIVATE_RUN_ANCESTOR_DIRECTORY_ENTRY_NOT_DURABLE",
      "S2_AUTHOR_AND_COMPILER_TSX_TRANSFORMER_UNSEALED",
      "S3_OPERATOR_BOOTSTRAP_PRELOAD_ENVIRONMENT_UNSEALED",
      "S4_CASE_ALIAS_ENVIRONMENT_POLICY_BYPASS",
      "S5_DEPLOYED_NODE_RUNTIME_PARITY_UNBOUND",
      "S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST",
      "remainingBlockerCodes",
    ],
  );
  literal(
    remediation.reviewDirectory,
    "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v6-system-independent-audit-v1",
    "system audit review directory",
  );
  literal(
    remediation.reviewVerdict,
    "FAIL_BLOCKERS",
    "system audit review verdict",
  );
  literal(
    remediation.reviewFilesModified,
    false,
    "system audit review immutability",
  );
  for (const key of [
    "S1_PRIVATE_RUN_ANCESTOR_DIRECTORY_ENTRY_NOT_DURABLE",
    "S2_AUTHOR_AND_COMPILER_TSX_TRANSFORMER_UNSEALED",
    "S3_OPERATOR_BOOTSTRAP_PRELOAD_ENVIRONMENT_UNSEALED",
    "S4_CASE_ALIAS_ENVIRONMENT_POLICY_BYPASS",
  ] as const) {
    literal(
      remediation[key],
      "IMPLEMENTED_PENDING_FRESH_INDEPENDENT_AUDIT",
      `systemAuditRemediation.${key}`,
    );
  }
  literal(
    remediation.S5_DEPLOYED_NODE_RUNTIME_PARITY_UNBOUND,
    "TRACKED_POLICY_BOUND_DEPLOYED_PARITY_NOT_CLAIMED",
    "systemAuditRemediation.S5",
  );
  literal(
    remediation.S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST,
    "BLOCKING_NO_FREEZE_NO_EXECUTION_PENDING_OBSERVER_AND_FRESH_AUDITS",
    "systemAuditRemediation.S6",
  );
  exactStringArray(
    remediation.remainingBlockerCodes,
    ["S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST"],
    "systemAuditRemediation.remainingBlockerCodes",
  );

  const lineage = exactKeys(row.lineage, "lineage", [
    "preserves",
    "replacesExecutionPackage",
    "v2Unmodified",
    "v3Unmodified",
    "v4Unmodified",
    "v5Unmodified",
    "v2AuditDisposition",
    "v3AuditDisposition",
    "v4AuditDisposition",
    "v5AuditDisposition",
    "v4IndependentAuditPins",
    "v5PredecessorPins",
  ]);
  exactStringArray(
    lineage.preserves,
    [
      "campaign-v6-connectivity-pilot-v2",
      "campaign-v6-connectivity-pilot-v3",
      "campaign-v6-connectivity-pilot-v4",
      "campaign-v6-connectivity-pilot-v5",
    ],
    "lineage.preserves",
  );
  literal(
    lineage.replacesExecutionPackage,
    true,
    "lineage.replacesExecutionPackage",
  );
  literal(lineage.v2Unmodified, true, "lineage.v2Unmodified");
  literal(lineage.v3Unmodified, true, "lineage.v3Unmodified");
  literal(lineage.v4Unmodified, true, "lineage.v4Unmodified");
  literal(lineage.v5Unmodified, true, "lineage.v5Unmodified");
  literal(
    lineage.v2AuditDisposition,
    "REJECTED_TEST_TRANSPORT_SEAM_AND_INCOMPLETE_LIVE_CLOSURE",
    "lineage.v2AuditDisposition",
  );
  literal(
    lineage.v3AuditDisposition,
    "REJECTED_INCOMPLETE_COMPILER_CLOSURE_AND_PERMISSIVE_RESPONSE_PARSER",
    "lineage.v3AuditDisposition",
  );
  literal(
    lineage.v4AuditDisposition,
    "REJECTED_DYNAMIC_COMPILER_INPUTS_METADATA_GUARD_PARSER_BILLING_AND_RECONCILIATION_GAPS",
    "lineage.v4AuditDisposition",
  );
  literal(
    lineage.v5AuditDisposition,
    "REJECTED_INDEPENDENT_CORRECTNESS_BLOCKERS_C1_C2_C3_C4",
    "lineage.v5AuditDisposition",
  );
  const v4Pins = exactKeys(
    lineage.v4IndependentAuditPins,
    "lineage.v4IndependentAuditPins",
    [
      "directory",
      "verdict",
      "protocolV4Sha256",
      "authorGatesSha256",
      "evidenceSha256",
      "reportSha256",
      "verifierSha256",
      "manifestFileSha256",
      "manifestRows",
    ],
  );
  literal(
    v4Pins.directory,
    "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1",
    "v4 audit directory",
  );
  literal(v4Pins.verdict, "FAIL", "v4 audit verdict");
  const expectedV4Pins: Record<string, string> = {
    protocolV4Sha256:
      "18d7eb7c60fdfc1d4b49fb868ef887d64e62db6d217abf8eaec0fbbeab8ffec9",
    authorGatesSha256:
      "5b0346fb581b5cd12381484061fee8b4fc17e56a10882d7e29651ee8cbf613b0",
    evidenceSha256:
      "2aff0d69c81169f2f806dcd59f9053ce939927603d75cb7d7c2a60cab501f3b6",
    reportSha256:
      "8f135466efc5182843cf5a257c5bb361cafb2c91122798c29768839d0f31fae3",
    verifierSha256:
      "2211da72c2249c1302eddac8f138acf91c4c302a36fbb7810d24f20035c73dd0",
    manifestFileSha256:
      "2b7fb398cad98647698c7dd4120f819c50645116c71e8ffe79ccb53530ba0791",
  };
  for (const [key, expected] of Object.entries(expectedV4Pins))
    literal(v4Pins[key], expected, `v4 audit ${key}`);
  literal(v4Pins.manifestRows, 9, "v4 audit manifestRows");
  const v5Pins = exactKeys(
    lineage.v5PredecessorPins,
    "lineage.v5PredecessorPins",
    [
      "subjectDirectory",
      "protocolSha256",
      "verifierSha256",
      "subjectManifestFileSha256",
      "authorReportSha256",
      "independentReviewDirectory",
      "independentReviewManifestFileSha256",
      "independentReviewVerdict",
      "blockerCodes",
      "predecessorPrivateFilesRead",
    ],
  );
  literal(
    v5Pins.subjectDirectory,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5",
    "v5 predecessor subject directory",
  );
  const expectedV5Pins: Record<string, string> = {
    protocolSha256:
      "0110dd37d475d3c16af6203774ddc77f0b560f803cf5a98c75455a452287ff0e",
    verifierSha256:
      "9b300f8335228629ee13e7a92dc2d545973dde2ecb63cbd259f3883a66279401",
    subjectManifestFileSha256:
      "3e38abaf88a7cfae759b2621272c3951df19c6c95de98425d6aa7f7affe624ac",
    authorReportSha256:
      "b26eb140073adbe96d01ffdb992d1658636c0ff7e072837a51d81aa2d22343c2",
    independentReviewManifestFileSha256:
      "4d8b3037450e3d9d5a02d755e7a567f1dd30f0cf1f2bccc8c3f870b499e0ab55",
  };
  for (const [key, expected] of Object.entries(expectedV5Pins)) {
    literal(v5Pins[key], expected, `v5 predecessor ${key}`);
  }
  literal(
    v5Pins.independentReviewDirectory,
    "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v5-independent-correctness-review-v1",
    "v5 independent correctness review directory",
  );
  literal(
    v5Pins.independentReviewVerdict,
    "FAIL_BLOCKERS",
    "v5 independent correctness review verdict",
  );
  exactStringArray(
    v5Pins.blockerCodes,
    [
      "C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT",
      "C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED",
      "C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE",
      "C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT",
    ],
    "v5 independent correctness blocker codes",
  );
  literal(
    v5Pins.predecessorPrivateFilesRead,
    0,
    "v5 predecessor private files read",
  );

  const input = exactKeys(row.fixedProductionInput, "fixedProductionInput", [
    "sourcePublicId",
    "questionType",
    "profileId",
    "difficulty",
    "schoolType",
    "gradeInfo",
    "count",
    "qualityMode",
    "attemptIndex",
    "teacherIntentBlock",
    "analysisContext",
    "customPrompt",
    "targetPoints",
  ]);
  literal(
    input.sourcePublicId,
    "OCVP-B01",
    "fixedProductionInput.sourcePublicId",
  );
  literal(
    input.questionType,
    "BLANK_INFERENCE",
    "fixedProductionInput.questionType",
  );
  literal(
    input.profileId,
    "B0_CURRENT_CONTROL",
    "fixedProductionInput.profileId",
  );
  literal(input.difficulty, "INTERMEDIATE", "fixedProductionInput.difficulty");
  literal(input.schoolType, "고등학교", "fixedProductionInput.schoolType");
  literal(input.gradeInfo, "2학년", "fixedProductionInput.gradeInfo");
  literal(input.count, 1, "fixedProductionInput.count");
  literal(input.qualityMode, "strict", "fixedProductionInput.qualityMode");
  literal(input.attemptIndex, 0, "fixedProductionInput.attemptIndex");
  literal(
    input.teacherIntentBlock,
    "",
    "fixedProductionInput.teacherIntentBlock",
  );
  literal(input.analysisContext, "", "fixedProductionInput.analysisContext");
  literal(input.customPrompt, "", "fixedProductionInput.customPrompt");
  exactStringArray(input.targetPoints, [], "fixedProductionInput.targetPoints");

  const provider = exactKeys(row.providerContract, "providerContract", [
    "endpoint",
    "exactEndpointTag",
    "order",
    "only",
    "allowFallbacks",
    "requireParameters",
    "dataCollection",
    "zdr",
    "reasoning",
    "completionCount",
    "strictJsonSchema",
    "terminalFinishReasons",
    "fullResponseSchemaValidation",
    "safeIntegerUsageAndExactTotal",
    "maxResponseBodyUtf8Bytes",
    "maxActualCostUsdPerResponse",
    "maxUsageTokensPerResponse",
    "exactMessageShapeRequired",
    "independentBillingExtractionOnTerminalFailure",
    "duplicateJsonKeysRejected",
    "reasoningUsageMustBeZeroIfPresent",
    "cacheUsageMustBeZeroIfPresent",
    "rawCandidateCardinalityObserved",
    "globalCandidateQuarantineOnAffirmativeExcessOrValidJsonAmbiguity",
    "ordinaryInvalidTransportBodyDoesNotGlobalQuarantine",
    "exactRequestHasNoImageToolPluginOrCacheSurface",
    "byokUsageMustBeExplicitlyFalse",
    "incompletePostSendBodyObservationGlobalQuarantine",
    "postSendChargeConstructionFailureSynthesizesManualQuarantineCharge",
    "dispatchedAttemptCannotSettleWithZeroCharges",
  ]);
  literal(
    provider.endpoint,
    "https://openrouter.ai/api/v1/chat/completions",
    "providerContract.endpoint",
  );
  literal(
    provider.exactEndpointTag,
    "google-vertex/global",
    "providerContract.exactEndpointTag",
  );
  exactStringArray(
    provider.order,
    ["google-vertex/global"],
    "providerContract.order",
  );
  exactStringArray(
    provider.only,
    ["google-vertex/global"],
    "providerContract.only",
  );
  literal(provider.allowFallbacks, false, "providerContract.allowFallbacks");
  literal(
    provider.requireParameters,
    true,
    "providerContract.requireParameters",
  );
  literal(provider.dataCollection, "deny", "providerContract.dataCollection");
  literal(provider.zdr, true, "providerContract.zdr");
  const reasoning = exactKeys(
    provider.reasoning,
    "providerContract.reasoning",
    ["enabled", "effort", "exclude"],
  );
  literal(reasoning.enabled, false, "reasoning.enabled");
  literal(reasoning.effort, "none", "reasoning.effort");
  literal(reasoning.exclude, true, "reasoning.exclude");
  literal(provider.completionCount, 1, "providerContract.completionCount");
  literal(provider.strictJsonSchema, true, "providerContract.strictJsonSchema");
  exactStringArray(
    provider.terminalFinishReasons,
    ["stop"],
    "providerContract.terminalFinishReasons",
  );
  literal(
    provider.fullResponseSchemaValidation,
    true,
    "providerContract.fullResponseSchemaValidation",
  );
  literal(
    provider.safeIntegerUsageAndExactTotal,
    true,
    "providerContract.safeIntegerUsageAndExactTotal",
  );
  literal(
    provider.maxResponseBodyUtf8Bytes,
    MODEL_RESPONSE_BODY_MAX_BYTES_V6,
    "providerContract.maxResponseBodyUtf8Bytes",
  );
  literal(
    provider.maxActualCostUsdPerResponse,
    MAX_PER_RESPONSE_ACTUAL_COST_USD_V6,
    "providerContract.maxActualCostUsdPerResponse",
  );
  literal(
    provider.maxUsageTokensPerResponse,
    MAX_PER_RESPONSE_USAGE_TOKENS_V6,
    "providerContract.maxUsageTokensPerResponse",
  );
  literal(
    provider.exactMessageShapeRequired,
    true,
    "providerContract.exactMessageShapeRequired",
  );
  literal(
    provider.independentBillingExtractionOnTerminalFailure,
    true,
    "providerContract.independentBillingExtractionOnTerminalFailure",
  );
  for (const key of [
    "duplicateJsonKeysRejected",
    "reasoningUsageMustBeZeroIfPresent",
    "cacheUsageMustBeZeroIfPresent",
    "rawCandidateCardinalityObserved",
    "globalCandidateQuarantineOnAffirmativeExcessOrValidJsonAmbiguity",
    "ordinaryInvalidTransportBodyDoesNotGlobalQuarantine",
    "exactRequestHasNoImageToolPluginOrCacheSurface",
    "byokUsageMustBeExplicitlyFalse",
    "incompletePostSendBodyObservationGlobalQuarantine",
    "postSendChargeConstructionFailureSynthesizesManualQuarantineCharge",
    "dispatchedAttemptCannotSettleWithZeroCharges",
  ] as const)
    literal(provider[key], true, `providerContract.${key}`);

  const bounds = exactKeys(row.durableBounds, "durableBounds", [
    "sharedCandidateCap",
    "sharedPhysicalFetchCap",
    "sharedCompletionCap",
    "concurrency",
    "serialOrder",
    "perAssignmentCandidateCap",
    "perAssignmentPhysicalFetchCap",
    "perAssignmentCompletionCap",
    "retryAllowed",
    "repairAllowed",
    "fallbackAllowed",
    "replacementAllowed",
    "topUpAllowed",
    "failureTimeoutUnknownTerminal",
    "reserveBeforeNetwork",
    "assignments",
    "sharedCostCapUsd",
  ]);
  for (const key of [
    "sharedCandidateCap",
    "sharedPhysicalFetchCap",
    "sharedCompletionCap",
  ] as const)
    literal(bounds[key], 2, `durableBounds.${key}`);
  literal(bounds.concurrency, 1, "durableBounds.concurrency");
  exactStringArray(
    bounds.serialOrder,
    ["STANDARD", "PREMIUM"],
    "durableBounds.serialOrder",
  );
  for (const key of [
    "perAssignmentCandidateCap",
    "perAssignmentPhysicalFetchCap",
    "perAssignmentCompletionCap",
  ] as const)
    literal(bounds[key], 1, `durableBounds.${key}`);
  for (const key of [
    "retryAllowed",
    "repairAllowed",
    "fallbackAllowed",
    "replacementAllowed",
    "topUpAllowed",
  ] as const)
    literal(bounds[key], false, `durableBounds.${key}`);
  literal(
    bounds.failureTimeoutUnknownTerminal,
    true,
    "durableBounds.failureTimeoutUnknownTerminal",
  );
  literal(
    bounds.reserveBeforeNetwork,
    true,
    "durableBounds.reserveBeforeNetwork",
  );
  const assignments = validateAssignments(bounds.assignments, row);
  numberValue(bounds.sharedCostCapUsd, "durableBounds.sharedCostCapUsd");
  literal(
    bounds.sharedCostCapUsd,
    Math.ceil(
      assignments.reduce(
        (sum, item) => sum + item.calculatedWorstCaseUsdCap,
        0,
      ) * 1e9,
    ) / 1e9,
    "durableBounds.sharedCostCapUsd",
  );

  const pricing = exactKeys(
    row.pricingEvidenceContract,
    "pricingEvidenceContract",
    [
      "schemaVersion",
      "maximumAgeMs",
      "exactEndpointCardinality",
      "requiredParameters",
      "canonicalSlugRequired",
      "allActiveEndpointsAndOverridesRequired",
      "chargeDimensionsRequired",
      "contentHashRequired",
      "serverTokenOverheadUpperBound",
      "safetyMultiplier",
      "maxMetadataResponseBodyUtf8Bytes",
      "fixedRequestFeesIncludedInReserve",
      "knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation",
      "unknownChargeDimensionsRejected",
      "rawHttpEvidenceBundleRequired",
      "rawHttpDuplicateKeysRejected",
      "omittedFixedRequestFeeAssumedZero",
      "privateBundlePreReadMaxBytes",
      "topLevelFixedRequestIncludedInEmergencyCeiling",
      "topLevelPromptAndCompletionIncludedInEmergencyCeiling",
      "cacheReadWriteRatesIncludedInEmergencyInputCeiling",
      "reasoningRatesIncludedInEmergencyOutputCeiling",
      "imageAndWebSearchZeroUseProvenByExactRequestShape",
      "privateBundleFdBoundExactReadRequired",
      "captureToLiveInMemoryFileAndBundleHashHandoffRequired",
    ],
  );
  literal(
    pricing.schemaVersion,
    "question-quality-openrouter-public-price-snapshot-v6",
    "pricingEvidenceContract.schemaVersion",
  );
  literal(pricing.maximumAgeMs, 900000, "pricingEvidenceContract.maximumAgeMs");
  literal(
    pricing.exactEndpointCardinality,
    1,
    "pricingEvidenceContract.exactEndpointCardinality",
  );
  exactStringArray(
    pricing.requiredParameters,
    ["response_format", "structured_outputs"],
    "pricingEvidenceContract.requiredParameters",
  );
  for (const key of [
    "canonicalSlugRequired",
    "allActiveEndpointsAndOverridesRequired",
    "chargeDimensionsRequired",
    "contentHashRequired",
  ] as const)
    literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  numberValue(
    pricing.serverTokenOverheadUpperBound,
    "pricingEvidenceContract.serverTokenOverheadUpperBound",
    true,
  );
  numberValue(
    pricing.safetyMultiplier,
    "pricingEvidenceContract.safetyMultiplier",
  );
  literal(
    pricing.maxMetadataResponseBodyUtf8Bytes,
    METADATA_RESPONSE_BODY_MAX_BYTES_V6,
    "pricingEvidenceContract.maxMetadataResponseBodyUtf8Bytes",
  );
  literal(
    pricing.fixedRequestFeesIncludedInReserve,
    true,
    "pricingEvidenceContract.fixedRequestFeesIncludedInReserve",
  );
  literal(
    pricing.knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation,
    true,
    "pricingEvidenceContract.knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation",
  );
  literal(
    pricing.unknownChargeDimensionsRejected,
    true,
    "pricingEvidenceContract.unknownChargeDimensionsRejected",
  );
  for (const key of [
    "rawHttpEvidenceBundleRequired",
    "rawHttpDuplicateKeysRejected",
    "topLevelFixedRequestIncludedInEmergencyCeiling",
    "topLevelPromptAndCompletionIncludedInEmergencyCeiling",
    "cacheReadWriteRatesIncludedInEmergencyInputCeiling",
    "reasoningRatesIncludedInEmergencyOutputCeiling",
    "imageAndWebSearchZeroUseProvenByExactRequestShape",
    "privateBundleFdBoundExactReadRequired",
    "captureToLiveInMemoryFileAndBundleHashHandoffRequired",
  ] as const)
    literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  literal(
    pricing.omittedFixedRequestFeeAssumedZero,
    false,
    "pricingEvidenceContract.omittedFixedRequestFeeAssumedZero",
  );
  literal(
    pricing.privateBundlePreReadMaxBytes,
    306184192,
    "pricingEvidenceContract.privateBundlePreReadMaxBytes",
  );

  const wire = exactKeys(row.exactWireCommitment, "exactWireCommitment", [
    "privateArtifactPath",
    "privateArtifactSha256",
    "publicArtifactPath",
    "publicArtifactSha256",
    "locallyInterceptedProductionCompilerFetches",
    "externalNetworkCalls",
    "providerCalls",
    "modelCalls",
    "apiCandidatesConsumed",
  ]);
  literal(
    wire.privateArtifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/private/exact-wire-v6.private.json",
    "exactWireCommitment.privateArtifactPath",
  );
  literal(
    wire.publicArtifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline-exact-wire-seal-v6.json",
    "exactWireCommitment.publicArtifactPath",
  );
  hashValue(
    wire.privateArtifactSha256,
    "exactWireCommitment.privateArtifactSha256",
  );
  hashValue(
    wire.publicArtifactSha256,
    "exactWireCommitment.publicArtifactSha256",
  );
  literal(
    wire.locallyInterceptedProductionCompilerFetches,
    2,
    "exactWireCommitment.locallyInterceptedProductionCompilerFetches",
  );
  for (const key of [
    "externalNetworkCalls",
    "providerCalls",
    "modelCalls",
    "apiCandidatesConsumed",
  ] as const)
    literal(wire[key], 0, `exactWireCommitment.${key}`);

  const compilerClosure = exactKeys(
    row.compilerClosureContract,
    "compilerClosureContract",
    [
      "artifactPath",
      "artifactSha256",
      "semanticSha256",
      "algorithm",
      "entrypoints",
      "exactSourceFiles",
      "exactDynamicSourceInputs",
      "exactDeclaredDataInputs",
      "exactTotalFiles",
      "exactEqualityRequired",
      "zeroUnresolvedLocalRequired",
      "zeroNonliteralDynamicRequired",
      "minimumCountChecksForbidden",
      "inheritedThirtyTwoRowSubsetAuthority",
      "externalInputsExactEqualityRequired",
      "compilerFsReadSitesStaticallyEnumerated",
      "isolatedChildEnvironmentRequired",
    ],
  );
  literal(
    compilerClosure.artifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-closure-v6.json",
    "compilerClosureContract.artifactPath",
  );
  hashValue(
    compilerClosure.artifactSha256,
    "compilerClosureContract.artifactSha256",
  );
  hashValue(
    compilerClosure.semanticSha256,
    "compilerClosureContract.semanticSha256",
  );
  literal(
    compilerClosure.algorithm,
    "INDEPENDENT_AST_PLUS_DYNAMIC_SOURCE_PLUS_DATA_PLUS_EXTERNAL_INPUTS_V3",
    "compilerClosureContract.algorithm",
  );
  exactStringArray(
    compilerClosure.entrypoints,
    [
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-child.mts",
    ],
    "compilerClosureContract.entrypoints",
  );
  numberValue(
    compilerClosure.exactSourceFiles,
    "compilerClosureContract.exactSourceFiles",
    true,
  );
  literal(
    compilerClosure.exactDynamicSourceInputs,
    3,
    "compilerClosureContract.exactDynamicSourceInputs",
  );
  numberValue(
    compilerClosure.exactDeclaredDataInputs,
    "compilerClosureContract.exactDeclaredDataInputs",
    true,
  );
  numberValue(
    compilerClosure.exactTotalFiles,
    "compilerClosureContract.exactTotalFiles",
    true,
  );
  literal(
    compilerClosure.exactTotalFiles,
    (compilerClosure.exactSourceFiles as number) +
      (compilerClosure.exactDynamicSourceInputs as number) +
      (compilerClosure.exactDeclaredDataInputs as number),
    "compilerClosureContract.exactTotalFiles",
  );
  for (const key of [
    "exactEqualityRequired",
    "zeroUnresolvedLocalRequired",
    "zeroNonliteralDynamicRequired",
    "minimumCountChecksForbidden",
    "externalInputsExactEqualityRequired",
    "compilerFsReadSitesStaticallyEnumerated",
    "isolatedChildEnvironmentRequired",
  ] as const)
    literal(compilerClosure[key], true, `compilerClosureContract.${key}`);
  literal(
    compilerClosure.inheritedThirtyTwoRowSubsetAuthority,
    false,
    "compilerClosureContract.inheritedThirtyTwoRowSubsetAuthority",
  );

  const transformer = exactKeys(
    row.transformerExecutionContract,
    "transformerExecutionContract",
    [
      "scope",
      "lockPath",
      "lockBytes",
      "lockSha256",
      "independentPreTransformRootPath",
      "independentPreTransformRootBytes",
      "independentPreTransformRootSha256",
      "rootExcludedFromRootedLockToAvoidHashCycle",
      "sealedImplementationFiles",
      "sealedImplementationBytes",
      "sealedPackages",
      "sealedFiles",
      "sealedBytes",
      "plainNodeLauncherPath",
      "externalAuthorBootstrapPath",
      "externalAuthorBootstrapPlatform",
      "authorNodeExecutablePath",
      "authorNodeExecutableBytes",
      "authorNodeExecutableSha256",
      "authorRoleEntrypoint",
      "compilerRoleEntrypoint",
      "validationRoleEntrypoints",
      "validationNodeArguments",
      "authorProvenanceArtifactPath",
      "compilerProvenanceArtifactPath",
      "validationProvenanceArtifactPath",
      "actualSourceToExecutedJavaScriptMappingRequired",
      "directPlainNodeAuthorRoleAllowed",
      "directTsxCliAuthorityAllowed",
      "packageLockAloneIsTransformerAuthority",
      "liveRuntimeTsxAllowed",
      "provenanceArtifactsMaterialized",
    ],
  );
  literal(
    transformer.scope,
    "AUTHOR_COMPILER_AND_AUTHOR_VALIDATION_ONLY",
    "transformerExecutionContract.scope",
  );
  literal(
    transformer.lockPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/tsx-transformer-lock-v6.json",
    "transformerExecutionContract.lockPath",
  );
  literal(
    transformer.lockBytes,
    4076,
    "transformerExecutionContract.lockBytes",
  );
  literal(
    transformer.lockSha256,
    "4c1d7ea0ac2d11a55eecbf3fec72a186eae8da41d4ee3366a58742b65d2b6958",
    "transformerExecutionContract.lockSha256",
  );
  literal(
    transformer.independentPreTransformRootPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/tsx-transform-root-v6.mjs",
    "transformerExecutionContract.independentPreTransformRootPath",
  );
  literal(
    transformer.independentPreTransformRootBytes,
    1592,
    "transformerExecutionContract.independentPreTransformRootBytes",
  );
  literal(
    transformer.independentPreTransformRootSha256,
    "9925ac57fafdad1e3dcdd9efbabb9442289a103d147b28b00870caf652c836dc",
    "transformerExecutionContract.independentPreTransformRootSha256",
  );
  literal(
    transformer.rootExcludedFromRootedLockToAvoidHashCycle,
    true,
    "transformerExecutionContract.rootExcludedFromRootedLockToAvoidHashCycle",
  );
  literal(
    transformer.sealedImplementationFiles,
    5,
    "transformerExecutionContract.sealedImplementationFiles",
  );
  literal(
    transformer.sealedImplementationBytes,
    30143,
    "transformerExecutionContract.sealedImplementationBytes",
  );
  literal(
    transformer.sealedPackages,
    5,
    "transformerExecutionContract.sealedPackages",
  );
  literal(
    transformer.sealedFiles,
    74,
    "transformerExecutionContract.sealedFiles",
  );
  literal(
    transformer.sealedBytes,
    12115785,
    "transformerExecutionContract.sealedBytes",
  );
  literal(
    transformer.plainNodeLauncherPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/sealed-transform-launcher.mjs",
    "transformerExecutionContract.plainNodeLauncherPath",
  );
  literal(
    transformer.externalAuthorBootstrapPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/author-bootstrap-v6.ps1",
    "transformerExecutionContract.externalAuthorBootstrapPath",
  );
  literal(
    transformer.externalAuthorBootstrapPlatform,
    "WIN32_POWERSHELL_NO_PROFILE_EXACT_ENV",
    "transformerExecutionContract.externalAuthorBootstrapPlatform",
  );
  literal(
    transformer.authorNodeExecutablePath,
    "C:\\Program Files\\nodejs\\node.exe",
    "transformerExecutionContract.authorNodeExecutablePath",
  );
  literal(
    transformer.authorNodeExecutableBytes,
    89578992,
    "transformerExecutionContract.authorNodeExecutableBytes",
  );
  literal(
    transformer.authorNodeExecutableSha256,
    "c1b274a8d0a23e060fc42ce71c3cdfa1569b83d91ba82cc59fa907da97a425e9",
    "transformerExecutionContract.authorNodeExecutableSha256",
  );
  literal(
    transformer.authorRoleEntrypoint,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/build-offline.mts",
    "transformerExecutionContract.authorRoleEntrypoint",
  );
  literal(
    transformer.compilerRoleEntrypoint,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-child.mts",
    "transformerExecutionContract.compilerRoleEntrypoint",
  );
  exactStringArray(
    transformer.validationRoleEntrypoints,
    [
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline.test.ts",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/system-boundary.test.ts",
    ],
    "transformerExecutionContract.validationRoleEntrypoints",
  );
  exactStringArray(
    transformer.validationNodeArguments,
    ["--test", "--test-isolation=none", "--test-concurrency=1"],
    "transformerExecutionContract.validationNodeArguments",
  );
  literal(
    transformer.authorProvenanceArtifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/author-transform-provenance-v6.json",
    "transformerExecutionContract.authorProvenanceArtifactPath",
  );
  literal(
    transformer.compilerProvenanceArtifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/compiler-transform-provenance-v6.json",
    "transformerExecutionContract.compilerProvenanceArtifactPath",
  );
  literal(
    transformer.validationProvenanceArtifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/validation-transform-provenance-v6.json",
    "transformerExecutionContract.validationProvenanceArtifactPath",
  );
  literal(
    transformer.actualSourceToExecutedJavaScriptMappingRequired,
    true,
    "transformerExecutionContract.actualSourceToExecutedJavaScriptMappingRequired",
  );
  for (const key of [
    "directPlainNodeAuthorRoleAllowed",
    "directTsxCliAuthorityAllowed",
    "packageLockAloneIsTransformerAuthority",
    "liveRuntimeTsxAllowed",
    "provenanceArtifactsMaterialized",
  ] as const)
    literal(transformer[key], false, `transformerExecutionContract.${key}`);

  const deployment = exactKeys(
    row.deploymentRuntimeTrust,
    "deploymentRuntimeTrust",
    [
      "trackedPackageEngine",
      "trackedPackageLockRoot",
      "trackedLineEndingPolicy",
      "trackedVercelDescriptor",
      "ignoredLocalProjectHint",
      "currentRemoteDeploymentEvidencePresent",
      "currentDeployedCommitEvidencePresent",
      "deployedRuntimeParityClaimed",
      "unknownRemoteOrCommitDisposition",
    ],
  );
  const packageEngine = exactKeys(
    deployment.trackedPackageEngine,
    "deploymentRuntimeTrust.trackedPackageEngine",
    ["path", "bytes", "sha256", "nodePolicy", "trustLevel"],
  );
  literal(
    packageEngine.path,
    "package.json",
    "deploymentRuntimeTrust.trackedPackageEngine.path",
  );
  literal(
    packageEngine.bytes,
    4496,
    "deploymentRuntimeTrust.trackedPackageEngine.bytes",
  );
  literal(
    packageEngine.sha256,
    "62eeef660ffc172eee422ddf9a55342366fff897633070926da7240d4ac4a7bc",
    "deploymentRuntimeTrust.trackedPackageEngine.sha256",
  );
  literal(
    packageEngine.nodePolicy,
    "24.x",
    "deploymentRuntimeTrust.trackedPackageEngine.nodePolicy",
  );
  literal(
    packageEngine.trustLevel,
    "TRACKED_DEPLOYMENT_INPUT",
    "deploymentRuntimeTrust.trackedPackageEngine.trustLevel",
  );
  const packageLockRoot = exactKeys(
    deployment.trackedPackageLockRoot,
    "deploymentRuntimeTrust.trackedPackageLockRoot",
    ["path", "bytes", "sha256", "nodePolicy", "trustLevel"],
  );
  literal(
    packageLockRoot.path,
    "package-lock.json",
    "deploymentRuntimeTrust.trackedPackageLockRoot.path",
  );
  literal(
    packageLockRoot.bytes,
    777883,
    "deploymentRuntimeTrust.trackedPackageLockRoot.bytes",
  );
  literal(
    packageLockRoot.sha256,
    "c16c85142716e7a13131bd6a4bf5c8ddc667cde75e37367e22c1582ed7d96f72",
    "deploymentRuntimeTrust.trackedPackageLockRoot.sha256",
  );
  literal(
    packageLockRoot.nodePolicy,
    "24.x",
    "deploymentRuntimeTrust.trackedPackageLockRoot.nodePolicy",
  );
  literal(
    packageLockRoot.trustLevel,
    "TRACKED_LOCK_ROOT_CORROBORATION",
    "deploymentRuntimeTrust.trackedPackageLockRoot.trustLevel",
  );
  const lineEndings = exactKeys(
    deployment.trackedLineEndingPolicy,
    "deploymentRuntimeTrust.trackedLineEndingPolicy",
    ["path", "bytes", "sha256", "exactRules", "trustLevel"],
  );
  literal(
    lineEndings.path,
    ".gitattributes",
    "deploymentRuntimeTrust.trackedLineEndingPolicy.path",
  );
  literal(
    lineEndings.bytes,
    454,
    "deploymentRuntimeTrust.trackedLineEndingPolicy.bytes",
  );
  literal(
    lineEndings.sha256,
    "b7855de9675977ce7f941b0a09310748a32c5efaeb2f14a2d14931b6f0c3652c",
    "deploymentRuntimeTrust.trackedLineEndingPolicy.sha256",
  );
  exactStringArray(
    lineEndings.exactRules,
    [
      "/.gitattributes text eol=lf",
      "/package.json text eol=lf",
      "/package-lock.json text eol=lf",
      "/experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/** text eol=lf",
    ],
    "deploymentRuntimeTrust.trackedLineEndingPolicy.exactRules",
  );
  literal(
    lineEndings.trustLevel,
    "TRACKED_EXACT_BYTE_CHECKOUT_POLICY",
    "deploymentRuntimeTrust.trackedLineEndingPolicy.trustLevel",
  );
  const vercel = exactKeys(
    deployment.trackedVercelDescriptor,
    "deploymentRuntimeTrust.trackedVercelDescriptor",
    ["path", "bytes", "sha256", "directNodeRuntimePinPresent", "trustLevel"],
  );
  literal(
    vercel.path,
    "vercel.json",
    "deploymentRuntimeTrust.trackedVercelDescriptor.path",
  );
  literal(
    vercel.bytes,
    119,
    "deploymentRuntimeTrust.trackedVercelDescriptor.bytes",
  );
  literal(
    vercel.sha256,
    "b3fb19b0df4a06c31bf64a9dbfa9c23ea0675b83257e3d50f399e1581223cc67",
    "deploymentRuntimeTrust.trackedVercelDescriptor.sha256",
  );
  literal(
    vercel.directNodeRuntimePinPresent,
    false,
    "deploymentRuntimeTrust.trackedVercelDescriptor.directNodeRuntimePinPresent",
  );
  literal(
    vercel.trustLevel,
    "TRACKED_DESCRIPTOR_NO_CONFLICTING_NODE_OVERRIDE",
    "deploymentRuntimeTrust.trackedVercelDescriptor.trustLevel",
  );
  const localHint = exactKeys(
    deployment.ignoredLocalProjectHint,
    "deploymentRuntimeTrust.ignoredLocalProjectHint",
    [
      "observedSha256FromImmutableAudit",
      "observedNodePolicy",
      "tracked",
      "trustLevel",
    ],
  );
  literal(
    localHint.observedSha256FromImmutableAudit,
    "c2387c39b820f9ecae28758176e7861ab9de9dbef33d94cb6a57f1ef292e33fe",
    "deploymentRuntimeTrust.ignoredLocalProjectHint.observedSha256FromImmutableAudit",
  );
  literal(
    localHint.observedNodePolicy,
    "24.x",
    "deploymentRuntimeTrust.ignoredLocalProjectHint.observedNodePolicy",
  );
  literal(
    localHint.tracked,
    false,
    "deploymentRuntimeTrust.ignoredLocalProjectHint.tracked",
  );
  literal(
    localHint.trustLevel,
    "CORROBORATING_ONLY_UNTRACKED_NOT_AUTHORITY",
    "deploymentRuntimeTrust.ignoredLocalProjectHint.trustLevel",
  );
  for (const key of [
    "currentRemoteDeploymentEvidencePresent",
    "currentDeployedCommitEvidencePresent",
    "deployedRuntimeParityClaimed",
  ] as const)
    literal(deployment[key], false, `deploymentRuntimeTrust.${key}`);
  literal(
    deployment.unknownRemoteOrCommitDisposition,
    "BLOCK_FREEZE_AND_EXECUTION_PENDING_FRESH_EVIDENCE",
    "deploymentRuntimeTrust.unknownRemoteOrCommitDisposition",
  );

  const ledger = exactKeys(row.globalResearchLedger, "globalResearchLedger", [
    "path",
    "globalCap",
    "requiredPreAuthorUsed",
    "requiredPreAuthorReserved",
    "liveReservation",
    "authorFreezeMutationAllowed",
    "privateStoreReservationAlsoRequired",
    "atomicLockRequired",
    "globalCapacityQuarantineOnCandidateExcessOrAmbiguity",
    "ordinaryInvalidBodySettlesSingleOpportunityWithoutGlobalQuarantine",
    "postCommitCleanupOutcomeRequired",
  ]);
  literal(
    ledger.path,
    "experiments/question-quality-20260715/budget-ledger.json",
    "globalResearchLedger.path",
  );
  literal(ledger.globalCap, 1000, "globalResearchLedger.globalCap");
  literal(
    ledger.requiredPreAuthorUsed,
    0,
    "globalResearchLedger.requiredPreAuthorUsed",
  );
  literal(
    ledger.requiredPreAuthorReserved,
    0,
    "globalResearchLedger.requiredPreAuthorReserved",
  );
  literal(ledger.liveReservation, 2, "globalResearchLedger.liveReservation");
  literal(
    ledger.authorFreezeMutationAllowed,
    false,
    "globalResearchLedger.authorFreezeMutationAllowed",
  );
  literal(
    ledger.privateStoreReservationAlsoRequired,
    true,
    "globalResearchLedger.privateStoreReservationAlsoRequired",
  );
  literal(
    ledger.atomicLockRequired,
    true,
    "globalResearchLedger.atomicLockRequired",
  );
  for (const key of [
    "globalCapacityQuarantineOnCandidateExcessOrAmbiguity",
    "ordinaryInvalidBodySettlesSingleOpportunityWithoutGlobalQuarantine",
    "postCommitCleanupOutcomeRequired",
  ] as const)
    literal(ledger[key], true, `globalResearchLedger.${key}`);

  const closure = exactKeys(row.liveClosureContract, "liveClosureContract", [
    "artifactPath",
    "algorithm",
    "exactEntrypointSetRequired",
    "exactTransitiveFileSetRequired",
    "exactBytesAndSha256Required",
    "literalDynamicImportsIncluded",
    "runtimeDataReadsClassified",
    "minimumCountChecksForbidden",
    "testSupportExcluded",
    "exactExpectedFiles",
    "declaredFrozenRuntimeArtifactsIncluded",
    "declaredOperatorBootstrapArtifactsIncluded",
    "exactExpectedExternalFiles",
    "externalNodeExecutableIdentityRequired",
  ]);
  literal(
    closure.artifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/live-closure-v6.json",
    "liveClosureContract.artifactPath",
  );
  literal(
    closure.algorithm,
    "TYPESCRIPT_AST_TRANSITIVE_IMPORTS_PLUS_DECLARED_RUNTIME_AND_BOOTSTRAP_DATA_V2",
    "liveClosureContract.algorithm",
  );
  for (const key of [
    "exactEntrypointSetRequired",
    "exactTransitiveFileSetRequired",
    "exactBytesAndSha256Required",
    "literalDynamicImportsIncluded",
    "runtimeDataReadsClassified",
    "testSupportExcluded",
  ] as const)
    literal(closure[key], true, `liveClosureContract.${key}`);
  literal(
    closure.minimumCountChecksForbidden,
    true,
    "liveClosureContract.minimumCountChecksForbidden",
  );
  literal(
    closure.exactExpectedFiles,
    27,
    "liveClosureContract.exactExpectedFiles",
  );
  literal(
    closure.declaredFrozenRuntimeArtifactsIncluded,
    true,
    "liveClosureContract.declaredFrozenRuntimeArtifactsIncluded",
  );
  literal(
    closure.declaredOperatorBootstrapArtifactsIncluded,
    true,
    "liveClosureContract.declaredOperatorBootstrapArtifactsIncluded",
  );
  literal(
    closure.exactExpectedExternalFiles,
    1,
    "liveClosureContract.exactExpectedExternalFiles",
  );
  literal(
    closure.externalNodeExecutableIdentityRequired,
    true,
    "liveClosureContract.externalNodeExecutableIdentityRequired",
  );

  const frozen = exactKeys(row.frozenRuntimeContract, "frozenRuntimeContract", [
    "artifactPath",
    "artifactSha256",
    "artifactContentSha256",
    "bundleSetSha256",
    "executionLoader",
    "entrypoints",
    "nodeVersion",
    "nodeExecutableSha256",
    "allBundleBytesRequired",
    "nodeExecutableIdentityRequired",
    "sourceTsxRuntimeAllowed",
    "externalRuntimePackagesAllowed",
    "authorFreezePermanentlyNoDispatch",
    "authorizationPackagePolicy",
  ]);
  literal(
    frozen.artifactPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-runtime-v6.json",
    "frozenRuntimeContract.artifactPath",
  );
  for (const key of [
    "artifactSha256",
    "artifactContentSha256",
    "bundleSetSha256",
    "nodeExecutableSha256",
  ] as const)
    hashValue(frozen[key], `frozenRuntimeContract.${key}`);
  literal(
    frozen.executionLoader,
    "PLAIN_NODE_ESM_BUNDLES",
    "frozenRuntimeContract.executionLoader",
  );
  exactStringArray(
    frozen.entrypoints,
    [
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/capture-price-snapshot-v6.bundle.mjs",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/live-child-v6.bundle.mjs",
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/operator-wrapper-v6.bundle.mjs",
    ],
    "frozenRuntimeContract.entrypoints",
  );
  stringValue(frozen.nodeVersion, "frozenRuntimeContract.nodeVersion");
  literal(
    frozen.allBundleBytesRequired,
    true,
    "frozenRuntimeContract.allBundleBytesRequired",
  );
  literal(
    frozen.nodeExecutableIdentityRequired,
    true,
    "frozenRuntimeContract.nodeExecutableIdentityRequired",
  );
  literal(
    frozen.sourceTsxRuntimeAllowed,
    false,
    "frozenRuntimeContract.sourceTsxRuntimeAllowed",
  );
  literal(
    frozen.externalRuntimePackagesAllowed,
    false,
    "frozenRuntimeContract.externalRuntimePackagesAllowed",
  );
  literal(
    frozen.authorFreezePermanentlyNoDispatch,
    true,
    "frozenRuntimeContract.authorFreezePermanentlyNoDispatch",
  );
  literal(
    frozen.authorizationPackagePolicy,
    "SEPARATE_DIRECTORY_NEW_BUNDLES_SUBJECT_AND_INDEPENDENT_AUDIT_MANIFESTS_REQUIRED",
    "frozenRuntimeContract.authorizationPackagePolicy",
  );

  const isolation = exactKeys(row.processIsolation, "processIsolation", [
    "soleAuthorizedAuthorBuildEntry",
    "authorBuildExternalBootstrapPath",
    "authorBuildExactEnvironmentNames",
    "authorBuildNodeExecutablePath",
    "authorBuildNodeExecutableBytes",
    "authorBuildNodeExecutableSha256",
    "authorBuildExactSystemRoot",
    "authorBuildExactPath",
    "directAuthorNodeLauncherAuthorized",
    "ambientPreloadProbeMustRemainUnexecuted",
    "soleAuthorizedOperatorEntry",
    "posixExternalBootstrapPath",
    "plainNodePreflightPath",
    "externalBootstrapExactEnvironmentNames",
    "externalBootstrapExactPath",
    "externalBootstrapNodeRealpath",
    "secondEnvIAtNodeExecRequired",
    "preloadLoaderAndPnpRejectedBeforeOperatorNode",
    "directOperatorBundleInvocationAuthorized",
    "windowsLiveExecutionAllowed",
    "liveLauncherExplicitEnvironmentNames",
    "metadataLauncherExplicitEnvironmentNames",
    "windowsObservedAutoInjectedEnvironmentNames",
    "nonWindowsObservedAutoInjectedEnvironmentNames",
    "exactObservedNameSetRequired",
    "ambientPreloadNamesForbidden",
    "credentialNamesForbiddenExcept",
  ]);
  literal(
    isolation.soleAuthorizedAuthorBuildEntry,
    "WINDOWS_POWERSHELL_NO_PROFILE_EXACT_ENV_THEN_PINNED_NODE_LAUNCHER",
    "processIsolation.soleAuthorizedAuthorBuildEntry",
  );
  literal(
    isolation.authorBuildExternalBootstrapPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/author-bootstrap-v6.ps1",
    "processIsolation.authorBuildExternalBootstrapPath",
  );
  exactStringArray(
    isolation.authorBuildExactEnvironmentNames,
    [
      "COMSPEC",
      "PATH",
      "PATHEXT",
      "QGEN_V6_AUTHOR_EXTERNAL_BOOTSTRAP",
      "SystemRoot",
      "TEMP",
      "TMP",
      "WINDIR",
    ],
    "processIsolation.authorBuildExactEnvironmentNames",
  );
  literal(
    isolation.authorBuildNodeExecutablePath,
    "C:\\Program Files\\nodejs\\node.exe",
    "processIsolation.authorBuildNodeExecutablePath",
  );
  literal(
    isolation.authorBuildNodeExecutableBytes,
    89578992,
    "processIsolation.authorBuildNodeExecutableBytes",
  );
  literal(
    isolation.authorBuildNodeExecutableSha256,
    "c1b274a8d0a23e060fc42ce71c3cdfa1569b83d91ba82cc59fa907da97a425e9",
    "processIsolation.authorBuildNodeExecutableSha256",
  );
  literal(
    isolation.authorBuildExactSystemRoot,
    "C:\\Windows",
    "processIsolation.authorBuildExactSystemRoot",
  );
  literal(
    isolation.authorBuildExactPath,
    "C:\\Windows\\System32",
    "processIsolation.authorBuildExactPath",
  );
  literal(
    isolation.directAuthorNodeLauncherAuthorized,
    false,
    "processIsolation.directAuthorNodeLauncherAuthorized",
  );
  literal(
    isolation.ambientPreloadProbeMustRemainUnexecuted,
    true,
    "processIsolation.ambientPreloadProbeMustRemainUnexecuted",
  );
  literal(
    isolation.soleAuthorizedOperatorEntry,
    "POSIX_EXTERNAL_ENV_I_THEN_PLAIN_NODE_PREFLIGHT",
    "processIsolation.soleAuthorizedOperatorEntry",
  );
  literal(
    isolation.posixExternalBootstrapPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-bootstrap-v6.sh",
    "processIsolation.posixExternalBootstrapPath",
  );
  literal(
    isolation.plainNodePreflightPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-bootstrap-preflight-v6.mjs",
    "processIsolation.plainNodePreflightPath",
  );
  exactStringArray(
    isolation.externalBootstrapExactEnvironmentNames,
    [
      "HOME",
      "LANG",
      "LC_ALL",
      "PATH",
      "QUESTION_QUALITY_V6_POSIX_ENV_I",
      "TMPDIR",
    ],
    "processIsolation.externalBootstrapExactEnvironmentNames",
  );
  literal(
    isolation.externalBootstrapExactPath,
    "/usr/bin:/bin",
    "processIsolation.externalBootstrapExactPath",
  );
  literal(
    isolation.externalBootstrapNodeRealpath,
    "/usr/bin/node",
    "processIsolation.externalBootstrapNodeRealpath",
  );
  literal(
    isolation.secondEnvIAtNodeExecRequired,
    true,
    "processIsolation.secondEnvIAtNodeExecRequired",
  );
  literal(
    isolation.preloadLoaderAndPnpRejectedBeforeOperatorNode,
    true,
    "processIsolation.preloadLoaderAndPnpRejectedBeforeOperatorNode",
  );
  literal(
    isolation.directOperatorBundleInvocationAuthorized,
    false,
    "processIsolation.directOperatorBundleInvocationAuthorized",
  );
  literal(
    isolation.windowsLiveExecutionAllowed,
    false,
    "processIsolation.windowsLiveExecutionAllowed",
  );
  exactStringArray(
    isolation.liveLauncherExplicitEnvironmentNames,
    [
      "SystemRoot",
      "WINDIR",
      "PATH",
      "PATHEXT",
      "TEMP",
      "TMP",
      "COMSPEC",
      "OPENROUTER_API_KEY",
      "QUESTION_QUALITY_CONNECTIVITY_PILOT_V6_LIVE_CHILD",
    ],
    "processIsolation.liveLauncherExplicitEnvironmentNames",
  );
  exactStringArray(
    isolation.metadataLauncherExplicitEnvironmentNames,
    ["SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP", "COMSPEC"],
    "processIsolation.metadataLauncherExplicitEnvironmentNames",
  );
  exactStringArray(
    isolation.windowsObservedAutoInjectedEnvironmentNames,
    [
      "HOMEDRIVE",
      "HOMEPATH",
      "LOGONSERVER",
      "SYSTEMDRIVE",
      "USERDOMAIN",
      "USERNAME",
      "USERPROFILE",
    ],
    "processIsolation.windowsObservedAutoInjectedEnvironmentNames",
  );
  exactStringArray(
    isolation.nonWindowsObservedAutoInjectedEnvironmentNames,
    [],
    "processIsolation.nonWindowsObservedAutoInjectedEnvironmentNames",
  );
  literal(
    isolation.exactObservedNameSetRequired,
    true,
    "processIsolation.exactObservedNameSetRequired",
  );
  exactStringArray(
    isolation.ambientPreloadNamesForbidden,
    [
      "DYLD_INSERT_LIBRARIES",
      "DYLD_LIBRARY_PATH",
      "ESBUILD_BINARY_PATH",
      "LD_LIBRARY_PATH",
      "LD_PRELOAD",
      "NODE_EXTRA_CA_CERTS",
      "NODE_OPTIONS",
      "NODE_PATH",
      "NODE_REPL_EXTERNAL_MODULE",
      "NPM_CONFIG_NODE_OPTIONS",
      "PNPAPI",
    ],
    "processIsolation.ambientPreloadNamesForbidden",
  );
  exactStringArray(
    isolation.credentialNamesForbiddenExcept,
    ["OPENROUTER_API_KEY"],
    "processIsolation.credentialNamesForbiddenExcept",
  );

  const persistence = exactKeys(row.privatePersistence, "privatePersistence", [
    "exclusiveNewRunDirectory",
    "durableEventJournal",
    "rawRequestAndResponsePrivateOnly",
    "credentialNeverPersisted",
    "unknownAfterSendNeverReplay",
    "publicAllowlistOnly",
    "terminalReconciliationIntentBeforeSettlement",
    "settlementFailureNoReplayEvidence",
    "absentOrMalformedBillingUsesReservedEffectiveCost",
    "durableNoReplayMarkerBeforeGlobalReservation",
    "boundedModelResponseBeforeMaterialization",
    "explicitPositiveUnrepresentableCostRequiresManualReconciliation",
    "rawPriceHttpEvidencePersisted",
    "privateInputsCanonicalRealRegularFiles",
    "privateOutputAncestorsRealDirectories",
    "priceEvidencePreReadBounded",
    "soleCredentialSourceCanonicalDirectRealRegularFile",
    "frozenPlainEsmRuntimeRequired",
    "credentialFdBoundExactReadAndPostAttestation",
    "mutableLedgerFdBoundDuplicateFreeNoBom",
    "mutableLedgerCommitTargetReattested",
    "priceCaptureFdBoundAndInMemoryHashHandoff",
    "postSendChargeCoverageEqualsDispatches",
    "byokNonFalseManualReconciliation",
    "parentDirectoryEntryFsyncRequired",
    "authorizedDurabilityPlatforms",
    "runsRootEntryFsyncInExactPrivateRootRequired",
    "runRootEntryFsyncInExactRunsRootRequired",
    "directoryIdentityAndDirectAncestorReattestationRequired",
    "postMkdirFailureTypedCommitUnknownNoReplay",
    "windowsDirectoryFsyncUnavailableFailClosed",
    "windowsLiveExecutionAllowed",
  ]);
  for (const key of Object.keys(persistence).filter(
    (candidate) =>
      candidate !== "authorizedDurabilityPlatforms" &&
      candidate !== "windowsLiveExecutionAllowed",
  )) {
    literal(persistence[key], true, `privatePersistence.${key}`);
  }
  exactStringArray(
    persistence.authorizedDurabilityPlatforms,
    ["linux", "darwin", "freebsd", "openbsd", "netbsd", "aix", "sunos"],
    "privatePersistence.authorizedDurabilityPlatforms",
  );
  literal(
    persistence.windowsLiveExecutionAllowed,
    false,
    "privatePersistence.windowsLiveExecutionAllowed",
  );
  const publicResult = exactKeys(
    row.publicResultContract,
    "publicResultContract",
    [
      "allowlist",
      "forbiddenNamePattern",
      "requiresTwoSuccessfulAssignments",
      "requiresUsageRouteParserEvidence",
      "twoRowsNotQualityComparison",
    ],
  );
  if (
    !Array.isArray(publicResult.allowlist) ||
    publicResult.allowlist.length < 8
  )
    fail("publicResultContract.allowlist", "too short");
  stringValue(
    publicResult.forbiddenNamePattern,
    "publicResultContract.forbiddenNamePattern",
  );
  literal(
    publicResult.requiresTwoSuccessfulAssignments,
    true,
    "publicResultContract.requiresTwoSuccessfulAssignments",
  );
  literal(
    publicResult.requiresUsageRouteParserEvidence,
    true,
    "publicResultContract.requiresUsageRouteParserEvidence",
  );
  literal(
    publicResult.twoRowsNotQualityComparison,
    true,
    "publicResultContract.twoRowsNotQualityComparison",
  );

  const auth = exactKeys(row.authorization, "authorization", [
    "liveExecutionAuthorized",
    "metadataNetworkAuthorized",
    "hostileAuditPassed",
    "dispatchCommandPresent",
  ]);
  for (const key of Object.keys(auth))
    literal(auth[key], false, `authorization.${key}`);
  const activity = exactKeys(row.authorFreezeActivity, "authorFreezeActivity", [
    "externalNetworkCalls",
    "metadataNetworkCalls",
    "providerCalls",
    "modelCalls",
    "apiCandidatesConsumed",
    "productionDatabaseCalls",
    "realCredentialValuesRead",
    "globalLedgerReservationMutations",
    "globalLedgerReadOnlyAttestations",
  ]);
  for (const key of Object.keys(activity)) {
    literal(
      activity[key],
      key === "globalLedgerReadOnlyAttestations" ? 1 : 0,
      `authorFreezeActivity.${key}`,
    );
  }
  return row as unknown as ConnectivityPilotProtocolV6;
}

export function validatePriceSnapshotV6(value: unknown): PublicPriceSnapshotV6 {
  const row = exactKeys(value, "priceSnapshot", [
    "schemaVersion",
    "fetchedAt",
    "sources",
    "routingContract",
    "chargeDimensions",
    "knownInapplicableUnitChargeDimensions",
    "knownBoundedInputTokenChargeDimensions",
    "knownBoundedOutputTokenChargeDimensions",
    "models",
    "contentSha256",
  ]);
  literal(
    row.schemaVersion,
    "question-quality-openrouter-public-price-snapshot-v6",
    "priceSnapshot.schemaVersion",
  );
  stringValue(row.fetchedAt, "priceSnapshot.fetchedAt");
  if (
    !UTC.test(row.fetchedAt) ||
    new Date(Date.parse(row.fetchedAt)).toISOString() !== row.fetchedAt
  )
    fail("priceSnapshot.fetchedAt", "not canonical UTC");
  const sources = exactKeys(row.sources, "priceSnapshot.sources", [
    "modelsUrl",
    "endpointUrls",
    "rawResponseCommitments",
  ]);
  literal(
    sources.modelsUrl,
    "https://openrouter.ai/api/v1/models",
    "priceSnapshot.sources.modelsUrl",
  );
  const endpointUrls = object(
    sources.endpointUrls,
    "priceSnapshot.sources.endpointUrls",
  );
  exactStringArray(
    Object.keys(endpointUrls).sort(),
    Object.values(MODELS).sort(),
    "priceSnapshot endpoint model set",
  );
  for (const modelId of Object.values(MODELS)) {
    literal(
      endpointUrls[modelId],
      `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
      `endpointUrls.${modelId}`,
    );
  }
  const expectedSourceUrls = [
    "https://openrouter.ai/api/v1/models",
    ...Object.values(MODELS).map(
      (modelId) => `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
    ),
  ].sort();
  if (
    !Array.isArray(sources.rawResponseCommitments) ||
    sources.rawResponseCommitments.length !== 3
  ) {
    fail(
      "priceSnapshot.sources.rawResponseCommitments",
      "must contain exactly three responses",
    );
  }
  const observedSourceUrls: string[] = [];
  sources.rawResponseCommitments.forEach((candidate, index) => {
    const commitment = exactKeys(
      candidate,
      `rawResponseCommitments[${index}]`,
      ["url", "status", "contentType", "bodyUtf8Bytes", "bodySha256"],
    );
    stringValue(commitment.url, `rawResponseCommitments[${index}].url`);
    observedSourceUrls.push(commitment.url);
    literal(commitment.status, 200, `rawResponseCommitments[${index}].status`);
    stringValue(
      commitment.contentType,
      `rawResponseCommitments[${index}].contentType`,
    );
    if (
      !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(
        commitment.contentType.trim(),
      )
    ) {
      fail(`rawResponseCommitments[${index}].contentType`, "must be JSON");
    }
    numberValue(
      commitment.bodyUtf8Bytes,
      `rawResponseCommitments[${index}].bodyUtf8Bytes`,
      true,
    );
    if (
      (commitment.bodyUtf8Bytes as number) < 1 ||
      (commitment.bodyUtf8Bytes as number) > METADATA_RESPONSE_BODY_MAX_BYTES_V6
    ) {
      fail(
        `rawResponseCommitments[${index}].bodyUtf8Bytes`,
        "outside metadata bound",
      );
    }
    hashValue(
      commitment.bodySha256,
      `rawResponseCommitments[${index}].bodySha256`,
    );
  });
  exactStringArray(
    observedSourceUrls,
    expectedSourceUrls,
    "rawResponseCommitments URL order",
  );
  const routing = exactKeys(
    row.routingContract,
    "priceSnapshot.routingContract",
    [
      "exactEndpointTag",
      "emergencyCeilingScope",
      "requestNonUseAndResponseAttestationContract",
    ],
  );
  literal(
    routing.exactEndpointTag,
    "google-vertex/global",
    "routingContract.exactEndpointTag",
  );
  literal(
    routing.emergencyCeilingScope,
    "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES",
    "routingContract.emergencyCeilingScope",
  );
  const zeroUnitContract = exactKeys(
    routing.requestNonUseAndResponseAttestationContract,
    "routingContract.requestNonUseAndResponseAttestationContract",
    KNOWN_EXTRA_UNIT_DIMENSIONS_V6,
  );
  for (const [dimension, disposition] of Object.entries(
    REQUEST_NON_USE_CONTRACT_V6,
  )) {
    literal(
      zeroUnitContract[dimension],
      disposition,
      `routingContract.requestNonUseAndResponseAttestationContract.${dimension}`,
    );
  }
  if (
    !Array.isArray(row.chargeDimensions) ||
    row.chargeDimensions.length === 0 ||
    new Set(row.chargeDimensions).size !== row.chargeDimensions.length ||
    row.chargeDimensions.some((entry) => typeof entry !== "string" || !entry)
  )
    fail("chargeDimensions", "must be unique strings");
  if (
    !Array.isArray(row.knownInapplicableUnitChargeDimensions) ||
    row.knownInapplicableUnitChargeDimensions.some(
      (entry) => typeof entry !== "string" || !entry,
    )
  )
    fail("knownInapplicableUnitChargeDimensions", "must be strings");
  if (
    !Array.isArray(row.knownBoundedInputTokenChargeDimensions) ||
    row.knownBoundedInputTokenChargeDimensions.some(
      (entry) => typeof entry !== "string" || !entry,
    )
  )
    fail("knownBoundedInputTokenChargeDimensions", "must be strings");
  if (
    !Array.isArray(row.knownBoundedOutputTokenChargeDimensions) ||
    row.knownBoundedOutputTokenChargeDimensions.some(
      (entry) => typeof entry !== "string" || !entry,
    )
  )
    fail("knownBoundedOutputTokenChargeDimensions", "must be strings");
  if (!Array.isArray(row.models) || row.models.length !== 2)
    fail("models", "must have two models");
  const observedExtraDimensions = new Set<string>();
  const assertKnownExtraDimensions = (value: unknown, label: string): void => {
    const extras = object(value, label);
    for (const [dimension, rate] of Object.entries(extras)) {
      if (
        !(KNOWN_EXTRA_UNIT_DIMENSIONS_V6 as readonly string[]).includes(
          dimension,
        )
      ) {
        fail(label, `contains unknown charge dimension ${dimension}`);
      }
      numberValue(rate, `${label}.${dimension}`);
      observedExtraDimensions.add(dimension);
    }
  };
  const ordered = [MODELS.STANDARD, MODELS.PREMIUM];
  row.models.forEach((candidate, modelIndex) => {
    const model = exactKeys(candidate, `models[${modelIndex}]`, [
      "requestedModelId",
      "canonicalSlug",
      "topLevelPromptUsdPerToken",
      "topLevelCompletionUsdPerToken",
      "topLevelFixedRequestUsd",
      "topLevelExtraChargeUsdPerUnit",
      "endpointRates",
    ]);
    literal(
      model.requestedModelId,
      ordered[modelIndex],
      `models[${modelIndex}].requestedModelId`,
    );
    stringValue(model.canonicalSlug, `models[${modelIndex}].canonicalSlug`);
    numberValue(
      model.topLevelPromptUsdPerToken,
      `models[${modelIndex}].topLevelPromptUsdPerToken`,
    );
    numberValue(
      model.topLevelCompletionUsdPerToken,
      `models[${modelIndex}].topLevelCompletionUsdPerToken`,
    );
    numberValue(
      model.topLevelFixedRequestUsd,
      `models[${modelIndex}].topLevelFixedRequestUsd`,
    );
    assertKnownExtraDimensions(
      model.topLevelExtraChargeUsdPerUnit,
      `models[${modelIndex}].topLevelExtraChargeUsdPerUnit`,
    );
    if (!Array.isArray(model.endpointRates) || model.endpointRates.length === 0)
      fail(`models[${modelIndex}].endpointRates`, "must be nonempty");
    let exactActive = 0;
    model.endpointRates.forEach((candidateEndpoint, endpointIndex) => {
      const endpoint = exactKeys(
        candidateEndpoint,
        `endpoint[${modelIndex}:${endpointIndex}]`,
        [
          "provider",
          "endpointName",
          "tag",
          "status",
          "contextLength",
          "promptUsdPerToken",
          "completionUsdPerToken",
          "fixedRequestUsd",
          "extraChargeUsdPerUnit",
          "supportedParameters",
          "overrides",
        ],
      );
      for (const key of ["provider", "endpointName", "tag"] as const)
        stringValue(endpoint[key], `endpoint.${key}`);
      if (endpoint.status !== "active" && endpoint.status !== "inactive")
        fail("endpoint.status", "invalid");
      numberValue(endpoint.contextLength, "endpoint.contextLength", true);
      numberValue(endpoint.promptUsdPerToken, "endpoint.promptUsdPerToken");
      numberValue(
        endpoint.completionUsdPerToken,
        "endpoint.completionUsdPerToken",
      );
      numberValue(endpoint.fixedRequestUsd, "endpoint.fixedRequestUsd");
      assertKnownExtraDimensions(
        endpoint.extraChargeUsdPerUnit,
        `endpoint[${modelIndex}:${endpointIndex}].extraChargeUsdPerUnit`,
      );
      if (
        !Array.isArray(endpoint.supportedParameters) ||
        endpoint.supportedParameters.some((entry) => typeof entry !== "string")
      )
        fail("endpoint.supportedParameters", "invalid");
      if (!Array.isArray(endpoint.overrides))
        fail("endpoint.overrides", "invalid");
      endpoint.overrides.forEach((candidateOverride) => {
        const override = exactKeys(candidateOverride, "endpoint.override", [
          "minPromptTokens",
          "promptUsdPerToken",
          "completionUsdPerToken",
          "fixedRequestUsd",
          "extraChargeUsdPerUnit",
        ]);
        numberValue(override.minPromptTokens, "override.minPromptTokens", true);
        numberValue(override.promptUsdPerToken, "override.promptUsdPerToken");
        numberValue(
          override.completionUsdPerToken,
          "override.completionUsdPerToken",
        );
        numberValue(override.fixedRequestUsd, "override.fixedRequestUsd");
        assertKnownExtraDimensions(
          override.extraChargeUsdPerUnit,
          "override.extraChargeUsdPerUnit",
        );
      });
      if (
        endpoint.tag === "google-vertex/global" &&
        endpoint.status === "active"
      )
        exactActive += 1;
    });
    literal(exactActive, 1, `models[${modelIndex}].exactActiveEndpointCount`);
  });
  const exactExtraDimensions = [...observedExtraDimensions].sort();
  exactStringArray(
    row.knownInapplicableUnitChargeDimensions,
    exactExtraDimensions.filter((dimension) =>
      (INAPPLICABLE_UNIT_DIMENSIONS_V6 as readonly string[]).includes(
        dimension,
      ),
    ),
    "knownInapplicableUnitChargeDimensions",
  );
  exactStringArray(
    row.knownBoundedInputTokenChargeDimensions,
    exactExtraDimensions.filter((dimension) =>
      (BOUNDED_INPUT_TOKEN_DIMENSIONS_V6 as readonly string[]).includes(
        dimension,
      ),
    ),
    "knownBoundedInputTokenChargeDimensions",
  );
  exactStringArray(
    row.knownBoundedOutputTokenChargeDimensions,
    exactExtraDimensions.filter((dimension) =>
      (BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V6 as readonly string[]).includes(
        dimension,
      ),
    ),
    "knownBoundedOutputTokenChargeDimensions",
  );
  exactStringArray(
    row.chargeDimensions,
    ["completion", ...exactExtraDimensions, "prompt", "request"].sort(),
    "chargeDimensions",
  );
  hashValue(row.contentSha256, "priceSnapshot.contentSha256");
  const core = { ...row };
  delete core.contentSha256;
  literal(
    row.contentSha256,
    sha256V6(stableJsonV6(core)),
    "priceSnapshot.contentSha256",
  );
  return row as unknown as PublicPriceSnapshotV6;
}

export function modelIdsV6(): readonly [string, string] {
  return [MODELS.STANDARD, MODELS.PREMIUM];
}
