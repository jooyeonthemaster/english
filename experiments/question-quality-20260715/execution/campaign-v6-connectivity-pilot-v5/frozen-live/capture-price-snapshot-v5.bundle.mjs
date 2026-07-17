var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-price-snapshot.mts
import { openSync, writeFileSync, closeSync, fsyncSync } from "node:fs";
import path3 from "node:path";
import { readFileSync as readFileSync2 } from "node:fs";
import { fileURLToPath } from "node:url";

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/bounded-response-body.ts
var bounded_response_body_exports = {};
__export(bounded_response_body_exports, {
  BoundedBodyReadErrorV5: () => BoundedBodyReadErrorV5,
  METADATA_RESPONSE_BODY_MAX_BYTES_V5: () => METADATA_RESPONSE_BODY_MAX_BYTES_V5,
  MODEL_RESPONSE_BODY_MAX_BYTES_V5: () => MODEL_RESPONSE_BODY_MAX_BYTES_V5,
  RESPONSE_BODY_MAX_CHUNKS_V5: () => RESPONSE_BODY_MAX_CHUNKS_V5,
  readBoundedUtf8ResponseBodyV5: () => readBoundedUtf8ResponseBodyV5
});
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

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-output-boundary.ts
var capture_output_boundary_exports = {};
__export(capture_output_boundary_exports, {
  assertCanonicalDirectPrivateOutputV5: () => assertCanonicalDirectPrivateOutputV5,
  assertExactMetadataCaptureEnvironmentV5: () => assertExactMetadataCaptureEnvironmentV5,
  parsePriceCaptureCliArgumentsV5: () => parsePriceCaptureCliArgumentsV5
});
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-environment.ts
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

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-output-boundary.ts
function assertExactMetadataCaptureEnvironmentV5(env = process.env) {
  assertExactMetadataEnvironmentV5(env);
}
function normalized(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
function parsePriceCaptureCliArgumentsV5(args) {
  if (args.length !== 1 || !args[0].startsWith("--output=") || args[0].split("--output=").length !== 2) {
    throw new Error("price capture requires exactly one --output=<direct-v5-private-json> argument");
  }
  const outputPath = args[0].slice("--output=".length);
  if (!outputPath || outputPath.includes("\0")) throw new Error("price capture output argument is invalid");
  return { outputPath };
}
function assertCanonicalDirectPrivateOutputV5(rawPath, privateRoot2) {
  const root = path.resolve(privateRoot2);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error("v5 private output root must be an existing real directory");
  }
  if (normalized(realpathSync.native(root)) !== normalized(root)) {
    throw new Error("v5 private output root must not traverse a symlink or junction");
  }
  const absolute = path.resolve(rawPath);
  if (normalized(path.dirname(absolute)) !== normalized(root)) {
    throw new Error("price snapshot output must be a direct child of the canonical v5 private directory");
  }
  const name = path.basename(absolute);
  if (!/^[a-z0-9][a-z0-9.-]{1,78}\.json$/u.test(name)) {
    throw new Error("price snapshot output filename is invalid");
  }
  if (existsSync(absolute)) {
    throw new Error("price snapshot output must be a new non-existing file");
  }
  return absolute;
}

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/price-snapshot-core.ts
var price_snapshot_core_exports = {};
__export(price_snapshot_core_exports, {
  buildPrivatePriceEvidenceBundleV5: () => buildPrivatePriceEvidenceBundleV5,
  buildPublicPriceSnapshotV5: () => buildPublicPriceSnapshotV5,
  priceEvidenceForModelV5: () => priceEvidenceForModelV5,
  validatePinnedPrivatePriceEvidenceBundleV5: () => validatePinnedPrivatePriceEvidenceBundleV5,
  validatePrivatePriceEvidenceBundleV5: () => validatePrivatePriceEvidenceBundleV5
});

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
  const publicResult = exactKeys(row.publicResultContract, "publicResultContract", [
    "allowlist",
    "forbiddenNamePattern",
    "requiresTwoSuccessfulAssignments",
    "requiresUsageRouteParserEvidence",
    "twoRowsNotQualityComparison"
  ]);
  if (!Array.isArray(publicResult.allowlist) || publicResult.allowlist.length < 8) fail("publicResultContract.allowlist", "too short");
  stringValue(publicResult.forbiddenNamePattern, "publicResultContract.forbiddenNamePattern");
  literal(publicResult.requiresTwoSuccessfulAssignments, true, "publicResultContract.requiresTwoSuccessfulAssignments");
  literal(publicResult.requiresUsageRouteParserEvidence, true, "publicResultContract.requiresUsageRouteParserEvidence");
  literal(publicResult.twoRowsNotQualityComparison, true, "publicResultContract.twoRowsNotQualityComparison");
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
  value(path4, depth) {
    if (depth > MAX_JSON_DEPTH_V5) throw new Error("JSON nesting exceeds v5 observation bound");
    this.white();
    const token = this.source[this.offset];
    if (token === "{") return this.object(path4, depth + 1);
    if (token === "[") return this.array(path4, depth + 1);
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
  object(path4, depth) {
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
        this.duplicates.push({ objectPath: path4, key });
      }
      keys.add(key);
      this.white();
      if (this.source[this.offset] !== ":") throw new Error(`JSON object colon missing at byte ${this.offset}`);
      this.offset += 1;
      this.value(`${path4}.${key}`, depth);
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
  array(path4, depth) {
    this.offset += 1;
    this.white();
    if (this.source[this.offset] === "]") {
      this.offset += 1;
      return;
    }
    let index = 0;
    while (true) {
      this.value(`${path4}[${index}]`, depth);
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
import { lstatSync as lstatSync2, readFileSync, realpathSync as realpathSync2 } from "node:fs";
import path2 from "node:path";
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
  const normalized2 = path2.normalize(value);
  return process.platform === "win32" ? normalized2.toLocaleLowerCase("en-US") : normalized2;
}
function captureCurrentNodeRuntimeV5() {
  const executableRealPath = realpathSync2.native(process.execPath);
  const stat = lstatSync2(executableRealPath);
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
  const artifactAbsolute = path2.resolve(input.repoRoot, input.artifactPath);
  const artifactStat = lstatSync2(artifactAbsolute);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || comparable(realpathSync2.native(artifactAbsolute)) !== comparable(artifactAbsolute)) {
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
    const absolute = path2.resolve(input.repoRoot, row.path);
    const stat = lstatSync2(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || comparable(realpathSync2.native(absolute)) !== comparable(absolute)) {
      throw new Error(`${row.role} frozen bundle must be a real regular file`);
    }
    assertFrozenBundleBytesV5(artifact, row.role, readFileSync(absolute));
  }
  const ownRow = artifact.bundles.find((row) => row.role === input.role);
  if (comparable(realpathSync2.native(input.currentModulePath)) !== comparable(path2.resolve(input.repoRoot, ownRow.path))) {
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

// experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-price-snapshot.mts
var priceCoreExports = void 0 ?? price_snapshot_core_exports;
var protocolCoreExports = void 0 ?? protocol_core_exports;
var frozenRuntimeExports = void 0 ?? frozen_runtime_core_exports;
var authorGateExports = void 0 ?? author_freeze_gate_exports;
var { buildPrivatePriceEvidenceBundleV5: buildPrivatePriceEvidenceBundleV52, buildPublicPriceSnapshotV5: buildPublicPriceSnapshotV52 } = priceCoreExports;
var { metadataNetworkDispatchAuthorizedV5: metadataNetworkDispatchAuthorizedV52, modelIdsV5: modelIdsV52, validateProtocolV5: validateProtocolV52 } = protocolCoreExports;
var { assertFrozenRuntimeEntrypointV5: assertFrozenRuntimeEntrypointV52, frozenRuntimeReferenceFromProtocolV5: frozenRuntimeReferenceFromProtocolV52 } = frozenRuntimeExports;
var { assertAuthorFreezePermanentlyNoDispatchV5: assertAuthorFreezePermanentlyNoDispatchV52 } = authorGateExports;
var boundedBodyExports = void 0 ?? bounded_response_body_exports;
var { METADATA_RESPONSE_BODY_MAX_BYTES_V5: METADATA_RESPONSE_BODY_MAX_BYTES_V52, readBoundedUtf8ResponseBodyV5: readBoundedUtf8ResponseBodyV52 } = boundedBodyExports;
var captureOutputBoundaryExports = void 0 ?? capture_output_boundary_exports;
var {
  assertCanonicalDirectPrivateOutputV5: assertCanonicalDirectPrivateOutputV52,
  assertExactMetadataCaptureEnvironmentV5: assertExactMetadataCaptureEnvironmentV52,
  parsePriceCaptureCliArgumentsV5: parsePriceCaptureCliArgumentsV52
} = captureOutputBoundaryExports;
var moduleDirectory = path3.dirname(fileURLToPath(import.meta.url));
var packageRoot = path3.basename(moduleDirectory) === "frozen-live" ? path3.dirname(moduleDirectory) : moduleDirectory;
var repoRoot = path3.resolve(packageRoot, "../../../..");
var privateRoot = path3.join(packageRoot, "private");
var protocolPath = path3.join(packageRoot, "protocol-v5.json");
var MODELS_URL = "https://openrouter.ai/api/v1/models";
async function fetchPublicJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(3e4)
  });
  const bodyText = (await readBoundedUtf8ResponseBodyV52({
    response,
    maximumBytes: METADATA_RESPONSE_BODY_MAX_BYTES_V52,
    label: "public price metadata response"
  })).text;
  if (!response.ok) throw new Error(`public price endpoint returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new Error("public price endpoint did not attest a JSON Content-Type");
  }
  return {
    payload: JSON.parse(bodyText),
    raw: { url, status: response.status, contentType, bodyText }
  };
}
async function main() {
  assertAuthorFreezePermanentlyNoDispatchV52();
  assertExactMetadataCaptureEnvironmentV52();
  const protocol = validateProtocolV52(JSON.parse(readFileSync2(protocolPath, "utf8").replace(/^\uFEFF/u, "")));
  if (!metadataNetworkDispatchAuthorizedV52(protocol.authorization)) {
    throw new Error("v5 public metadata capture requires metadata authorization, hostile audit, and an explicit dispatch command");
  }
  const frozenReference = frozenRuntimeReferenceFromProtocolV52(protocol);
  assertFrozenRuntimeEntrypointV52({
    repoRoot,
    artifactPath: frozenReference.artifactPath,
    expectedArtifactSha256: frozenReference.artifactSha256,
    role: "CAPTURE_PRICE_METADATA",
    currentModulePath: fileURLToPath(import.meta.url)
  });
  const parsedArguments = parsePriceCaptureCliArgumentsV52(process.argv.slice(2));
  const outputPath = assertCanonicalDirectPrivateOutputV52(parsedArguments.outputPath, privateRoot);
  const modelsResponse = await fetchPublicJson(MODELS_URL);
  const endpointPayloads = {};
  const rawHttpResponses = [modelsResponse.raw];
  for (const modelId of modelIdsV52()) {
    const endpointResponse = await fetchPublicJson(`${MODELS_URL}/${modelId}/endpoints`);
    endpointPayloads[modelId] = endpointResponse.payload;
    rawHttpResponses.push(endpointResponse.raw);
  }
  const snapshot = buildPublicPriceSnapshotV52({
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
    modelsPayload: modelsResponse.payload,
    endpointPayloads,
    rawHttpResponses
  });
  const bundle = buildPrivatePriceEvidenceBundleV52(snapshot, rawHttpResponses);
  const bytes = `${JSON.stringify(bundle, null, 2)}
`;
  const handle = openSync(outputPath, "wx", 384);
  try {
    writeFileSync(handle, bytes, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  process.stdout.write(`${JSON.stringify({
    status: "PUBLIC_PRICE_SNAPSHOT_CAPTURED",
    fetchedAt: snapshot.fetchedAt,
    contentSha256: snapshot.contentSha256,
    privateEvidenceBundleSha256: bundle.bundleSha256,
    rawResponseEvidenceCount: bundle.rawHttpResponses.length,
    modelCount: snapshot.models.length,
    credentialValuesRead: 0,
    metadataNetworkCalls: 3,
    externalNetworkCalls: 3,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0
  })}
`);
}
if (process.argv[1] && path3.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
