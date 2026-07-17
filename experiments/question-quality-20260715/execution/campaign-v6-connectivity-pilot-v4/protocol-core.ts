import { createHash } from "node:crypto";

export type PilotPlanV4 = "STANDARD" | "PREMIUM";
export type JsonObject = Record<string, unknown>;

export interface AssignmentV4 {
  ordinal: 1 | 2;
  plan: PilotPlanV4;
  modelId: string;
  exactWireBodyUtf8Bytes: number;
  exactWireBodySha256: string;
  maxOutputTokens: 4000;
  emergencyInputUsdPer1M: number;
  emergencyOutputUsdPer1M: number;
  calculatedWorstCaseUsdCap: number;
  timeoutMs: number;
}

export interface ConnectivityPilotProtocolV4 extends JsonObject {
  schemaVersion: "question-quality-v6-connectivity-pilot-protocol-v4";
  artifactId: "campaign-v6-connectivity-pilot-v4";
  status: "OFFLINE_AUTHOR_FREEZE_LIVE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_AUDIT";
  lineage: JsonObject;
  fixedProductionInput: JsonObject;
  providerContract: JsonObject;
  durableBounds: JsonObject & {
    sharedCandidateCap: 2;
    sharedPhysicalFetchCap: 2;
    sharedCompletionCap: 2;
    serialOrder: ["STANDARD", "PREMIUM"];
    assignments: AssignmentV4[];
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
    exactDeclaredDataInputs: number;
    exactTotalFiles: number;
  };
  globalResearchLedger: JsonObject;
  liveClosureContract: JsonObject;
  privatePersistence: JsonObject;
  publicResultContract: JsonObject;
  authorization: {
    liveExecutionAuthorized: false;
    hostileAuditPassed: false;
    dispatchCommandPresent: false;
  };
  authorFreezeActivity: {
    externalNetworkCalls: 0;
    providerCalls: 0;
    modelCalls: 0;
    apiCandidatesConsumed: 0;
    productionDatabaseCalls: 0;
    realCredentialValuesRead: 0;
    globalLedgerReservationMutations: 0;
  };
}

export interface EndpointPriceV4 {
  provider: string;
  endpointName: string;
  tag: string;
  status: "active" | "inactive";
  contextLength: number;
  promptUsdPerToken: number;
  completionUsdPerToken: number;
  supportedParameters: string[];
  overrides: Array<{
    minPromptTokens: number;
    promptUsdPerToken: number;
    completionUsdPerToken: number;
  }>;
}

export interface PublicPriceSnapshotV4 extends JsonObject {
  schemaVersion: "question-quality-openrouter-public-price-snapshot-v4";
  fetchedAt: string;
  sources: {
    modelsUrl: "https://openrouter.ai/api/v1/models";
    endpointUrls: Record<string, string>;
  };
  routingContract: {
    exactEndpointTag: "google-vertex/global";
    emergencyCeilingScope: "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES";
  };
  chargeDimensions: string[];
  models: Array<{
    requestedModelId: string;
    canonicalSlug: string;
    endpointRates: EndpointPriceV4[];
  }>;
  contentSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MODELS: Record<PilotPlanV4, string> = {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview",
};

export function stableValueV4(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValueV4);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, stableValueV4(child)]));
  }
  return value;
}

export function stableJsonV4(value: unknown): string {
  return JSON.stringify(stableValueV4(value));
}

export function sha256V4(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

export function conservativeCostV4(input: {
  bodyBytes: number;
  maxOutputTokens: number;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  serverTokenOverheadUpperBound: number;
  safetyMultiplier: number;
}): number {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value <= 0) fail(name, "must be positive");
  }
  const raw = ((input.bodyBytes + input.serverTokenOverheadUpperBound) * input.inputUsdPer1M +
    input.maxOutputTokens * input.outputUsdPer1M) / 1_000_000;
  return Math.ceil(raw * input.safetyMultiplier * 1e9) / 1e9;
}

function validateAssignments(value: unknown, protocol: JsonObject): AssignmentV4[] {
  if (!Array.isArray(value) || value.length !== 2) fail("durableBounds.assignments", "must contain two rows");
  const pricing = object(protocol.pricingEvidenceContract, "pricingEvidenceContract");
  numberValue(pricing.serverTokenOverheadUpperBound, "pricingEvidenceContract.serverTokenOverheadUpperBound", true);
  numberValue(pricing.safetyMultiplier, "pricingEvidenceContract.safetyMultiplier");
  const rows = value.map((candidate, index) => {
    const row = exactKeys(candidate, `assignment[${index}]`, [
      "ordinal", "plan", "modelId", "exactWireBodyUtf8Bytes", "exactWireBodySha256",
      "maxOutputTokens", "emergencyInputUsdPer1M", "emergencyOutputUsdPer1M",
      "calculatedWorstCaseUsdCap", "timeoutMs",
    ]);
    const plan: PilotPlanV4 = index === 0 ? "STANDARD" : "PREMIUM";
    literal(row.ordinal, index + 1, `assignment[${index}].ordinal`);
    literal(row.plan, plan, `assignment[${index}].plan`);
    literal(row.modelId, MODELS[plan], `assignment[${index}].modelId`);
    numberValue(row.exactWireBodyUtf8Bytes, `assignment[${index}].exactWireBodyUtf8Bytes`, true);
    if ((row.exactWireBodyUtf8Bytes as number) < 1) fail(`assignment[${index}]`, "body bytes must be positive");
    hashValue(row.exactWireBodySha256, `assignment[${index}].exactWireBodySha256`);
    literal(row.maxOutputTokens, 4000, `assignment[${index}].maxOutputTokens`);
    numberValue(row.emergencyInputUsdPer1M, `assignment[${index}].emergencyInputUsdPer1M`);
    numberValue(row.emergencyOutputUsdPer1M, `assignment[${index}].emergencyOutputUsdPer1M`);
    numberValue(row.calculatedWorstCaseUsdCap, `assignment[${index}].calculatedWorstCaseUsdCap`);
    numberValue(row.timeoutMs, `assignment[${index}].timeoutMs`, true);
    const expectedCost = conservativeCostV4({
      bodyBytes: row.exactWireBodyUtf8Bytes as number,
      maxOutputTokens: 4000,
      inputUsdPer1M: row.emergencyInputUsdPer1M as number,
      outputUsdPer1M: row.emergencyOutputUsdPer1M as number,
      serverTokenOverheadUpperBound: pricing.serverTokenOverheadUpperBound as number,
      safetyMultiplier: pricing.safetyMultiplier as number,
    });
    literal(row.calculatedWorstCaseUsdCap, expectedCost, `assignment[${index}].calculatedWorstCaseUsdCap`);
    return row as unknown as AssignmentV4;
  });
  return rows;
}

export function validateProtocolV4(value: unknown): ConnectivityPilotProtocolV4 {
  const row = exactKeys(value, "protocol", [
    "schemaVersion", "artifactId", "status", "lineage", "fixedProductionInput",
    "providerContract", "durableBounds", "pricingEvidenceContract", "exactWireCommitment",
    "compilerClosureContract", "globalResearchLedger", "liveClosureContract", "privatePersistence",
    "publicResultContract", "authorization", "authorFreezeActivity",
  ]);
  literal(row.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v4", "schemaVersion");
  literal(row.artifactId, "campaign-v6-connectivity-pilot-v4", "artifactId");
  literal(row.status, "OFFLINE_AUTHOR_FREEZE_LIVE_EXECUTION_BLOCKED_PENDING_INDEPENDENT_AUDIT", "status");

  const lineage = exactKeys(row.lineage, "lineage", ["preserves", "replacesExecutionPackage", "v2Unmodified", "v3Unmodified", "v2AuditDisposition", "v3AuditDisposition"]);
  exactStringArray(lineage.preserves, ["campaign-v6-connectivity-pilot-v2", "campaign-v6-connectivity-pilot-v3"], "lineage.preserves");
  literal(lineage.replacesExecutionPackage, true, "lineage.replacesExecutionPackage");
  literal(lineage.v2Unmodified, true, "lineage.v2Unmodified");
  literal(lineage.v3Unmodified, true, "lineage.v3Unmodified");
  literal(lineage.v2AuditDisposition, "REJECTED_TEST_TRANSPORT_SEAM_AND_INCOMPLETE_LIVE_CLOSURE", "lineage.v2AuditDisposition");
  literal(lineage.v3AuditDisposition, "REJECTED_INCOMPLETE_COMPILER_CLOSURE_AND_PERMISSIVE_RESPONSE_PARSER", "lineage.v3AuditDisposition");

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
  ]);
  literal(pricing.schemaVersion, "question-quality-openrouter-public-price-snapshot-v4", "pricingEvidenceContract.schemaVersion");
  literal(pricing.maximumAgeMs, 900000, "pricingEvidenceContract.maximumAgeMs");
  literal(pricing.exactEndpointCardinality, 1, "pricingEvidenceContract.exactEndpointCardinality");
  exactStringArray(pricing.requiredParameters, ["response_format", "structured_outputs"], "pricingEvidenceContract.requiredParameters");
  for (const key of ["canonicalSlugRequired", "allActiveEndpointsAndOverridesRequired", "chargeDimensionsRequired", "contentHashRequired"] as const) literal(pricing[key], true, `pricingEvidenceContract.${key}`);
  numberValue(pricing.serverTokenOverheadUpperBound, "pricingEvidenceContract.serverTokenOverheadUpperBound", true);
  numberValue(pricing.safetyMultiplier, "pricingEvidenceContract.safetyMultiplier");

  const wire = exactKeys(row.exactWireCommitment, "exactWireCommitment", [
    "privateArtifactPath", "privateArtifactSha256", "publicArtifactPath", "publicArtifactSha256",
    "locallyInterceptedProductionCompilerFetches", "externalNetworkCalls", "providerCalls",
    "modelCalls", "apiCandidatesConsumed",
  ]);
  literal(wire.privateArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/private/exact-wire-v4.private.json", "exactWireCommitment.privateArtifactPath");
  literal(wire.publicArtifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/offline-exact-wire-seal-v4.json", "exactWireCommitment.publicArtifactPath");
  hashValue(wire.privateArtifactSha256, "exactWireCommitment.privateArtifactSha256");
  hashValue(wire.publicArtifactSha256, "exactWireCommitment.publicArtifactSha256");
  literal(wire.locallyInterceptedProductionCompilerFetches, 2, "exactWireCommitment.locallyInterceptedProductionCompilerFetches");
  for (const key of ["externalNetworkCalls", "providerCalls", "modelCalls", "apiCandidatesConsumed"] as const) literal(wire[key], 0, `exactWireCommitment.${key}`);

  const compilerClosure = exactKeys(row.compilerClosureContract, "compilerClosureContract", [
    "artifactPath", "artifactSha256", "semanticSha256", "algorithm", "entrypoints",
    "exactSourceFiles", "exactDeclaredDataInputs", "exactTotalFiles", "exactEqualityRequired",
    "zeroUnresolvedLocalRequired", "zeroNonliteralDynamicRequired", "minimumCountChecksForbidden",
    "inheritedThirtyTwoRowSubsetAuthority",
  ]);
  literal(compilerClosure.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compiler-closure-v4.json", "compilerClosureContract.artifactPath");
  hashValue(compilerClosure.artifactSha256, "compilerClosureContract.artifactSha256");
  hashValue(compilerClosure.semanticSha256, "compilerClosureContract.semanticSha256");
  literal(compilerClosure.algorithm, "INDEPENDENT_TYPESCRIPT_AST_EXACT_TRANSITIVE_REPO_LOCAL_V2", "compilerClosureContract.algorithm");
  exactStringArray(compilerClosure.entrypoints, ["experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/compile-exact-wire.mts"], "compilerClosureContract.entrypoints");
  numberValue(compilerClosure.exactSourceFiles, "compilerClosureContract.exactSourceFiles", true);
  numberValue(compilerClosure.exactDeclaredDataInputs, "compilerClosureContract.exactDeclaredDataInputs", true);
  numberValue(compilerClosure.exactTotalFiles, "compilerClosureContract.exactTotalFiles", true);
  literal(compilerClosure.exactTotalFiles, (compilerClosure.exactSourceFiles as number) + (compilerClosure.exactDeclaredDataInputs as number), "compilerClosureContract.exactTotalFiles");
  for (const key of ["exactEqualityRequired", "zeroUnresolvedLocalRequired", "zeroNonliteralDynamicRequired", "minimumCountChecksForbidden"] as const) literal(compilerClosure[key], true, `compilerClosureContract.${key}`);
  literal(compilerClosure.inheritedThirtyTwoRowSubsetAuthority, false, "compilerClosureContract.inheritedThirtyTwoRowSubsetAuthority");

  const ledger = exactKeys(row.globalResearchLedger, "globalResearchLedger", [
    "path", "globalCap", "requiredPreAuthorUsed", "requiredPreAuthorReserved", "liveReservation",
    "authorFreezeMutationAllowed", "privateStoreReservationAlsoRequired", "atomicLockRequired",
  ]);
  literal(ledger.path, "experiments/question-quality-20260715/budget-ledger.json", "globalResearchLedger.path");
  literal(ledger.globalCap, 1000, "globalResearchLedger.globalCap");
  literal(ledger.requiredPreAuthorUsed, 0, "globalResearchLedger.requiredPreAuthorUsed");
  literal(ledger.requiredPreAuthorReserved, 0, "globalResearchLedger.requiredPreAuthorReserved");
  literal(ledger.liveReservation, 2, "globalResearchLedger.liveReservation");
  literal(ledger.authorFreezeMutationAllowed, false, "globalResearchLedger.authorFreezeMutationAllowed");
  literal(ledger.privateStoreReservationAlsoRequired, true, "globalResearchLedger.privateStoreReservationAlsoRequired");
  literal(ledger.atomicLockRequired, true, "globalResearchLedger.atomicLockRequired");

  const closure = exactKeys(row.liveClosureContract, "liveClosureContract", [
    "artifactPath", "algorithm", "exactEntrypointSetRequired", "exactTransitiveFileSetRequired",
    "exactBytesAndSha256Required", "literalDynamicImportsIncluded", "runtimeDataReadsClassified",
    "minimumCountChecksForbidden", "testSupportExcluded", "exactExpectedFiles",
  ]);
  literal(closure.artifactPath, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/live-closure-v4.json", "liveClosureContract.artifactPath");
  literal(closure.algorithm, "TYPESCRIPT_AST_TRANSITIVE_IMPORTS_PLUS_DECLARED_RUNTIME_DATA_V1", "liveClosureContract.algorithm");
  for (const key of ["exactEntrypointSetRequired", "exactTransitiveFileSetRequired", "exactBytesAndSha256Required", "literalDynamicImportsIncluded", "runtimeDataReadsClassified", "testSupportExcluded"] as const) literal(closure[key], true, `liveClosureContract.${key}`);
  literal(closure.minimumCountChecksForbidden, true, "liveClosureContract.minimumCountChecksForbidden");
  literal(closure.exactExpectedFiles, 11, "liveClosureContract.exactExpectedFiles");

  const persistence = exactKeys(row.privatePersistence, "privatePersistence", [
    "exclusiveNewRunDirectory", "durableEventJournal", "rawRequestAndResponsePrivateOnly",
    "credentialNeverPersisted", "unknownAfterSendNeverReplay", "publicAllowlistOnly",
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

  const auth = exactKeys(row.authorization, "authorization", ["liveExecutionAuthorized", "hostileAuditPassed", "dispatchCommandPresent"]);
  for (const key of Object.keys(auth)) literal(auth[key], false, `authorization.${key}`);
  const activity = exactKeys(row.authorFreezeActivity, "authorFreezeActivity", [
    "externalNetworkCalls", "providerCalls", "modelCalls", "apiCandidatesConsumed",
    "productionDatabaseCalls", "realCredentialValuesRead", "globalLedgerReservationMutations",
  ]);
  for (const key of Object.keys(activity)) literal(activity[key], 0, `authorFreezeActivity.${key}`);
  return row as unknown as ConnectivityPilotProtocolV4;
}

export function validatePriceSnapshotV4(value: unknown): PublicPriceSnapshotV4 {
  const row = exactKeys(value, "priceSnapshot", [
    "schemaVersion", "fetchedAt", "sources", "routingContract", "chargeDimensions", "models", "contentSha256",
  ]);
  literal(row.schemaVersion, "question-quality-openrouter-public-price-snapshot-v4", "priceSnapshot.schemaVersion");
  stringValue(row.fetchedAt, "priceSnapshot.fetchedAt");
  if (!UTC.test(row.fetchedAt) || new Date(Date.parse(row.fetchedAt)).toISOString() !== row.fetchedAt) fail("priceSnapshot.fetchedAt", "not canonical UTC");
  const sources = exactKeys(row.sources, "priceSnapshot.sources", ["modelsUrl", "endpointUrls"]);
  literal(sources.modelsUrl, "https://openrouter.ai/api/v1/models", "priceSnapshot.sources.modelsUrl");
  const endpointUrls = object(sources.endpointUrls, "priceSnapshot.sources.endpointUrls");
  exactStringArray(Object.keys(endpointUrls).sort(), Object.values(MODELS).sort(), "priceSnapshot endpoint model set");
  for (const modelId of Object.values(MODELS)) {
    literal(endpointUrls[modelId], `https://openrouter.ai/api/v1/models/${modelId}/endpoints`, `endpointUrls.${modelId}`);
  }
  const routing = exactKeys(row.routingContract, "priceSnapshot.routingContract", ["exactEndpointTag", "emergencyCeilingScope"]);
  literal(routing.exactEndpointTag, "google-vertex/global", "routingContract.exactEndpointTag");
  literal(routing.emergencyCeilingScope, "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES", "routingContract.emergencyCeilingScope");
  if (!Array.isArray(row.chargeDimensions) || row.chargeDimensions.length === 0 || new Set(row.chargeDimensions).size !== row.chargeDimensions.length || row.chargeDimensions.some((entry) => typeof entry !== "string" || !entry)) fail("chargeDimensions", "must be unique strings");
  if (!Array.isArray(row.models) || row.models.length !== 2) fail("models", "must have two models");
  const ordered = [MODELS.STANDARD, MODELS.PREMIUM];
  row.models.forEach((candidate, modelIndex) => {
    const model = exactKeys(candidate, `models[${modelIndex}]`, ["requestedModelId", "canonicalSlug", "endpointRates"]);
    literal(model.requestedModelId, ordered[modelIndex], `models[${modelIndex}].requestedModelId`);
    stringValue(model.canonicalSlug, `models[${modelIndex}].canonicalSlug`);
    if (!Array.isArray(model.endpointRates) || model.endpointRates.length === 0) fail(`models[${modelIndex}].endpointRates`, "must be nonempty");
    let exactActive = 0;
    model.endpointRates.forEach((candidateEndpoint, endpointIndex) => {
      const endpoint = exactKeys(candidateEndpoint, `endpoint[${modelIndex}:${endpointIndex}]`, [
        "provider", "endpointName", "tag", "status", "contextLength", "promptUsdPerToken",
        "completionUsdPerToken", "supportedParameters", "overrides",
      ]);
      for (const key of ["provider", "endpointName", "tag"] as const) stringValue(endpoint[key], `endpoint.${key}`);
      if (endpoint.status !== "active" && endpoint.status !== "inactive") fail("endpoint.status", "invalid");
      numberValue(endpoint.contextLength, "endpoint.contextLength", true);
      numberValue(endpoint.promptUsdPerToken, "endpoint.promptUsdPerToken");
      numberValue(endpoint.completionUsdPerToken, "endpoint.completionUsdPerToken");
      if (!Array.isArray(endpoint.supportedParameters) || endpoint.supportedParameters.some((entry) => typeof entry !== "string")) fail("endpoint.supportedParameters", "invalid");
      if (!Array.isArray(endpoint.overrides)) fail("endpoint.overrides", "invalid");
      endpoint.overrides.forEach((candidateOverride) => {
        const override = exactKeys(candidateOverride, "endpoint.override", ["minPromptTokens", "promptUsdPerToken", "completionUsdPerToken"]);
        numberValue(override.minPromptTokens, "override.minPromptTokens", true);
        numberValue(override.promptUsdPerToken, "override.promptUsdPerToken");
        numberValue(override.completionUsdPerToken, "override.completionUsdPerToken");
      });
      if (endpoint.tag === "google-vertex/global" && endpoint.status === "active") exactActive += 1;
    });
    literal(exactActive, 1, `models[${modelIndex}].exactActiveEndpointCount`);
  });
  hashValue(row.contentSha256, "priceSnapshot.contentSha256");
  const core = { ...row };
  delete core.contentSha256;
  literal(row.contentSha256, sha256V4(stableJsonV4(core)), "priceSnapshot.contentSha256");
  return row as unknown as PublicPriceSnapshotV4;
}

export function modelIdsV4(): readonly [string, string] {
  return [MODELS.STANDARD, MODELS.PREMIUM];
}
