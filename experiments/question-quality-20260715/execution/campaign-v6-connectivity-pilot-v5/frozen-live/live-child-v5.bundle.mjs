var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-child.mts
import path4 from "node:path";
import { fileURLToPath as fileURLToPath3 } from "node:url";
import { readFileSync as readFileSync4 } from "node:fs";

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/production-runner.ts
var production_runner_exports = {};
__export(production_runner_exports, {
  runSealedConnectivityPilotV5: () => runSealedConnectivityPilotV5
});
import {
  appendFileSync,
  closeSync as closeSync2,
  fsyncSync as fsyncSync2,
  openSync as openSync2,
  writeFileSync as writeFileSync2
} from "node:fs";
import path3 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/bounded-response-body.ts
var MODEL_RESPONSE_BODY_MAX_BYTES_V5 = 2 * 1024 * 1024;
var METADATA_RESPONSE_BODY_MAX_BYTES_V5 = 16 * 1024 * 1024;
var RESPONSE_BODY_MAX_CHUNKS_V5 = 8192;
var BoundedBodyReadErrorV5 = class extends Error {
  constructor(input) {
    super(`${input.label}: ${input.code}`);
    this.name = "BoundedBodyReadErrorV5";
    this.code = input.code;
    this.maximumBytes = input.maximumBytes;
    this.observedOrDeclaredBytes = input.observedOrDeclaredBytes ?? null;
  }
};
function declaredLength(headers, label, maximumBytes) {
  const raw = headers.get("content-length");
  if (raw === null) return null;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_CONTENT_LENGTH",
      label,
      maximumBytes
    });
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_CONTENT_LENGTH",
      label,
      maximumBytes
    });
  }
  return value;
}
async function cancelQuietly(body) {
  if (!body || body.locked) return;
  try {
    await body.cancel("bounded response body rejected");
  } catch {
  }
}
async function readBoundedUtf8ResponseBodyV5(input) {
  if (!Number.isSafeInteger(input.maximumBytes) || input.maximumBytes < 1) {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_LIMIT",
      label: input.label,
      maximumBytes: input.maximumBytes
    });
  }
  const declaredContentLength = declaredLength(input.response.headers, input.label, input.maximumBytes);
  if (declaredContentLength !== null && declaredContentLength > input.maximumBytes) {
    await cancelQuietly(input.response.body);
    throw new BoundedBodyReadErrorV5({
      code: "DECLARED_LENGTH_EXCEEDED",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: declaredContentLength
    });
  }
  const body = input.response.body;
  if (!body) {
    if (declaredContentLength === 0) return {
      text: "",
      utf8Bytes: 0,
      declaredContentLength,
      chunksRead: 0,
      contentLengthEqualityChecked: true
    };
    throw new BoundedBodyReadErrorV5({
      code: "MISSING_BODY",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: declaredContentLength
    });
  }
  const reader = body.getReader();
  const storage = new Uint8Array(input.maximumBytes);
  let total = 0;
  let chunksRead = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunksRead += 1;
      if (chunksRead > RESPONSE_BODY_MAX_CHUNKS_V5) {
        try {
          await reader.cancel("bounded response body exceeded maximum chunk count");
        } catch {
        }
        throw new BoundedBodyReadErrorV5({
          code: "STREAM_CHUNK_COUNT_EXCEEDED",
          label: input.label,
          maximumBytes: input.maximumBytes,
          observedOrDeclaredBytes: total
        });
      }
      const chunk = next.value;
      if (!(chunk instanceof Uint8Array)) throw new Error(`${input.label}: response stream emitted a non-byte chunk`);
      if (chunk.byteLength > input.maximumBytes - total) {
        try {
          await reader.cancel("bounded response body exceeded maximum bytes");
        } catch {
        }
        throw new BoundedBodyReadErrorV5({
          code: "STREAM_LENGTH_EXCEEDED",
          label: input.label,
          maximumBytes: input.maximumBytes,
          observedOrDeclaredBytes: total + chunk.byteLength
        });
      }
      if (chunk.byteLength === 0) continue;
      storage.set(chunk, total);
      total += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const contentEncoding = input.response.headers.get("content-encoding")?.trim().toLowerCase() ?? null;
  const contentLengthEqualityChecked = declaredContentLength !== null && (contentEncoding === null || contentEncoding === "" || contentEncoding === "identity");
  if (contentLengthEqualityChecked && total !== declaredContentLength) {
    throw new BoundedBodyReadErrorV5({
      code: "CONTENT_LENGTH_MISMATCH",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: total
    });
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(storage.subarray(0, total)),
      utf8Bytes: total,
      declaredContentLength,
      chunksRead,
      contentLengthEqualityChecked
    };
  } catch {
    throw new BoundedBodyReadErrorV5({
      code: "INVALID_UTF8",
      label: input.label,
      maximumBytes: input.maximumBytes,
      observedOrDeclaredBytes: total
    });
  }
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/protocol-core.ts
var protocol_core_exports = {};
__export(protocol_core_exports, {
  MAX_PER_RESPONSE_ACTUAL_COST_USD_V5: () => MAX_PER_RESPONSE_ACTUAL_COST_USD_V5,
  MAX_PER_RESPONSE_USAGE_TOKENS_V5: () => MAX_PER_RESPONSE_USAGE_TOKENS_V5,
  conservativeCostV5: () => conservativeCostV5,
  metadataNetworkDispatchAuthorizedV5: () => metadataNetworkDispatchAuthorizedV5,
  modelIdsV5: () => modelIdsV5,
  sha256V5: () => sha256V5,
  stableJsonV5: () => stableJsonV5,
  stableValueV5: () => stableValueV5,
  validatePriceSnapshotV5: () => validatePriceSnapshotV5,
  validateProtocolV5: () => validateProtocolV5
});
import { createHash } from "node:crypto";
var MAX_PER_RESPONSE_ACTUAL_COST_USD_V5 = 1e3;
var MAX_PER_RESPONSE_USAGE_TOKENS_V5 = 1e7;
var SHA256 = /^[a-f0-9]{64}$/u;
var UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
var MODELS = {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview"
};
var KNOWN_EXTRA_UNIT_DIMENSIONS_V5 = [
  "image",
  "input_cache_read",
  "input_cache_write",
  "internal_reasoning",
  "web_search"
];
var INAPPLICABLE_UNIT_DIMENSIONS_V5 = ["image", "web_search"];
var BOUNDED_INPUT_TOKEN_DIMENSIONS_V5 = ["input_cache_read", "input_cache_write"];
var BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V5 = ["internal_reasoning"];
var REQUEST_NON_USE_CONTRACT_V5 = {
  image: "TEXT_ONLY_MESSAGE_CONTENT",
  web_search: "NO_PLUGIN_OR_TOOL_SURFACE",
  internal_reasoning: "REQUEST_DISABLED_RESPONSE_REASONING_TOKENS_MUST_BE_ZERO_IF_PRESENT_AND_MAX_RATE_INCLUDED_IN_OUTPUT_CEILING",
  input_cache_read: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
  input_cache_write: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING"
};
function stableValueV5(value) {
  if (Array.isArray(value)) return value.map(stableValueV5);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== void 0).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, child]) => [key, stableValueV5(child)]));
  }
  return value;
}
function stableJsonV5(value) {
  return JSON.stringify(stableValueV5(value));
}
function sha256V5(value) {
  return createHash("sha256").update(value).digest("hex");
}
function metadataNetworkDispatchAuthorizedV5(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const authorization = value;
  return authorization.metadataNetworkAuthorized === true && authorization.hostileAuditPassed === true && authorization.dispatchCommandPresent === true;
}
function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label, "must be an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(label, "must be plain JSON");
  return value;
}
function exactKeys(value, label, keys) {
  const row = object(value, label);
  const actual = Object.keys(row).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label, `keys differ: ${actual.join(",")}`);
  }
  return row;
}
function stringValue(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(label, "must be a non-empty string");
}
function numberValue(value, label, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || integer && !Number.isSafeInteger(value)) {
    fail(label, "must be a non-negative finite number");
  }
}
function hashValue(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(label, "must be SHA-256 hex");
}
function literal(value, expected, label) {
  if (value !== expected) fail(label, `must equal ${JSON.stringify(expected)}`);
}
function exactStringArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(label, `must equal ${JSON.stringify(expected)}`);
  }
}
function conservativeCostV5(input) {
  for (const [name, value] of Object.entries(input)) {
    const canBeZero = name === "fixedRequestUsd";
    if (!Number.isFinite(value) || value < 0 || !canBeZero && value === 0) {
      fail(name, canBeZero ? "must be non-negative" : "must be positive");
    }
  }
  const raw = ((input.bodyBytes + input.serverTokenOverheadUpperBound) * input.inputUsdPer1M + input.maxOutputTokens * input.outputUsdPer1M) / 1e6 + input.fixedRequestUsd;
  return Math.ceil(raw * input.safetyMultiplier * 1e9) / 1e9;
}
function validateAssignments(value, protocol) {
  if (!Array.isArray(value) || value.length !== 2) fail("durableBounds.assignments", "must contain two rows");
  const pricing = object(protocol.pricingEvidenceContract, "pricingEvidenceContract");
  numberValue(pricing.serverTokenOverheadUpperBound, "pricingEvidenceContract.serverTokenOverheadUpperBound", true);
  numberValue(pricing.safetyMultiplier, "pricingEvidenceContract.safetyMultiplier");
  const rows2 = value.map((candidate, index) => {
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
      "timeoutMs"
    ]);
    const plan = index === 0 ? "STANDARD" : "PREMIUM";
    literal(row.ordinal, index + 1, `assignment[${index}].ordinal`);
    literal(row.plan, plan, `assignment[${index}].plan`);
    literal(row.modelId, MODELS[plan], `assignment[${index}].modelId`);
    numberValue(row.exactWireBodyUtf8Bytes, `assignment[${index}].exactWireBodyUtf8Bytes`, true);
    if (row.exactWireBodyUtf8Bytes < 1) fail(`assignment[${index}]`, "body bytes must be positive");
    hashValue(row.exactWireBodySha256, `assignment[${index}].exactWireBodySha256`);
    literal(row.maxOutputTokens, 4e3, `assignment[${index}].maxOutputTokens`);
    numberValue(row.emergencyInputUsdPer1M, `assignment[${index}].emergencyInputUsdPer1M`);
    numberValue(row.emergencyOutputUsdPer1M, `assignment[${index}].emergencyOutputUsdPer1M`);
    numberValue(row.emergencyRequestUsd, `assignment[${index}].emergencyRequestUsd`);
    numberValue(row.calculatedWorstCaseUsdCap, `assignment[${index}].calculatedWorstCaseUsdCap`);
    numberValue(row.timeoutMs, `assignment[${index}].timeoutMs`, true);
    const expectedCost = conservativeCostV5({
      bodyBytes: row.exactWireBodyUtf8Bytes,
      maxOutputTokens: 4e3,
      inputUsdPer1M: row.emergencyInputUsdPer1M,
      outputUsdPer1M: row.emergencyOutputUsdPer1M,
      fixedRequestUsd: row.emergencyRequestUsd,
      serverTokenOverheadUpperBound: pricing.serverTokenOverheadUpperBound,
      safetyMultiplier: pricing.safetyMultiplier
    });
    literal(row.calculatedWorstCaseUsdCap, expectedCost, `assignment[${index}].calculatedWorstCaseUsdCap`);
    return row;
  });
  return rows2;
}
function validateProtocolV5(value) {
  const row = exactKeys(value, "protocol", [
    "schemaVersion",
    "artifactId",
    "status",
    "lineage",
    "fixedProductionInput",
    "providerContract",
    "durableBounds",
    "pricingEvidenceContract",
    "exactWireCommitment",
    "compilerClosureContract",
    "globalResearchLedger",
    "liveClosureContract",
    "frozenRuntimeContract",
    "processIsolation",
    "privatePersistence",
    "publicResultContract",
    "authorization",
    "authorFreezeActivity"
  ]);
  literal(row.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v5", "schemaVersion");
  literal(row.artifactId, "campaign-v6-connectivity-pilot-v5", "artifactId");
  literal(row.status, "OFFLINE_AUTHOR_FREEZE_LIVE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_AUDIT", "status");
  const lineage = exactKeys(row.lineage, "lineage", [
    "preserves",
    "replacesExecutionPackage",
    "v2Unmodified",
    "v3Unmodified",
    "v4Unmodified",
    "v2AuditDisposition",
    "v3AuditDisposition",
    "v4AuditDisposition",
    "v4IndependentAuditPins"
  ]);
  exactStringArray(
    lineage.preserves,
    ["campaign-v6-connectivity-pilot-v2", "campaign-v6-connectivity-pilot-v3", "campaign-v6-connectivity-pilot-v4"],
    "lineage.preserves"
  );
  literal(lineage.replacesExecutionPackage, true, "lineage.replacesExecutionPackage");
  literal(lineage.v2Unmodified, true, "lineage.v2Unmodified");
  literal(lineage.v3Unmodified, true, "lineage.v3Unmodified");
  literal(lineage.v4Unmodified, true, "lineage.v4Unmodified");
  literal(lineage.v2AuditDisposition, "REJECTED_TEST_TRANSPORT_SEAM_AND_INCOMPLETE_LIVE_CLOSURE", "lineage.v2AuditDisposition");
  literal(lineage.v3AuditDisposition, "REJECTED_INCOMPLETE_COMPILER_CLOSURE_AND_PERMISSIVE_RESPONSE_PARSER", "lineage.v3AuditDisposition");
  literal(lineage.v4AuditDisposition, "REJECTED_DYNAMIC_COMPILER_INPUTS_METADATA_GUARD_PARSER_BILLING_AND_RECONCILIATION_GAPS", "lineage.v4AuditDisposition");
  const v4Pins = exactKeys(lineage.v4IndependentAuditPins, "lineage.v4IndependentAuditPins", [
    "directory",
    "verdict",
    "protocolV4Sha256",
    "authorGatesSha256",
    "evidenceSha256",
    "reportSha256",
    "verifierSha256",
    "manifestFileSha256",
    "manifestRows"
  ]);
  literal(v4Pins.directory, "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1", "v4 audit directory");
  literal(v4Pins.verdict, "FAIL", "v4 audit verdict");
  const expectedV4Pins = {
    protocolV4Sha256: "18d7eb7c60fdfc1d4b49fb868ef887d64e62db6d217abf8eaec0fbbeab8ffec9",
    authorGatesSha256: "5b0346fb581b5cd12381484061fee8b4fc17e56a10882d7e29651ee8cbf613b0",
    evidenceSha256: "2aff0d69c81169f2f806dcd59f9053ce939927603d75cb7d7c2a60cab501f3b6",
    reportSha256: "8f135466efc5182843cf5a257c5bb361cafb2c91122798c29768839d0f31fae3",
    verifierSha256: "2211da72c2249c1302eddac8f138acf91c4c302a36fbb7810d24f20035c73dd0",
    manifestFileSha256: "2b7fb398cad98647698c7dd4120f819c50645116c71e8ffe79ccb53530ba0791"
  };
  for (const [key, expected] of Object.entries(expectedV4Pins)) literal(v4Pins[key], expected, `v4 audit ${key}`);
  literal(v4Pins.manifestRows, 9, "v4 audit manifestRows");
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
    "targetPoints"
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
    "dispatchedAttemptCannotSettleWithZeroCharges"
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
    "dispatchedAttemptCannotSettleWithZeroCharges"
  ]) literal(provider[key], true, `providerContract.${key}`);
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
    "sharedCostCapUsd"
  ]);
  for (const key of ["sharedCandidateCap", "sharedPhysicalFetchCap", "sharedCompletionCap"]) literal(bounds[key], 2, `durableBounds.${key}`);
  literal(bounds.concurrency, 1, "durableBounds.concurrency");
  exactStringArray(bounds.serialOrder, ["STANDARD", "PREMIUM"], "durableBounds.serialOrder");
  for (const key of ["perAssignmentCandidateCap", "perAssignmentPhysicalFetchCap", "perAssignmentCompletionCap"]) literal(bounds[key], 1, `durableBounds.${key}`);
  for (const key of ["retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed"]) literal(bounds[key], false, `durableBounds.${key}`);
  literal(bounds.failureTimeoutUnknownTerminal, true, "durableBounds.failureTimeoutUnknownTerminal");
  literal(bounds.reserveBeforeNetwork, true, "durableBounds.reserveBeforeNetwork");
  const assignments = validateAssignments(bounds.assignments, row);
  numberValue(bounds.sharedCostCapUsd, "durableBounds.sharedCostCapUsd");
  literal(bounds.sharedCostCapUsd, Math.ceil(assignments.reduce((sum, item) => sum + item.calculatedWorstCaseUsdCap, 0) * 1e9) / 1e9, "durableBounds.sharedCostCapUsd");
  const pricing = exactKeys(row.pricingEvidenceContract, "pricingEvidenceContract", [
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
    "captureToLiveInMemoryFileAndBundleHashHandoffRequired"
  ]);
  literal(pricing.schemaVersion, "question-quality-openrouter-public-price-snapshot-v5", "pricingEvidenceContract.schemaVersion");
  literal(pricing.maximumAgeMs, 9e5, "pricingEvidenceContract.maximumAgeMs");
  literal(pricing.exactEndpointCardinality, 1, "pricingEvidenceContract.exactEndpointCardinality");
  exactStringArray(pricing.requiredParameters, ["response_format", "structured_outputs"], "pricingEvidenceContract.requiredParameters");
  for (const key of ["canonicalSlugRequired", "allActiveEndpointsAndOverridesRequired", "chargeDimensionsRequired", "contentHashRequired"]) literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  numberValue(pricing.serverTokenOverheadUpperBound, "pricingEvidenceContract.serverTokenOverheadUpperBound", true);
  numberValue(pricing.safetyMultiplier, "pricingEvidenceContract.safetyMultiplier");
  literal(pricing.maxMetadataResponseBodyUtf8Bytes, METADATA_RESPONSE_BODY_MAX_BYTES_V5, "pricingEvidenceContract.maxMetadataResponseBodyUtf8Bytes");
  literal(pricing.fixedRequestFeesIncludedInReserve, true, "pricingEvidenceContract.fixedRequestFeesIncludedInReserve");
  literal(pricing.knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation, true, "pricingEvidenceContract.knownInapplicableUnitDimensionsRequireRequestNonUseAndResponseAttestation");
  literal(pricing.unknownChargeDimensionsRejected, true, "pricingEvidenceContract.unknownChargeDimensionsRejected");
  for (const key of [
    "rawHttpEvidenceBundleRequired",
    "rawHttpDuplicateKeysRejected",
    "topLevelFixedRequestIncludedInEmergencyCeiling",
    "topLevelPromptAndCompletionIncludedInEmergencyCeiling",
    "cacheReadWriteRatesIncludedInEmergencyInputCeiling",
    "reasoningRatesIncludedInEmergencyOutputCeiling",
    "imageAndWebSearchZeroUseProvenByExactRequestShape",
    "privateBundleFdBoundExactReadRequired",
    "captureToLiveInMemoryFileAndBundleHashHandoffRequired"
  ]) literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  literal(pricing.omittedFixedRequestFeeAssumedZero, false, "pricingEvidenceContract.omittedFixedRequestFeeAssumedZero");
  literal(pricing.privateBundlePreReadMaxBytes, 306184192, "pricingEvidenceContract.privateBundlePreReadMaxBytes");
  const wire = exactKeys(row.exactWireCommitment, "exactWireCommitment", [
    "privateArtifactPath",
    "privateArtifactSha256",
    "publicArtifactPath",
    "publicArtifactSha256",
    "locallyInterceptedProductionCompilerFetches",
    "externalNetworkCalls",
    "providerCalls",
    "modelCalls",
    "apiCandidatesConsumed"
  ]);
  literal(wire.privateArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/private/exact-wire-v5.private.json", "exactWireCommitment.privateArtifactPath");
  literal(wire.publicArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/offline-exact-wire-seal-v5.json", "exactWireCommitment.publicArtifactPath");
  hashValue(wire.privateArtifactSha256, "exactWireCommitment.privateArtifactSha256");
  hashValue(wire.publicArtifactSha256, "exactWireCommitment.publicArtifactSha256");
  literal(wire.locallyInterceptedProductionCompilerFetches, 2, "exactWireCommitment.locallyInterceptedProductionCompilerFetches");
  for (const key of ["externalNetworkCalls", "providerCalls", "modelCalls", "apiCandidatesConsumed"]) literal(wire[key], 0, `exactWireCommitment.${key}`);
  const compilerClosure = exactKeys(row.compilerClosureContract, "compilerClosureContract", [
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
    "isolatedChildEnvironmentRequired"
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
    compilerClosure.exactSourceFiles + compilerClosure.exactDynamicSourceInputs + compilerClosure.exactDeclaredDataInputs,
    "compilerClosureContract.exactTotalFiles"
  );
  for (const key of [
    "exactEqualityRequired",
    "zeroUnresolvedLocalRequired",
    "zeroNonliteralDynamicRequired",
    "minimumCountChecksForbidden",
    "externalInputsExactEqualityRequired",
    "compilerFsReadSitesStaticallyEnumerated",
    "isolatedChildEnvironmentRequired"
  ]) literal(compilerClosure[key], true, `compilerClosureContract.${key}`);
  literal(compilerClosure.inheritedThirtyTwoRowSubsetAuthority, false, "compilerClosureContract.inheritedThirtyTwoRowSubsetAuthority");
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
    "postCommitCleanupOutcomeRequired"
  ]);
  literal(ledger.path, "experiments/question-quality-20260715/budget-ledger.json", "globalResearchLedger.path");
  literal(ledger.globalCap, 1e3, "globalResearchLedger.globalCap");
  literal(ledger.requiredPreAuthorUsed, 0, "globalResearchLedger.requiredPreAuthorUsed");
  literal(ledger.requiredPreAuthorReserved, 0, "globalResearchLedger.requiredPreAuthorReserved");
  literal(ledger.liveReservation, 2, "globalResearchLedger.liveReservation");
  literal(ledger.authorFreezeMutationAllowed, false, "globalResearchLedger.authorFreezeMutationAllowed");
  literal(ledger.privateStoreReservationAlsoRequired, true, "globalResearchLedger.privateStoreReservationAlsoRequired");
  literal(ledger.atomicLockRequired, true, "globalResearchLedger.atomicLockRequired");
  for (const key of [
    "globalCapacityQuarantineOnCandidateExcessOrAmbiguity",
    "ordinaryInvalidBodySettlesSingleOpportunityWithoutGlobalQuarantine",
    "postCommitCleanupOutcomeRequired"
  ]) literal(ledger[key], true, `globalResearchLedger.${key}`);
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
    "exactExpectedExternalFiles",
    "externalNodeExecutableIdentityRequired"
  ]);
  literal(closure.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-closure-v5.json", "liveClosureContract.artifactPath");
  literal(closure.algorithm, "TYPESCRIPT_AST_TRANSITIVE_IMPORTS_PLUS_DECLARED_RUNTIME_DATA_V1", "liveClosureContract.algorithm");
  for (const key of ["exactEntrypointSetRequired", "exactTransitiveFileSetRequired", "exactBytesAndSha256Required", "literalDynamicImportsIncluded", "runtimeDataReadsClassified", "testSupportExcluded"]) literal(closure[key], true, `liveClosureContract.${key}`);
  literal(closure.minimumCountChecksForbidden, true, "liveClosureContract.minimumCountChecksForbidden");
  literal(closure.exactExpectedFiles, 23, "liveClosureContract.exactExpectedFiles");
  literal(closure.declaredFrozenRuntimeArtifactsIncluded, true, "liveClosureContract.declaredFrozenRuntimeArtifactsIncluded");
  literal(closure.exactExpectedExternalFiles, 1, "liveClosureContract.exactExpectedExternalFiles");
  literal(closure.externalNodeExecutableIdentityRequired, true, "liveClosureContract.externalNodeExecutableIdentityRequired");
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
    "authorizationPackagePolicy"
  ]);
  literal(frozen.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-v5.json", "frozenRuntimeContract.artifactPath");
  for (const key of ["artifactSha256", "artifactContentSha256", "bundleSetSha256", "nodeExecutableSha256"]) hashValue(frozen[key], `frozenRuntimeContract.${key}`);
  literal(frozen.executionLoader, "PLAIN_NODE_ESM_BUNDLES", "frozenRuntimeContract.executionLoader");
  exactStringArray(frozen.entrypoints, [
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/capture-price-snapshot-v5.bundle.mjs",
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/live-child-v5.bundle.mjs",
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/operator-wrapper-v5.bundle.mjs"
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
    "frozenRuntimeContract.authorizationPackagePolicy"
  );
  const isolation = exactKeys(row.processIsolation, "processIsolation", [
    "liveLauncherExplicitEnvironmentNames",
    "metadataLauncherExplicitEnvironmentNames",
    "windowsObservedAutoInjectedEnvironmentNames",
    "nonWindowsObservedAutoInjectedEnvironmentNames",
    "exactObservedNameSetRequired",
    "ambientPreloadNamesForbidden",
    "credentialNamesForbiddenExcept"
  ]);
  exactStringArray(isolation.liveLauncherExplicitEnvironmentNames, [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "PATHEXT",
    "TEMP",
    "TMP",
    "COMSPEC",
    "OPENROUTER_API_KEY",
    "QUESTION_QUALITY_CONNECTIVITY_PILOT_V5_LIVE_CHILD"
  ], "processIsolation.liveLauncherExplicitEnvironmentNames");
  exactStringArray(isolation.metadataLauncherExplicitEnvironmentNames, [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "PATHEXT",
    "TEMP",
    "TMP",
    "COMSPEC"
  ], "processIsolation.metadataLauncherExplicitEnvironmentNames");
  exactStringArray(isolation.windowsObservedAutoInjectedEnvironmentNames, [
    "HOMEDRIVE",
    "HOMEPATH",
    "LOGONSERVER",
    "SYSTEMDRIVE",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE"
  ], "processIsolation.windowsObservedAutoInjectedEnvironmentNames");
  exactStringArray(isolation.nonWindowsObservedAutoInjectedEnvironmentNames, [], "processIsolation.nonWindowsObservedAutoInjectedEnvironmentNames");
  literal(isolation.exactObservedNameSetRequired, true, "processIsolation.exactObservedNameSetRequired");
  exactStringArray(isolation.ambientPreloadNamesForbidden, ["NODE_OPTIONS", "NODE_PATH"], "processIsolation.ambientPreloadNamesForbidden");
  exactStringArray(isolation.credentialNamesForbiddenExcept, ["OPENROUTER_API_KEY"], "processIsolation.credentialNamesForbiddenExcept");
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
    "byokNonFalseManualReconciliation"
  ]);
  for (const key of Object.keys(persistence)) literal(persistence[key], true, `privatePersistence.${key}`);
  const publicResult2 = exactKeys(row.publicResultContract, "publicResultContract", [
    "allowlist",
    "forbiddenNamePattern",
    "requiresTwoSuccessfulAssignments",
    "requiresUsageRouteParserEvidence",
    "twoRowsNotQualityComparison"
  ]);
  if (!Array.isArray(publicResult2.allowlist) || publicResult2.allowlist.length < 8) fail("publicResultContract.allowlist", "too short");
  stringValue(publicResult2.forbiddenNamePattern, "publicResultContract.forbiddenNamePattern");
  literal(publicResult2.requiresTwoSuccessfulAssignments, true, "publicResultContract.requiresTwoSuccessfulAssignments");
  literal(publicResult2.requiresUsageRouteParserEvidence, true, "publicResultContract.requiresUsageRouteParserEvidence");
  literal(publicResult2.twoRowsNotQualityComparison, true, "publicResultContract.twoRowsNotQualityComparison");
  const auth = exactKeys(row.authorization, "authorization", [
    "liveExecutionAuthorized",
    "metadataNetworkAuthorized",
    "hostileAuditPassed",
    "dispatchCommandPresent"
  ]);
  for (const key of Object.keys(auth)) literal(auth[key], false, `authorization.${key}`);
  const activity = exactKeys(row.authorFreezeActivity, "authorFreezeActivity", [
    "externalNetworkCalls",
    "metadataNetworkCalls",
    "providerCalls",
    "modelCalls",
    "apiCandidatesConsumed",
    "productionDatabaseCalls",
    "realCredentialValuesRead",
    "globalLedgerReservationMutations"
  ]);
  for (const key of Object.keys(activity)) literal(activity[key], 0, `authorFreezeActivity.${key}`);
  return row;
}
function validatePriceSnapshotV5(value) {
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
    "contentSha256"
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
    ...Object.values(MODELS).map((modelId) => `https://openrouter.ai/api/v1/models/${modelId}/endpoints`)
  ].sort();
  if (!Array.isArray(sources.rawResponseCommitments) || sources.rawResponseCommitments.length !== 3) {
    fail("priceSnapshot.sources.rawResponseCommitments", "must contain exactly three responses");
  }
  const observedSourceUrls = [];
  sources.rawResponseCommitments.forEach((candidate, index) => {
    const commitment = exactKeys(candidate, `rawResponseCommitments[${index}]`, [
      "url",
      "status",
      "contentType",
      "bodyUtf8Bytes",
      "bodySha256"
    ]);
    stringValue(commitment.url, `rawResponseCommitments[${index}].url`);
    observedSourceUrls.push(commitment.url);
    literal(commitment.status, 200, `rawResponseCommitments[${index}].status`);
    stringValue(commitment.contentType, `rawResponseCommitments[${index}].contentType`);
    if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(commitment.contentType.trim())) {
      fail(`rawResponseCommitments[${index}].contentType`, "must be JSON");
    }
    numberValue(commitment.bodyUtf8Bytes, `rawResponseCommitments[${index}].bodyUtf8Bytes`, true);
    if (commitment.bodyUtf8Bytes < 1 || commitment.bodyUtf8Bytes > METADATA_RESPONSE_BODY_MAX_BYTES_V5) {
      fail(`rawResponseCommitments[${index}].bodyUtf8Bytes`, "outside metadata bound");
    }
    hashValue(commitment.bodySha256, `rawResponseCommitments[${index}].bodySha256`);
  });
  exactStringArray(observedSourceUrls, expectedSourceUrls, "rawResponseCommitments URL order");
  const routing = exactKeys(row.routingContract, "priceSnapshot.routingContract", [
    "exactEndpointTag",
    "emergencyCeilingScope",
    "requestNonUseAndResponseAttestationContract"
  ]);
  literal(routing.exactEndpointTag, "google-vertex/global", "routingContract.exactEndpointTag");
  literal(routing.emergencyCeilingScope, "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES", "routingContract.emergencyCeilingScope");
  const zeroUnitContract = exactKeys(
    routing.requestNonUseAndResponseAttestationContract,
    "routingContract.requestNonUseAndResponseAttestationContract",
    KNOWN_EXTRA_UNIT_DIMENSIONS_V5
  );
  for (const [dimension, disposition] of Object.entries(REQUEST_NON_USE_CONTRACT_V5)) {
    literal(zeroUnitContract[dimension], disposition, `routingContract.requestNonUseAndResponseAttestationContract.${dimension}`);
  }
  if (!Array.isArray(row.chargeDimensions) || row.chargeDimensions.length === 0 || new Set(row.chargeDimensions).size !== row.chargeDimensions.length || row.chargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("chargeDimensions", "must be unique strings");
  if (!Array.isArray(row.knownInapplicableUnitChargeDimensions) || row.knownInapplicableUnitChargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("knownInapplicableUnitChargeDimensions", "must be strings");
  if (!Array.isArray(row.knownBoundedInputTokenChargeDimensions) || row.knownBoundedInputTokenChargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("knownBoundedInputTokenChargeDimensions", "must be strings");
  if (!Array.isArray(row.knownBoundedOutputTokenChargeDimensions) || row.knownBoundedOutputTokenChargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("knownBoundedOutputTokenChargeDimensions", "must be strings");
  if (!Array.isArray(row.models) || row.models.length !== 2) fail("models", "must have two models");
  const observedExtraDimensions = /* @__PURE__ */ new Set();
  const assertKnownExtraDimensions = (value2, label) => {
    const extras = object(value2, label);
    for (const [dimension, rate] of Object.entries(extras)) {
      if (!KNOWN_EXTRA_UNIT_DIMENSIONS_V5.includes(dimension)) {
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
      "endpointRates"
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
        "overrides"
      ]);
      for (const key of ["provider", "endpointName", "tag"]) stringValue(endpoint[key], `endpoint.${key}`);
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
          "minPromptTokens",
          "promptUsdPerToken",
          "completionUsdPerToken",
          "fixedRequestUsd",
          "extraChargeUsdPerUnit"
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
    exactExtraDimensions.filter((dimension) => INAPPLICABLE_UNIT_DIMENSIONS_V5.includes(dimension)),
    "knownInapplicableUnitChargeDimensions"
  );
  exactStringArray(
    row.knownBoundedInputTokenChargeDimensions,
    exactExtraDimensions.filter((dimension) => BOUNDED_INPUT_TOKEN_DIMENSIONS_V5.includes(dimension)),
    "knownBoundedInputTokenChargeDimensions"
  );
  exactStringArray(
    row.knownBoundedOutputTokenChargeDimensions,
    exactExtraDimensions.filter((dimension) => BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V5.includes(dimension)),
    "knownBoundedOutputTokenChargeDimensions"
  );
  exactStringArray(row.chargeDimensions, ["completion", ...exactExtraDimensions, "prompt", "request"].sort(), "chargeDimensions");
  hashValue(row.contentSha256, "priceSnapshot.contentSha256");
  const core = { ...row };
  delete core.contentSha256;
  literal(row.contentSha256, sha256V5(stableJsonV5(core)), "priceSnapshot.contentSha256");
  return row;
}
function modelIdsV5() {
  return [MODELS.STANDARD, MODELS.PREMIUM];
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/strict-json-observer.ts
var MAX_JSON_DEPTH_V5 = 128;
var MAX_RECORDED_DUPLICATES_V5 = 64;
var MAX_RAW_CANDIDATE_OBSERVATION_V5 = 1001;
var StrictJsonObserverV5 = class {
  constructor(source) {
    this.source = source;
    this.offset = 0;
    this.duplicates = [];
  }
  parse() {
    this.white();
    this.value("$", 0);
    this.white();
    if (this.offset !== this.source.length) throw new Error("JSON has trailing bytes");
    return this.duplicates;
  }
  parseSequence() {
    let completedTopLevelValues = 0;
    this.white();
    while (this.offset < this.source.length) {
      try {
        this.value(`$[${completedTopLevelValues}]`, 0);
        completedTopLevelValues += 1;
        this.white();
      } catch {
        return {
          completedTopLevelValues,
          failed: true,
          duplicateKeys: [...this.duplicates]
        };
      }
    }
    return {
      completedTopLevelValues,
      failed: false,
      duplicateKeys: [...this.duplicates]
    };
  }
  white() {
    while (this.offset < this.source.length && /[\u0009\u000a\u000d\u0020]/u.test(this.source[this.offset])) {
      this.offset += 1;
    }
  }
  value(path5, depth) {
    if (depth > MAX_JSON_DEPTH_V5) throw new Error("JSON nesting exceeds v5 observation bound");
    this.white();
    const token = this.source[this.offset];
    if (token === "{") return this.object(path5, depth + 1);
    if (token === "[") return this.array(path5, depth + 1);
    if (token === '"') {
      this.string();
      return;
    }
    if (token === "t" && this.source.slice(this.offset, this.offset + 4) === "true") {
      this.offset += 4;
      return;
    }
    if (token === "f" && this.source.slice(this.offset, this.offset + 5) === "false") {
      this.offset += 5;
      return;
    }
    if (token === "n" && this.source.slice(this.offset, this.offset + 4) === "null") {
      this.offset += 4;
      return;
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.source.slice(this.offset));
    if (!match) throw new Error(`invalid JSON token at byte ${this.offset}`);
    this.offset += match[0].length;
  }
  object(path5, depth) {
    this.offset += 1;
    this.white();
    const keys = /* @__PURE__ */ new Set();
    if (this.source[this.offset] === "}") {
      this.offset += 1;
      return;
    }
    while (true) {
      this.white();
      if (this.source[this.offset] !== '"') throw new Error(`JSON object key missing at byte ${this.offset}`);
      const key = this.string();
      if (keys.has(key) && this.duplicates.length < MAX_RECORDED_DUPLICATES_V5) {
        this.duplicates.push({ objectPath: path5, key });
      }
      keys.add(key);
      this.white();
      if (this.source[this.offset] !== ":") throw new Error(`JSON object colon missing at byte ${this.offset}`);
      this.offset += 1;
      this.value(`${path5}.${key}`, depth);
      this.white();
      const token = this.source[this.offset];
      if (token === "}") {
        this.offset += 1;
        return;
      }
      if (token !== ",") throw new Error(`JSON object separator missing at byte ${this.offset}`);
      this.offset += 1;
    }
  }
  array(path5, depth) {
    this.offset += 1;
    this.white();
    if (this.source[this.offset] === "]") {
      this.offset += 1;
      return;
    }
    let index = 0;
    while (true) {
      this.value(`${path5}[${index}]`, depth);
      index += 1;
      this.white();
      const token = this.source[this.offset];
      if (token === "]") {
        this.offset += 1;
        return;
      }
      if (token !== ",") throw new Error(`JSON array separator missing at byte ${this.offset}`);
      this.offset += 1;
    }
  }
  string() {
    const start = this.offset;
    this.offset += 1;
    while (this.offset < this.source.length) {
      const code = this.source.charCodeAt(this.offset);
      if (code === 34) {
        this.offset += 1;
        return JSON.parse(this.source.slice(start, this.offset));
      }
      if (code < 32) throw new Error(`unescaped JSON control character at byte ${this.offset}`);
      if (code === 92) {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === "u") {
          if (!/^[a-fA-F0-9]{4}$/u.test(this.source.slice(this.offset + 1, this.offset + 5))) {
            throw new Error(`invalid JSON unicode escape at byte ${this.offset}`);
          }
          this.offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error(`invalid JSON escape at byte ${this.offset}`);
        }
      }
      this.offset += 1;
    }
    throw new Error("unterminated JSON string");
  }
};
function observeDuplicateJsonKeysV5(rawText) {
  return new StrictJsonObserverV5(rawText).parse();
}
function objectOrNull(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function boundedQuestionObjectCountV5(value) {
  const visited = /* @__PURE__ */ new Set();
  let count = 0;
  let saturated = false;
  const visit = (candidate, depth) => {
    if (saturated || depth > MAX_JSON_DEPTH_V5 || candidate === null || typeof candidate !== "object") return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      for (const child of candidate) visit(child, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(candidate)) {
      if (key === "questions" && Array.isArray(child)) {
        for (const question of child) {
          if (objectOrNull(question)) {
            count += 1;
            if (count >= MAX_RAW_CANDIDATE_OBSERVATION_V5) {
              count = MAX_RAW_CANDIDATE_OBSERVATION_V5;
              saturated = true;
              return;
            }
          }
        }
      }
      visit(child, depth + 1);
      if (saturated) return;
    }
  };
  visit(value, 0);
  return { count, saturated };
}
function incompleteJsonHasAffirmativeModelEnvelopeMarkersV5(rawText) {
  if (!/^\s*[\[{]/u.test(rawText)) return false;
  const choices = /"choices"\s*:/u.test(rawText);
  const message = /"message"\s*:/u.test(rawText);
  const questions = /(?:"questions"|\\"questions\\")\s*:/u.test(rawText);
  return questions || choices && message;
}
function observeRawCandidateCardinalityV5(rawText) {
  const rootSequence = new StrictJsonObserverV5(rawText).parseSequence();
  const duplicateKeys = rootSequence.duplicateKeys;
  let cardinalityAmbiguous = duplicateKeys.length > 0 || rootSequence.completedTopLevelValues > 1 || rootSequence.failed && (rootSequence.completedTopLevelValues >= 1 && /^\s*[\[{]/u.test(rawText) || incompleteJsonHasAffirmativeModelEnvelopeMarkersV5(rawText));
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const affirmativeRoots = Math.min(
      rootSequence.completedTopLevelValues,
      MAX_RAW_CANDIDATE_OBSERVATION_V5
    );
    return {
      choicesObserved: 0,
      fullQuestionObjectsObserved: 0,
      candidateUnitsEffective: Math.max(1, affirmativeRoots),
      choiceCardinalityDrift: true,
      choiceCardinalityShortage: true,
      choiceCardinalityExcess: false,
      cardinalityAmbiguous,
      observationSaturated: rootSequence.completedTopLevelValues >= MAX_RAW_CANDIDATE_OBSERVATION_V5,
      duplicateKeys
    };
  }
  cardinalityAmbiguous ||= rootSequence.failed;
  const root = objectOrNull(parsed);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const alternateRootQuestions = boundedQuestionObjectCountV5(root);
  let fullQuestionObjectsObserved = alternateRootQuestions.count;
  let observationSaturated = choices.length >= MAX_RAW_CANDIDATE_OBSERVATION_V5;
  observationSaturated ||= alternateRootQuestions.saturated;
  for (const candidate of choices.slice(0, MAX_RAW_CANDIDATE_OBSERVATION_V5)) {
    const choice = objectOrNull(candidate);
    const message = objectOrNull(choice?.message);
    if (typeof message?.content !== "string") {
      continue;
    }
    const contentSequence = new StrictJsonObserverV5(message.content).parseSequence();
    if (contentSequence.duplicateKeys.length > 0 || contentSequence.completedTopLevelValues > 1 || contentSequence.failed && (contentSequence.completedTopLevelValues >= 1 && /^\s*[\[{]/u.test(message.content) || incompleteJsonHasAffirmativeModelEnvelopeMarkersV5(message.content))) {
      cardinalityAmbiguous = true;
    }
    let content;
    try {
      content = JSON.parse(message.content);
    } catch {
      continue;
    }
    cardinalityAmbiguous ||= contentSequence.failed;
    const contentQuestions = boundedQuestionObjectCountV5(content);
    fullQuestionObjectsObserved = Math.min(
      MAX_RAW_CANDIDATE_OBSERVATION_V5,
      fullQuestionObjectsObserved + contentQuestions.count
    );
    observationSaturated ||= contentQuestions.saturated || fullQuestionObjectsObserved >= MAX_RAW_CANDIDATE_OBSERVATION_V5;
    if (observationSaturated) break;
  }
  const choicesObserved = Math.min(choices.length, MAX_RAW_CANDIDATE_OBSERVATION_V5);
  const candidateUnitsEffective = Math.max(1, choicesObserved, fullQuestionObjectsObserved);
  cardinalityAmbiguous ||= choices.length > 1 || fullQuestionObjectsObserved > 1;
  return {
    choicesObserved,
    fullQuestionObjectsObserved,
    candidateUnitsEffective,
    choiceCardinalityDrift: choices.length !== 1,
    choiceCardinalityShortage: choices.length < 1,
    choiceCardinalityExcess: choices.length > 1,
    cardinalityAmbiguous,
    observationSaturated,
    duplicateKeys
  };
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/price-snapshot-core.ts
function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function rows(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a nonempty array`);
  return value.map((entry, index) => record(entry, `${label}[${index}]`));
}
function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}
function decimal(value, label) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} is not a non-negative decimal`);
  return parsed;
}
function positiveInteger(value, label) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} is not a positive integer`);
  return parsed;
}
function uniqueSortedStrings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    throw new Error(`${label} must be a string array`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${label} must not contain duplicate declarations`);
  }
  return [...value].sort();
}
function rawResponseCommitments(input) {
  const expectedUrls = [
    "https://openrouter.ai/api/v1/models",
    ...modelIdsV5().map((modelId) => `https://openrouter.ai/api/v1/models/${modelId}/endpoints`)
  ].sort();
  if (input.rawHttpResponses.length !== expectedUrls.length) {
    throw new Error("public pricing capture must bind exactly three raw HTTP responses");
  }
  const ordered = [...input.rawHttpResponses].sort((left, right) => left.url.localeCompare(right.url, "en"));
  if (stableJsonV5(ordered.map((row) => row.url)) !== stableJsonV5(expectedUrls)) {
    throw new Error("public pricing raw HTTP response URL set differs");
  }
  const parsedByUrl = /* @__PURE__ */ new Map();
  const commitments = ordered.map((row) => {
    if (row.status !== 200) throw new Error(`${row.url} raw HTTP status must equal 200`);
    if (typeof row.contentType !== "string" || !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(row.contentType.trim())) {
      throw new Error(`${row.url} raw HTTP Content-Type is not JSON`);
    }
    const bodyUtf8Bytes = Buffer.byteLength(row.bodyText, "utf8");
    if (bodyUtf8Bytes < 1 || bodyUtf8Bytes > METADATA_RESPONSE_BODY_MAX_BYTES_V5) {
      throw new Error(`${row.url} raw HTTP body exceeds metadata bound`);
    }
    if (observeDuplicateJsonKeysV5(row.bodyText).length > 0) {
      throw new Error(`${row.url} raw HTTP JSON contains duplicate object keys`);
    }
    parsedByUrl.set(row.url, JSON.parse(row.bodyText));
    return {
      url: row.url,
      status: 200,
      contentType: row.contentType,
      bodyUtf8Bytes,
      bodySha256: sha256V5(row.bodyText)
    };
  });
  const modelsUrl = expectedUrls[0];
  if (stableJsonV5(parsedByUrl.get(modelsUrl)) !== stableJsonV5(input.modelsPayload)) {
    throw new Error("models payload differs from its exact raw HTTP response");
  }
  for (const modelId of modelIdsV5()) {
    const url = `https://openrouter.ai/api/v1/models/${modelId}/endpoints`;
    if (stableJsonV5(parsedByUrl.get(url)) !== stableJsonV5(input.endpointPayloads[modelId])) {
      throw new Error(`${modelId} endpoint payload differs from its exact raw HTTP response`);
    }
  }
  return commitments;
}
var KNOWN_EXTRA_UNIT_DIMENSIONS_V52 = /* @__PURE__ */ new Set([
  "image",
  "web_search",
  "internal_reasoning",
  "input_cache_read",
  "input_cache_write"
]);
var INAPPLICABLE_UNIT_DIMENSIONS_V52 = /* @__PURE__ */ new Set([
  "image",
  "web_search"
]);
var BOUNDED_INPUT_TOKEN_DIMENSIONS_V52 = /* @__PURE__ */ new Set([
  "input_cache_read",
  "input_cache_write"
]);
var BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V52 = /* @__PURE__ */ new Set([
  "internal_reasoning"
]);
var REQUEST_NON_USE_CONTRACT_V52 = {
  image: "TEXT_ONLY_MESSAGE_CONTENT",
  web_search: "NO_PLUGIN_OR_TOOL_SURFACE",
  internal_reasoning: "REQUEST_DISABLED_RESPONSE_REASONING_TOKENS_MUST_BE_ZERO_IF_PRESENT_AND_MAX_RATE_INCLUDED_IN_OUTPUT_CEILING",
  input_cache_read: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
  input_cache_write: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING"
};
function pricingObject(value, label, chargeDimensions, inherited, allowOverrides = false) {
  const pricing = record(value, label);
  const prompt = pricing.prompt === void 0 && inherited ? inherited.prompt : decimal(pricing.prompt, `${label}.prompt`);
  const completion = pricing.completion === void 0 && inherited ? inherited.completion : decimal(pricing.completion, `${label}.completion`);
  if (pricing.request === void 0 && !inherited) {
    throw new Error(`${label}.request is absent; v5 does not assume an omitted fixed request fee is zero`);
  }
  const request = pricing.request === void 0 ? inherited.request : decimal(pricing.request, `${label}.request`);
  const extraChargeUsdPerUnit = inherited ? { ...inherited.extraChargeUsdPerUnit } : {};
  chargeDimensions.add("prompt");
  chargeDimensions.add("completion");
  chargeDimensions.add("request");
  for (const [dimension, raw] of Object.entries(pricing)) {
    if (dimension === "prompt" || dimension === "completion" || dimension === "request") continue;
    if (dimension === "overrides" && allowOverrides) continue;
    if (!KNOWN_EXTRA_UNIT_DIMENSIONS_V52.has(dimension)) {
      throw new Error(`${label}.${dimension} is an unknown charge dimension`);
    }
    const rate = decimal(raw, `${label}.${dimension}`);
    chargeDimensions.add(dimension);
    extraChargeUsdPerUnit[dimension] = rate;
  }
  return { prompt, completion, request, extraChargeUsdPerUnit };
}
function normalizeOverrides(pricingRoot, basePricing, label, chargeDimensions) {
  const candidates = pricingRoot.overrides;
  if (!Array.isArray(candidates)) throw new Error(`${label}.pricing.overrides must be an array`);
  const result = candidates.map((candidate, index) => {
    const row = record(candidate, `${label}.pricing.overrides[${index}]`);
    const threshold = row.min_prompt_tokens ?? row.minPromptTokens ?? row.min_tokens;
    const pricingFields = { ...row };
    delete pricingFields.min_prompt_tokens;
    delete pricingFields.minPromptTokens;
    delete pricingFields.min_tokens;
    const pricing = pricingObject(
      pricingFields,
      `${label}.pricing.overrides[${index}]`,
      chargeDimensions,
      basePricing
    );
    return {
      minPromptTokens: positiveInteger(threshold, `${label}.pricing.overrides[${index}].min_prompt_tokens`),
      promptUsdPerToken: pricing.prompt,
      completionUsdPerToken: pricing.completion,
      fixedRequestUsd: pricing.request,
      extraChargeUsdPerUnit: pricing.extraChargeUsdPerUnit
    };
  });
  result.sort((left, right) => left.minPromptTokens - right.minPromptTokens);
  if (new Set(result.map((row) => row.minPromptTokens)).size !== result.length) {
    throw new Error(`${label}.pricing.overrides has duplicate thresholds`);
  }
  return result;
}
function normalizeStatus(endpoint, label) {
  if (endpoint.status === "active" || endpoint.status === "inactive") return endpoint.status;
  if (Object.hasOwn(endpoint, "status")) throw new Error(`${label}.status is invalid`);
  if (endpoint.is_available === true || endpoint.isAvailable === true) return "active";
  if (endpoint.is_available === false || endpoint.isAvailable === false) return "inactive";
  if (Object.hasOwn(endpoint, "is_available") || Object.hasOwn(endpoint, "isAvailable")) {
    throw new Error(`${label}.is_available is invalid`);
  }
  return "active";
}
function endpointArray(payload, label) {
  const root = record(payload, label);
  const data = root.data === void 0 ? root : record(root.data, `${label}.data`);
  return rows(data.endpoints, `${label}.data.endpoints`);
}
function normalizeEndpoint(endpoint, label, chargeDimensions) {
  for (const forbidden of ["pricing_overrides", "pricingOverrides", "overrides"]) {
    if (Object.prototype.hasOwnProperty.call(endpoint, forbidden)) {
      throw new Error(`${label}.${forbidden} is forbidden; endpoint.pricing.overrides is canonical`);
    }
  }
  const pricingRoot = record(endpoint.pricing, `${label}.pricing`);
  const pricing = pricingObject(pricingRoot, `${label}.pricing`, chargeDimensions, void 0, true);
  const supported = uniqueSortedStrings(
    endpoint.supported_parameters ?? endpoint.supportedParameters,
    `${label}.supported_parameters`
  );
  const tag = nonempty(endpoint.tag ?? endpoint.provider_tag ?? endpoint.providerTag, `${label}.tag`);
  return {
    provider: nonempty(endpoint.provider_name ?? endpoint.provider ?? endpoint.providerName, `${label}.provider_name`),
    endpointName: nonempty(endpoint.name ?? endpoint.endpoint_name ?? endpoint.model_name, `${label}.name`),
    tag,
    status: normalizeStatus(endpoint, label),
    contextLength: positiveInteger(endpoint.context_length ?? endpoint.contextLength, `${label}.context_length`),
    promptUsdPerToken: decimal(pricing.prompt, `${label}.pricing.prompt`),
    completionUsdPerToken: decimal(pricing.completion, `${label}.pricing.completion`),
    fixedRequestUsd: pricing.request,
    extraChargeUsdPerUnit: pricing.extraChargeUsdPerUnit,
    supportedParameters: supported,
    overrides: normalizeOverrides(pricingRoot, pricing, label, chargeDimensions)
  };
}
function modelRows(payload) {
  const root = record(payload, "models payload");
  return rows(root.data, "models payload.data");
}
function buildPublicPriceSnapshotV5(input) {
  const commitments = rawResponseCommitments(input);
  const requestedIds = modelIdsV5();
  const rawModels = modelRows(input.modelsPayload);
  const chargeDimensions = /* @__PURE__ */ new Set();
  const models = requestedIds.map((requestedModelId) => {
    const matches = rawModels.filter((row) => row.id === requestedModelId);
    if (matches.length !== 1) throw new Error(`models payload must contain exactly one ${requestedModelId}`);
    const model = matches[0];
    const canonicalSlug = nonempty(model.canonical_slug ?? model.canonicalSlug, `${requestedModelId}.canonical_slug`);
    const topPricing = pricingObject(model.pricing, `${requestedModelId}.pricing`, chargeDimensions);
    const payload = input.endpointPayloads[requestedModelId];
    if (payload === void 0) throw new Error(`missing endpoint payload for ${requestedModelId}`);
    const endpointRates = endpointArray(payload, `${requestedModelId} endpoint payload`).map((endpoint, index) => normalizeEndpoint(endpoint, `${requestedModelId}.endpoints[${index}]`, chargeDimensions)).sort((left, right) => {
      const leftKey = `${left.tag}\0${left.provider}\0${left.endpointName}`;
      const rightKey = `${right.tag}\0${right.provider}\0${right.endpointName}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    const exactActive = endpointRates.filter((row) => row.tag === "google-vertex/global" && row.status === "active");
    if (exactActive.length !== 1) throw new Error(`${requestedModelId} must have exactly one active google-vertex/global endpoint`);
    for (const required of ["response_format", "structured_outputs"]) {
      if (!exactActive[0].supportedParameters.includes(required)) {
        throw new Error(`${requestedModelId} exact endpoint lacks ${required}`);
      }
    }
    return {
      requestedModelId,
      canonicalSlug,
      topLevelPromptUsdPerToken: topPricing.prompt,
      topLevelCompletionUsdPerToken: topPricing.completion,
      topLevelFixedRequestUsd: topPricing.request,
      topLevelExtraChargeUsdPerUnit: topPricing.extraChargeUsdPerUnit,
      endpointRates
    };
  });
  if (!chargeDimensions.has("prompt") || !chargeDimensions.has("completion")) {
    throw new Error("price snapshot lacks prompt/completion charge dimensions");
  }
  const endpointUrls = Object.fromEntries(requestedIds.map((modelId) => [
    modelId,
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`
  ]));
  const core = {
    schemaVersion: "question-quality-openrouter-public-price-snapshot-v5",
    fetchedAt: input.fetchedAt,
    sources: {
      modelsUrl: "https://openrouter.ai/api/v1/models",
      endpointUrls,
      rawResponseCommitments: commitments
    },
    routingContract: {
      exactEndpointTag: "google-vertex/global",
      emergencyCeilingScope: "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES",
      requestNonUseAndResponseAttestationContract: REQUEST_NON_USE_CONTRACT_V52
    },
    chargeDimensions: [...chargeDimensions].sort(),
    knownInapplicableUnitChargeDimensions: [...chargeDimensions].filter((dimension) => INAPPLICABLE_UNIT_DIMENSIONS_V52.has(dimension)).sort(),
    knownBoundedInputTokenChargeDimensions: [...chargeDimensions].filter((dimension) => BOUNDED_INPUT_TOKEN_DIMENSIONS_V52.has(dimension)).sort(),
    knownBoundedOutputTokenChargeDimensions: [...chargeDimensions].filter((dimension) => BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V52.has(dimension)).sort(),
    models
  };
  const snapshot = { ...core, contentSha256: sha256V5(stableJsonV5(core)) };
  return validatePriceSnapshotV5(snapshot);
}
function buildPrivatePriceEvidenceBundleV5(snapshot, rawHttpResponses) {
  const validatedSnapshot = validatePriceSnapshotV5(snapshot);
  const byUrl = new Map(rawHttpResponses.map((row) => [row.url, row]));
  if (byUrl.size !== rawHttpResponses.length || byUrl.size !== validatedSnapshot.sources.rawResponseCommitments.length) {
    throw new Error("private price evidence raw response cardinality differs");
  }
  for (const commitment of validatedSnapshot.sources.rawResponseCommitments) {
    const raw = byUrl.get(commitment.url);
    if (!raw || raw.status !== commitment.status || raw.contentType !== commitment.contentType || Buffer.byteLength(raw.bodyText, "utf8") !== commitment.bodyUtf8Bytes || sha256V5(raw.bodyText) !== commitment.bodySha256) {
      throw new Error(`private raw price evidence differs for ${commitment.url}`);
    }
    if (observeDuplicateJsonKeysV5(raw.bodyText).length > 0) {
      throw new Error(`private raw price evidence has duplicate keys for ${commitment.url}`);
    }
  }
  const core = {
    schemaVersion: "question-quality-openrouter-private-price-evidence-bundle-v5",
    snapshot: validatedSnapshot,
    rawHttpResponses: [...rawHttpResponses].sort((left, right) => left.url.localeCompare(right.url, "en"))
  };
  return { ...core, bundleSha256: sha256V5(stableJsonV5(core)) };
}
function validatePrivatePriceEvidenceBundleV5(value) {
  const bundle = record(value, "private price evidence bundle");
  if (Object.keys(bundle).sort().join(",") !== "bundleSha256,rawHttpResponses,schemaVersion,snapshot") {
    throw new Error("private price evidence bundle keys differ");
  }
  if (bundle.schemaVersion !== "question-quality-openrouter-private-price-evidence-bundle-v5" || !Array.isArray(bundle.rawHttpResponses) || typeof bundle.bundleSha256 !== "string") {
    throw new Error("private price evidence bundle shape differs");
  }
  const core = { ...bundle };
  delete core.bundleSha256;
  if (bundle.bundleSha256 !== sha256V5(stableJsonV5(core))) {
    throw new Error("private price evidence bundle hash differs");
  }
  const snapshot = validatePriceSnapshotV5(bundle.snapshot);
  const rawHttpResponses = bundle.rawHttpResponses.map((candidate, index) => {
    const row = record(candidate, `private price evidence rawHttpResponses[${index}]`);
    if (typeof row.url !== "string" || typeof row.status !== "number" || typeof row.contentType !== "string" || typeof row.bodyText !== "string") {
      throw new Error(`private price evidence rawHttpResponses[${index}] shape differs`);
    }
    if (Object.keys(row).sort().join(",") !== "bodyText,contentType,status,url") {
      throw new Error(`private price evidence rawHttpResponses[${index}] keys differ`);
    }
    return row;
  });
  const byUrl = new Map(rawHttpResponses.map((row) => [row.url, JSON.parse(row.bodyText)]));
  const rebuiltSnapshot = buildPublicPriceSnapshotV5({
    fetchedAt: snapshot.fetchedAt,
    modelsPayload: byUrl.get("https://openrouter.ai/api/v1/models"),
    endpointPayloads: Object.fromEntries(modelIdsV5().map((modelId) => [
      modelId,
      byUrl.get(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`)
    ])),
    rawHttpResponses
  });
  if (stableJsonV5(rebuiltSnapshot) !== stableJsonV5(snapshot)) {
    throw new Error("private raw price evidence does not exactly reproduce normalized snapshot");
  }
  const rebuiltBundle = buildPrivatePriceEvidenceBundleV5(snapshot, rawHttpResponses);
  if (stableJsonV5(rebuiltBundle) !== stableJsonV5(bundle)) {
    throw new Error("private price evidence bundle is not canonical");
  }
  return rebuiltBundle;
}
function validatePinnedPrivatePriceEvidenceBundleV5(input) {
  const hash2 = /^[a-f0-9]{64}$/u;
  if (!hash2.test(input.observedFileSha256) || !hash2.test(input.expectedFileSha256) || !hash2.test(input.expectedBundleSha256)) {
    throw new Error("price capture handoff hashes are malformed");
  }
  if (input.observedFileSha256 !== input.expectedFileSha256) {
    throw new Error("price capture artifact file differs from the in-memory capture handoff");
  }
  const bundle = validatePrivatePriceEvidenceBundleV5(input.value);
  if (bundle.bundleSha256 !== input.expectedBundleSha256) {
    throw new Error("price capture bundle differs from the in-memory capture handoff");
  }
  return bundle;
}
function priceEvidenceForModelV5(snapshot, modelId) {
  const model = snapshot.models.find((row) => row.requestedModelId === modelId);
  if (!model) throw new Error(`price snapshot lacks ${modelId}`);
  const exact = model.endpointRates.filter((row) => row.tag === "google-vertex/global" && row.status === "active");
  if (exact.length !== 1) throw new Error(`price snapshot exact endpoint cardinality failed for ${modelId}`);
  const activeRates = model.endpointRates.filter((row) => row.status === "active").flatMap((row) => [
    {
      prompt: row.promptUsdPerToken,
      completion: row.completionUsdPerToken,
      request: row.fixedRequestUsd,
      cacheRead: row.extraChargeUsdPerUnit.input_cache_read ?? 0,
      cacheWrite: row.extraChargeUsdPerUnit.input_cache_write ?? 0,
      internalReasoning: row.extraChargeUsdPerUnit.internal_reasoning ?? 0
    },
    ...row.overrides.map((override) => ({
      prompt: override.promptUsdPerToken,
      completion: override.completionUsdPerToken,
      request: override.fixedRequestUsd,
      cacheRead: override.extraChargeUsdPerUnit.input_cache_read ?? 0,
      cacheWrite: override.extraChargeUsdPerUnit.input_cache_write ?? 0,
      internalReasoning: override.extraChargeUsdPerUnit.internal_reasoning ?? 0
    }))
  ]);
  if (activeRates.length === 0) throw new Error(`price snapshot has no active rates for ${modelId}`);
  const perMillion = (value) => Math.round(value * 1e6 * 1e12) / 1e12;
  const maximumCacheRead = Math.max(
    model.topLevelExtraChargeUsdPerUnit.input_cache_read ?? 0,
    ...activeRates.map((row) => row.cacheRead)
  );
  const maximumCacheWrite = Math.max(
    model.topLevelExtraChargeUsdPerUnit.input_cache_write ?? 0,
    ...activeRates.map((row) => row.cacheWrite)
  );
  const emergencyPrompt = Math.max(model.topLevelPromptUsdPerToken, ...activeRates.map((row) => row.prompt)) + maximumCacheRead + maximumCacheWrite;
  const maximumInternalReasoning = Math.max(
    model.topLevelExtraChargeUsdPerUnit.internal_reasoning ?? 0,
    ...activeRates.map((row) => row.internalReasoning)
  );
  const emergencyCompletion = Math.max(
    model.topLevelCompletionUsdPerToken,
    ...activeRates.map((row) => row.completion)
  ) + maximumInternalReasoning;
  return {
    canonicalSlug: model.canonicalSlug,
    exactProvider: exact[0].provider,
    exactPromptUsdPer1M: perMillion(exact[0].promptUsdPerToken),
    exactCompletionUsdPer1M: perMillion(exact[0].completionUsdPerToken),
    exactRequestUsd: exact[0].fixedRequestUsd,
    // Cache read/write may be activated by provider-side behavior even when
    // the request contains no cache controls. Count every worst-case input
    // token against both maximum rates instead of treating cache as zero-use.
    emergencyPromptUsdPer1M: perMillion(emergencyPrompt),
    emergencyCompletionUsdPer1M: perMillion(emergencyCompletion),
    emergencyRequestUsd: Math.max(model.topLevelFixedRequestUsd, ...activeRates.map((row) => row.request)),
    emergencyCacheReadUsdPer1M: perMillion(maximumCacheRead),
    emergencyCacheWriteUsdPer1M: perMillion(maximumCacheWrite),
    emergencyInternalReasoningUsdPer1M: perMillion(maximumInternalReasoning)
  };
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/response-parser.ts
function maybeRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function record2(value, label) {
  const row = maybeRecord(value);
  if (!row) throw new Error(`${label} must be an object`);
  return row;
}
function exactObjectKeys(value, required, optional, label) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label}.${key} is required`);
  }
  const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) throw new Error(`${label} contains unexpected fields: ${unexpected.sort().join(",")}`);
}
function finite(value, label, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
function safeInteger(value, label, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}
function nonempty2(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}
function extractConnectivityBillingEvidenceV5(rawText) {
  const defects = [];
  let duplicateBillingKeys = false;
  let strictObservationFailed = false;
  try {
    const duplicates = observeDuplicateJsonKeysV5(rawText);
    duplicateBillingKeys = duplicates.length > 0;
    if (duplicateBillingKeys) defects.push("duplicate_billing_keys_manual_reconciliation");
  } catch {
    strictObservationFailed = true;
    defects.push("strict_json_observation_failed");
  }
  let response = null;
  try {
    response = maybeRecord(JSON.parse(rawText));
    if (!response) defects.push("response_not_object");
  } catch {
    defects.push("response_not_json");
  }
  if (strictObservationFailed && response) duplicateBillingKeys = true;
  const usage = response ? maybeRecord(response.usage) : null;
  if (!usage) defects.push("usage_not_object");
  const isByok = usage && typeof usage.is_byok === "boolean" ? usage.is_byok : null;
  const byokFieldPresent = usage ? Object.hasOwn(usage, "is_byok") : false;
  const nonByokResponseCompliant = isByok === false;
  const byokOrMalformedBilling = isByok !== false;
  if (isByok === true) defects.push("byok_billing_requires_manual_reconciliation");
  else if (byokFieldPresent && isByok === null) defects.push("malformed_byok_billing_requires_manual_reconciliation");
  else if (!byokFieldPresent) defects.push("absent_byok_attestation_requires_manual_reconciliation");
  const positiveUpstreamCostEvidence = usage ? [
    ["usage.cost", usage.cost],
    ...Object.entries(maybeRecord(usage.cost_details) ?? {}).filter(([key]) => /cost/iu.test(key)).map(([key, value]) => [`usage.cost_details.${key}`, value])
  ].flatMap(([field, value]) => typeof value === "number" && (Number.isFinite(value) && value > 0 || value === Number.POSITIVE_INFINITY) ? [{ field: String(field), canonicalDecimal: String(value) }] : []) : [];
  let actualCostUsd = null;
  let costDisposition = "ABSENT_OR_MALFORMED_UNKNOWN";
  let explicitPositiveCostEvidenceHash = null;
  if (duplicateBillingKeys) {
    costDisposition = "AMBIGUOUS_DUPLICATE_BILLING_KEYS";
    explicitPositiveCostEvidenceHash = sha256V5(stableJsonV5({
      type: "duplicate-billing-keys",
      rawResponseSha256: sha256V5(rawText)
    }));
  } else if (byokOrMalformedBilling) {
    costDisposition = "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION";
    if (positiveUpstreamCostEvidence.length > 0) {
      explicitPositiveCostEvidenceHash = sha256V5(stableJsonV5({
        type: "byok-positive-upstream-cost-evidence",
        evidence: positiveUpstreamCostEvidence,
        rawResponseSha256: sha256V5(rawText)
      }));
    }
  } else if (usage && typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 && usage.cost <= MAX_PER_RESPONSE_ACTUAL_COST_USD_V5 && Number.isSafeInteger(Math.ceil(usage.cost * 1e12))) {
    actualCostUsd = usage.cost;
    costDisposition = "ACTUAL_KNOWN";
  } else if (usage && typeof usage.cost === "number" && (Number.isFinite(usage.cost) && usage.cost > 0 || usage.cost === Number.POSITIVE_INFINITY)) {
    costDisposition = "EXPLICIT_POSITIVE_UNREPRESENTABLE";
    explicitPositiveCostEvidenceHash = sha256V5(stableJsonV5({
      type: Number.isFinite(usage.cost) ? "finite-positive-number" : "json-numeric-overflow-positive-infinity",
      canonicalDecimal: String(usage.cost),
      rawResponseSha256: sha256V5(rawText)
    }));
    defects.push("explicit_positive_cost_unrepresentable_manual_reconciliation");
  } else {
    defects.push("cost_unknown_invalid_or_unroundable");
  }
  let promptTokens = null;
  let completionTokens = null;
  let totalTokens = null;
  let reasoningTokens = null;
  let reasoningDisabledResponseCompliant = true;
  let cachedTokens = null;
  let cacheDisabledResponseCompliant = true;
  if (usage && typeof usage.prompt_tokens === "number" && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 1 && usage.prompt_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 && typeof usage.completion_tokens === "number" && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0 && usage.completion_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 && typeof usage.total_tokens === "number" && Number.isSafeInteger(usage.total_tokens) && usage.total_tokens >= 1 && usage.total_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 && Number.isSafeInteger(usage.prompt_tokens + usage.completion_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens) {
    promptTokens = usage.prompt_tokens;
    completionTokens = usage.completion_tokens;
    totalTokens = usage.total_tokens;
  } else {
    defects.push("usage_unknown_invalid_or_inconsistent");
  }
  if (usage && Object.hasOwn(usage, "completion_tokens_details")) {
    const details = maybeRecord(usage.completion_tokens_details);
    if (details && Object.keys(details).length === 1 && Object.hasOwn(details, "reasoning_tokens") && typeof details.reasoning_tokens === "number" && Number.isSafeInteger(details.reasoning_tokens) && details.reasoning_tokens >= 0 && details.reasoning_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5) {
      reasoningTokens = details.reasoning_tokens;
      if (reasoningTokens > 0) {
        reasoningDisabledResponseCompliant = false;
        defects.push("reasoning_tokens_positive_despite_disabled_request");
      }
    } else {
      reasoningDisabledResponseCompliant = false;
      defects.push("reasoning_token_details_malformed");
    }
  }
  if (usage && Object.hasOwn(usage, "prompt_tokens_details")) {
    const details = maybeRecord(usage.prompt_tokens_details);
    if (details && Object.keys(details).length === 1 && Object.hasOwn(details, "cached_tokens") && typeof details.cached_tokens === "number" && Number.isSafeInteger(details.cached_tokens) && details.cached_tokens >= 0 && details.cached_tokens <= MAX_PER_RESPONSE_USAGE_TOKENS_V5) {
      cachedTokens = details.cached_tokens;
      if (cachedTokens > 0) {
        cacheDisabledResponseCompliant = false;
        defects.push("cached_tokens_positive_despite_cacheless_request");
      }
    } else {
      cacheDisabledResponseCompliant = false;
      defects.push("cached_token_details_malformed");
    }
  }
  if (usage && Object.keys(usage).some((key) => /cache/iu.test(key))) {
    cacheDisabledResponseCompliant = false;
    defects.push("unknown_cache_usage_field");
  }
  const core = {
    billingParserVersion: "campaign-v6-connectivity-pilot-billing-parser-v5",
    costActualKnown: actualCostUsd !== null,
    costDisposition,
    manualCostReconciliationRequired: costDisposition === "EXPLICIT_POSITIVE_UNREPRESENTABLE" || costDisposition === "AMBIGUOUS_DUPLICATE_BILLING_KEYS" || costDisposition === "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION",
    explicitPositiveCostEvidenceHash,
    usageActualKnown: promptTokens !== null,
    actualCostUsd,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens,
    reasoningDisabledResponseCompliant,
    cachedTokens,
    cacheDisabledResponseCompliant,
    isByok,
    nonByokResponseCompliant,
    defects: [...new Set(defects)].sort()
  };
  return { ...core, billingEvidenceHash: sha256V5(stableJsonV5(core)) };
}
var SUPPORTED_SCHEMA_KEYS = /* @__PURE__ */ new Set([
  "$schema",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "enum",
  "const",
  "minimum",
  "maximum",
  "pattern",
  "description",
  "title"
]);
function jsonEqual(left, right) {
  return stableJsonV5(left) === stableJsonV5(right);
}
function assertMatchesExactSchema(value, schemaValue, label, depth = 0) {
  if (depth > 64) throw new Error(`${label} schema nesting exceeds verifier bound`);
  const schema = record2(schemaValue, `${label} schema`);
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_SCHEMA_KEYS.has(key)) throw new Error(`${label} uses unsupported schema keyword ${key}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => jsonEqual(candidate, value))) {
    throw new Error(`${label} is outside schema enum`);
  }
  if (Object.hasOwn(schema, "const") && !jsonEqual(schema.const, value)) {
    throw new Error(`${label} differs from schema const`);
  }
  const type = schema.type;
  if (typeof type !== "string") throw new Error(`${label} schema must declare one explicit type`);
  if (type === "object") {
    const objectValue = record2(value, label);
    const properties = record2(schema.properties, `${label} schema.properties`);
    if (!Array.isArray(schema.required) || schema.required.some((entry) => typeof entry !== "string")) {
      throw new Error(`${label} schema.required must be a string array`);
    }
    for (const required of schema.required) {
      if (!Object.hasOwn(objectValue, required)) throw new Error(`${label}.${required} is required by exact response schema`);
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`${label} exact response schema must set additionalProperties=false`);
    }
    for (const [key, child] of Object.entries(objectValue)) {
      if (!Object.hasOwn(properties, key)) throw new Error(`${label}.${key} is not allowed by exact response schema`);
      assertMatchesExactSchema(child, properties[key], `${label}.${key}`, depth + 1);
    }
    return;
  }
  if (type === "array") {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
    const minItems = schema.minItems === void 0 ? 0 : safeInteger(schema.minItems, `${label} schema.minItems`);
    const maxItems = schema.maxItems === void 0 ? Number.MAX_SAFE_INTEGER : safeInteger(schema.maxItems, `${label} schema.maxItems`);
    if (value.length < minItems || value.length > maxItems) throw new Error(`${label} array length violates exact response schema`);
    if (!schema.items) throw new Error(`${label} schema.items is required`);
    value.forEach((child, index) => assertMatchesExactSchema(child, schema.items, `${label}[${index}]`, depth + 1));
    return;
  }
  if (type === "string") {
    if (typeof value !== "string") throw new Error(`${label} must be a string`);
    const minLength = schema.minLength === void 0 ? 0 : safeInteger(schema.minLength, `${label} schema.minLength`);
    const maxLength = schema.maxLength === void 0 ? Number.MAX_SAFE_INTEGER : safeInteger(schema.maxLength, `${label} schema.maxLength`);
    if (value.length < minLength || value.length > maxLength) throw new Error(`${label} string length violates exact response schema`);
    if (schema.pattern !== void 0) {
      if (typeof schema.pattern !== "string" || !new RegExp(schema.pattern, "u").test(value)) throw new Error(`${label} violates schema pattern`);
    }
    return;
  }
  if (type === "integer") {
    safeInteger(value, label, Number.isFinite(schema.minimum) ? Number(schema.minimum) : Number.MIN_SAFE_INTEGER);
    if (typeof schema.maximum === "number" && value > schema.maximum) throw new Error(`${label} exceeds schema maximum`);
    return;
  }
  if (type === "number") {
    const number = finite(value, label, Number.isFinite(schema.minimum) ? Number(schema.minimum) : -Number.MAX_VALUE);
    if (typeof schema.maximum === "number" && number > schema.maximum) throw new Error(`${label} exceeds schema maximum`);
    return;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
    return;
  }
  if (type === "null") {
    if (value !== null) throw new Error(`${label} must be null`);
    return;
  }
  throw new Error(`${label} uses unsupported schema type ${type}`);
}
function parseConnectivityResponseV5(input) {
  const responseDuplicates = observeDuplicateJsonKeysV5(input.rawText);
  if (responseDuplicates.length > 0) throw new Error("response contains duplicate JSON object keys");
  const response = record2(JSON.parse(input.rawText), "response");
  exactObjectKeys(
    response,
    ["id", "model", "provider", "object", "created", "choices", "usage"],
    ["system_fingerprint"],
    "response"
  );
  const providerRequestId = nonempty2(response.id, "response.id");
  const servedModel = nonempty2(response.model, "response.model");
  const provider = nonempty2(response.provider, "response.provider");
  if (response.object !== "chat.completion") throw new Error("response.object must be chat.completion");
  safeInteger(response.created, "response.created", 1);
  if (Object.hasOwn(response, "system_fingerprint") && response.system_fingerprint !== null && typeof response.system_fingerprint !== "string") {
    throw new Error("response.system_fingerprint must be string or null");
  }
  if (!input.allowedServedModels.includes(servedModel)) throw new Error("served model is not price-attested");
  if (provider !== input.expectedProvider) throw new Error("provider route is not the exact price-attested route");
  if (!Array.isArray(response.choices) || response.choices.length !== 1) throw new Error("response must have exactly one choice");
  const choice = record2(response.choices[0], "response.choices[0]");
  exactObjectKeys(choice, ["index", "finish_reason", "message"], ["native_finish_reason", "logprobs"], "response.choices[0]");
  if (choice.index !== 0) throw new Error("choice index must be zero");
  if (Object.hasOwn(choice, "native_finish_reason") && choice.native_finish_reason !== null && typeof choice.native_finish_reason !== "string") {
    throw new Error("choice.native_finish_reason must be string or null");
  }
  if (Object.hasOwn(choice, "logprobs") && choice.logprobs !== null) {
    throw new Error("choice.logprobs must be null when not requested");
  }
  const finishReason = nonempty2(choice.finish_reason, "choice.finish_reason");
  if (!input.allowedFinishReasons.includes(finishReason)) {
    throw new Error("choice.finish_reason is not an allowed terminal non-truncated reason");
  }
  const message = record2(choice.message, "choice.message");
  exactObjectKeys(message, ["role", "content"], [], "choice.message");
  if (message.role !== "assistant") throw new Error("choice.message.role must be assistant");
  const content = nonempty2(message.content, "choice.message.content");
  if (observeDuplicateJsonKeysV5(content).length > 0) {
    throw new Error("choice.message.content JSON contains duplicate object keys");
  }
  const parsedContent = record2(JSON.parse(content), "choice.message.content JSON");
  assertMatchesExactSchema(parsedContent, input.responseSchema, "choice.message.content JSON");
  if (!Array.isArray(parsedContent.questions) || parsedContent.questions.length !== 1) {
    throw new Error("parser requires exactly one semantic question");
  }
  const question = record2(parsedContent.questions[0], "questions[0]");
  if (Object.keys(question).length === 0) throw new Error("question is empty");
  const billing = extractConnectivityBillingEvidenceV5(input.rawText);
  if (!billing.nonByokResponseCompliant) {
    throw new Error("response.usage.is_byok must be explicitly false for non-BYOK billing attestation");
  }
  if (!billing.costActualKnown || !billing.usageActualKnown || billing.actualCostUsd === null || billing.promptTokens === null || billing.completionTokens === null || billing.totalTokens === null) {
    throw new Error("successful parser requires exact final usage and actual cost evidence");
  }
  const usage = record2(response.usage, "response.usage");
  exactObjectKeys(usage, ["prompt_tokens", "completion_tokens", "total_tokens", "cost"], [
    "prompt_tokens_details",
    "completion_tokens_details",
    "cost_details",
    "is_byok"
  ], "response.usage");
  if (Object.hasOwn(usage, "prompt_tokens_details")) {
    const promptDetails = record2(usage.prompt_tokens_details, "response.usage.prompt_tokens_details");
    exactObjectKeys(promptDetails, ["cached_tokens"], [], "response.usage.prompt_tokens_details");
    if (safeInteger(promptDetails.cached_tokens, "response.usage.prompt_tokens_details.cached_tokens") !== 0) {
      throw new Error("response reports cached tokens despite the cacheless exact request");
    }
  }
  if (Object.hasOwn(usage, "completion_tokens_details")) {
    const completionDetails = record2(usage.completion_tokens_details, "response.usage.completion_tokens_details");
    exactObjectKeys(completionDetails, ["reasoning_tokens"], [], "response.usage.completion_tokens_details");
    safeInteger(completionDetails.reasoning_tokens, "response.usage.completion_tokens_details.reasoning_tokens");
  }
  if (Object.hasOwn(usage, "cost_details")) {
    const costDetails = record2(usage.cost_details, "response.usage.cost_details");
    exactObjectKeys(costDetails, [
      "upstream_inference_cost",
      "upstream_inference_prompt_cost",
      "upstream_inference_completions_cost"
    ], [], "response.usage.cost_details");
    for (const key of Object.keys(costDetails)) finite(costDetails[key], `response.usage.cost_details.${key}`);
  }
  if (usage.is_byok !== false || !billing.nonByokResponseCompliant) {
    throw new Error("response.usage.is_byok must be explicitly false for non-BYOK billing attestation");
  }
  if (!billing.reasoningDisabledResponseCompliant) {
    throw new Error("response reports reasoning tokens despite the reasoning-disabled exact request");
  }
  if (!billing.cacheDisabledResponseCompliant) {
    throw new Error("response cache usage is positive, malformed, or outside the exact attestation shape");
  }
  const evidenceCore = {
    parserVersion: "campaign-v6-connectivity-pilot-response-parser-v5",
    providerRequestId,
    requestedModel: input.requestedModel,
    servedModel,
    provider,
    promptTokens: billing.promptTokens,
    completionTokens: billing.completionTokens,
    totalTokens: billing.totalTokens,
    actualCostUsd: billing.actualCostUsd,
    reasoningTokens: billing.reasoningTokens,
    cachedTokens: billing.cachedTokens,
    finishReason,
    questionHash: sha256V5(stableJsonV5(question)),
    billingEvidenceHash: billing.billingEvidenceHash,
    responseSchemaSha256: sha256V5(stableJsonV5(input.responseSchema)),
    semanticQuestionCount: 1,
    choiceCount: 1,
    exactMessageShape: ["content", "role"]
  };
  return { ...evidenceCore, parserEvidenceHash: sha256V5(stableJsonV5(evidenceCore)) };
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/terminal-reconciliation-core.ts
var MONEY_SCALE_V5 = 1e12;
var MAX_RUN_EFFECTIVE_COST_USD_V5 = MAX_PER_RESPONSE_ACTUAL_COST_USD_V5 * 2;
var MAX_RUN_USAGE_TOKENS_V5 = MAX_PER_RESPONSE_USAGE_TOKENS_V5 * 2;
function projectCandidateCapacityQuarantineV5(input) {
  for (const [label, value] of Object.entries(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer`);
  }
  if (input.cap < 1 || input.pilotReservation < 1 || input.currentReserved < input.pilotReservation || input.currentUsed + input.currentReserved > input.cap || input.observedCandidateUnits < 1) {
    throw new Error("candidate quarantine projection inputs violate the global cap invariant");
  }
  const remainingBefore = input.cap - input.currentUsed;
  const usedIncrement = Math.min(input.observedCandidateUnits, remainingBefore);
  const nextUsed = input.currentUsed + usedIncrement;
  const otherReserved = input.currentReserved - input.pilotReservation;
  const nextReserved = input.cap - nextUsed;
  if (otherReserved > nextReserved) {
    throw new Error("concurrent reservation prevents exact candidate quarantine attribution");
  }
  return {
    usedIncrement,
    nextUsed,
    otherReserved,
    nextReserved,
    pilotQuarantineReservation: nextReserved - otherReserved,
    furtherCandidateReservationAllowed: false
  };
}
function boundedMoney(value, label, maximum) {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${label} must be nonnegative finite money <= ${maximum}`);
  }
  const scaled = Math.ceil(value * MONEY_SCALE_V5);
  if (!Number.isSafeInteger(scaled) || scaled < 0) throw new Error(`${label} cannot be safely scaled`);
  const rounded = scaled / MONEY_SCALE_V5;
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > maximum) throw new Error(`${label} cannot be safely rounded`);
  return rounded;
}
function maybeActualMoney(value) {
  if (value === null) return null;
  try {
    return boundedMoney(value, "actualCostUsd", MAX_PER_RESPONSE_ACTUAL_COST_USD_V5);
  } catch {
    return null;
  }
}
function exactKnownUsage(billing) {
  if (!billing.usageActualKnown || billing.promptTokens === null || billing.completionTokens === null || billing.totalTokens === null) return null;
  const values = [billing.promptTokens, billing.completionTokens, billing.totalTokens];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > MAX_PER_RESPONSE_USAGE_TOKENS_V5) || billing.promptTokens < 1 || billing.totalTokens < 1 || !Number.isSafeInteger(billing.promptTokens + billing.completionTokens) || billing.totalTokens !== billing.promptTokens + billing.completionTokens) return null;
  return {
    promptTokens: billing.promptTokens,
    completionTokens: billing.completionTokens,
    totalTokens: billing.totalTokens
  };
}
function buildAssignmentChargeV5(input) {
  const reservedCostUsd = boundedMoney(input.reservedCostUsd, "reservedCostUsd", MAX_RUN_EFFECTIVE_COST_USD_V5);
  if (reservedCostUsd <= 0) throw new Error("reservedCostUsd must be positive");
  const actualCostUsd = input.billing.costActualKnown ? maybeActualMoney(input.billing.actualCostUsd) : null;
  const actualKnown = actualCostUsd !== null;
  const manualCostReconciliationRequired = input.billing.costDisposition === "EXPLICIT_POSITIVE_UNREPRESENTABLE" || input.billing.costDisposition === "AMBIGUOUS_DUPLICATE_BILLING_KEYS" || input.billing.costDisposition === "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION" || input.billing.manualCostReconciliationRequired || input.billing.costActualKnown && !actualKnown;
  const costDisposition = manualCostReconciliationRequired ? input.billing.costDisposition : actualKnown ? "ACTUAL_KNOWN" : "ABSENT_OR_MALFORMED_UNKNOWN";
  const usage = exactKnownUsage(input.billing);
  const usageKnown = usage !== null;
  const effectiveCostUsd = actualCostUsd ?? reservedCostUsd;
  const observation = input.candidateObservation;
  if (!Number.isSafeInteger(observation.fullQuestionObjectsObserved) || observation.fullQuestionObjectsObserved < 0 || !Number.isSafeInteger(observation.candidateUnitsEffective) || observation.candidateUnitsEffective < 1) {
    throw new Error("raw candidate observation is outside its bounded integer contract");
  }
  if (typeof input.responseCandidateCardinalityUnobservableAfterSend !== "boolean") {
    throw new Error("response candidate cardinality observability disposition must be explicit");
  }
  const candidateOverflow = observation.candidateUnitsEffective > 1 || observation.observationSaturated;
  const candidateCardinalityAmbiguous = observation.cardinalityAmbiguous || input.responseCandidateCardinalityUnobservableAfterSend;
  const globalCandidateQuarantineRequired = candidateOverflow || observation.choiceCardinalityExcess || candidateCardinalityAmbiguous;
  const candidateObservationEvidenceHash = sha256V5(stableJsonV5({
    observation,
    responseCandidateCardinalityUnobservableAfterSend: input.responseCandidateCardinalityUnobservableAfterSend
  }));
  const core = {
    ordinal: input.ordinal,
    plan: input.plan,
    reservedCostUsd,
    actualKnown,
    costDisposition,
    manualCostReconciliationRequired,
    explicitPositiveCostEvidenceHash: input.billing.explicitPositiveCostEvidenceHash,
    usageKnown,
    actualCostUsd,
    effectiveCostUsd,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    billingEvidenceHash: input.billing.billingEvidenceHash,
    conservativeUnknownBilling: !actualKnown && !manualCostReconciliationRequired,
    provisionalReservedCostPendingManualReconciliation: manualCostReconciliationRequired,
    observedFullQuestionCandidates: observation.fullQuestionObjectsObserved,
    candidateUnitsEffective: observation.candidateUnitsEffective,
    choiceCardinalityDrift: observation.choiceCardinalityDrift,
    choiceCardinalityShortage: observation.choiceCardinalityShortage,
    choiceCardinalityExcess: observation.choiceCardinalityExcess,
    candidateCardinalityAmbiguous,
    candidateObservationSaturated: observation.observationSaturated,
    responseCandidateCardinalityUnobservableAfterSend: input.responseCandidateCardinalityUnobservableAfterSend,
    candidateOverflow,
    globalCandidateQuarantineRequired,
    candidateObservationEvidenceHash
  };
  return core;
}
function buildFailClosedPostSendChargeV5(input) {
  const reservedCostUsd = boundedMoney(input.reservedCostUsd, "reservedCostUsd", MAX_RUN_EFFECTIVE_COST_USD_V5);
  if (reservedCostUsd <= 0) throw new Error("fail-closed post-send charge requires positive reserved cost");
  const failureMessage = input.failure instanceof Error ? `${input.failure.name}:${input.failure.message}` : String(input.failure);
  const failureHash = sha256V5(failureMessage);
  const candidateObservationEvidenceHash = sha256V5(stableJsonV5({
    disposition: "POST_SEND_CHARGE_CONSTRUCTION_FAILED_GLOBAL_QUARANTINE",
    failureHash,
    responseCandidateCardinalityUnobservableAfterSend: true
  }));
  return {
    ordinal: input.ordinal,
    plan: input.plan,
    reservedCostUsd,
    actualKnown: false,
    costDisposition: "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION",
    manualCostReconciliationRequired: true,
    explicitPositiveCostEvidenceHash: failureHash,
    usageKnown: false,
    actualCostUsd: null,
    effectiveCostUsd: reservedCostUsd,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    billingEvidenceHash: sha256V5(stableJsonV5({
      disposition: "POST_SEND_BILLING_UNOBSERVABLE_MANUAL_RECONCILIATION",
      failureHash
    })),
    conservativeUnknownBilling: false,
    provisionalReservedCostPendingManualReconciliation: true,
    observedFullQuestionCandidates: 0,
    candidateUnitsEffective: 1,
    choiceCardinalityDrift: true,
    choiceCardinalityShortage: true,
    choiceCardinalityExcess: false,
    candidateCardinalityAmbiguous: true,
    candidateObservationSaturated: false,
    responseCandidateCardinalityUnobservableAfterSend: true,
    candidateOverflow: false,
    globalCandidateQuarantineRequired: true,
    candidateObservationEvidenceHash
  };
}
function constructPostSendChargeFailClosedV5(input) {
  try {
    return { charge: input.constructPrimaryCharge(), constructionError: null };
  } catch (constructionError) {
    return {
      charge: buildFailClosedPostSendChargeV5({
        ordinal: input.ordinal,
        plan: input.plan,
        reservedCostUsd: input.reservedCostUsd,
        failure: constructionError
      }),
      constructionError
    };
  }
}
function buildRunLedgerSettlementV5(charges) {
  if (charges.length > 2) throw new Error("v5 settlement cannot contain more than two sent assignments");
  for (const charge of charges) {
    const dispositions = Number(charge.actualKnown) + Number(charge.conservativeUnknownBilling) + Number(charge.manualCostReconciliationRequired);
    if (dispositions !== 1) throw new Error("each charge must have exactly one cost disposition");
  }
  const ordinals = charges.map((charge) => charge.ordinal);
  if (JSON.stringify(ordinals) !== JSON.stringify(ordinals.length === 2 ? [1, 2] : ordinals.length === 1 ? [1] : [])) {
    throw new Error("v5 settlement assignment order differs from Standard then Premium");
  }
  const sumMoney = (values) => {
    const scaledValues = values.map((value) => {
      const bounded = boundedMoney(value, "cost component", MAX_RUN_EFFECTIVE_COST_USD_V5);
      const scaled = Math.round(bounded * MONEY_SCALE_V5);
      if (!Number.isSafeInteger(scaled) || scaled < 0) throw new Error("cost component scaled representation is invalid");
      return scaled;
    });
    const scaledTotal = scaledValues.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(scaledTotal) || scaledTotal < 0 || scaledTotal > MAX_RUN_EFFECTIVE_COST_USD_V5 * MONEY_SCALE_V5) {
      throw new Error("cost sum is outside the v5 representable run bound");
    }
    return scaledTotal / MONEY_SCALE_V5;
  };
  const knownUsage = charges.filter((charge) => charge.usageKnown);
  const inputTokensCandidate = knownUsage.reduce((sum, charge) => sum + (charge.promptTokens ?? 0), 0);
  const outputTokensCandidate = knownUsage.reduce((sum, charge) => sum + (charge.completionTokens ?? 0), 0);
  const aggregateUsageSafe = knownUsage.every((charge) => Number.isSafeInteger(charge.promptTokens) && Number.isSafeInteger(charge.completionTokens) && Number.isSafeInteger(charge.totalTokens) && (charge.promptTokens ?? -1) >= 1 && (charge.completionTokens ?? -1) >= 0 && (charge.totalTokens ?? -1) >= 1 && (charge.promptTokens ?? 0) <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 && (charge.completionTokens ?? 0) <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 && (charge.totalTokens ?? 0) <= MAX_PER_RESPONSE_USAGE_TOKENS_V5 && charge.totalTokens === (charge.promptTokens ?? 0) + (charge.completionTokens ?? 0)) && Number.isSafeInteger(inputTokensCandidate) && Number.isSafeInteger(outputTokensCandidate) && inputTokensCandidate <= MAX_RUN_USAGE_TOKENS_V5 && outputTokensCandidate <= MAX_RUN_USAGE_TOKENS_V5;
  const inputTokens = aggregateUsageSafe ? inputTokensCandidate : 0;
  const outputTokens = aggregateUsageSafe ? outputTokensCandidate : 0;
  const usageKnownAssignments = aggregateUsageSafe ? knownUsage.length : 0;
  const manualCostReconciliationAssignments = charges.filter((charge) => charge.manualCostReconciliationRequired).length;
  const observedFullQuestionCandidates = charges.reduce(
    (sum, charge) => sum + charge.observedFullQuestionCandidates,
    0
  );
  const candidateUnits = charges.reduce((sum, charge) => sum + charge.candidateUnitsEffective, 0);
  if (!Number.isSafeInteger(observedFullQuestionCandidates) || !Number.isSafeInteger(candidateUnits)) {
    throw new Error("candidate observation aggregate is outside safe integer bounds");
  }
  const candidateOverflowAssignments = charges.filter((charge) => charge.candidateOverflow).length;
  const choiceCardinalityDriftAssignments = charges.filter((charge) => charge.choiceCardinalityDrift).length;
  const choiceCardinalityShortageAssignments = charges.filter((charge) => charge.choiceCardinalityShortage).length;
  const choiceCardinalityExcessAssignments = charges.filter((charge) => charge.choiceCardinalityExcess).length;
  const candidateCardinalityAmbiguousAssignments = charges.filter((charge) => charge.candidateCardinalityAmbiguous).length;
  const globalCandidateQuarantineRequired = charges.some((charge) => charge.globalCandidateQuarantineRequired);
  return {
    used: candidateUnits,
    modelCalls: charges.length,
    observedFullQuestionCandidates,
    candidateOverflowAssignments,
    choiceCardinalityDriftAssignments,
    choiceCardinalityShortageAssignments,
    choiceCardinalityExcessAssignments,
    candidateCardinalityAmbiguousAssignments,
    globalCandidateQuarantineRequired,
    inputTokens,
    outputTokens,
    actualCostUsd: sumMoney(charges.flatMap((charge) => charge.actualCostUsd === null ? [] : [charge.actualCostUsd])),
    effectiveCostUsd: sumMoney(charges.map((charge) => charge.effectiveCostUsd)),
    actualCostKnownAssignments: charges.filter((charge) => charge.actualKnown).length,
    usageKnownAssignments,
    conservativeUnknownBillingAssignments: charges.filter((charge) => charge.conservativeUnknownBilling).length,
    manualCostReconciliationAssignments,
    manualReconciliationRequired: manualCostReconciliationAssignments > 0 || globalCandidateQuarantineRequired
  };
}
function buildRunLedgerSettlementForDispatchV5(input) {
  if (!Number.isSafeInteger(input.physicalFetches) || input.physicalFetches < 0 || input.physicalFetches > 2 || !Number.isSafeInteger(input.candidateOpportunitiesConsumed) || input.candidateOpportunitiesConsumed < 0 || input.candidateOpportunitiesConsumed > 2 || input.physicalFetches !== input.candidateOpportunitiesConsumed || input.charges.length !== input.physicalFetches || input.physicalFetches > 0 && input.charges.length === 0) {
    throw new Error("post-send charge coverage differs from physical fetches and consumed opportunities");
  }
  return buildRunLedgerSettlementV5(input.charges);
}
function buildTerminalReconciliationIntentV5(input) {
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-terminal-reconciliation-intent-v5",
    runId: input.runId,
    noReplay: true,
    globalSettlementState: "PENDING_FAIL_CLOSED",
    status: input.status,
    journalHeadHash: input.journalHeadHash,
    settlement: input.settlement
  };
  return { ...core, intentSha256: sha256V5(stableJsonV5(core)) };
}
function buildSettlementFailureEvidenceV5(input) {
  const message = input.error instanceof Error ? `${input.error.name}:${input.error.message}` : String(input.error);
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-settlement-failure-v5",
    noReplay: true,
    manualReconciliationRequired: true,
    reservationMayRemain: true,
    intentSha256: input.intentSha256,
    settlement: input.settlement,
    errorSha256: sha256V5(message)
  };
  return { ...core, evidenceSha256: sha256V5(stableJsonV5(core)) };
}
function buildPostSettlementMarkerFailureEvidenceV5(input) {
  const message = input.error instanceof Error ? `${input.error.name}:${input.error.message}` : String(input.error);
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-post-settlement-marker-failure-v5",
    noReplay: true,
    globalLedgerSettlementSucceeded: true,
    reservationMayRemain: false,
    manualEvidenceRepairRequired: true,
    intentSha256: input.intentSha256,
    settlement: input.settlement,
    errorSha256: sha256V5(message)
  };
  return { ...core, evidenceSha256: sha256V5(stableJsonV5(core)) };
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/author-freeze-gate.ts
var author_freeze_gate_exports = {};
__export(author_freeze_gate_exports, {
  AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5: () => AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5,
  assertAuthorFreezePermanentlyNoDispatchV5: () => assertAuthorFreezePermanentlyNoDispatchV5
});
var AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5 = true;
function assertAuthorFreezePermanentlyNoDispatchV5() {
  if (AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5) {
    throw new Error("AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5: use a separately audited authorization package");
  }
  throw new Error("unreachable v5 author-freeze gate state");
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-core.ts
var frozen_runtime_core_exports = {};
__export(frozen_runtime_core_exports, {
  FROZEN_RUNTIME_ARTIFACT_PATH_V5: () => FROZEN_RUNTIME_ARTIFACT_PATH_V5,
  FROZEN_RUNTIME_BUNDLE_PATHS_V5: () => FROZEN_RUNTIME_BUNDLE_PATHS_V5,
  assertCurrentNodeRuntimeV5: () => assertCurrentNodeRuntimeV5,
  assertFrozenBundleBytesV5: () => assertFrozenBundleBytesV5,
  assertFrozenRuntimeEntrypointV5: () => assertFrozenRuntimeEntrypointV5,
  captureCurrentNodeRuntimeV5: () => captureCurrentNodeRuntimeV5,
  frozenRuntimeReferenceFromProtocolV5: () => frozenRuntimeReferenceFromProtocolV5,
  validateFrozenRuntimeArtifactV5: () => validateFrozenRuntimeArtifactV5
});
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
var SHA2562 = /^[a-f0-9]{64}$/u;
var EXPECTED_BUNDLE_PATHS = {
  CAPTURE_PRICE_METADATA: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/capture-price-snapshot-v5.bundle.mjs",
  LIVE_CHILD: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/live-child-v5.bundle.mjs",
  OPERATOR: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/operator-wrapper-v5.bundle.mjs"
};
var EXPECTED_ROLES = Object.keys(EXPECTED_BUNDLE_PATHS).sort();
var COMMON_HTTPS_LITERALS = [
  "https://openrouter.ai/api/v1/chat/completions",
  "https://openrouter.ai/api/v1/models",
  "https://openrouter.ai/api/v1/models/${modelId}/endpoints"
];
var ROLE_EXTERNAL_SPECIFIERS = {
  CAPTURE_PRICE_METADATA: ["node:crypto", "node:fs", "node:path", "node:url"],
  LIVE_CHILD: ["node:crypto", "node:fs", "node:path", "node:url"],
  OPERATOR: ["node:child_process", "node:crypto", "node:fs", "node:path", "node:url"]
};
var ROLE_NETWORK_CONTRACT = {
  CAPTURE_PRICE_METADATA: {
    fetchCallSites: 1,
    directNetworkFetchCallSites: 0,
    maximumRequestsPerInvocation: 3,
    authorizedUrlTemplates: [
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/models/${modelId}/endpoints"
    ]
  },
  LIVE_CHILD: {
    fetchCallSites: 0,
    directNetworkFetchCallSites: 1,
    maximumRequestsPerInvocation: 2,
    authorizedUrlTemplates: ["https://openrouter.ai/api/v1/chat/completions"]
  },
  OPERATOR: {
    fetchCallSites: 0,
    directNetworkFetchCallSites: 0,
    maximumRequestsPerInvocation: 0,
    authorizedUrlTemplates: []
  }
};
var FROZEN_RUNTIME_ARTIFACT_PATH_V5 = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-v5.json";
function object2(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys2(value, label, keys) {
  const row = object2(value, label);
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} keys differ`);
  }
  return row;
}
function hash(value, label) {
  if (typeof value !== "string" || !SHA2562.test(value)) throw new Error(`${label} must be a SHA-256 hex string`);
}
function comparable(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}
function captureCurrentNodeRuntimeV5() {
  const executableRealPath = realpathSync.native(process.execPath);
  const stat = lstatSync(executableRealPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Node executable must resolve to a real regular file");
  const bytes = readFileSync(executableRealPath);
  return {
    executableRealPath,
    executableBytes: bytes.byteLength,
    executableSha256: sha256V5(bytes),
    nodeVersion: process.version,
    modulesAbi: process.versions.modules,
    v8Version: process.versions.v8,
    platform: process.platform,
    arch: process.arch
  };
}
function assertCurrentNodeRuntimeV5(expectedValue) {
  const expected = exactKeys2(expectedValue, "frozen Node runtime", [
    "executableRealPath",
    "executableBytes",
    "executableSha256",
    "nodeVersion",
    "modulesAbi",
    "v8Version",
    "platform",
    "arch"
  ]);
  const actual = captureCurrentNodeRuntimeV5();
  if (stableJsonV5(actual) !== stableJsonV5(expected)) {
    throw new Error("current Node executable identity differs from the frozen runtime contract");
  }
  return actual;
}
function validateFrozenRuntimeArtifactV5(value) {
  const artifact = exactKeys2(value, "frozen runtime artifact", [
    "schemaVersion",
    "bundler",
    "bundles",
    "externalRuntimeSpecifiers",
    "nodeRuntime",
    "bundleSetSha256",
    "contentSha256"
  ]);
  if (artifact.schemaVersion !== "question-quality-connectivity-pilot-frozen-runtime-v5") {
    throw new Error("frozen runtime artifact schema differs");
  }
  const bundler = exactKeys2(artifact.bundler, "frozen runtime bundler", ["name", "version", "configuration"]);
  if (bundler.name !== "esbuild" || typeof bundler.version !== "string" || !bundler.version || bundler.configuration !== "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES") {
    throw new Error("frozen runtime bundler contract differs");
  }
  if (!Array.isArray(artifact.bundles) || artifact.bundles.length !== 3) {
    throw new Error("frozen runtime must contain exactly three bundles");
  }
  const bundles = artifact.bundles.map((candidate, index) => {
    const row = exactKeys2(candidate, `frozen runtime bundle[${index}]`, [
      "role",
      "path",
      "bytes",
      "sha256",
      "externalRuntimeSpecifiers",
      "networkContract",
      "forbiddenSyntaxCounts"
    ]);
    if (!EXPECTED_ROLES.includes(row.role) || row.path !== EXPECTED_BUNDLE_PATHS[row.role] || !Number.isSafeInteger(row.bytes) || row.bytes < 1) {
      throw new Error(`frozen runtime bundle[${index}] identity differs`);
    }
    hash(row.sha256, `frozen runtime bundle[${index}].sha256`);
    const role = row.role;
    if (JSON.stringify(row.externalRuntimeSpecifiers) !== JSON.stringify(ROLE_EXTERNAL_SPECIFIERS[role])) {
      throw new Error(`${role} exact Node builtin allowlist differs`);
    }
    const network = exactKeys2(row.networkContract, `${role}.networkContract`, [
      "fetchCallSites",
      "directNetworkFetchCallSites",
      "maximumRequestsPerInvocation",
      "authorizedUrlTemplates",
      "observedHttpsLiterals"
    ]);
    const expectedNetwork = ROLE_NETWORK_CONTRACT[role];
    if (network.fetchCallSites !== expectedNetwork.fetchCallSites || network.directNetworkFetchCallSites !== expectedNetwork.directNetworkFetchCallSites || network.maximumRequestsPerInvocation !== expectedNetwork.maximumRequestsPerInvocation || JSON.stringify(network.authorizedUrlTemplates) !== JSON.stringify(expectedNetwork.authorizedUrlTemplates) || JSON.stringify(network.observedHttpsLiterals) !== JSON.stringify(COMMON_HTTPS_LITERALS)) {
      throw new Error(`${role} network callsite or URL contract differs`);
    }
    const forbidden = exactKeys2(row.forbiddenSyntaxCounts, `${role}.forbiddenSyntaxCounts`, [
      "dynamicImport",
      "requireCall",
      "evalCall",
      "functionConstructor",
      "webSocket",
      "eventSource"
    ]);
    if (Object.values(forbidden).some((count) => count !== 0)) {
      throw new Error(`${role} frozen bundle contains forbidden dynamic or alternate transport syntax`);
    }
    return row;
  });
  if (JSON.stringify(bundles.map((row) => row.role)) !== JSON.stringify(EXPECTED_ROLES)) {
    throw new Error("frozen runtime bundle roles are not exact and sorted");
  }
  if (!Array.isArray(artifact.externalRuntimeSpecifiers) || JSON.stringify(artifact.externalRuntimeSpecifiers) !== JSON.stringify([
    "node:child_process",
    "node:crypto",
    "node:fs",
    "node:path",
    "node:url"
  ])) {
    throw new Error("frozen runtime external specifier union differs from its exact reviewed allowlist");
  }
  exactKeys2(artifact.nodeRuntime, "frozen Node runtime", [
    "executableRealPath",
    "executableBytes",
    "executableSha256",
    "nodeVersion",
    "modulesAbi",
    "v8Version",
    "platform",
    "arch"
  ]);
  hash(artifact.nodeRuntime.executableSha256, "frozen Node executable hash");
  hash(artifact.bundleSetSha256, "frozen runtime bundle set hash");
  hash(artifact.contentSha256, "frozen runtime content hash");
  if (artifact.bundleSetSha256 !== sha256V5(stableJsonV5(bundles))) {
    throw new Error("frozen runtime bundle set hash differs");
  }
  const core = { ...artifact };
  delete core.contentSha256;
  if (artifact.contentSha256 !== sha256V5(stableJsonV5(core))) {
    throw new Error("frozen runtime content hash differs");
  }
  return artifact;
}
function assertFrozenBundleBytesV5(artifactValue, role, bytes) {
  const artifact = validateFrozenRuntimeArtifactV5(artifactValue);
  const row = artifact.bundles.find((candidate) => candidate.role === role);
  if (!row || row.bytes !== bytes.byteLength || row.sha256 !== sha256V5(bytes)) {
    throw new Error(`${role} frozen bundle bytes differ`);
  }
}
function assertFrozenRuntimeEntrypointV5(input) {
  const artifactAbsolute = path.resolve(input.repoRoot, input.artifactPath);
  const artifactStat = lstatSync(artifactAbsolute);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || comparable(realpathSync.native(artifactAbsolute)) !== comparable(artifactAbsolute)) {
    throw new Error("frozen runtime artifact must be a real regular file");
  }
  const raw = readFileSync(artifactAbsolute);
  if (sha256V5(raw) !== input.expectedArtifactSha256) throw new Error("frozen runtime artifact file hash differs");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (text.charCodeAt(0) === 65279 || observeDuplicateJsonKeysV5(text).length > 0) {
    throw new Error("frozen runtime artifact is BOM-prefixed or has duplicate JSON keys");
  }
  const artifact = validateFrozenRuntimeArtifactV5(JSON.parse(text));
  assertCurrentNodeRuntimeV5(artifact.nodeRuntime);
  for (const row of artifact.bundles) {
    const absolute = path.resolve(input.repoRoot, row.path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
      throw new Error(`${row.role} frozen bundle must be a real regular file`);
    }
    assertFrozenBundleBytesV5(artifact, row.role, readFileSync(absolute));
  }
  const ownRow = artifact.bundles.find((row) => row.role === input.role);
  if (comparable(realpathSync.native(input.currentModulePath)) !== comparable(path.resolve(input.repoRoot, ownRow.path))) {
    throw new Error("source/loader execution is forbidden; use the exact frozen plain-ESM entrypoint");
  }
  return artifact;
}
function frozenRuntimeReferenceFromProtocolV5(protocolValue) {
  const protocol = object2(protocolValue, "protocol");
  const contract = object2(protocol.frozenRuntimeContract, "protocol.frozenRuntimeContract");
  if (contract.artifactPath !== FROZEN_RUNTIME_ARTIFACT_PATH_V5) {
    throw new Error("protocol frozen runtime artifact path differs");
  }
  hash(contract.artifactSha256, "protocol frozen runtime artifact hash");
  return {
    artifactPath: contract.artifactPath,
    artifactSha256: contract.artifactSha256
  };
}
var FROZEN_RUNTIME_BUNDLE_PATHS_V5 = EXPECTED_BUNDLE_PATHS;

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-environment.ts
var live_environment_exports = {};
__export(live_environment_exports, {
  LIVE_CHILD_ENV_NAMES_V5: () => LIVE_CHILD_ENV_NAMES_V5,
  LIVE_CHILD_MARKER_ENV_V5: () => LIVE_CHILD_MARKER_ENV_V5,
  MINIMAL_OS_ENV_NAMES_V5: () => MINIMAL_OS_ENV_NAMES_V5,
  WINDOWS_AUTOINJECTED_ENV_NAMES_V5: () => WINDOWS_AUTOINJECTED_ENV_NAMES_V5,
  assertExactLiveChildEnvironmentV5: () => assertExactLiveChildEnvironmentV5,
  assertExactMetadataEnvironmentV5: () => assertExactMetadataEnvironmentV5,
  buildExactLiveChildEnvironmentV5: () => buildExactLiveChildEnvironmentV5,
  buildExactMetadataEnvironmentV5: () => buildExactMetadataEnvironmentV5
});
var LIVE_CHILD_MARKER_ENV_V5 = "QUESTION_QUALITY_CONNECTIVITY_PILOT_V5_LIVE_CHILD";
var MINIMAL_OS_ENV_NAMES_V5 = [
  "SystemRoot",
  "WINDIR",
  "PATH",
  "PATHEXT",
  "TEMP",
  "TMP",
  "COMSPEC"
];
var WINDOWS_AUTOINJECTED_ENV_NAMES_V5 = [
  "HOMEDRIVE",
  "HOMEPATH",
  "LOGONSERVER",
  "SYSTEMDRIVE",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE"
];
var LIVE_CHILD_ENV_NAMES_V5 = [
  ...MINIMAL_OS_ENV_NAMES_V5,
  "OPENROUTER_API_KEY",
  LIVE_CHILD_MARKER_ENV_V5
];
var REQUIRED_OS_ENV_NAMES_V5 = MINIMAL_OS_ENV_NAMES_V5;
function buildExactLiveChildEnvironmentV5(source, openRouterApiKey) {
  if (typeof openRouterApiKey !== "string" || openRouterApiKey.length < 8) {
    throw new Error("live child OpenRouter credential is invalid");
  }
  const env = {};
  for (const name of MINIMAL_OS_ENV_NAMES_V5) {
    const value = source[name];
    if (typeof value === "string" && value) env[name] = value;
  }
  for (const name of REQUIRED_OS_ENV_NAMES_V5) {
    if (typeof env[name] !== "string" || !env[name]) {
      throw new Error(`live launcher required OS environment is missing: ${name}`);
    }
  }
  env.OPENROUTER_API_KEY = openRouterApiKey;
  env[LIVE_CHILD_MARKER_ENV_V5] = "1";
  return env;
}
function assertExactLiveChildEnvironmentV5(env = process.env) {
  const expected = /* @__PURE__ */ new Set([
    ...LIVE_CHILD_ENV_NAMES_V5,
    ...process.platform === "win32" ? WINDOWS_AUTOINJECTED_ENV_NAMES_V5 : []
  ]);
  if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error("live child exact environment name set differs");
  }
  for (const name of Object.keys(env)) {
    if (!expected.has(name)) throw new Error(`live child received a non-allowlisted environment name: ${name}`);
  }
  for (const name of [...REQUIRED_OS_ENV_NAMES_V5, "OPENROUTER_API_KEY", LIVE_CHILD_MARKER_ENV_V5]) {
    if (typeof env[name] !== "string" || !env[name]) {
      throw new Error(`live child required environment name is missing: ${name}`);
    }
  }
  if (env[LIVE_CHILD_MARKER_ENV_V5] !== "1") throw new Error("live child marker missing");
}
function assertExactMetadataEnvironmentV5(env = process.env) {
  const expected = /* @__PURE__ */ new Set([
    ...MINIMAL_OS_ENV_NAMES_V5,
    ...process.platform === "win32" ? WINDOWS_AUTOINJECTED_ENV_NAMES_V5 : []
  ]);
  if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error("metadata capture exact environment name set differs");
  }
  for (const name of Object.keys(env)) {
    if (!expected.has(name)) throw new Error(`metadata capture received a non-allowlisted environment name: ${name}`);
  }
  for (const name of REQUIRED_OS_ENV_NAMES_V5) {
    if (typeof env[name] !== "string" || !env[name]) {
      throw new Error(`metadata capture required environment is missing: ${name}`);
    }
  }
}
function buildExactMetadataEnvironmentV5(source) {
  const env = {};
  for (const name of MINIMAL_OS_ENV_NAMES_V5) {
    const value = source[name];
    if (typeof value === "string" && value) env[name] = value;
  }
  if (JSON.stringify(Object.keys(env).sort()) !== JSON.stringify([...MINIMAL_OS_ENV_NAMES_V5].sort())) {
    throw new Error("metadata launcher exact environment name set differs");
  }
  return env;
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-io.ts
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync as lstatSync2,
  mkdirSync,
  openSync,
  readSync,
  readFileSync as readFileSync2,
  realpathSync as realpathSync2,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createHash as createHash2 } from "node:crypto";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
var liveModuleDirectoryV5 = path2.dirname(fileURLToPath(import.meta.url));
var livePackageRootV5 = path2.basename(liveModuleDirectoryV5) === "frozen-live" ? path2.dirname(liveModuleDirectoryV5) : liveModuleDirectoryV5;
var liveRepoRootV5 = path2.resolve(livePackageRootV5, "../../../..");
var livePrivateRootV5 = path2.join(livePackageRootV5, "private");
var PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V5 = METADATA_RESPONSE_BODY_MAX_BYTES_V5 * 3 * 6 + 4 * 1024 * 1024;
var IMMUTABLE_REPOSITORY_INPUT_MAX_BYTES_V5 = 4 * 1024 * 1024;
var MUTABLE_LEDGER_INPUT_MAX_BYTES_V5 = 4 * 1024 * 1024;
function sameNodeIdentityV5(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
function sameFileIdentityV5(left, right) {
  return sameNodeIdentityV5(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function comparable2(value) {
  const resolved = path2.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function assertRealDirectoryV5(directoryPath, label) {
  const absolute = path2.resolve(directoryPath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist`);
  const stat = lstatSync2(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  if (comparable2(realpathSync2.native(absolute)) !== comparable2(absolute)) {
    throw new Error(`${label} traverses a symlink or junction`);
  }
  return absolute;
}
function assertRealRegularFileV5(filePath, label) {
  const absolute = path2.resolve(filePath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist`);
  const stat = lstatSync2(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a real regular file`);
  if (comparable2(realpathSync2.native(absolute)) !== comparable2(absolute)) {
    throw new Error(`${label} traverses a symlink or junction`);
  }
  assertRealDirectoryV5(path2.dirname(absolute), `${label} parent`);
  return absolute;
}
function createExclusivePrivateRunDirectoryV5(runId) {
  const privateRoot = assertRealDirectoryV5(livePrivateRootV5, "v5 private root");
  const runsRoot = path2.join(privateRoot, "runs");
  if (!existsSync(runsRoot)) mkdirSync(runsRoot, { recursive: false, mode: 448 });
  assertRealDirectoryV5(runsRoot, "v5 private runs root");
  if (comparable2(path2.dirname(runsRoot)) !== comparable2(privateRoot)) {
    throw new Error("v5 private runs root is not a direct child");
  }
  const runRoot = path2.join(runsRoot, runId);
  if (existsSync(runRoot)) throw new Error("v5 private run directory already exists");
  mkdirSync(runRoot, { recursive: false, mode: 448 });
  assertRealDirectoryV5(runRoot, "v5 private run directory");
  if (comparable2(path2.dirname(runRoot)) !== comparable2(runsRoot)) {
    throw new Error("v5 private run directory is not a direct child");
  }
  return runRoot;
}
function resolveRepoPath(relativePath) {
  assertRealDirectoryV5(liveRepoRootV5, "live repository root");
  const absolute = path2.resolve(liveRepoRootV5, relativePath);
  const relative = path2.relative(liveRepoRootV5, absolute);
  if (!relative || relative.startsWith("..") || path2.isAbsolute(relative)) {
    throw new Error("runtime repository path escaped or was empty");
  }
  return absolute;
}
function readImmutableRepoBytesV5(relativePath) {
  const canonical = assertRealRegularFileV5(resolveRepoPath(relativePath), "immutable repository input");
  const size = lstatSync2(canonical).size;
  if (!Number.isSafeInteger(size) || size < 1 || size > IMMUTABLE_REPOSITORY_INPUT_MAX_BYTES_V5) {
    throw new Error("immutable repository input exceeds its pre-read byte ceiling");
  }
  return readFileSync2(canonical);
}
function assertDirectRealPrivateInputPathV5(filePath, rootPath = livePrivateRootV5) {
  const privateRoot = assertRealDirectoryV5(rootPath, "v5 private root");
  const absolute = path2.resolve(filePath);
  const relative = path2.relative(privateRoot, absolute);
  if (!relative || relative.startsWith("..") || path2.isAbsolute(relative) || path2.extname(absolute) !== ".json" || comparable2(path2.dirname(absolute)) !== comparable2(privateRoot)) {
    throw new Error("attested private input must be a direct-child JSON file under the real v5 private root");
  }
  return assertRealRegularFileV5(absolute, "attested private input");
}
function readPrivateAttestedJsonEvidenceV5(filePath, raceHooks = {}) {
  const canonical = assertDirectRealPrivateInputPathV5(filePath);
  const parent = path2.dirname(canonical);
  const before = lstatSync2(canonical, { bigint: true });
  const parentBefore = lstatSync2(parent, { bigint: true });
  if (before.size < BigInt(1) || before.size > BigInt(PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V5)) {
    throw new Error("attested private price evidence bundle exceeds its pre-read byte ceiling");
  }
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const fd = openSync(canonical, constants.O_RDONLY | noFollow);
  const bytes = Buffer.alloc(Number(before.size));
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !sameFileIdentityV5(before, opened)) {
      throw new Error("attested private price evidence changed while opening");
    }
    raceHooks.afterTargetOpenBeforeRead?.();
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) throw new Error("attested private price evidence truncated during bounded read");
      offset += count;
    }
    if (readSync(fd, extra, 0, 1, null) !== 0) {
      throw new Error("attested private price evidence grew during bounded read");
    }
    raceHooks.afterReadBeforePostAttestation?.();
    const postDescriptor = fstatSync(fd, { bigint: true });
    const postPath = lstatSync2(canonical, { bigint: true });
    const parentAfter = lstatSync2(parent, { bigint: true });
    if (!postDescriptor.isFile() || !postPath.isFile() || postPath.isSymbolicLink() || !sameFileIdentityV5(opened, postDescriptor) || !sameFileIdentityV5(postDescriptor, postPath) || !sameNodeIdentityV5(parentBefore, parentAfter) || comparable2(realpathSync2.native(parent)) !== comparable2(parent) || comparable2(realpathSync2.native(canonical)) !== comparable2(canonical)) {
      throw new Error("attested private price evidence or parent changed during bounded read");
    }
    if (bytes.byteLength >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
      throw new Error("attested private price evidence must not contain a UTF-8 BOM");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("attested private price evidence is not fatal UTF-8");
    }
    if (text.startsWith("\uFEFF")) throw new Error("attested private price evidence must not contain a UTF-8 BOM");
    let duplicates;
    try {
      duplicates = observeDuplicateJsonKeysV5(text);
    } catch {
      throw new Error("attested private price evidence failed strict JSON observation");
    }
    if (duplicates.length > 0) throw new Error("attested private price evidence contains duplicate JSON keys");
    return {
      canonicalPath: canonical,
      fileSha256: createHash2("sha256").update(bytes).digest("hex"),
      utf8Bytes: bytes.byteLength,
      value: JSON.parse(text)
    };
  } finally {
    bytes.fill(0);
    extra.fill(0);
    closeSync(fd);
  }
}
function attestJsonTransactionTargetV5(targetPath) {
  const target = assertRealRegularFileV5(targetPath, "repository transaction target");
  const parentPath = assertRealDirectoryV5(path2.dirname(target), "repository transaction parent");
  const targetStat = lstatSync2(target, { bigint: true });
  const parentStat = lstatSync2(parentPath, { bigint: true });
  if (targetStat.size < BigInt(1) || targetStat.size > BigInt(MUTABLE_LEDGER_INPUT_MAX_BYTES_V5)) {
    throw new Error("repository transaction target exceeds its pre-read byte ceiling");
  }
  return {
    targetPath: target,
    parentPath,
    targetIdentity: {
      dev: targetStat.dev,
      ino: targetStat.ino,
      size: targetStat.size,
      mtimeNs: targetStat.mtimeNs,
      ctimeNs: targetStat.ctimeNs
    },
    parentIdentity: { dev: parentStat.dev, ino: parentStat.ino }
  };
}
function assertJsonTransactionTargetUnchangedV5(attestation) {
  const current = attestJsonTransactionTargetV5(attestation.targetPath);
  if (comparable2(current.targetPath) !== comparable2(attestation.targetPath) || comparable2(current.parentPath) !== comparable2(attestation.parentPath) || !sameFileIdentityV5(current.targetIdentity, attestation.targetIdentity) || !sameNodeIdentityV5(current.parentIdentity, attestation.parentIdentity)) {
    throw new Error("repository transaction target or parent changed identity");
  }
}
function readStableMutableJsonV5(attestation, hooks) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const fd = openSync(attestation.targetPath, constants.O_RDONLY | noFollow);
  const expectedSize = Number(attestation.targetIdentity.size);
  const bytes = Buffer.alloc(expectedSize);
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    const openedIdentity = {
      dev: opened.dev,
      ino: opened.ino,
      size: opened.size,
      mtimeNs: opened.mtimeNs,
      ctimeNs: opened.ctimeNs
    };
    if (!opened.isFile() || !sameFileIdentityV5(openedIdentity, attestation.targetIdentity)) {
      throw new Error("repository transaction target changed while opening");
    }
    hooks.afterTargetOpenBeforeRead?.();
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) throw new Error("repository transaction target truncated during read");
      offset += count;
    }
    if (readSync(fd, extra, 0, 1, null) !== 0) {
      throw new Error("repository transaction target grew during read");
    }
    hooks.afterReadBeforePostAttestation?.();
    const post = fstatSync(fd, { bigint: true });
    const postIdentity = {
      dev: post.dev,
      ino: post.ino,
      size: post.size,
      mtimeNs: post.mtimeNs,
      ctimeNs: post.ctimeNs
    };
    if (!post.isFile() || !sameFileIdentityV5(openedIdentity, postIdentity)) {
      throw new Error("repository transaction target changed during read");
    }
    assertJsonTransactionTargetUnchangedV5(attestation);
    if (bytes.byteLength >= 3 && bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) {
      throw new Error("repository transaction target must not contain a UTF-8 BOM");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("repository transaction target is not fatal UTF-8");
    }
    if (text.startsWith("\uFEFF")) throw new Error("repository transaction target must not contain a UTF-8 BOM");
    let duplicates;
    try {
      duplicates = observeDuplicateJsonKeysV5(text);
    } catch {
      throw new Error("repository transaction target failed strict JSON observation");
    }
    if (duplicates.length > 0) throw new Error("repository transaction target contains duplicate JSON keys");
    return JSON.parse(text);
  } finally {
    bytes.fill(0);
    extra.fill(0);
    closeSync(fd);
  }
}
function classifyCommittedTransactionCleanupV5(committed, value, cleanupWarningKinds) {
  if (!committed) throw new Error("repository transaction was not committed");
  return { value, committed: true, cleanupWarningKinds: [...cleanupWarningKinds] };
}
function withExclusiveRepoJsonTransactionV5(input) {
  const target = resolveRepoPath(input.relativePath);
  const initialAttestation = attestJsonTransactionTargetV5(target);
  const lockPath = `${target}.${input.lockSuffix}.lock`;
  const lockHandle = openSync(lockPath, "wx", 384);
  let committed = false;
  let result;
  let primaryError = null;
  try {
    assertJsonTransactionTargetUnchangedV5(initialAttestation);
    const lockedAttestation = attestJsonTransactionTargetV5(target);
    const current = readStableMutableJsonV5(lockedAttestation, input.raceHooksForOfflineTestOnly ?? {});
    const { next, value } = input.mutate(current);
    const tempPath = `${target}.${input.lockSuffix}.${process.pid}.tmp`;
    const tempHandle = openSync(tempPath, "wx", 384);
    try {
      writeFileSync(tempHandle, `${JSON.stringify(next, null, 2)}
`, "utf8");
      fsyncSync(tempHandle);
    } finally {
      closeSync(tempHandle);
    }
    input.raceHooksForOfflineTestOnly?.beforeCommitReattestation?.();
    assertJsonTransactionTargetUnchangedV5(lockedAttestation);
    assertRealDirectoryV5(path2.dirname(target), "repository transaction parent immediately before commit");
    renameSync(tempPath, target);
    committed = true;
    result = value;
  } catch (error) {
    primaryError = error;
  }
  const cleanupWarnings = [];
  try {
    closeSync(lockHandle);
  } catch (error) {
    if (!committed) primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    else cleanupWarnings.push("LOCK_CLOSE_FAILED_AFTER_COMMIT");
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (!committed) primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    else cleanupWarnings.push("LOCK_UNLINK_FAILED_AFTER_COMMIT");
  }
  if (primaryError !== null) throw primaryError;
  return classifyCommittedTransactionCleanupV5(committed, result, cleanupWarnings);
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/production-runner.ts
var directNetworkFetchV5 = globalThis.fetch.bind(globalThis);
var PROTOCOL_PATH = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/protocol-v5.json";
var EXACT_WIRE_PATH = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/private/exact-wire-v5.private.json";
var GLOBAL_LEDGER_PATH = "experiments/question-quality-20260715/budget-ledger.json";
var ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
var GLOBAL_BATCH_ID = "campaign-v6-connectivity-pilot-v5-two-call";
function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function assertHash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} must be SHA-256`);
}
function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/u, ""));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}
function money(value) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_RUN_EFFECTIVE_COST_USD_V5) {
    throw new Error("money is outside the v5 representable run bound");
  }
  const scaled = Math.ceil(value * 1e12);
  if (!Number.isSafeInteger(scaled)) throw new Error("money cannot be represented at the v5 decimal scale");
  return scaled / 1e12;
}
function addMoney(left, right) {
  const leftScaled = Math.round(money(left) * 1e12);
  const rightScaled = Math.round(money(right) * 1e12);
  const totalScaled = leftScaled + rightScaled;
  if (!Number.isSafeInteger(totalScaled) || totalScaled < 0 || totalScaled > MAX_RUN_EFFECTIVE_COST_USD_V5 * 1e12) {
    throw new Error("money aggregate is outside the v5 representable run bound");
  }
  return totalScaled / 1e12;
}
function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1e3).toISOString().replace("Z", "+09:00");
}
function exactWire() {
  const protocolBytes = readImmutableRepoBytesV5(PROTOCOL_PATH);
  const protocol = validateProtocolV5(parseJsonBytes(protocolBytes, "protocol"));
  const artifactBytes = readImmutableRepoBytesV5(EXACT_WIRE_PATH);
  if (sha256V5(artifactBytes) !== protocol.exactWireCommitment.privateArtifactSha256) {
    throw new Error("private exact-wire artifact differs from protocol commitment");
  }
  const artifact = parseJsonBytes(artifactBytes, "private exact-wire artifact");
  if (artifact.schemaVersion !== "question-quality-v6-connectivity-pilot-exact-wire-private-v5" || artifact.status !== "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED" || !Array.isArray(artifact.rows) || artifact.rows.length !== 2) {
    throw new Error("private exact-wire artifact is malformed");
  }
  const core = { ...artifact };
  delete core.privateSemanticSha256;
  assertHash(artifact.privateSemanticSha256, "privateSemanticSha256");
  if (sha256V5(stableJsonV5(core)) !== artifact.privateSemanticSha256) {
    throw new Error("private exact-wire semantic hash differs");
  }
  const rows2 = [...artifact.rows].sort((left, right) => left.ordinal - right.ordinal);
  for (let index = 0; index < rows2.length; index += 1) {
    const wire = rows2[index];
    const assignment = protocol.durableBounds.assignments[index];
    if (wire.ordinal !== assignment.ordinal || wire.plan !== assignment.plan || wire.modelId !== assignment.modelId || wire.endpoint !== ENDPOINT || wire.bodySha256 !== sha256V5(wire.bodyText) || wire.bodyUtf8Bytes !== Buffer.byteLength(wire.bodyText, "utf8") || wire.bodySha256 !== assignment.exactWireBodySha256 || wire.bodyUtf8Bytes !== assignment.exactWireBodyUtf8Bytes || wire.maxOutputTokens !== 4e3 || wire.completionCount !== 1 || wire.candidateOutputsPerCompletion !== 1) {
      throw new Error(`exact wire differs for ${assignment.plan}`);
    }
    const body = asObject(JSON.parse(wire.bodyText), `${assignment.plan} body`);
    const exactBodyKeys = ["max_tokens", "messages", "model", "provider", "reasoning", "response_format"];
    if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(exactBodyKeys)) {
      throw new Error(`${assignment.plan} exact wire exposes an unmodeled charge-capable request surface`);
    }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.some((candidate) => {
      const message = asObject(candidate, `${assignment.plan} message`);
      return JSON.stringify(Object.keys(message).sort()) !== JSON.stringify(["content", "role"]) || typeof message.content !== "string" || message.role !== "system" && message.role !== "user";
    })) {
      throw new Error(`${assignment.plan} exact wire messages are not text-only role/content objects`);
    }
    if (body.model !== assignment.modelId || body.n !== void 0 && body.n !== 1 || body.stream === true || stableJsonV5(body.provider) !== stableJsonV5({
      order: ["google-vertex/global"],
      only: ["google-vertex/global"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true
    }) || stableJsonV5(body.reasoning) !== stableJsonV5({ enabled: false, effort: "none", exclude: true })) {
      throw new Error(`exact route or body model differs for ${assignment.plan}`);
    }
    const tokenCaps = [body.max_tokens, body.max_completion_tokens, body.max_output_tokens].filter((value) => typeof value === "number");
    if (tokenCaps.length !== 1 || tokenCaps[0] !== 4e3) throw new Error(`${assignment.plan} token cap differs`);
    const responseFormat = asObject(body.response_format, `${assignment.plan} response_format`);
    const jsonSchema = asObject(responseFormat.json_schema, `${assignment.plan} response_format.json_schema`);
    const responseSchema = asObject(jsonSchema.schema, `${assignment.plan} response schema`);
    if (responseFormat.type !== "json_schema" || jsonSchema.strict !== true || sha256V5(stableJsonV5(responseSchema)) !== wire.schemaSha256) {
      throw new Error(`${assignment.plan} exact response schema differs from compiler commitment`);
    }
  }
  return { protocol, artifact: { ...artifact, rows: rows2 } };
}
function assertAuthorized(protocol) {
  const authorization = protocol.authorization;
  if (process.env[LIVE_CHILD_MARKER_ENV_V5] !== "1" || authorization.liveExecutionAuthorized !== true || authorization.hostileAuditPassed !== true || authorization.dispatchCommandPresent !== true) {
    throw new Error("v5 live dispatch is not authorized");
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== "string" || key.length < 8) throw new Error("live child lacks its sole OpenRouter credential");
}
function validateFreshPriceSnapshot(protocol, snapshotPath, expectedFileSha256, expectedBundleSha256) {
  const observed = readPrivateAttestedJsonEvidenceV5(snapshotPath);
  const bundle = validatePinnedPrivatePriceEvidenceBundleV5({
    value: observed.value,
    observedFileSha256: observed.fileSha256,
    expectedFileSha256,
    expectedBundleSha256
  });
  const snapshot = validatePriceSnapshotV5(bundle.snapshot);
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  const age = Date.now() - fetchedAt;
  if (age < 0 || age > Number(protocol.pricingEvidenceContract.maximumAgeMs)) throw new Error("price snapshot is stale");
  for (const assignment of protocol.durableBounds.assignments) {
    const evidence = priceEvidenceForModelV5(snapshot, assignment.modelId);
    if (evidence.emergencyPromptUsdPer1M > assignment.emergencyInputUsdPer1M + 1e-12 || evidence.emergencyCompletionUsdPer1M > assignment.emergencyOutputUsdPer1M + 1e-12 || evidence.emergencyRequestUsd > assignment.emergencyRequestUsd + 1e-12) {
      throw new Error(`${assignment.plan} public price exceeds the frozen emergency ceiling`);
    }
    const recomputed = conservativeCostV5({
      bodyBytes: assignment.exactWireBodyUtf8Bytes,
      maxOutputTokens: assignment.maxOutputTokens,
      inputUsdPer1M: assignment.emergencyInputUsdPer1M,
      outputUsdPer1M: assignment.emergencyOutputUsdPer1M,
      fixedRequestUsd: assignment.emergencyRequestUsd,
      serverTokenOverheadUpperBound: Number(protocol.pricingEvidenceContract.serverTokenOverheadUpperBound),
      safetyMultiplier: Number(protocol.pricingEvidenceContract.safetyMultiplier)
    });
    if (recomputed !== assignment.calculatedWorstCaseUsdCap) throw new Error("frozen cost envelope differs");
  }
  return snapshot;
}
function globalLedger(value) {
  const ledger = asObject(value, "global research ledger");
  const exactKeys3 = [
    "schemaVersion",
    "capFullQuestionCandidates",
    "usedFullQuestionCandidates",
    "reservedFullQuestionCandidates",
    "acceptedQuestions",
    "modelCalls",
    "inputTokens",
    "outputTokens",
    "costUsd",
    "startedAtKst",
    "lastUpdatedAtKst",
    "batches",
    "note"
  ].sort();
  if (ledger.schemaVersion !== 1 || ledger.capFullQuestionCandidates !== 1e3 || !Number.isSafeInteger(ledger.usedFullQuestionCandidates) || !Number.isSafeInteger(ledger.reservedFullQuestionCandidates) || ledger.usedFullQuestionCandidates < 0 || ledger.reservedFullQuestionCandidates < 0 || ledger.usedFullQuestionCandidates + ledger.reservedFullQuestionCandidates > ledger.capFullQuestionCandidates || !Number.isSafeInteger(ledger.acceptedQuestions) || ledger.acceptedQuestions < 0 || !Number.isSafeInteger(ledger.modelCalls) || ledger.modelCalls < 0 || !Number.isSafeInteger(ledger.inputTokens) || ledger.inputTokens < 0 || !Number.isSafeInteger(ledger.outputTokens) || ledger.outputTokens < 0 || !Number.isFinite(ledger.costUsd) || ledger.costUsd < 0 || !Number.isSafeInteger(Math.ceil(ledger.costUsd * 1e12)) || typeof ledger.startedAtKst !== "string" || typeof ledger.lastUpdatedAtKst !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?\+09:00$/u.test(ledger.startedAtKst) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?\+09:00$/u.test(ledger.lastUpdatedAtKst) || !Number.isFinite(Date.parse(ledger.startedAtKst)) || !Number.isFinite(Date.parse(ledger.lastUpdatedAtKst)) || typeof ledger.note !== "string" || !Array.isArray(ledger.batches) || JSON.stringify(Object.keys(ledger).sort()) !== JSON.stringify(exactKeys3) || ledger.batches.some((batch) => !batch || typeof batch !== "object" || Array.isArray(batch))) {
    throw new Error("global research ledger is malformed");
  }
  return ledger;
}
function safeCounterAdd(left, right, label, maximum = Number.MAX_SAFE_INTEGER) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0 || result > maximum) {
    throw new Error(`${label} aggregate is outside its safe bound`);
  }
  return result;
}
function reserveGlobalTwo() {
  const outcome = withExclusiveRepoJsonTransactionV5({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v5",
    mutate(current) {
      const ledger = globalLedger(current);
      if (ledger.usedFullQuestionCandidates !== 0 || ledger.reservedFullQuestionCandidates !== 0 || ledger.acceptedQuestions !== 0 || ledger.modelCalls !== 0 || ledger.inputTokens !== 0 || ledger.outputTokens !== 0 || ledger.costUsd !== 0 || ledger.batches.length !== 0) {
        throw new Error("v5 author freeze binds every mutable global ledger counter, cost, and batch at exact zero; reseal required");
      }
      if (ledger.batches.some((batch) => batch.batchId === GLOBAL_BATCH_ID)) {
        throw new Error("global pilot reservation already exists");
      }
      if (ledger.usedFullQuestionCandidates + ledger.reservedFullQuestionCandidates + 2 > ledger.capFullQuestionCandidates) {
        throw new Error("global candidate cap cannot reserve two pilot candidates");
      }
      return {
        next: {
          ...ledger,
          reservedFullQuestionCandidates: ledger.reservedFullQuestionCandidates + 2,
          lastUpdatedAtKst: kstNow(),
          batches: [...ledger.batches, {
            batchId: GLOBAL_BATCH_ID,
            experiment: "question-quality-20260715",
            status: "RESERVED",
            reservedFullQuestionCandidates: 2,
            usedFullQuestionCandidates: 0,
            modelCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            actualCostUsd: 0,
            effectiveCostUsd: 0,
            costUsd: 0,
            actualCostKnownAssignments: 0,
            usageKnownAssignments: 0,
            conservativeUnknownBillingAssignments: 0,
            manualCostReconciliationAssignments: 0,
            note: "v5 connectivity pilot: exactly Standard then Premium, single-shot, no replay"
          }]
        },
        value: void 0
      };
    }
  });
  return outcome.cleanupWarningKinds;
}
function settleGlobal(input) {
  const outcome = withExclusiveRepoJsonTransactionV5({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v5",
    mutate(current) {
      const ledger = globalLedger(current);
      const matches = ledger.batches.filter((batch) => batch.batchId === GLOBAL_BATCH_ID);
      if (matches.length !== 1 || matches[0].status !== "RESERVED" || ledger.reservedFullQuestionCandidates < 2) {
        throw new Error("global pilot reservation cannot be settled exactly once");
      }
      const reservedBatch = matches[0];
      if (reservedBatch.experiment !== "question-quality-20260715" || reservedBatch.reservedFullQuestionCandidates !== 2 || reservedBatch.usedFullQuestionCandidates !== 0 || reservedBatch.modelCalls !== 0 || reservedBatch.inputTokens !== 0 || reservedBatch.outputTokens !== 0 || reservedBatch.actualCostUsd !== 0 || reservedBatch.effectiveCostUsd !== 0 || reservedBatch.costUsd !== 0 || reservedBatch.actualCostKnownAssignments !== 0 || reservedBatch.usageKnownAssignments !== 0 || reservedBatch.conservativeUnknownBillingAssignments !== 0 || reservedBatch.manualCostReconciliationAssignments !== 0) {
        throw new Error("global pilot reservation batch invariants differ");
      }
      if (!Number.isSafeInteger(input.used) || input.used < 0 || input.used > 2 || input.modelCalls !== input.used || input.observedFullQuestionCandidates > input.used || input.candidateOverflowAssignments !== 0 || input.choiceCardinalityExcessAssignments !== 0 || input.candidateCardinalityAmbiguousAssignments !== 0 || input.choiceCardinalityDriftAssignments !== input.choiceCardinalityShortageAssignments || input.globalCandidateQuarantineRequired !== false || !Number.isSafeInteger(input.inputTokens) || input.inputTokens < 0 || input.inputTokens > MAX_RUN_USAGE_TOKENS_V5 || !Number.isSafeInteger(input.outputTokens) || input.outputTokens < 0 || input.outputTokens > MAX_RUN_USAGE_TOKENS_V5 || !Number.isFinite(input.actualCostUsd) || input.actualCostUsd < 0 || input.actualCostUsd > MAX_RUN_EFFECTIVE_COST_USD_V5 || !Number.isFinite(input.effectiveCostUsd) || input.effectiveCostUsd < 0 || input.effectiveCostUsd > MAX_RUN_EFFECTIVE_COST_USD_V5 || !Number.isSafeInteger(Math.ceil(input.actualCostUsd * 1e12)) || !Number.isSafeInteger(Math.ceil(input.effectiveCostUsd * 1e12)) || input.effectiveCostUsd + 1e-12 < input.actualCostUsd || !Number.isSafeInteger(input.actualCostKnownAssignments) || input.actualCostKnownAssignments < 0 || !Number.isSafeInteger(input.usageKnownAssignments) || input.usageKnownAssignments < 0 || !Number.isSafeInteger(input.conservativeUnknownBillingAssignments) || input.conservativeUnknownBillingAssignments < 0 || !Number.isSafeInteger(input.manualCostReconciliationAssignments) || input.manualCostReconciliationAssignments < 0 || input.manualReconciliationRequired !== false || input.manualCostReconciliationAssignments !== 0 || input.actualCostKnownAssignments > input.used || input.usageKnownAssignments > input.used || input.conservativeUnknownBillingAssignments + input.manualCostReconciliationAssignments !== input.used - input.actualCostKnownAssignments) {
        throw new Error("global settlement counts are invalid");
      }
      const batches = ledger.batches.map((batch) => batch.batchId === GLOBAL_BATCH_ID ? {
        ...batch,
        status: "SETTLED_TERMINAL_NO_REPLAY",
        reservedFullQuestionCandidates: 0,
        usedFullQuestionCandidates: input.used,
        modelCalls: input.modelCalls,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        actualCostUsd: input.actualCostUsd,
        effectiveCostUsd: input.effectiveCostUsd,
        costUsd: input.effectiveCostUsd,
        actualCostKnownAssignments: input.actualCostKnownAssignments,
        usageKnownAssignments: input.usageKnownAssignments,
        conservativeUnknownBillingAssignments: input.conservativeUnknownBillingAssignments,
        manualCostReconciliationAssignments: input.manualCostReconciliationAssignments
      } : batch);
      return {
        next: {
          ...ledger,
          usedFullQuestionCandidates: safeCounterAdd(ledger.usedFullQuestionCandidates, input.used, "used candidates", ledger.capFullQuestionCandidates),
          reservedFullQuestionCandidates: ledger.reservedFullQuestionCandidates - 2,
          modelCalls: safeCounterAdd(ledger.modelCalls, input.modelCalls, "model calls"),
          inputTokens: safeCounterAdd(ledger.inputTokens, input.inputTokens, "input tokens"),
          outputTokens: safeCounterAdd(ledger.outputTokens, input.outputTokens, "output tokens"),
          costUsd: addMoney(ledger.costUsd, input.effectiveCostUsd),
          lastUpdatedAtKst: kstNow(),
          batches
        },
        value: void 0
      };
    }
  });
  return outcome.cleanupWarningKinds;
}
function quarantineGlobalCandidateCapacity(input) {
  if (!input.globalCandidateQuarantineRequired) {
    throw new Error("global candidate quarantine requires observed cardinality drift or overflow");
  }
  const outcome = withExclusiveRepoJsonTransactionV5({
    relativePath: GLOBAL_LEDGER_PATH,
    lockSuffix: "campaign-v6-connectivity-pilot-v5-global-quarantine",
    mutate(current) {
      const ledger = globalLedger(current);
      const matches = ledger.batches.filter((batch) => batch.batchId === GLOBAL_BATCH_ID);
      if (matches.length !== 1 || matches[0].status !== "RESERVED" || ledger.reservedFullQuestionCandidates < 2) {
        throw new Error("global pilot reservation cannot enter candidate quarantine exactly once");
      }
      if (!Number.isSafeInteger(input.used) || input.used < 1 || !Number.isSafeInteger(input.modelCalls) || input.modelCalls < 1 || input.modelCalls > 2 || !Number.isSafeInteger(input.observedFullQuestionCandidates) || input.observedFullQuestionCandidates < 0 || !Number.isSafeInteger(input.candidateOverflowAssignments) || input.candidateOverflowAssignments < 0 || !Number.isSafeInteger(input.choiceCardinalityDriftAssignments) || input.choiceCardinalityDriftAssignments < 0 || !Number.isSafeInteger(input.choiceCardinalityShortageAssignments) || input.choiceCardinalityShortageAssignments < 0 || !Number.isSafeInteger(input.choiceCardinalityExcessAssignments) || input.choiceCardinalityExcessAssignments < 0 || !Number.isSafeInteger(input.candidateCardinalityAmbiguousAssignments) || input.candidateCardinalityAmbiguousAssignments < 0) {
        throw new Error("candidate quarantine settlement counts are invalid");
      }
      const quarantine = projectCandidateCapacityQuarantineV5({
        cap: ledger.capFullQuestionCandidates,
        currentUsed: ledger.usedFullQuestionCandidates,
        currentReserved: ledger.reservedFullQuestionCandidates,
        pilotReservation: 2,
        observedCandidateUnits: input.used
      });
      const { usedIncrement, nextUsed, nextReserved, pilotQuarantineReservation } = quarantine;
      const batches = ledger.batches.map((batch) => batch.batchId === GLOBAL_BATCH_ID ? {
        ...batch,
        status: "QUARANTINED_GLOBAL_CANDIDATE_HALT_TERMINAL_NO_REPLAY",
        reservedFullQuestionCandidates: pilotQuarantineReservation,
        usedFullQuestionCandidates: usedIncrement,
        observedFullQuestionCandidates: input.observedFullQuestionCandidates,
        modelCalls: input.modelCalls,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        actualCostUsd: input.actualCostUsd,
        effectiveCostUsd: input.effectiveCostUsd,
        costUsd: input.effectiveCostUsd,
        actualCostKnownAssignments: input.actualCostKnownAssignments,
        usageKnownAssignments: input.usageKnownAssignments,
        conservativeUnknownBillingAssignments: input.conservativeUnknownBillingAssignments,
        manualCostReconciliationAssignments: input.manualCostReconciliationAssignments,
        candidateOverflowAssignments: input.candidateOverflowAssignments,
        choiceCardinalityDriftAssignments: input.choiceCardinalityDriftAssignments,
        choiceCardinalityShortageAssignments: input.choiceCardinalityShortageAssignments,
        choiceCardinalityExcessAssignments: input.choiceCardinalityExcessAssignments,
        candidateCardinalityAmbiguousAssignments: input.candidateCardinalityAmbiguousAssignments,
        globalCandidateQuarantineRequired: true,
        globallyEnforcedHalt: true
      } : batch);
      return {
        next: {
          ...ledger,
          usedFullQuestionCandidates: nextUsed,
          reservedFullQuestionCandidates: nextReserved,
          modelCalls: safeCounterAdd(ledger.modelCalls, input.modelCalls, "model calls"),
          inputTokens: safeCounterAdd(ledger.inputTokens, input.inputTokens, "input tokens"),
          outputTokens: safeCounterAdd(ledger.outputTokens, input.outputTokens, "output tokens"),
          costUsd: addMoney(ledger.costUsd, input.effectiveCostUsd),
          lastUpdatedAtKst: kstNow(),
          batches,
          note: `${ledger.note} | GLOBAL_CANDIDATE_CAPACITY_QUARANTINED_NO_FURTHER_DISPATCH`
        },
        value: void 0
      };
    }
  });
  return outcome.cleanupWarningKinds;
}
function createPrivateState(runId) {
  if (!/^[a-z0-9][a-z0-9-]{7,80}$/u.test(runId)) throw new Error("runId is invalid");
  const runRoot = createExclusivePrivateRunDirectoryV5(runId);
  const journalPath = path3.join(runRoot, "events.private.jsonl");
  const handle = openSync2(journalPath, "wx", 384);
  closeSync2(handle);
  const state = {
    schemaVersion: "question-quality-connectivity-pilot-private-run-v5",
    runId,
    terminal: false,
    status: "PRIVATE_RESERVED_NOT_STARTED",
    reservedCandidates: 2,
    candidateOpportunitiesConsumed: 0,
    physicalFetches: 0,
    completionsRequested: 0,
    settledAssignments: 0,
    successfulAssignments: 0,
    actualCostUsd: 0,
    effectiveCostUsd: 0,
    actualCostKnownAssignments: 0,
    usageKnownAssignments: 0,
    manualCostReconciliationAssignments: 0,
    globalReservationCommitted: false,
    globalSettlementSucceeded: false,
    assignments: [],
    charges: [],
    journalHeadHash: "0".repeat(64)
  };
  const writeMarker = (name, value) => {
    if (!/^[a-z0-9][a-z0-9.-]{1,80}\.private\.json$/u.test(name)) throw new Error("private marker name is invalid");
    assertRealDirectoryV5(runRoot, "v5 private run directory before marker write");
    const marker = openSync2(path3.join(runRoot, name), "wx", 384);
    try {
      writeFileSync2(marker, `${JSON.stringify(value, null, 2)}
`, "utf8");
      fsyncSync2(marker);
    } finally {
      closeSync2(marker);
    }
  };
  writeMarker("private-reservation.private.json", {
    schemaVersion: "question-quality-connectivity-pilot-private-reservation-v5",
    runId,
    reservedCandidates: 2,
    noReplay: true,
    settlementFailureDisposition: "NO_REPLAY_MANUAL_RECONCILIATION",
    durableBeforeGlobalReservation: true
  });
  let sequence = 0;
  const append = (event, plan, details) => {
    assertRealDirectoryV5(runRoot, "v5 private run directory before journal append");
    sequence += 1;
    const core = { sequence, at: (/* @__PURE__ */ new Date()).toISOString(), event, plan, details, previousHash: state.journalHeadHash };
    const row = { ...core, eventHash: sha256V5(stableJsonV5(core)) };
    appendFileSync(journalPath, `${JSON.stringify(row)}
`, { encoding: "utf8", flush: true });
    state.journalHeadHash = row.eventHash;
  };
  const persistFinal = () => {
    assertRealDirectoryV5(runRoot, "v5 private run directory before final state write");
    const statePath = path3.join(runRoot, "state.private.json");
    const stateHandle = openSync2(statePath, "wx", 384);
    try {
      writeFileSync2(stateHandle, `${JSON.stringify(state, null, 2)}
`, "utf8");
      fsyncSync2(stateHandle);
    } finally {
      closeSync2(stateHandle);
    }
  };
  return { runRoot, state, append, writeMarker, persistFinal };
}
function publicResult(protocol, state) {
  const evidence = state.assignments.map((row) => row.parserEvidence).filter(Boolean);
  const usageEvidenceComplete = evidence.length === 2 && state.usageKnownAssignments === 2 && evidence.every((row) => row.promptTokens > 0 && row.totalTokens === row.promptTokens + row.completionTokens);
  const routeEvidenceComplete = evidence.length === 2 && evidence.every((row) => Boolean(row.providerRequestId && row.servedModel && row.provider));
  const parserEvidenceComplete = evidence.length === 2 && evidence.every((row) => /^[a-f0-9]{64}$/u.test(row.parserEvidenceHash));
  const serialOrderComplete = state.assignments.length === 2 && state.assignments[0]?.plan === "STANDARD" && state.assignments[1]?.plan === "PREMIUM";
  const complete = state.successfulAssignments === 2 && state.settledAssignments === 2 && state.candidateOpportunitiesConsumed === 2 && state.physicalFetches === 2 && state.completionsRequested === 2 && state.actualCostKnownAssignments === 2 && usageEvidenceComplete && routeEvidenceComplete && parserEvidenceComplete && serialOrderComplete && state.globalSettlementSucceeded && state.effectiveCostUsd <= protocol.durableBounds.sharedCostCapUsd + 1e-12;
  const core = {
    schemaVersion: "question-quality-v6-connectivity-pilot-public-result-v5",
    status: complete ? "COMPLETED_BOUNDED_CONNECTIVITY_PILOT" : "TERMINAL_PARTIAL_OR_FAILED",
    startedAssignments: state.assignments.length,
    settledAssignments: state.settledAssignments,
    successfulAssignments: state.successfulAssignments,
    candidateOpportunitiesConsumed: state.candidateOpportunitiesConsumed,
    physicalFetches: state.physicalFetches,
    completionsRequested: state.completionsRequested,
    actualCostUsd: state.actualCostUsd,
    effectiveCostUsd: state.effectiveCostUsd,
    actualCostKnownAssignments: state.actualCostKnownAssignments,
    usageEvidenceComplete,
    routeEvidenceComplete,
    parserEvidenceComplete,
    serialOrderComplete,
    globalReservationBound: state.globalReservationCommitted && state.globalSettlementSucceeded
  };
  return { ...core, executionArtifactSha256: sha256V5(stableJsonV5({ ...core, journalHeadHash: state.journalHeadHash })) };
}
function authorizationHeader() {
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== "string" || key.length < 8) throw new Error("OpenRouter credential unavailable");
  return `Bearer ${key}`;
}
async function executeOne(input) {
  const { assignment, wire, run } = input;
  const header = authorizationHeader();
  run.append("ASSIGNMENT_WILL_DEBIT_AND_SEND", assignment.plan, {
    ordinal: assignment.ordinal,
    candidateOpportunity: 1,
    physicalFetch: 1,
    completion: 1,
    reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
    wireBodySha256: assignment.exactWireBodySha256,
    replayAllowed: false
  });
  const assignmentState = {
    ordinal: assignment.ordinal,
    plan: assignment.plan,
    requestedModel: assignment.modelId,
    reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
    state: "UNKNOWN_AFTER_SEND_TERMINAL_UNTIL_RECONCILED",
    wireBodySha256: assignment.exactWireBodySha256
  };
  run.state.assignments.push(assignmentState);
  run.state.candidateOpportunitiesConsumed += 1;
  run.state.physicalFetches += 1;
  run.state.completionsRequested += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("CONNECTIVITY_PILOT_TIMEOUT")), assignment.timeoutMs);
  let rawText = "";
  let parserEvidence = null;
  let terminalError = null;
  let dispatchAttempted = false;
  let responseBodyObservationComplete = false;
  try {
    dispatchAttempted = true;
    const response = await directNetworkFetchV5(ENDPOINT, {
      method: "POST",
      headers: { authorization: header, "content-type": "application/json", accept: "application/json" },
      body: wire.bodyText,
      redirect: "error",
      signal: controller.signal
    });
    const boundedBody = await readBoundedUtf8ResponseBodyV5({
      response,
      maximumBytes: MODEL_RESPONSE_BODY_MAX_BYTES_V5,
      label: `${assignment.plan} model response`
    });
    rawText = boundedBody.text;
    responseBodyObservationComplete = true;
    assertRealDirectoryV5(run.runRoot, "v5 private run directory before raw response write");
    const responsePath = path3.join(run.runRoot, `${assignment.ordinal}-${assignment.plan.toLowerCase()}-response.private.json`);
    const responseHandle = openSync2(responsePath, "wx", 384);
    try {
      writeFileSync2(responseHandle, rawText, "utf8");
      fsyncSync2(responseHandle);
    } finally {
      closeSync2(responseHandle);
    }
    if (!response.ok) throw new Error(`OpenRouter HTTP ${response.status}`);
    parserEvidence = parseConnectivityResponseV5({
      rawText,
      requestedModel: assignment.modelId,
      allowedServedModels: input.allowedServedModels,
      expectedProvider: input.expectedProvider,
      allowedFinishReasons: input.allowedFinishReasons,
      responseSchema: asObject(
        asObject(asObject(JSON.parse(wire.bodyText), "wire body").response_format, "wire response_format").json_schema,
        "wire json_schema"
      ).schema
    });
    if (parserEvidence.actualCostUsd > assignment.calculatedWorstCaseUsdCap + 1e-12) {
      throw new Error("actual cost exceeded frozen assignment cap");
    }
  } catch (error) {
    terminalError = error;
  } finally {
    clearTimeout(timer);
    const reconciledCharge = constructPostSendChargeFailClosedV5({
      ordinal: assignment.ordinal,
      plan: assignment.plan,
      reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
      constructPrimaryCharge() {
        const billing = extractConnectivityBillingEvidenceV5(rawText);
        const candidateObservation = observeRawCandidateCardinalityV5(rawText);
        return buildAssignmentChargeV5({
          ordinal: assignment.ordinal,
          plan: assignment.plan,
          reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
          billing,
          candidateObservation,
          responseCandidateCardinalityUnobservableAfterSend: dispatchAttempted && !responseBodyObservationComplete
        });
      }
    });
    const charge = reconciledCharge.charge;
    if (reconciledCharge.constructionError !== null) {
      terminalError = terminalError === null ? reconciledCharge.constructionError : new AggregateError(
        [terminalError, reconciledCharge.constructionError],
        "provider terminal failure and post-send charge construction failure"
      );
    }
    run.state.charges.push(charge);
    run.state.settledAssignments += 1;
    run.state.actualCostUsd = addMoney(run.state.actualCostUsd, charge.actualCostUsd ?? 0);
    run.state.effectiveCostUsd = addMoney(run.state.effectiveCostUsd, charge.effectiveCostUsd);
    if (charge.actualKnown) run.state.actualCostKnownAssignments += 1;
    if (charge.usageKnown) run.state.usageKnownAssignments += 1;
    if (charge.manualCostReconciliationRequired) run.state.manualCostReconciliationAssignments += 1;
    assignmentState.actualKnown = charge.actualKnown;
    assignmentState.usageKnown = charge.usageKnown;
    assignmentState.actualCostUsd = charge.actualCostUsd;
    assignmentState.effectiveCostUsd = charge.effectiveCostUsd;
    assignmentState.billingEvidenceHash = charge.billingEvidenceHash;
    assignmentState.conservativeUnknownBilling = charge.conservativeUnknownBilling;
    assignmentState.manualCostReconciliationRequired = charge.manualCostReconciliationRequired;
    assignmentState.explicitPositiveCostEvidenceHash = charge.explicitPositiveCostEvidenceHash;
    assignmentState.provisionalReservedCostPendingManualReconciliation = charge.provisionalReservedCostPendingManualReconciliation;
    assignmentState.observedFullQuestionCandidates = charge.observedFullQuestionCandidates;
    assignmentState.candidateUnitsEffective = charge.candidateUnitsEffective;
    assignmentState.choiceCardinalityDrift = charge.choiceCardinalityDrift;
    assignmentState.choiceCardinalityShortage = charge.choiceCardinalityShortage;
    assignmentState.choiceCardinalityExcess = charge.choiceCardinalityExcess;
    assignmentState.candidateCardinalityAmbiguous = charge.candidateCardinalityAmbiguous;
    assignmentState.responseCandidateCardinalityUnobservableAfterSend = charge.responseCandidateCardinalityUnobservableAfterSend;
    assignmentState.candidateOverflow = charge.candidateOverflow;
    assignmentState.globalCandidateQuarantineRequired = charge.globalCandidateQuarantineRequired;
    assignmentState.candidateObservationEvidenceHash = charge.candidateObservationEvidenceHash;
    if (terminalError === null && parserEvidence) {
      assignmentState.state = "SUCCESS_TERMINAL";
      assignmentState.parserEvidence = parserEvidence;
      run.state.successfulAssignments += 1;
      run.append("ASSIGNMENT_SUCCESS_TERMINAL_RECONCILED", assignment.plan, {
        providerRequestIdSha256: sha256V5(parserEvidence.providerRequestId),
        servedModelSha256: sha256V5(parserEvidence.servedModel),
        providerSha256: sha256V5(parserEvidence.provider),
        parserEvidenceHash: parserEvidence.parserEvidenceHash,
        questionHash: parserEvidence.questionHash,
        billingEvidenceHash: charge.billingEvidenceHash,
        actualKnown: charge.actualKnown,
        usageKnown: charge.usageKnown,
        actualCostUsd: charge.actualCostUsd,
        effectiveCostUsd: charge.effectiveCostUsd,
        replayAllowed: false
      });
    } else {
      assignmentState.state = "FAILED_OR_UNKNOWN_AFTER_SEND_TERMINAL_RECONCILED";
      assignmentState.failureClass = controller.signal.aborted ? "TIMEOUT" : "HTTP_SCHEMA_PARSER_COST_OR_UNKNOWN";
      assignmentState.failureMessageSha256 = sha256V5(terminalError instanceof Error ? terminalError.message : String(terminalError));
      run.append("ASSIGNMENT_FAILED_OR_UNKNOWN_TERMINAL_RECONCILED", assignment.plan, {
        failureClass: assignmentState.failureClass,
        failureMessageSha256: assignmentState.failureMessageSha256,
        rawResponseCaptured: rawText.length > 0,
        billingEvidenceHash: charge.billingEvidenceHash,
        actualKnown: charge.actualKnown,
        usageKnown: charge.usageKnown,
        actualCostUsd: charge.actualCostUsd,
        effectiveCostUsd: charge.effectiveCostUsd,
        conservativeUnknownBilling: charge.conservativeUnknownBilling,
        manualCostReconciliationRequired: charge.manualCostReconciliationRequired,
        replayAllowed: false
      });
    }
  }
  return terminalError === null && parserEvidence !== null;
}
async function runSealedConnectivityPilotV5(input) {
  assertAuthorFreezePermanentlyNoDispatchV5();
  const loaded = exactWire();
  const frozenReference = frozenRuntimeReferenceFromProtocolV5(loaded.protocol);
  assertFrozenRuntimeEntrypointV5({
    repoRoot: path3.resolve(livePackageRootV5, "../../../.."),
    artifactPath: frozenReference.artifactPath,
    expectedArtifactSha256: frozenReference.artifactSha256,
    role: "LIVE_CHILD",
    currentModulePath: fileURLToPath2(import.meta.url)
  });
  assertAuthorized(loaded.protocol);
  const snapshot = validateFreshPriceSnapshot(
    loaded.protocol,
    input.priceSnapshotPath,
    input.priceSnapshotFileSha256,
    input.priceSnapshotBundleSha256
  );
  const run = createPrivateState(input.runId);
  let primaryError = null;
  let reconciliationError = null;
  try {
    const reserveCleanupWarnings = reserveGlobalTwo();
    run.state.globalReservationCommitted = true;
    run.append("DUAL_RESERVATION_COMMITTED", null, {
      globalCandidateReservation: 2,
      privateCandidateReservation: 2,
      globalLedgerPathSha256: sha256V5(GLOBAL_LEDGER_PATH),
      replayAllowed: false,
      postCommitCleanupWarningKinds: reserveCleanupWarnings
    });
    if (reserveCleanupWarnings.length > 0) {
      throw new Error("global reservation committed with lock cleanup warning; no provider dispatch allowed");
    }
    for (let index = 0; index < loaded.protocol.durableBounds.assignments.length; index += 1) {
      const assignment = loaded.protocol.durableBounds.assignments[index];
      const wire = loaded.artifact.rows[index];
      const price = priceEvidenceForModelV5(snapshot, assignment.modelId);
      const success = await executeOne({
        assignment,
        wire,
        expectedProvider: price.exactProvider,
        allowedServedModels: [assignment.modelId, price.canonicalSlug],
        allowedFinishReasons: loaded.protocol.providerContract.terminalFinishReasons,
        run
      });
      if (!success) break;
    }
  } catch (error) {
    primaryError = error;
  } finally {
    while (run.state.charges.length < run.state.physicalFetches) {
      const ordinal = run.state.charges.length + 1;
      const assignment = loaded.protocol.durableBounds.assignments[ordinal - 1];
      const missingCharge = buildFailClosedPostSendChargeV5({
        ordinal,
        plan: assignment.plan,
        reservedCostUsd: assignment.calculatedWorstCaseUsdCap,
        failure: primaryError ?? new Error("sent assignment escaped without a terminal charge")
      });
      run.state.charges.push(missingCharge);
      run.state.settledAssignments += 1;
      run.state.effectiveCostUsd = addMoney(run.state.effectiveCostUsd, missingCharge.effectiveCostUsd);
      run.state.manualCostReconciliationAssignments += 1;
      primaryError = primaryError === null ? new Error("sent assignment required synthesized fail-closed charge") : primaryError;
    }
    const settlement = buildRunLedgerSettlementForDispatchV5({
      charges: run.state.charges,
      physicalFetches: run.state.physicalFetches,
      candidateOpportunitiesConsumed: run.state.candidateOpportunitiesConsumed
    });
    run.state.terminal = true;
    run.state.status = run.state.successfulAssignments === 2 ? "TERMINAL_PENDING_GLOBAL_RECONCILIATION" : "FAILED_OR_UNKNOWN_TERMINAL_PENDING_GLOBAL_RECONCILIATION";
    let intent = null;
    if (run.state.globalReservationCommitted) {
      intent = buildTerminalReconciliationIntentV5({
        runId: run.state.runId,
        journalHeadHash: run.state.journalHeadHash,
        settlement,
        status: run.state.status
      });
      try {
        run.writeMarker("terminal-reconciliation-intent.private.json", intent);
      } catch (error) {
        reconciliationError = error;
      }
      let settlementError = null;
      let settlementCleanupWarnings = [];
      try {
        if (settlement.globalCandidateQuarantineRequired) {
          settlementCleanupWarnings = quarantineGlobalCandidateCapacity(settlement);
        } else {
          settlementCleanupWarnings = settleGlobal(settlement);
        }
      } catch (error) {
        settlementError = error;
      }
      if (settlementError !== null) {
        const error = settlementError;
        reconciliationError = error;
        run.state.status = "GLOBAL_SETTLEMENT_FAILED_TERMINAL_NO_REPLAY_MANUAL_RECONCILIATION";
        const failure = buildSettlementFailureEvidenceV5({
          intentSha256: typeof intent?.intentSha256 === "string" ? intent.intentSha256 : "0".repeat(64),
          settlement,
          error
        });
        try {
          run.writeMarker("terminal-reconciliation-failure.private.json", failure);
        } catch (markerError) {
          reconciliationError = new AggregateError([error, markerError], "global settlement and no-replay evidence write both failed");
        }
      } else {
        run.state.globalSettlementSucceeded = true;
        run.state.status = settlement.globalCandidateQuarantineRequired ? "GLOBAL_CANDIDATE_CAPACITY_QUARANTINED_TERMINAL_NO_REPLAY" : settlementCleanupWarnings.length > 0 ? "GLOBAL_SETTLED_LOCK_CLEANUP_WARNING_TERMINAL_NO_REPLAY" : run.state.successfulAssignments === 2 ? "COMPLETED_TERMINAL" : "FAILED_OR_UNKNOWN_TERMINAL";
        try {
          run.writeMarker("terminal-reconciliation-success.private.json", {
            schemaVersion: "question-quality-connectivity-pilot-terminal-reconciliation-success-v5",
            noReplay: true,
            intentSha256: intent?.intentSha256 ?? null,
            settlement,
            postCommitCleanupWarningKinds: settlementCleanupWarnings
          });
          if (settlementCleanupWarnings.length > 0) {
            reconciliationError = new Error("global settlement committed with lock cleanup warning");
          }
        } catch (error) {
          reconciliationError = error;
          run.state.status = "GLOBAL_SETTLED_SUCCESS_MARKER_FAILED_TERMINAL_NO_REPLAY";
          const postSettlementFailure = buildPostSettlementMarkerFailureEvidenceV5({
            intentSha256: typeof intent?.intentSha256 === "string" ? intent.intentSha256 : "0".repeat(64),
            settlement,
            error
          });
          try {
            run.writeMarker("post-settlement-marker-failure.private.json", postSettlementFailure);
          } catch (markerError) {
            reconciliationError = new AggregateError(
              [error, markerError],
              "global settlement succeeded but both success and post-settlement evidence writes failed"
            );
          }
        }
      }
    } else {
      run.state.status = "GLOBAL_RESERVATION_NOT_COMMITTED_TERMINAL";
    }
    try {
      run.append("RUN_TERMINAL_NO_REPLAY", null, {
        status: run.state.status,
        candidateOpportunitiesConsumed: run.state.candidateOpportunitiesConsumed,
        physicalFetches: run.state.physicalFetches,
        completionsRequested: run.state.completionsRequested,
        successfulAssignments: run.state.successfulAssignments,
        actualCostKnownAssignments: run.state.actualCostKnownAssignments,
        manualCostReconciliationAssignments: run.state.manualCostReconciliationAssignments,
        actualCostUsd: run.state.actualCostUsd,
        effectiveCostUsd: run.state.effectiveCostUsd,
        globalSettlementSucceeded: run.state.globalSettlementSucceeded,
        replayAllowed: false
      });
    } catch (error) {
      primaryError ??= error;
    }
    try {
      run.persistFinal();
    } catch (error) {
      primaryError ??= error;
    }
  }
  if (reconciliationError) throw reconciliationError;
  if (primaryError) throw primaryError;
  return publicResult(loaded.protocol, run.state);
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-child.mts
var frozenRuntimeExports = void 0 ?? frozen_runtime_core_exports;
var protocolCoreExports = void 0 ?? protocol_core_exports;
var liveEnvironmentExports = void 0 ?? live_environment_exports;
var authorGateExports = void 0 ?? author_freeze_gate_exports;
var { assertFrozenRuntimeEntrypointV5: assertFrozenRuntimeEntrypointV52, frozenRuntimeReferenceFromProtocolV5: frozenRuntimeReferenceFromProtocolV52 } = frozenRuntimeExports;
var { validateProtocolV5: validateProtocolV52 } = protocolCoreExports;
var { assertExactLiveChildEnvironmentV5: assertExactLiveChildEnvironmentV52 } = liveEnvironmentExports;
var { assertAuthorFreezePermanentlyNoDispatchV5: assertAuthorFreezePermanentlyNoDispatchV52 } = authorGateExports;
var moduleDirectory = path4.dirname(fileURLToPath3(import.meta.url));
var packageRoot = path4.basename(moduleDirectory) === "frozen-live" ? path4.dirname(moduleDirectory) : moduleDirectory;
var repoRoot = path4.resolve(packageRoot, "../../../..");
var productionRunnerExports = void 0 ?? production_runner_exports;
var { runSealedConnectivityPilotV5: runSealedConnectivityPilotV52 } = productionRunnerExports;
function exactArguments() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !args[0].startsWith("--run-id=") || !args[1].startsWith("--price-snapshot=") || !args[2].startsWith("--price-snapshot-file-sha256=") || !args[3].startsWith("--price-snapshot-bundle-sha256=") || args[0].split("--run-id=").length !== 2 || args[1].split("--price-snapshot=").length !== 2 || args[2].split("--price-snapshot-file-sha256=").length !== 2 || args[3].split("--price-snapshot-bundle-sha256=").length !== 2) {
    throw new Error("live child requires exactly ordered run, price path, file hash, and bundle hash arguments");
  }
  const runId = args[0].slice("--run-id=".length);
  const priceSnapshotPath = args[1].slice("--price-snapshot=".length);
  const priceSnapshotFileSha256 = args[2].slice("--price-snapshot-file-sha256=".length);
  const priceSnapshotBundleSha256 = args[3].slice("--price-snapshot-bundle-sha256=".length);
  if (!runId || !priceSnapshotPath || !/^[a-f0-9]{64}$/u.test(priceSnapshotFileSha256) || !/^[a-f0-9]{64}$/u.test(priceSnapshotBundleSha256)) {
    throw new Error("live child arguments are empty or their capture handoff hashes are malformed");
  }
  return { runId, priceSnapshotPath, priceSnapshotFileSha256, priceSnapshotBundleSha256 };
}
async function main() {
  assertAuthorFreezePermanentlyNoDispatchV52();
  assertExactLiveChildEnvironmentV52();
  const protocol = validateProtocolV52(JSON.parse(readFileSync4(path4.join(packageRoot, "protocol-v5.json"), "utf8")));
  const frozenReference = frozenRuntimeReferenceFromProtocolV52(protocol);
  assertFrozenRuntimeEntrypointV52({
    repoRoot,
    artifactPath: frozenReference.artifactPath,
    expectedArtifactSha256: frozenReference.artifactSha256,
    role: "LIVE_CHILD",
    currentModulePath: fileURLToPath3(import.meta.url)
  });
  const args = exactArguments();
  const result = await runSealedConnectivityPilotV52({
    runId: args.runId,
    priceSnapshotPath: args.priceSnapshotPath,
    priceSnapshotFileSha256: args.priceSnapshotFileSha256,
    priceSnapshotBundleSha256: args.priceSnapshotBundleSha256
  });
  process.stdout.write(`${JSON.stringify(result)}
`);
}
if (process.argv[1] && path4.resolve(process.argv[1]) === fileURLToPath3(import.meta.url)) {
  await main();
}
