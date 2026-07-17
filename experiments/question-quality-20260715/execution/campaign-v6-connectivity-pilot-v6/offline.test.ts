import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BoundedBodyReadErrorV6,
  MODEL_RESPONSE_BODY_MAX_BYTES_V6,
  readBoundedUtf8ResponseBodyV6,
  RESPONSE_BODY_MAX_CHUNKS_V6,
} from "./bounded-response-body";
import { assertCanonicalDirectPrivateOutputV6, parsePriceCaptureCliArgumentsV6 } from "./capture-output-boundary";
import { readDirectRealEnvLocalCredentialTextV6 } from "./credential-file-boundary";
import { runIsolatedCompilerV6 } from "./compiler-client.mts";
import { buildFrozenRuntimeV6 } from "./build-frozen-runtime.mts";
import {
  assertCurrentBundlerToolchainV6,
  captureBundlerToolchainProvenanceV6,
  captureTransitiveJsClosureV6,
} from "./bundler-toolchain-provenance";
import {
  assertCurrentNodeRuntimeV6,
  assertFrozenBundleBytesV6,
  validateFrozenRuntimeArtifactV6,
} from "./frozen-runtime-core";
import { computeLiveClosureV6, LIVE_ENTRYPOINTS_V6 } from "./live-closure.mts";
import {
  buildPrivatePriceEvidenceBundleV6,
  buildPublicPriceSnapshotV6,
  priceEvidenceForModelV6,
  validatePrivatePriceEvidenceBundleV6,
  validatePinnedPrivatePriceEvidenceBundleV6,
} from "./price-snapshot-core";
import { extractConnectivityBillingEvidenceV6, parseConnectivityResponseV6 } from "./response-parser";
import {
  MAX_JSON_RECOVERY_ATTEMPTS_V6,
  MAX_JSON_NODES_V6,
  MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6,
  observeRawCandidateCardinalityV6,
} from "./strict-json-observer";
import {
  metadataNetworkDispatchAuthorizedV6,
  sha256V6,
  stableJsonV6,
  validatePriceSnapshotV6,
  validateProtocolV6,
  type JsonObject,
} from "./protocol-core";
import {
  buildAssignmentChargeV6,
  buildFailClosedPostSendChargeV6,
  buildPostSettlementMarkerFailureEvidenceV6,
  buildRunLedgerSettlementV6,
  buildRunLedgerSettlementForDispatchV6,
  buildSettlementFailureEvidenceV6,
  buildTerminalReconciliationIntentV6,
  commitGlobalSettlementAfterDurableIntentV6,
  constructPostSendChargeFailClosedV6,
  projectCandidateCapacityQuarantineV6,
  TerminalIntentNotDurableErrorV6,
} from "./terminal-reconciliation-core";
import { runDeterministicLocalScenarioV6 } from "./test-support";
import {
  assertExactLiveChildEnvironmentV6,
  assertExactMetadataEnvironmentV6,
  buildExactLiveChildEnvironmentV6,
  buildExactMetadataEnvironmentV6,
  LIVE_CHILD_ENV_NAMES_V6,
  LIVE_CHILD_MARKER_ENV_V6,
  MINIMAL_OS_ENV_NAMES_V6,
  WINDOWS_AUTOINJECTED_ENV_NAMES_V6,
} from "./live-environment";
import {
  assertDirectRealPrivateInputPathV6,
  assertJsonTransactionTargetUnchangedV6,
  assertRealDirectoryV6,
  assertRealRegularFileV6,
  attestJsonTransactionTargetV6,
  classifyCommittedTransactionCleanupV6,
  PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V6,
  readPrivateAttestedJsonV6,
  readPrivateAttestedJsonEvidenceV6,
  readStableMutableJsonV6,
  withExclusiveRepoJsonTransactionV6,
} from "./live-io";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const parseJsonFile = (filePath: string): unknown => JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "")) as unknown;
const protocol = validateProtocolV6(parseJsonFile(path.join(here, "protocol-v6.json")));
const exactWire = parseJsonFile(path.join(here, "private/exact-wire-v6.private.json")) as { rows: Array<{ bodyText: string }> };
const standardBody = JSON.parse(exactWire.rows[0]!.bodyText) as JsonObject;
const responseSchema = ((standardBody.response_format as JsonObject).json_schema as JsonObject).schema as JsonObject;
let frozenBuildPromise: ReturnType<typeof buildFrozenRuntimeV6> | null = null;
function getFrozenBuild() {
  frozenBuildPromise ??= buildFrozenRuntimeV6();
  return frozenBuildPromise;
}
async function frozenClosureOverrides(): Promise<Map<string, Uint8Array>> {
  const frozen = await getFrozenBuild();
  return new Map<string, Uint8Array>([
    [String(protocol.frozenRuntimeContract.artifactPath), frozen.artifactBytes],
    ...frozen.artifact.bundles.map((row) => [row.path, frozen.bundleBytesByRole.get(row.role)!] as const),
  ]);
}

const rawModels = {
  data: [
    { id: "google/gemini-3.5-flash", canonical_slug: "google/gemini-3.5-flash-20260519", pricing: { prompt: "0.0000015", completion: "0.000009", request: "0", image: "0", internal_reasoning: "0.000009" } },
    { id: "google/gemini-3.1-pro-preview", canonical_slug: "google/gemini-3.1-pro-preview-20260401", pricing: { prompt: "0.000002", completion: "0.000012", request: "0", image: "0", internal_reasoning: "0.000012" } },
  ],
};

function endpointPayload(modelId: string, exactProvider = "Google Vertex") {
  return {
    data: {
      endpoints: [
        {
          provider_name: exactProvider,
          name: `${modelId}:vertex`,
          tag: "google-vertex/global",
          status: "active",
          context_length: 1048576,
          supported_parameters: ["structured_outputs", "response_format", "tools"],
          pricing: { prompt: "0.000002", completion: "0.000012", request: "0", image: "0", internal_reasoning: "0.000012", overrides: [] },
        },
        {
          provider_name: "Emergency Provider",
          name: `${modelId}:emergency`,
          tag: "other/global",
          status: "active",
          context_length: 1048576,
          supported_parameters: ["structured_outputs", "response_format"],
          pricing: modelId.includes("3.5")
            ? { prompt: "0.0000027", completion: "0.0000162", request: "0.002", internal_reasoning: "0.0000162", overrides: [] }
            : {
                prompt: "0.0000072", completion: "0.0000324", request: "0.003",
                internal_reasoning: "0.0000324",
                overrides: [{ min_prompt_tokens: 200001, prompt: "0.0000072", completion: "0.0000324" }],
              },
        },
      ],
    },
  };
}

function rawPriceInput(modelsPayload: unknown, endpointPayloads: Record<string, unknown>) {
  const rows = [
    { url: "https://openrouter.ai/api/v1/models", payload: modelsPayload },
    ...["google/gemini-3.5-flash", "google/gemini-3.1-pro-preview"].map((modelId) => ({
      url: `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
      payload: endpointPayloads[modelId],
    })),
  ];
  return {
    fetchedAt: "2026-07-15T00:00:00.000Z",
    modelsPayload,
    endpointPayloads,
    rawHttpResponses: rows.map((row) => ({
      url: row.url,
      status: 200,
      contentType: "application/json; charset=utf-8",
      bodyText: JSON.stringify(row.payload),
    })),
  };
}

function priceSnapshot() {
  return buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  }));
}

function schemaExample(schema: JsonObject): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === "object") {
    const properties = schema.properties as JsonObject;
    const required = schema.required as string[];
    return Object.fromEntries(required.map((key) => [key, schemaExample(properties[key] as JsonObject)]));
  }
  if (schema.type === "array") {
    const length = typeof schema.minItems === "number" ? schema.minItems : 0;
    return Array.from({ length }, () => schemaExample(schema.items as JsonObject));
  }
  if (schema.type === "string") return "x".repeat(Math.max(16, typeof schema.minLength === "number" ? schema.minLength : 1));
  if (schema.type === "integer" || schema.type === "number") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (schema.type === "boolean") return false;
  if (schema.type === "null") return null;
  throw new Error(`unsupported test schema type ${String(schema.type)}`);
}

const validContent = schemaExample(responseSchema) as { questions: JsonObject[] };

function responseRaw(model: string, options: {
  provider?: string;
  questionCount?: number;
  finishReason?: string;
  content?: unknown;
  usage?: JsonObject;
} = {}): string {
  const count = options.questionCount ?? 1;
  const content = options.content ?? { ...validContent, questions: Array.from({ length: count }, () => validContent.questions[0]) };
  return JSON.stringify({
    id: `gen-${sha256V6(model).slice(0, 16)}`,
    model,
    provider: options.provider ?? "Google Vertex",
    object: "chat.completion",
    created: 1_784_064_000,
    choices: [{
      index: 0,
      finish_reason: options.finishReason ?? "stop",
      message: { role: "assistant", content: JSON.stringify(content) },
    }],
    usage: options.usage === undefined
      ? { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0.01, is_byok: false }
      : { is_byok: false, ...options.usage },
  });
}

function parserInput(rawText: string, expectedProvider = "Google Vertex") {
  return {
    rawText,
    requestedModel: "google/gemini-3.5-flash",
    allowedServedModels: ["google/gemini-3.5-flash", "google/gemini-3.5-flash-20260519"],
    expectedProvider,
    allowedFinishReasons: ["stop"] as const,
    responseSchema,
  };
}

function mutateResponse(rawText: string, mutate: (response: JsonObject) => void): string {
  const response = JSON.parse(rawText) as JsonObject;
  mutate(response);
  return JSON.stringify(response);
}

function billingCharge(
  rawText: string,
  ordinal: 1 | 2,
  plan: "STANDARD" | "PREMIUM",
  reservedCostUsd = 0.1,
  responseCandidateCardinalityUnobservableAfterSend = false,
) {
  return buildAssignmentChargeV6({
    ordinal,
    plan,
    reservedCostUsd,
    billing: extractConnectivityBillingEvidenceV6(rawText),
    candidateObservation: observeRawCandidateCardinalityV6(rawText),
    responseCandidateCardinalityUnobservableAfterSend,
  });
}

test("protocol is the blocked v6 author freeze", () => {
  assert.equal(protocol.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v6");
  assert.deepEqual(protocol.authorization, {
    liveExecutionAuthorized: false,
    metadataNetworkAuthorized: false,
    hostileAuditPassed: false,
    dispatchCommandPresent: false,
  });
});

test("protocol fixes exactly two serial single-shot assignments", () => {
  assert.deepEqual(protocol.durableBounds.assignments.map((row) => row.plan), ["STANDARD", "PREMIUM"]);
  assert.equal(protocol.durableBounds.sharedCandidateCap, 2);
  assert.equal(protocol.durableBounds.sharedPhysicalFetchCap, 2);
  assert.equal(protocol.durableBounds.sharedCompletionCap, 2);
});

test("protocol forbids retry/repair/fallback/replacement/top-up", () => {
  for (const key of ["retryAllowed", "repairAllowed", "fallbackAllowed", "replacementAllowed", "topUpAllowed"] as const) assert.equal(protocol.durableBounds[key], false);
});

test("author freeze records one read-only ledger attestation and zero external activity or mutation", () => {
  assert.deepEqual(protocol.authorFreezeActivity, {
    externalNetworkCalls: 0,
    metadataNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    productionDatabaseCalls: 0,
    realCredentialValuesRead: 0,
    globalLedgerReadOnlyAttestations: 1,
    globalLedgerReservationMutations: 0,
  });
});

test("price snapshot normalizes canonical slugs, all endpoint rates, and exact tag", () => {
  const snapshot = priceSnapshot();
  assert.equal(snapshot.models.length, 2);
  assert(snapshot.models.every((row) => row.endpointRates.length === 2));
  assert(snapshot.models.every((row) => row.endpointRates.filter((endpoint) => endpoint.tag === "google-vertex/global" && endpoint.status === "active").length === 1));
});

test("price snapshot content hash is self-verifying", () => {
  const snapshot = priceSnapshot();
  const core = { ...snapshot } as Record<string, unknown>;
  delete core.contentSha256;
  assert.equal(snapshot.contentSha256, sha256V6(stableJsonV6(core)));
});

test("price snapshot is exact-bound to three bounded raw responses and a private evidence bundle", () => {
  const input = rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  });
  const snapshot = buildPublicPriceSnapshotV6(input);
  assert.equal(snapshot.sources.rawResponseCommitments.length, 3);
  const bundle = buildPrivatePriceEvidenceBundleV6(snapshot, input.rawHttpResponses);
  assert.deepEqual(validatePrivatePriceEvidenceBundleV6(bundle), bundle);
  const tampered = structuredClone(bundle);
  (tampered.rawHttpResponses[0]! as { bodyText: string }).bodyText += " ";
  assert.throws(() => validatePrivatePriceEvidenceBundleV6(tampered), /bundle hash differs|raw price evidence differs/u);

  const forgedSnapshot = structuredClone(snapshot);
  forgedSnapshot.models[0]!.endpointRates[0]!.promptUsdPerToken += 0.000001;
  const forgedCore = { ...forgedSnapshot } as JsonObject;
  delete forgedCore.contentSha256;
  forgedSnapshot.contentSha256 = sha256V6(stableJsonV6(forgedCore));
  const forgedBundle = buildPrivatePriceEvidenceBundleV6(forgedSnapshot, input.rawHttpResponses);
  assert.throws(
    () => validatePrivatePriceEvidenceBundleV6(forgedBundle),
    /does not exactly reproduce normalized snapshot/u,
  );

  const duplicateSource = structuredClone(input);
  (duplicateSource.rawHttpResponses[0]! as { bodyText: string }).bodyText = '{"data":[],"data":[]}';
  duplicateSource.modelsPayload = { data: [] };
  assert.throws(() => buildPublicPriceSnapshotV6(duplicateSource), /duplicate object keys/u);
});

test("price capture handoff is fd-bound and rejects growth, replacement, and recomputed synthetic bundles", () => {
  const filePath = path.join(here, "private/offline-hostile-price-handoff.json");
  const movedPath = `${filePath}.moved`;
  assert.equal(existsSync(filePath), false);
  try {
    const input = rawPriceInput(rawModels, {
      "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
      "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
    });
    const authentic = buildPrivatePriceEvidenceBundleV6(buildPublicPriceSnapshotV6(input), input.rawHttpResponses);
    writeFileSync(filePath, `${JSON.stringify(authentic)}\n`, "utf8");
    const captured = readPrivateAttestedJsonEvidenceV6(filePath);
    assert.deepEqual(validatePinnedPrivatePriceEvidenceBundleV6({
      value: captured.value,
      observedFileSha256: captured.fileSha256,
      expectedFileSha256: captured.fileSha256,
      expectedBundleSha256: authentic.bundleSha256,
    }), authentic);

    assert.throws(() => readPrivateAttestedJsonEvidenceV6(filePath, {
      afterTargetOpenBeforeRead() {
        writeFileSync(filePath, " ", { encoding: "utf8", flag: "a" });
      },
    }), /grew during|changed during/u);

    writeFileSync(filePath, `${JSON.stringify(authentic)}\n`, "utf8");
    const pinnedAgain = readPrivateAttestedJsonEvidenceV6(filePath);
    const hostileModels = structuredClone(rawModels) as typeof rawModels;
    hostileModels.data[0]!.pricing.prompt = "0.0000001";
    const hostileInput = rawPriceInput(hostileModels, {
      "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
      "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
    });
    const synthetic = buildPrivatePriceEvidenceBundleV6(
      buildPublicPriceSnapshotV6(hostileInput),
      hostileInput.rawHttpResponses,
    );
    renameSync(filePath, movedPath);
    writeFileSync(filePath, `${JSON.stringify(synthetic)}\n`, "utf8");
    const replaced = readPrivateAttestedJsonEvidenceV6(filePath);
    assert.throws(() => validatePinnedPrivatePriceEvidenceBundleV6({
      value: replaced.value,
      observedFileSha256: replaced.fileSha256,
      expectedFileSha256: pinnedAgain.fileSha256,
      expectedBundleSha256: authentic.bundleSha256,
    }), /file differs/u);
    assert.throws(() => validatePinnedPrivatePriceEvidenceBundleV6({
      value: replaced.value,
      observedFileSha256: replaced.fileSha256,
      expectedFileSha256: replaced.fileSha256,
      expectedBundleSha256: authentic.bundleSha256,
    }), /bundle differs/u);
  } finally {
    rmSync(filePath, { force: true });
    rmSync(movedPath, { force: true });
  }
});

test("price snapshot binds all-active emergency maxima including overrides", () => {
  const snapshot = priceSnapshot();
  const premium = priceEvidenceForModelV6(snapshot, "google/gemini-3.1-pro-preview");
  assert.equal(premium.emergencyPromptUsdPer1M, 7.2);
  assert.equal(premium.emergencyCompletionUsdPer1M, 64.8);
  assert.equal(premium.emergencyInternalReasoningUsdPer1M, 32.4);
  assert.deepEqual(snapshot.knownBoundedOutputTokenChargeDimensions, ["internal_reasoning"]);

  const hostileTopLevel = structuredClone(rawModels) as typeof rawModels;
  hostileTopLevel.data[0]!.pricing.prompt = "0.0001";
  hostileTopLevel.data[0]!.pricing.completion = "0.0002";
  const topLevelSnapshot = buildPublicPriceSnapshotV6(rawPriceInput(hostileTopLevel, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  }));
  const topLevelEvidence = priceEvidenceForModelV6(topLevelSnapshot, "google/gemini-3.5-flash");
  assert.equal(topLevelEvidence.emergencyPromptUsdPer1M, 100);
  assert.equal(topLevelEvidence.emergencyCompletionUsdPer1M, 216.2);
});

test("historical 2026-07-14 pricing shape is explicit about absent request fees and nested overrides", () => {
  const historical = parseJsonFile(path.join(repoRoot, "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json")) as {
    models: Array<{
      id: string;
      canonicalSlug: string;
      endpointRates: Array<{
        provider: string;
        endpointName: string;
        contextLength: number;
        promptUsdPerToken: number;
        completionUsdPerToken: number;
        internalReasoningUsdPerToken: number;
        overrides: Array<{ minPromptTokens: number; promptUsdPerToken: number; completionUsdPerToken: number }>;
      }>;
    }>;
  };
  assert(historical.models.every((model) => model.endpointRates.every((endpoint) => endpoint.internalReasoningUsdPerToken > 0)));
  const modelsPayload = { data: historical.models.map((model) => ({
    id: model.id,
    canonical_slug: model.canonicalSlug,
    pricing: {
      prompt: model.endpointRates[0]!.promptUsdPerToken,
      completion: model.endpointRates[0]!.completionUsdPerToken,
      internal_reasoning: model.endpointRates[0]!.internalReasoningUsdPerToken,
    },
  })) };
  const endpointPayloads = Object.fromEntries(historical.models.map((model) => [model.id, {
    data: { endpoints: model.endpointRates.map((endpoint, index) => ({
      provider_name: endpoint.provider,
      name: endpoint.endpointName,
      tag: index === 0 ? "google-vertex/global" : `historical/${index}`,
      context_length: endpoint.contextLength,
      supported_parameters: ["response_format", "structured_outputs"],
      pricing: {
        prompt: endpoint.promptUsdPerToken,
        completion: endpoint.completionUsdPerToken,
        internal_reasoning: endpoint.internalReasoningUsdPerToken,
        overrides: endpoint.overrides.map((override) => ({
          min_prompt_tokens: override.minPromptTokens,
          prompt: override.promptUsdPerToken,
          completion: override.completionUsdPerToken,
        })),
      },
    })) },
  }])) as Record<string, unknown>;
  assert.throws(
    () => buildPublicPriceSnapshotV6(rawPriceInput(modelsPayload, endpointPayloads)),
    /does not assume an omitted fixed request fee is zero/u,
  );
  for (const model of modelsPayload.data) (model.pricing as JsonObject).request = 0;
  for (const payload of Object.values(endpointPayloads)) {
    const endpoints = ((payload as JsonObject).data as JsonObject).endpoints as JsonObject[];
    for (const endpoint of endpoints) ((endpoint.pricing as JsonObject).request) = 0;
  }
  const admitted = buildPublicPriceSnapshotV6(rawPriceInput(modelsPayload, endpointPayloads));
  assert(admitted.models[1]!.endpointRates.every((endpoint) => endpoint.overrides.length === 1));
  assert(admitted.models[1]!.endpointRates.every((endpoint) => endpoint.overrides[0]!.fixedRequestUsd === 0));
});

test("price snapshot rejects duplicate exact active endpoints", () => {
  const payload = endpointPayload("google/gemini-3.5-flash");
  payload.data.endpoints.push({ ...payload.data.endpoints[0]!, name: "duplicate" });
  assert.throws(() => buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": payload,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /exactly one active/u);
});

test("price snapshot rejects tampered content hash", () => {
  const snapshot = { ...priceSnapshot(), contentSha256: "0".repeat(64) };
  assert.throws(() => validatePriceSnapshotV6(snapshot), /contentSha256/u);
});

test("price snapshot reserves request fees, accepts known request-disabled unit rates, and rejects unknown dimensions", () => {
  const hostileModels = structuredClone(rawModels) as typeof rawModels;
  (hostileModels.data[0]!.pricing as JsonObject).request = "0.01";
  const endpoints = {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  };
  const snapshot = buildPublicPriceSnapshotV6(rawPriceInput(hostileModels, endpoints));
  assert.equal(snapshot.models[0]!.topLevelFixedRequestUsd, 0.01);
  assert.equal(priceEvidenceForModelV6(snapshot, "google/gemini-3.5-flash").emergencyRequestUsd, 0.01);
  assert(!snapshot.knownInapplicableUnitChargeDimensions.includes("internal_reasoning"));
  assert(snapshot.knownBoundedOutputTokenChargeDimensions.includes("internal_reasoning"));

  const cachePricedEndpoint = endpointPayload("google/gemini-3.5-flash");
  (cachePricedEndpoint.data.endpoints[0]!.pricing as JsonObject).input_cache_read = "0.000001";
  (cachePricedEndpoint.data.endpoints[0]!.pricing as JsonObject).input_cache_write = "0.000002";
  const cachePricedSnapshot = buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": cachePricedEndpoint,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  }));
  const cachePricedEvidence = priceEvidenceForModelV6(cachePricedSnapshot, "google/gemini-3.5-flash");
  assert.deepEqual(cachePricedSnapshot.knownBoundedInputTokenChargeDimensions, ["input_cache_read", "input_cache_write"]);
  assert.equal(cachePricedEvidence.emergencyCacheReadUsdPer1M, 1);
  assert.equal(cachePricedEvidence.emergencyCacheWriteUsdPer1M, 2);
  assert.equal(cachePricedEvidence.emergencyPromptUsdPer1M, 5.7);

  const knownUnitRateEndpoint = endpointPayload("google/gemini-3.5-flash");
  (knownUnitRateEndpoint.data.endpoints[0]!.pricing as JsonObject).web_search = "0.0001";
  assert.doesNotThrow(() => buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": knownUnitRateEndpoint,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })));

  const unknownDimensionEndpoint = endpointPayload("google/gemini-3.5-flash");
  (unknownDimensionEndpoint.data.endpoints[0]!.pricing as JsonObject).mystery_charge = "0";
  assert.throws(() => buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": unknownDimensionEndpoint,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /unknown charge dimension/u);
});

test("price snapshot requires canonical nested overrides and rejects ambiguous endpoint metadata", () => {
  const topAlias = endpointPayload("google/gemini-3.5-flash");
  (topAlias.data.endpoints[0]! as JsonObject).pricing_overrides = [];
  assert.throws(() => buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": topAlias,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /forbidden.*pricing\.overrides is canonical/u);

  const invalidStatus = endpointPayload("google/gemini-3.5-flash");
  (invalidStatus.data.endpoints[0]! as JsonObject).status = "offline";
  assert.throws(() => buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": invalidStatus,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /status is invalid/u);

  const duplicateParameter = endpointPayload("google/gemini-3.5-flash");
  duplicateParameter.data.endpoints[0]!.supported_parameters.push("response_format");
  assert.throws(() => buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": duplicateParameter,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /duplicate declarations/u);

  const inheritedOverride = endpointPayload("google/gemini-3.1-pro-preview");
  const override = ((inheritedOverride.data.endpoints[1]!.pricing as JsonObject).overrides as JsonObject[])[0]!;
  delete override.completion;
  const admitted = buildPublicPriceSnapshotV6(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": inheritedOverride,
  }));
  const inherited = admitted.models[1]!.endpointRates.find((endpoint) => endpoint.tag === "other/global")!.overrides[0]!;
  assert.equal(inherited.completionUsdPerToken, 0.0000324);
  assert.equal(inherited.fixedRequestUsd, 0.003);
});

test("response parser requires final usage, exact route, and one semantic question", () => {
  const parsed = parseConnectivityResponseV6(parserInput(responseRaw("google/gemini-3.5-flash-20260519")));
  assert.equal(parsed.promptTokens, 100);
  assert.match(parsed.parserEvidenceHash, /^[a-f0-9]{64}$/u);
});

test("frozen bundle construction exact-seals resolved esbuild JS, package sets, native executable, and package-lock", async () => {
  const provenance = captureBundlerToolchainProvenanceV6();
  assert.equal(provenance.esbuildVersion, "0.27.3");
  assert.equal(provenance.platform, process.platform);
  assert.equal(provenance.arch, process.arch);
  assert.equal(provenance.resolvedEntrypoint.repoRelativePath, "node_modules/esbuild/lib/main.js");
  assert.equal(provenance.packageJson.repoRelativePath, "node_modules/esbuild/package.json");
  assert.equal(provenance.transitiveJsClosure.length, 1);
  assert.equal(provenance.esbuildPackageFiles.length, 7);
  assert.equal(provenance.selectedNativePackageFiles.length, 3);
  assert.equal(provenance.packageLock.repoRelativePath, "package-lock.json");
  assert.deepEqual(provenance.externalStaticSpecifiers, [
    "child_process", "crypto", "fs", "os", "path", "pnpapi", "tty", "worker_threads",
  ]);
  assert.match(provenance.selectedNativeExecutable.repoRelativePath, /^node_modules\/@esbuild\//u);
  assert.match(provenance.selectedNativeExecutable.sha256, /^[a-f0-9]{64}$/u);
  assertCurrentBundlerToolchainV6(provenance);

  const frozen = await getFrozenBuild();
  assert.deepEqual(frozen.artifact.bundler.toolchain, provenance);
  const tampered = structuredClone(provenance);
  tampered.selectedNativeExecutable.sha256 = "0".repeat(64);
  assert.throws(() => assertCurrentBundlerToolchainV6(tampered), /differs/u);

  const previousBinaryPath = process.env.ESBUILD_BINARY_PATH;
  try {
    process.env.ESBUILD_BINARY_PATH = path.join(here, "private/hostile-esbuild-binary.exe");
    assert.throws(() => captureBundlerToolchainProvenanceV6(), /ESBUILD_BINARY_PATH is forbidden/u);
  } finally {
    if (previousBinaryPath === undefined) delete process.env.ESBUILD_BINARY_PATH;
    else process.env.ESBUILD_BINARY_PATH = previousBinaryPath;
  }
});

test("bundler provenance preserves canonical paths across a multi-file static JS closure and rejects nonliteral loads", () => {
  const fixture = mkdtempSync(path.join(here, "private/offline-v6-bundler-closure-"));
  try {
    const nested = path.join(fixture, "nested");
    mkdirSync(nested);
    const entry = path.join(fixture, "Entry.js");
    writeFileSync(entry, [
      'import child from "./Child.js";',
      'export { nested } from "./nested/index.js";',
      'const fs = require("node:fs");',
      'export default child + Boolean(fs);',
    ].join("\n"), "utf8");
    writeFileSync(path.join(fixture, "Child.js"), 'module.exports = require("node:path").sep;\n', "utf8");
    writeFileSync(path.join(nested, "index.js"), 'export const nested = "sealed";\n', "utf8");
    const entryWithHostileCasing = process.platform === "win32" ? entry.toUpperCase() : entry;
    const closure = captureTransitiveJsClosureV6(entryWithHostileCasing);
    assert.equal(closure.files.length, 3);
    assert.equal(new Set(closure.files.map((row) => row.realPath)).size, 3);
    assert.equal(closure.files.some((row) => row.repoRelativePath.endsWith("/Entry.js")), true);
    assert.deepEqual(closure.externalStaticSpecifiers, ["node:fs", "node:path"]);

    const nonliteral = path.join(fixture, "nonliteral.js");
    writeFileSync(nonliteral, 'require("./" + "Child.js");\n', "utf8");
    assert.throws(() => captureTransitiveJsClosureV6(nonliteral), /nonliteral esbuild module load/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("every frozen bundle records an exact source-byte mapping equal to the reviewed live source closure", async () => {
  const frozen = await getFrozenBuild();
  const closure = computeLiveClosureV6({ declaredRuntimeArtifactBytes: await frozenClosureOverrides() });
  const liveSources = new Map(
    closure.files.filter((row) => row.kind === "source").map((row) => [row.path, row]),
  );
  const mapped = new Set<string>();
  for (const bundle of frozen.artifact.bundles) {
    assert.match(bundle.sourceInputSetSha256, /^[a-f0-9]{64}$/u);
    for (const input of bundle.sourceInputs) {
      mapped.add(input.path);
      const live = liveSources.get(input.path);
      assert(live, `${bundle.role} mapped source is outside the live closure: ${input.path}`);
      assert.deepEqual([input.sourceBytes, input.sourceSha256], [live.bytes, live.sha256]);
      assert.doesNotMatch(input.path, /(?:offline\.test|test-support|verify|build-offline|bundler-toolchain)/u);
    }
  }
  assert.deepEqual([...mapped].sort(), [...liveSources.keys()].sort());
});

test("response parser rejects wrong provider", () => {
  assert.throws(() => parseConnectivityResponseV6(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { provider: "Fallback Provider" }),
  )), /provider route/u);
});

test("response parser rejects two semantic questions", () => {
  assert.throws(() => parseConnectivityResponseV6(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { questionCount: 2 }),
  )), /array length|exactly one semantic/u);
});

test("raw candidate observer distinguishes shortage from excess and globally quarantines affirmative overflow", () => {
  const base = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const zeroChoices = structuredClone(base);
  zeroChoices.choices = [];
  const zeroRaw = JSON.stringify(zeroChoices);
  const zeroObservation = observeRawCandidateCardinalityV6(zeroRaw);
  assert.equal(zeroObservation.choiceCardinalityShortage, true);
  assert.equal(zeroObservation.cardinalityAmbiguous, false);
  const zeroSettlement = buildRunLedgerSettlementV6([billingCharge(zeroRaw, 1, "STANDARD")]);
  assert.equal(zeroSettlement.used, 1);
  assert.equal(zeroSettlement.globalCandidateQuarantineRequired, false);

  const twoChoices = structuredClone(base);
  (twoChoices.choices as JsonObject[]).push(structuredClone((twoChoices.choices as JsonObject[])[0]!));
  const twoRaw = JSON.stringify(twoChoices);
  const twoObservation = observeRawCandidateCardinalityV6(twoRaw);
  assert.equal(twoObservation.fullQuestionObjectsObserved, 2);
  assert.equal(twoObservation.choiceCardinalityExcess, true);
  const twoSettlement = buildRunLedgerSettlementV6([billingCharge(twoRaw, 1, "STANDARD")]);
  assert.equal(twoSettlement.used, 2);
  assert.equal(twoSettlement.modelCalls, 1);
  assert.equal(twoSettlement.globalCandidateQuarantineRequired, true);

  const validAndMalformed = structuredClone(base);
  (validAndMalformed.choices as JsonObject[]).push({
    index: 1,
    finish_reason: "stop",
    message: { role: "assistant", content: "{not-json" },
  });
  const mixedObservation = observeRawCandidateCardinalityV6(JSON.stringify(validAndMalformed));
  assert.equal(mixedObservation.fullQuestionObjectsObserved, 1);
  assert.equal(mixedObservation.choiceCardinalityExcess, true);
  assert.equal(mixedObservation.cardinalityAmbiguous, true);
});

test("raw candidate observer fails closed on multi-object, alternate-root, duplicate, and two-question content", () => {
  const base = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const choice = ((base.choices as JsonObject[])[0]!.message as JsonObject);
  const oneQuestion = JSON.stringify(validContent.questions[0]);

  choice.content = `{"questions":[${oneQuestion}]}{"questions":[${oneQuestion}]}`;
  assert.equal(observeRawCandidateCardinalityV6(JSON.stringify(base)).cardinalityAmbiguous, true);

  choice.content = JSON.stringify({ questions: [validContent.questions[0]], alternate: { questions: [validContent.questions[0]] } });
  assert.equal(observeRawCandidateCardinalityV6(JSON.stringify(base)).cardinalityAmbiguous, true);

  choice.content = `{"questions":[${oneQuestion}],"questions":[${oneQuestion},${oneQuestion}]}`;
  const duplicateObservation = observeRawCandidateCardinalityV6(JSON.stringify(base));
  assert.equal(duplicateObservation.cardinalityAmbiguous, true);
  assert.throws(() => parseConnectivityResponseV6(parserInput(JSON.stringify(base))), /duplicate object keys/u);

  choice.content = JSON.stringify({ questions: [validContent.questions[0], validContent.questions[0]] });
  const twoQuestionRaw = JSON.stringify(base);
  const twoQuestionSettlement = buildRunLedgerSettlementV6([billingCharge(twoQuestionRaw, 1, "STANDARD")]);
  assert.equal(twoQuestionSettlement.observedFullQuestionCandidates, 2);
  assert.equal(twoQuestionSettlement.globalCandidateQuarantineRequired, true);

  const quarantine = projectCandidateCapacityQuarantineV6({
    cap: 1000,
    currentUsed: 0,
    currentReserved: 2,
    pilotReservation: 2,
    observedCandidateUnits: twoQuestionSettlement.used,
  });
  assert.equal(quarantine.nextUsed + quarantine.nextReserved, 1000);
  assert.equal(quarantine.furtherCandidateReservationAllowed, false);
  assert.equal(quarantine.nextUsed + quarantine.nextReserved + 1 > 1000, true);
});

test("raw candidate observer keeps ordinary transport garbage separate from affirmative multiplicity", () => {
  for (const raw of ["502 Bad Gateway", '{"error":"unterminated']) {
    const observation = observeRawCandidateCardinalityV6(raw);
    assert.equal(observation.cardinalityAmbiguous, false);
    assert.equal(observation.candidateUnitsEffective, 1);
    const settlement = buildRunLedgerSettlementV6([billingCharge(raw, 1, "STANDARD")]);
    assert.equal(settlement.used, 1);
    assert.equal(settlement.globalCandidateQuarantineRequired, false);
  }
  const concatenated = `${responseRaw("google/gemini-3.5-flash-20260519")}${responseRaw("google/gemini-3.5-flash-20260519")}`;
  const concatenatedObservation = observeRawCandidateCardinalityV6(concatenated);
  assert.equal(concatenatedObservation.cardinalityAmbiguous, true);
  assert.equal(concatenatedObservation.candidateUnitsEffective, 2);
  assert.equal(buildRunLedgerSettlementV6([billingCharge(concatenated, 1, "STANDARD")]).globalCandidateQuarantineRequired, true);
});

test("truncated first model envelope with complete two-question inner content is globally ambiguous", () => {
  const root = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  ((root.choices as JsonObject[])[0]!.message as JsonObject).content = JSON.stringify({
    questions: [validContent.questions[0], validContent.questions[0]],
  });
  const complete = JSON.stringify(root);
  const truncated = complete.slice(0, -1);
  assert.throws(() => JSON.parse(truncated));
  const observation = observeRawCandidateCardinalityV6(truncated);
  assert.equal(observation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV6([
    billingCharge(truncated, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);
});

test("a complete root followed by a truncated extra root is affirmative ambiguity at both envelopes", () => {
  const validRoot = responseRaw("google/gemini-3.5-flash-20260519");
  const rootObservation = observeRawCandidateCardinalityV6(`${validRoot}{"choices":[`);
  assert.equal(rootObservation.candidateUnitsEffective, 1);
  assert.equal(rootObservation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV6([
    billingCharge(`${validRoot}{"choices":[`, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);

  const outer = JSON.parse(validRoot) as JsonObject;
  const message = ((outer.choices as JsonObject[])[0]!.message as JsonObject);
  message.content = `${JSON.stringify({ questions: [validContent.questions[0]] })}{"questions":[`;
  const contentRaw = JSON.stringify(outer);
  const contentObservation = observeRawCandidateCardinalityV6(contentRaw);
  assert.equal(contentObservation.candidateUnitsEffective, 1);
  assert.equal(contentObservation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV6([
    billingCharge(contentRaw, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);
});

test("valid JSON beyond strict observation depth globally quarantines root and content cardinality", () => {
  const baseline = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  let deepQuestions: unknown = { questions: [validContent.questions[0], validContent.questions[0]] };
  for (let depth = 0; depth < 130; depth += 1) deepQuestions = { nested: deepQuestions };
  const deepRoot = structuredClone(baseline);
  deepRoot.alternate = deepQuestions;
  assert.equal(observeRawCandidateCardinalityV6(JSON.stringify(deepRoot)).cardinalityAmbiguous, true);
  const deepContent = structuredClone(baseline);
  ((deepContent.choices as JsonObject[])[0]!.message as JsonObject).content = JSON.stringify(deepQuestions);
  assert.equal(observeRawCandidateCardinalityV6(JSON.stringify(deepContent)).cardinalityAmbiguous, true);
});

test("valid JSON arrays, nested containers, and JSON-string wrappers cannot hide candidate-capable subtrees", () => {
  const envelope = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const question = validContent.questions[0]!;
  const fixtures = [
    { name: "two top-level envelopes", value: [envelope, structuredClone(envelope)], minimum: 2 },
    { name: "mixed array", value: [null, envelope, { questions: [question] }], minimum: 2 },
    { name: "two naked question objects", value: [question, structuredClone(question)], minimum: 2 },
  ] as const;
  for (const fixture of fixtures) {
    const observation = observeRawCandidateCardinalityV6(JSON.stringify(fixture.value));
    assert.equal(observation.cardinalityAmbiguous, true, fixture.name);
    assert.equal(observation.candidateUnitsEffective >= fixture.minimum, true, fixture.name);
    assert.equal(buildRunLedgerSettlementV6([
      billingCharge(JSON.stringify(fixture.value), 1, "STANDARD"),
    ]).globalCandidateQuarantineRequired, true, fixture.name);
  }

  const doubleWrapped = structuredClone(envelope);
  ((doubleWrapped.choices as JsonObject[])[0]!.message as JsonObject).content = JSON.stringify(JSON.stringify({
    questions: [question, structuredClone(question)],
  }));
  const wrappedObservation = observeRawCandidateCardinalityV6(JSON.stringify(doubleWrapped));
  assert.equal(wrappedObservation.cardinalityAmbiguous, true);
  assert.equal(wrappedObservation.candidateUnitsEffective >= 2, true);
});

test("fully observed neutral, empty, direct, nested, and wrapped single-candidate shapes consume one without global quarantine", () => {
  const envelope = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const question = validContent.questions[0]!;
  const rawFixtures = [
    "null null",
    "{} {}",
    JSON.stringify({ questions: [] }),
    JSON.stringify(question),
    JSON.stringify({ nested: { questions: [question] } }),
    JSON.stringify([envelope]),
    JSON.stringify({ data: [envelope] }),
    JSON.stringify(JSON.stringify(envelope)),
    JSON.stringify({ payload: JSON.stringify(envelope) }),
    JSON.stringify(JSON.stringify(JSON.stringify({ questions: [question] }))),
  ];
  for (const raw of rawFixtures) {
    const observation = observeRawCandidateCardinalityV6(raw);
    assert.equal(observation.candidateUnitsEffective, 1, raw.slice(0, 80));
    assert.equal(observation.cardinalityAmbiguous, false, raw.slice(0, 80));
    const settlement = buildRunLedgerSettlementV6([billingCharge(raw, 1, "STANDARD")]);
    assert.equal(settlement.used, 1, raw.slice(0, 80));
    assert.equal(settlement.globalCandidateQuarantineRequired, false, raw.slice(0, 80));
  }
});

test("candidate observer bounds and complete-plus-truncated tails fail closed without quarantining neutral scalars", () => {
  for (const neutral of [null, true, 7, "ordinary text", [], [null, false, 1], { error: "rate limited" }]) {
    const observation = observeRawCandidateCardinalityV6(JSON.stringify(neutral));
    assert.equal(observation.choiceCardinalityShortage, true);
    assert.equal(observation.cardinalityAmbiguous, false, JSON.stringify(neutral));
  }

  const complete = responseRaw("google/gemini-3.5-flash-20260519");
  const tail = `${complete}[${JSON.stringify(complete)},`;
  const tailObservation = observeRawCandidateCardinalityV6(tail);
  assert.equal(tailObservation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV6([
    billingCharge(tail, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);

  const tooManyNodes = JSON.stringify(Array.from({ length: MAX_JSON_NODES_V6 + 1 }, () => 0));
  const nodeBound = observeRawCandidateCardinalityV6(tooManyNodes);
  assert.equal(nodeBound.observationSaturated, true);
  assert.equal(nodeBound.cardinalityAmbiguous, true);

  const byteBound = observeRawCandidateCardinalityV6(JSON.stringify(
    "x".repeat(MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6),
  ));
  assert.equal(byteBound.observationSaturated, true);
  assert.equal(byteBound.cardinalityAmbiguous, true);
});

test("decoded duplicate keys combined with arrays and wrappers always quarantine", () => {
  const envelope = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const choice = JSON.stringify((envelope.choices as JsonObject[])[0]);
  const escapedDuplicate = `[{"choices":[],"\\u0063hoices":[${choice}],"payload":${JSON.stringify(JSON.stringify(envelope))}}]`;
  const observation = observeRawCandidateCardinalityV6(escapedDuplicate);
  assert.equal(observation.duplicateKeys.some((row) => row.key === "choices"), true);
  assert.equal(observation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV6([
    billingCharge(escapedDuplicate, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);
});

test("C1-C2 lineage accounting sums independent branches and traverses typed provider containers", () => {
  const baseline = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const question = structuredClone(validContent.questions[0]!);
  const baselineObservation = observeRawCandidateCardinalityV6(JSON.stringify(baseline));
  assert.deepEqual({
    choices: baselineObservation.choicesObserved,
    questions: baselineObservation.fullQuestionObjectsObserved,
    units: baselineObservation.candidateUnitsEffective,
    ambiguous: baselineObservation.cardinalityAmbiguous,
    saturated: baselineObservation.observationSaturated,
  }, { choices: 1, questions: 1, units: 1, ambiguous: false, saturated: false });

  const garbageEnvelope = structuredClone(baseline);
  (((garbageEnvelope.choices as JsonObject[])[0]!.message as JsonObject).content) = "not-json";
  const independentRaw = JSON.stringify([garbageEnvelope, { questions: [question] }]);
  const independent = observeRawCandidateCardinalityV6(independentRaw);
  assert.deepEqual(
    [independent.choicesObserved, independent.fullQuestionObjectsObserved, independent.candidateUnitsEffective],
    [1, 1, 2],
    "a question outside a provider-choice lineage must not collapse into that choice",
  );
  assert.equal(buildRunLedgerSettlementV6([
    billingCharge(independentRaw, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);

  const typedChoices = structuredClone(baseline);
  typedChoices.choices = JSON.stringify({ questions: [question, structuredClone(question)] });
  const typedQuestions = { questions: { left: question, right: structuredClone(question) } };
  const objectContent = structuredClone(baseline);
  (((objectContent.choices as JsonObject[])[0]!.message as JsonObject).content) = {
    questions: [question, structuredClone(question)],
  };
  const nestedChoices = structuredClone(baseline);
  const originalChoice = (nestedChoices.choices as JsonObject[])[0]!;
  nestedChoices.choices = [[originalChoice, structuredClone(originalChoice)]];

  const typedFixtures = [
    { name: "non-array choices JSON string", raw: JSON.stringify(typedChoices), choices: 1 },
    { name: "non-array questions object map", raw: JSON.stringify(typedQuestions), choices: 0 },
    { name: "non-string message.content object", raw: JSON.stringify(objectContent), choices: 1 },
    { name: "nested provider choices arrays", raw: JSON.stringify(nestedChoices), choices: 2 },
  ] as const;
  for (const fixture of typedFixtures) {
    const observation = observeRawCandidateCardinalityV6(fixture.raw);
    assert.equal(observation.choicesObserved, fixture.choices, fixture.name);
    assert.equal(observation.fullQuestionObjectsObserved, 2, fixture.name);
    assert.equal(observation.candidateUnitsEffective, 2, fixture.name);
    assert.equal(observation.cardinalityAmbiguous, true, fixture.name);
    assert.equal(observation.observationSaturated, false, fixture.name);
  }
});

test("C3 malformed JSON-string wrapper tails retain exact lineage and failed-tail ambiguity through triple wrapping", () => {
  const baseline = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const question = structuredClone(validContent.questions[0]!);
  const wrap = (value: string, layers: number): string => {
    let wrapped = value;
    for (let layer = 0; layer < layers; layer += 1) wrapped = JSON.stringify(wrapped);
    return `${wrapped} trailing-neutral`;
  };
  const withContent = (content: string): string => {
    const envelope = structuredClone(baseline);
    (((envelope.choices as JsonObject[])[0]!.message as JsonObject).content) = content;
    return JSON.stringify(envelope);
  };

  const oneQuestionInner = JSON.stringify({ questions: [question] });
  for (const layers of [1, 2, 3]) {
    const raw = withContent(wrap(oneQuestionInner, layers));
    const observation = observeRawCandidateCardinalityV6(raw);
    assert.equal(observation.candidateUnitsEffective, 1, `one question at wrapper depth ${layers}`);
    assert.equal(observation.fullQuestionObjectsObserved, 1, `one question at wrapper depth ${layers}`);
    assert.equal(observation.cardinalityAmbiguous, true, `failed tail at wrapper depth ${layers}`);
    assert.equal(observation.observationSaturated, false, `one question at wrapper depth ${layers}`);
  }

  const twoQuestionInner = JSON.stringify({ questions: [question, structuredClone(question)] });
  for (const layers of [1, 2, 3]) {
    const raw = withContent(wrap(twoQuestionInner, layers));
    const observation = observeRawCandidateCardinalityV6(raw);
    assert.equal(observation.candidateUnitsEffective, 2, `two questions at wrapper depth ${layers}`);
    assert.equal(observation.fullQuestionObjectsObserved, 2, `two questions at wrapper depth ${layers}`);
    assert.equal(observation.cardinalityAmbiguous, true, `two questions at wrapper depth ${layers}`);
    assert.equal(buildRunLedgerSettlementV6([
      billingCharge(raw, 1, "STANDARD"),
    ]).globalCandidateQuarantineRequired, true, `two questions at wrapper depth ${layers}`);
  }
});

test("C4 duplicate-preserving traversal sees overwritten candidates after evidence cap and partial question roots", () => {
  const baseline = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const question = structuredClone(validContent.questions[0]!);
  const questionJson = JSON.stringify(question);
  const twoQuestionSubtree = `{"questions":[${questionJson},${questionJson}]}`;
  const withContent = (content: string): string => {
    const envelope = structuredClone(baseline);
    (((envelope.choices as JsonObject[])[0]!.message as JsonObject).content) = content;
    return JSON.stringify(envelope);
  };

  const duplicateFixtures = [
    `{"payload":${twoQuestionSubtree},"payload":0}`,
    `{"payload":0,"payload":${twoQuestionSubtree}}`,
    `{"p\\u0061yload":${twoQuestionSubtree},"payload":0}`,
    JSON.stringify(`{"payload":${twoQuestionSubtree},"payload":0}`),
  ];
  for (const content of duplicateFixtures) {
    const observation = observeRawCandidateCardinalityV6(withContent(content));
    assert.equal(observation.fullQuestionObjectsObserved, 2, content.slice(0, 60));
    assert.equal(observation.candidateUnitsEffective, 2, content.slice(0, 60));
    assert.equal(observation.cardinalityAmbiguous, true, content.slice(0, 60));
    assert.equal(observation.observationSaturated, false, content.slice(0, 60));
  }

  const neutralDuplicatePrefix = Array.from({ length: 65 }, (_unused, index) =>
    `"neutral_${index}":0,"neutral_${index}":1,`).join("");
  const afterEvidenceCap = `{${neutralDuplicatePrefix}"questions":[${questionJson}],"\\u0071uestions":[${questionJson},${questionJson}]}`;
  const capped = observeRawCandidateCardinalityV6(withContent(afterEvidenceCap));
  assert.equal(capped.duplicateKeys.length, 64, "diagnostic evidence is capped independently");
  assert.equal(capped.fullQuestionObjectsObserved, 3, "semantic traversal must continue after evidence cap");
  assert.equal(capped.candidateUnitsEffective, 3);
  assert.equal(capped.cardinalityAmbiguous, true);
  assert.equal(capped.observationSaturated, false, "evidence truncation is not semantic saturation");

  const partialQuestion = { options: ["a", "b"], correctAnswer: 1 };
  const partials = observeRawCandidateCardinalityV6(JSON.stringify([
    partialQuestion,
    structuredClone(partialQuestion),
  ]));
  assert.deepEqual(
    [partials.choicesObserved, partials.fullQuestionObjectsObserved, partials.candidateUnitsEffective],
    [0, 2, 2],
  );
  assert.equal(partials.cardinalityAmbiguous, true);
});

test("O1-O3 context and evidence caps do not turn answer choices or neutral markers into candidates", () => {
  const answerChoiceQuestion = {
    direction: "Choose the best answer.",
    choices: ["A", "B", "C", "D", "E"],
    correctAnswer: 1,
  };
  const answerChoices = observeRawCandidateCardinalityV6(JSON.stringify(answerChoiceQuestion));
  assert.deepEqual(
    [answerChoices.choicesObserved, answerChoices.fullQuestionObjectsObserved, answerChoices.candidateUnitsEffective],
    [0, 1, 1],
  );
  assert.equal(answerChoices.cardinalityAmbiguous, false);
  assert.equal(answerChoices.observationSaturated, false);

  const neutralJsonStrings = observeRawCandidateCardinalityV6(JSON.stringify({
    payload: Array.from({ length: 65 }, () => "{}"),
  }));
  assert.equal(neutralJsonStrings.candidateUnitsEffective, 1);
  assert.equal(neutralJsonStrings.cardinalityAmbiguous, false);
  assert.equal(neutralJsonStrings.observationSaturated, false);

  const directionMarkers = observeRawCandidateCardinalityV6(JSON.stringify(
    Array.from({ length: 257 }, () => ({ direction: "neutral single marker" })),
  ));
  assert.equal(directionMarkers.candidateUnitsEffective, 1);
  assert.equal(directionMarkers.fullQuestionObjectsObserved, 0);
  assert.equal(directionMarkers.cardinalityAmbiguous, false);
  assert.equal(directionMarkers.observationSaturated, false);
});

test("fresh audit exact typed-container, truncation, and liveness counterexamples have lineage-safe counts", () => {
  const exact = [
    {
      name: "typed provider choices object map",
      raw: JSON.stringify({
        model: "m",
        choices: {
          a: { index: 0, message: { content: "bad" } },
          b: { index: 1, message: { content: "bad" } },
        },
      }),
      expected: [2, 0, 2, true],
    },
    {
      name: "JSON-string provider choices array",
      raw: JSON.stringify({ model: "m", choices: JSON.stringify([{}, {}]) }),
      expected: [2, 0, 2, true],
    },
    {
      name: "explicit questions object map",
      raw: JSON.stringify({ questions: { left: { id: 1 }, right: { id: 2 } } }),
      expected: [0, 2, 2, true],
    },
    {
      name: "explicit questions malformed strings",
      raw: JSON.stringify({ questions: ["first", "second"] }),
      expected: [0, 2, 2, true],
    },
    {
      name: "complete question then truncated questions key",
      raw: '{"options":["A"],"correctAnswer":1}{"questions":',
      expected: [0, 2, 2, true],
    },
    {
      name: "truncated direct question structural value",
      raw: '{"direction":"x","options":',
      expected: [0, 1, 1, true],
    },
    {
      name: "truncated message content value",
      raw: '{"model":"m","choices":[{"message":{"content":',
      expected: [1, 0, 1, true],
    },
    {
      name: "question metadata is not another naked question",
      raw: JSON.stringify({
        direction: "d",
        options: ["A", "B"],
        correctAnswer: 1,
        metadata: { options: ["x"], difficulty: "HARD" },
      }),
      expected: [0, 1, 1, false],
    },
    {
      name: "top-level answer-choice metadata is not provider output",
      raw: JSON.stringify({ kind: "answer-choice-metadata", choices: ["A", "B", "C", "D", "E"] }),
      expected: [0, 0, 1, false],
    },
    {
      name: "provider sibling evidence establishes malformed choice lineages",
      raw: JSON.stringify({ model: "m", choices: [{}, {}] }),
      expected: [2, 0, 2, true],
    },
    {
      name: "choice element evidence establishes provider lineages",
      raw: JSON.stringify({ choices: [{ index: 0 }, { index: 1 }] }),
      expected: [2, 0, 2, true],
    },
    {
      name: "explicit direct partial question remains one question",
      raw: JSON.stringify({ options: ["x"], difficulty: "HARD" }),
      expected: [0, 1, 1, false],
    },
  ] as const;

  for (const fixture of exact) {
    const observation = observeRawCandidateCardinalityV6(fixture.raw);
    assert.deepEqual(
      [
        observation.choicesObserved,
        observation.fullQuestionObjectsObserved,
        observation.candidateUnitsEffective,
        observation.cardinalityAmbiguous,
      ],
      fixture.expected,
      fixture.name,
    );
    assert.equal(observation.observationSaturated, false, fixture.name);
  }
});

test("fresh audit deterministic 208-shape matrix preserves typed lineage and context separation", () => {
  let checked = 0;
  for (let index = 0; index < 16; index += 1) {
    const count = index % 4;
    const branches = Array.from({ length: count }, (_unused, branch) => ({ slot: `${index}-${branch}` }));
    const branchMap = Object.fromEntries(branches.map((branch, branchIndex) => [`b${branchIndex}`, branch]));
    const providerValues: unknown[] = [
      branches,
      branchMap,
      JSON.stringify(branches),
      JSON.stringify(branchMap),
    ];
    for (const choices of providerValues) {
      const observation = observeRawCandidateCardinalityV6(JSON.stringify({ model: `m${index}`, choices }));
      assert.deepEqual(
        [observation.choicesObserved, observation.fullQuestionObjectsObserved, observation.candidateUnitsEffective],
        [count, 0, Math.max(1, count)],
      );
      assert.equal(observation.cardinalityAmbiguous, count > 1);
      assert.equal(observation.observationSaturated, false);
      checked += 1;
    }
  }

  for (let index = 0; index < 16; index += 1) {
    const count = index % 4;
    const objectQuestions = Array.from({ length: count }, (_unused, question) => ({ id: question + 1 }));
    const stringQuestions = Array.from({ length: count }, (_unused, question) => `q-${question}`);
    const scalarQuestions = Array.from({ length: count }, (_unused, question) => question + 1);
    const questionMap = Object.fromEntries(scalarQuestions.map((value, question) => [`q${question}`, value]));
    const questionValues: unknown[] = [
      objectQuestions,
      stringQuestions,
      scalarQuestions,
      questionMap,
      JSON.stringify(scalarQuestions),
    ];
    for (const questions of questionValues) {
      const observation = observeRawCandidateCardinalityV6(JSON.stringify({ questions }));
      assert.deepEqual(
        [observation.choicesObserved, observation.fullQuestionObjectsObserved, observation.candidateUnitsEffective],
        [0, count, Math.max(1, count)],
      );
      assert.equal(observation.cardinalityAmbiguous, count > 1);
      assert.equal(observation.observationSaturated, false);
      checked += 1;
    }
  }

  for (let index = 0; index < 32; index += 1) {
    const questionWithMetadata = {
      direction: `direction-${index}`,
      options: ["A", "B"],
      correctAnswer: 1,
      metadata: { options: [`meta-${index}`], difficulty: index % 2 === 0 ? "HARD" : "EASY" },
    };
    const questionObservation = observeRawCandidateCardinalityV6(JSON.stringify(questionWithMetadata));
    assert.deepEqual(
      [questionObservation.choicesObserved, questionObservation.fullQuestionObjectsObserved,
        questionObservation.candidateUnitsEffective, questionObservation.cardinalityAmbiguous],
      [0, 1, 1, false],
    );
    checked += 1;

    const answerMetadata = {
      kind: `answer-choice-metadata-${index}`,
      choices: Array.from({ length: (index % 8) + 1 }, (_unused, answer) => `A${answer}`),
    };
    const metadataObservation = observeRawCandidateCardinalityV6(JSON.stringify(answerMetadata));
    assert.deepEqual(
      [metadataObservation.choicesObserved, metadataObservation.fullQuestionObjectsObserved,
        metadataObservation.candidateUnitsEffective, metadataObservation.cardinalityAmbiguous],
      [0, 0, 1, false],
    );
    checked += 1;
  }
  assert.equal(checked, 208);
});

test("successor observer locks all 94 sealed B1/B2 blocker regressions without inventing neutral lineages", () => {
  const questionJson = (seed: number): string => JSON.stringify({
    direction: `choose-${seed}`,
    options: [`a-${seed}`, `b-${seed}`, `c-${seed}`, `d-${seed}`, `e-${seed}`],
    correctAnswer: String((seed % 5) + 1),
    explanation: `because-${seed}`,
  });
  const envelope = (contents: readonly string[]): string => JSON.stringify({
    id: "sealed-successor-regression",
    model: "openrouter/test-model",
    choices: contents.map((content, index) => ({
      index,
      message: { role: "assistant", content },
      finish_reason: "stop",
    })),
  });
  const expectObservation = (
    raw: string,
    expected: readonly [number, number, number, boolean],
    label: string,
  ): void => {
    const observation = observeRawCandidateCardinalityV6(raw);
    assert.deepEqual(
      [
        observation.choicesObserved,
        observation.fullQuestionObjectsObserved,
        observation.candidateUnitsEffective,
        observation.cardinalityAmbiguous,
      ],
      expected,
      label,
    );
    assert.equal(observation.observationSaturated, false, label);
  };

  const provider = envelope(["opaque-single-choice"]);
  const completeNeutralRoots = [
    ["object", "{}"],
    ["array", "[]"],
    ["null", "null"],
    ["number", "0"],
    ["string", '"neutral"'],
    ["boolean", "true"],
    ["metadata-object", '{"trace":1}'],
    ["metadata-array", "[1,2,3]"],
  ] as const;
  const failedNeutralTails = [
    ["open-object", "{"],
    ["open-array", "["],
    ["unterminated-string", '"'],
    ["missing-object-value", '{"trace":'],
    ["missing-array-value", "[0,"],
    ["unterminated-object-string", '{"trace":"unterminated'],
    ["invalid-token", "tru"],
    ["invalid-exponent", "1e"],
    ["trailing-comma", ","],
    ["invalid-escape", '"\\q"'],
  ] as const;
  let sealedFailureRegressions = 0;

  for (const [name, neutral] of completeNeutralRoots) {
    expectObservation(`${provider}\n${neutral}`, [1, 0, 1, true], `B1 provider then ${name}`);
    expectObservation(`${neutral}\t${provider}`, [1, 0, 1, true], `B1 ${name} then provider`);
    sealedFailureRegressions += 2;
  }
  for (const [name, tail] of failedNeutralTails) {
    expectObservation(`${provider} ${tail}`, [1, 0, 1, true], `B1 provider then failed ${name}`);
    sealedFailureRegressions += 1;
  }

  const decodedCompleteVariants = ["{}", "[]", "null", "0", '"neutral"', '{"trace":1}'];
  for (let index = 0; index < decodedCompleteVariants.length; index += 1) {
    const neutral = decodedCompleteVariants[index]!;
    const question = questionJson(10_000 + index);
    expectObservation(envelope([`${question} ${neutral}`]), [1, 1, 1, true], `B1 decoded q-neutral ${index}`);
    expectObservation(envelope([`${neutral} ${question}`]), [1, 1, 1, true], `B1 decoded neutral-q ${index}`);
    expectObservation(envelope([`{} ${neutral}`]), [1, 0, 1, true], `B1 decoded neutral-neutral ${index}`);
    sealedFailureRegressions += 3;
  }
  for (let index = 0; index < 8; index += 1) {
    expectObservation(
      envelope([`${questionJson(10_100 + index)} ${failedNeutralTails[index]![1]}`]),
      [1, 1, 1, true],
      `B1 decoded failed tail ${index}`,
    );
    sealedFailureRegressions += 1;
  }

  const invalidAffixes = [
    ["null", "null "],
    ["true", "true "],
    ["zero", "0 "],
    ["bom", "\ufeff"],
    ["code-fence", "```json\n"],
    ["prose", "Here is: "],
    ["comma", ", "],
    ["colon", ": "],
  ] as const;
  for (let index = 0; index < invalidAffixes.length; index += 1) {
    const [name, affix] = invalidAffixes[index]!;
    const first = questionJson(10_200 + index * 2);
    const second = questionJson(10_201 + index * 2);
    expectObservation(envelope([`${affix}${first}`]), [1, 1, 1, true], `B2 decoded prefix ${name} q1`);
    expectObservation(envelope([`${affix}${first} ${second}`]), [1, 2, 2, true], `B2 decoded prefix ${name} q2`);
    expectObservation(envelope([`${first} ${affix}`]), [1, 1, 1, true], `B2 decoded suffix ${name}`);
    expectObservation(`${affix}${provider}`, [1, 0, 1, true], `B2 raw prefix ${name} q1`);
    sealedFailureRegressions += 4;

    const twoChoiceEnvelope = envelope([`opaque-a-${index}`, `opaque-b-${index}`]);
    if (index >= 3) {
      expectObservation(`${affix}${twoChoiceEnvelope}`, [2, 0, 2, true], `B2 raw prefix ${name} choices2`);
      expectObservation(`${affix}${provider} ${provider}`, [2, 0, 2, true], `B2 raw prefix ${name} roots2`);
      sealedFailureRegressions += 2;
    } else {
      // These six scalar-prefix shapes already passed the sealed predecessor
      // and remain explicit controls without inflating the 94 blocker count.
      expectObservation(`${affix}${twoChoiceEnvelope}`, [2, 0, 2, true], `B2 prior-pass ${name} choices2`);
      expectObservation(`${affix}${provider} ${provider}`, [2, 0, 2, true], `B2 prior-pass ${name} roots2`);
    }
  }
  assert.equal(sealedFailureRegressions, 94);

  for (const [name, neutral] of completeNeutralRoots.slice(0, 6)) {
    expectObservation(`{} ${neutral}`, [0, 0, 1, false], `neutral complete control ${name}`);
  }
  for (const [name, tail] of failedNeutralTails.slice(0, 6)) {
    expectObservation(`{} ${tail}`, [0, 0, 1, false], `neutral failed control ${name}`);
  }
  expectObservation(`${provider}\n \t`, [1, 0, 1, false], "whitespace is not a second root");
});

test("successor recovery covers 480 deterministic affix, wrapper, and multiplicity shapes", () => {
  const questionJson = (seed: number): string => JSON.stringify({
    direction: `deterministic-${seed}`,
    options: ["A", "B", "C", "D", "E"],
    correctAnswer: String((seed % 5) + 1),
    explanation: `deterministic-explanation-${seed}`,
  });
  const envelope = (contents: readonly string[]): string => JSON.stringify({
    model: "openrouter/deterministic",
    choices: contents.map((content, index) => ({ index, message: { content } })),
  });
  const affixes = [
    "\ufeff", "```json\n", "Here is the JSON:\n", ", ", ": ", "@@@ ",
    "<response> ", "\u0000", "tru ", "1e ", "false? ", "// result\n",
  ] as const;
  let checked = 0;
  for (let affixIndex = 0; affixIndex < affixes.length; affixIndex += 1) {
    const affix = affixes[affixIndex]!;
    for (let seedOffset = 0; seedOffset < 8; seedOffset += 1) {
      const first = questionJson(20_000 + affixIndex * 20 + seedOffset * 2);
      const second = questionJson(20_001 + affixIndex * 20 + seedOffset * 2);
      let wrapped = first;
      const wrapperLayers = (seedOffset % 4) + 1;
      for (let layer = 0; layer < wrapperLayers; layer += 1) wrapped = JSON.stringify(wrapped);
      const fixtures = [
        { raw: `${affix}${envelope(["opaque"])}`, expected: [1, 0, 1, true] },
        { raw: envelope([`${affix}${first}`]), expected: [1, 1, 1, true] },
        { raw: envelope([`${affix}${first} ${second}`]), expected: [1, 2, 2, true] },
        { raw: envelope([`${first} ${affix}`]), expected: [1, 1, 1, true] },
        { raw: envelope([`${affix}${wrapped}`]), expected: [1, 1, 1, true] },
      ] as const;
      for (const [fixtureIndex, fixture] of fixtures.entries()) {
        const observation = observeRawCandidateCardinalityV6(fixture.raw);
        assert.deepEqual(
          [
            observation.choicesObserved,
            observation.fullQuestionObjectsObserved,
            observation.candidateUnitsEffective,
            observation.cardinalityAmbiguous,
          ],
          fixture.expected,
          `affix=${affixIndex} seed=${seedOffset} fixture=${fixtureIndex} layers=${wrapperLayers}`,
        );
        assert.equal(observation.observationSaturated, false);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 480);
});

test("successor recovery stays scoped away from semantic leaf prose and metadata", () => {
  const directQuestion = {
    direction: "semantic leaf liveness",
    options: ["Use {x}", "[see note]", "```json", '"quoted JSON"', "plain"],
    correctAnswer: "1",
    explanation: '{"trace":1} {"trace":2}',
    keyPoints: [
      "Use {x} in prose",
      "[see note]",
      "```json\n{not candidate output}",
      '{"trace":"quoted neutral JSON"}',
    ],
    metadata: {
      content: "Here is: {ordinary metadata}",
      nested: { text: "```json\n{still metadata}" },
    },
  };
  const direct = observeRawCandidateCardinalityV6(JSON.stringify(directQuestion));
  assert.deepEqual(
    [direct.choicesObserved, direct.fullQuestionObjectsObserved, direct.candidateUnitsEffective,
      direct.cardinalityAmbiguous, direct.observationSaturated],
    [0, 1, 1, false, false],
  );

  const questionJson = JSON.stringify({
    direction: "provider content",
    options: ["A", "B"],
    correctAnswer: "1",
    explanation: "one",
  });
  const provider = {
    model: "openrouter/liveness",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: questionJson,
        annotation: "[see note]",
        metadata: { content: "Here is: {ordinary nested content metadata}" },
      },
      logprobs: {
        content: ["Use {x}", "```json\n{ordinary diagnostics}", '{"trace":1} {"trace":2}'],
      },
    }],
  };
  const providerObservation = observeRawCandidateCardinalityV6(JSON.stringify(provider));
  assert.deepEqual(
    [providerObservation.choicesObserved, providerObservation.fullQuestionObjectsObserved,
      providerObservation.candidateUnitsEffective, providerObservation.cardinalityAmbiguous,
      providerObservation.observationSaturated],
    [1, 1, 1, false, false],
  );

  provider.choices[0]!.message.content = `Here is: ${questionJson}`;
  const explicitOutputBoundary = observeRawCandidateCardinalityV6(JSON.stringify(provider));
  assert.deepEqual(
    [explicitOutputBoundary.choicesObserved, explicitOutputBoundary.fullQuestionObjectsObserved,
      explicitOutputBoundary.candidateUnitsEffective, explicitOutputBoundary.cardinalityAmbiguous,
      explicitOutputBoundary.observationSaturated],
    [1, 1, 1, true, false],
  );
});

test("successor recovery attempt boundary is monotonic, capped, and fail-closed", () => {
  const provider = JSON.stringify({
    model: "openrouter/recovery-bound",
    choices: [{ index: 0, message: { content: "opaque" } }],
  });
  const belowCap = `@${"{x".repeat(MAX_JSON_RECOVERY_ATTEMPTS_V6 - 1)}${provider}`;
  const below = observeRawCandidateCardinalityV6(belowCap);
  assert.deepEqual(
    [below.choicesObserved, below.fullQuestionObjectsObserved, below.candidateUnitsEffective,
      below.cardinalityAmbiguous, below.observationSaturated],
    [1, 0, 1, true, false],
  );

  const atCapBeforeProvider = `@${"{x".repeat(MAX_JSON_RECOVERY_ATTEMPTS_V6)}${provider}`;
  const capped = observeRawCandidateCardinalityV6(atCapBeforeProvider);
  assert.deepEqual(
    [capped.choicesObserved, capped.fullQuestionObjectsObserved, capped.candidateUnitsEffective,
      capped.cardinalityAmbiguous, capped.observationSaturated],
    [0, 0, 1, true, true],
  );

  const oneRecoveredEnvelopeWithNestedBraces = `garbage ${JSON.stringify({
    model: "openrouter/no-double-count",
    choices: [{ index: 0, message: { content: "{neutral { braces }}" } }],
    metadata: { nested: { left: {}, right: [{}, {}] } },
  })}`;
  const noDoubleCount = observeRawCandidateCardinalityV6(oneRecoveredEnvelopeWithNestedBraces);
  assert.deepEqual(
    [noDoubleCount.choicesObserved, noDoubleCount.fullQuestionObjectsObserved,
      noDoubleCount.candidateUnitsEffective, noDoubleCount.cardinalityAmbiguous,
      noDoubleCount.observationSaturated],
    [1, 0, 1, true, false],
  );

  const providerAtFailureToken = observeRawCandidateCardinalityV6(
    `garbage {"trace":1 ${provider}}`,
  );
  assert.deepEqual(
    [providerAtFailureToken.choicesObserved, providerAtFailureToken.fullQuestionObjectsObserved,
      providerAtFailureToken.candidateUnitsEffective, providerAtFailureToken.cardinalityAmbiguous,
      providerAtFailureToken.observationSaturated],
    [1, 0, 1, true, false],
  );

  const question = JSON.stringify({
    direction: "candidate at failed separator",
    options: ["A", "B"],
    correctAnswer: "1",
    explanation: "one",
  });
  const decodedAtFailureToken = observeRawCandidateCardinalityV6(JSON.stringify({
    model: "openrouter/recovery-bound",
    choices: [{ index: 0, message: { content: `{"trace":1 ${question}}` } }],
  }));
  assert.deepEqual(
    [decodedAtFailureToken.choicesObserved, decodedAtFailureToken.fullQuestionObjectsObserved,
      decodedAtFailureToken.candidateUnitsEffective, decodedAtFailureToken.cardinalityAmbiguous,
      decodedAtFailureToken.observationSaturated],
    [1, 1, 1, true, false],
  );

  const providerAcrossInvalidGap = observeRawCandidateCardinalityV6(
    `${provider} opaque-gap ${provider}`,
  );
  assert.deepEqual(
    [providerAcrossInvalidGap.choicesObserved, providerAcrossInvalidGap.fullQuestionObjectsObserved,
      providerAcrossInvalidGap.candidateUnitsEffective, providerAcrossInvalidGap.cardinalityAmbiguous,
      providerAcrossInvalidGap.observationSaturated],
    [2, 0, 2, true, false],
  );

  const questionsAcrossInvalidGap = observeRawCandidateCardinalityV6(JSON.stringify({
    model: "openrouter/recovery-bound",
    choices: [{ index: 0, message: { content: `${question} opaque-gap ${question}` } }],
  }));
  assert.deepEqual(
    [questionsAcrossInvalidGap.choicesObserved, questionsAcrossInvalidGap.fullQuestionObjectsObserved,
      questionsAcrossInvalidGap.candidateUnitsEffective, questionsAcrossInvalidGap.cardinalityAmbiguous,
      questionsAcrossInvalidGap.observationSaturated],
    [1, 2, 2, true, false],
  );

  const neutralAcrossInvalidGap = observeRawCandidateCardinalityV6("{} opaque-gap []");
  assert.deepEqual(
    [neutralAcrossInvalidGap.choicesObserved, neutralAcrossInvalidGap.fullQuestionObjectsObserved,
      neutralAcrossInvalidGap.candidateUnitsEffective, neutralAcrossInvalidGap.cardinalityAmbiguous,
      neutralAcrossInvalidGap.observationSaturated],
    [0, 0, 1, false, false],
  );
});

test("v2 independent fresh 456 cases are locally locked with the 461-case predecessor contract", () => {
  const question = (seed: number): Record<string, unknown> => ({
    direction: `choose-${seed}`,
    options: [`a-${seed}`, `b-${seed}`, `c-${seed}`, `d-${seed}`, `e-${seed}`],
    correctAnswer: String((seed % 5) + 1),
    explanation: `because-${seed}`,
  });
  const questionJson = (seed: number): string => JSON.stringify(question(seed));
  const envelope = (contents: readonly string[]): string => JSON.stringify({
    id: "generation-independent-audit",
    model: "google/gemini-audit",
    provider: "Google",
    choices: contents.map((content, index) => ({
      index,
      message: { role: "assistant", content },
      finish_reason: "stop",
    })),
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost: 0.001 },
  });
  const exact = (
    raw: string,
    expected: readonly [number, number, number, boolean, boolean?],
    label: string,
  ): void => {
    const [choices, questions, units, ambiguous, saturated = false] = expected;
    const observed = observeRawCandidateCardinalityV6(raw);
    assert.deepEqual(
      [
        observed.choicesObserved,
        observed.fullQuestionObjectsObserved,
        observed.candidateUnitsEffective,
        observed.choiceCardinalityDrift,
        observed.choiceCardinalityShortage,
        observed.choiceCardinalityExcess,
        observed.cardinalityAmbiguous,
        observed.observationSaturated,
      ],
      [choices, questions, units, choices !== 1, choices < 1, choices > 1, ambiguous, saturated],
      label,
    );
  };
  const safe = (raw: string, label: string): void => {
    assert.equal(observeRawCandidateCardinalityV6(raw).cardinalityAmbiguous, true, label);
  };
  let checked = 0;

  const invalidGaps = [
    ["bom", "\ufeff"], ["fence", "~~~json\n"], ["prose", "candidate follows => "],
    ["comma", ","], ["colon", ":"], ["nul", String.fromCharCode(0)],
    ["unit-separator", String.fromCharCode(0x1f)], ["anti-xssi", ")]}',\n"],
    ["html-open", "<pre>"], ["html-comment", "<!--transport-->"], ["assignment", "payload="],
    ["lone-surrogate", String.fromCharCode(0xd800)], ["short-true", "tru "],
    ["bad-exponent", "1e "], ["bad-escape", '"\\q" '], ["partial-error-object", '{"error":'],
  ] as const;
  const oneProvider = envelope(["fresh-one"]);
  const twoProvider = envelope(["fresh-a", "fresh-b"]);
  for (const [name, gap] of invalidGaps) {
    exact(gap + oneProvider, [1, 0, 1, true], `v2 raw prefix one ${name}`);
    exact(gap + twoProvider, [2, 0, 2, true], `v2 raw prefix two ${name}`);
    exact(oneProvider + gap + oneProvider, [2, 0, 2, true], `v2 raw middle ${name}`);
    exact(oneProvider + gap, [1, 0, 1, true], `v2 raw suffix ${name}`);
    const first = questionJson(2_000 + checked);
    const second = questionJson(2_001 + checked);
    exact(envelope([gap + first]), [1, 1, 1, true], `v2 decoded prefix ${name}`);
    exact(envelope([first + gap + second]), [1, 2, 2, true], `v2 decoded middle ${name}`);
    exact(envelope([first + gap]), [1, 1, 1, true], `v2 decoded suffix ${name}`);
    checked += 7;
  }

  const decodedPrefixes = [
    ["spaces", "  "], ["tabs", "\t\r\n"], ["bom", "\ufeff"], ["space-bom", " \ufeff"],
    ["bom-space", "\ufeff  "], ["zwsp", "\u200b"], ["nbsp", "\u00a0"],
    ["fence", "```json\n"], ["prose", "result:\n"], ["comma", ","], ["colon", ":"],
  ] as const;
  const twoQuestions = questionJson(3_001) + " " + questionJson(3_002);
  for (const [name, prefix] of decodedPrefixes) {
    safe("!" + JSON.stringify(prefix + twoProvider), `v2 quoted provider ${name}`);
    safe("!" + JSON.stringify(prefix + twoQuestions), `v2 quoted questions ${name}`);
    safe(JSON.stringify(prefix + twoProvider), `v2 top quoted provider ${name}`);
    safe(envelope([JSON.stringify(prefix + twoQuestions)]), `v2 content quoted questions ${name}`);
    checked += 4;
  }
  for (let depth = 1; depth <= 20; depth += 1) {
    let nested = (depth % 2 === 0 ? "\ufeff" : "  ") + questionJson(3_100 + depth);
    for (let layer = 0; layer < depth; layer += 1) nested = JSON.stringify(nested);
    safe("!" + nested, `v2 nested quoted wrapper ${depth}`);
    checked += 1;
  }

  const swallowedPayloads = [
    ["one-provider", oneProvider], ["two-choice-provider", twoProvider],
    ["two-provider-roots", oneProvider + " " + oneProvider], ["two-questions", twoQuestions],
    ["question-provider", questionJson(3_500) + " " + oneProvider],
  ] as const;
  const swallowPrefixes = [
    "transport ", "prefix: ", "\ufeff", "```json ", "xxxxxxxxxxxxxxxxx",
    "emoji-rocket ", "slashes-\\\\ ", "quoted-' ", "math-[x] ", "line1\nline2 ",
  ] as const;
  for (const [payloadName, payload] of swallowedPayloads) {
    for (let index = 0; index < swallowPrefixes.length; index += 1) {
      const prefix = swallowPrefixes[index]!;
      safe(JSON.stringify(prefix + payload).slice(0, -1), `v2 unterminated ${payloadName} ${index}`);
      safe(
        '"bad\\q ' + JSON.stringify(prefix).slice(1, -1) + JSON.stringify(payload).slice(1, -1),
        `v2 invalid escape ${payloadName} ${index}`,
      );
      checked += 2;
    }
  }
  for (let index = 0; index < 20; index += 1) {
    exact('"bad\\q ' + twoProvider, [2, 0, 2, true], `v2 unescaped provider ${index}`);
    checked += 1;
  }

  for (let index = 0; index < 25; index += 1) {
    const semanticQuestion = {
      ...question(4_000 + index),
      explanation: "Set {x:[x>0]}, code [a,b], math f(x)={x^2}, quoted " +
        JSON.stringify({ trace: index }),
      keyPoints: ["braces { are prose }", "array [1,2,3]", JSON.stringify(question(4_500 + index))],
      metadata: {
        options: ["rubric-A"], choices: ["label-A", "label-B"], difficulty: "HARD",
        quotedJson: JSON.stringify(question(4_600 + index)),
      },
      wrongOptionExplanations: { A: JSON.stringify(question(4_700 + index)) },
    };
    exact(JSON.stringify(semanticQuestion), [0, 1, 1, false], `v2 semantic question ${index}`);
    exact(envelope([JSON.stringify(semanticQuestion)]), [1, 1, 1, false], `v2 semantic provider ${index}`);
    checked += 2;
  }
  const neutralBodies = [
    JSON.stringify({ error: { message: "rate limited", type: "upstream_error", code: 429 } }),
    JSON.stringify({ status: 503, detail: "temporarily unavailable", request_id: "r-1" }),
    JSON.stringify({ cfRay: "abc", success: false, errors: [{ code: 1000, message: "edge" }] }),
    "<!doctype html><html><body>502 Bad Gateway</body></html>",
    '<html><script>window.trace={"ray":"abc","retry":true}</script></html>',
    "upstream connect error or disconnect/reset before headers",
    "\ufeff<!DOCTYPE html><title>Cloudflare</title>",
    ")]}',\n{\"error\":{\"message\":\"denied\"}}",
  ] as const;
  for (let index = 0; index < 32; index += 1) {
    exact(neutralBodies[index % neutralBodies.length]!, [0, 0, 1, false], `v2 neutral body ${index}`);
    checked += 1;
  }
  for (let index = 0; index < 24; index += 1) {
    exact(JSON.stringify({
      kind: "trace-fragment",
      content: "not model output: " + questionJson(5_000 + index),
      note: "{braces} [brackets]",
    }), [0, 0, 1, false], `v2 arbitrary content ${index}`);
    checked += 1;
  }

  const carrierPrefixes = ["\ufeff", "```json\n", "answer: ", ",", ":", String.fromCharCode(0)] as const;
  for (let index = 0; index < 12; index += 1) {
    const count = (index % 4) + 1;
    const choiceMap = Object.fromEntries(Array.from({ length: count }, (_, slot) => [
      `slot-${slot}`,
      {
        index: slot,
        delta: { content: slot % 2 === 0 ? questionJson(5_500 + slot) : `opaque-${slot}` },
        finish_reason: slot === count - 1 ? "stop" : null,
      },
    ]));
    exact(JSON.stringify({ provider: "Google", model: "m", choices: choiceMap }),
      [count, Math.ceil(count / 2), count, count > 1], `v2 typed choices ${index}`);
    const questionMap = Object.fromEntries(Array.from({ length: count }, (_, slot) => [
      `q-${slot}`, slot % 2 === 0 ? question(5_700 + slot) : `malformed-${slot}`,
    ]));
    exact(JSON.stringify({ questions: JSON.stringify(questionMap) }),
      [0, count, count, count > 1], `v2 typed questions ${index}`);
    const prefix = carrierPrefixes[index % carrierPrefixes.length]!;
    exact(JSON.stringify({ message: { role: "assistant", content: prefix + twoQuestions } }),
      [0, 2, 2, true], `v2 message carrier ${index}`);
    exact(JSON.stringify({ delta: { content: prefix + twoQuestions } }),
      [0, 2, 2, true], `v2 delta carrier ${index}`);
    checked += 4;
  }

  const invalidRoot = "{x";
  exact("!" + invalidRoot.repeat(4_096), [0, 0, 1, false], "v2 exact 4096 neutral");
  exact("!" + invalidRoot.repeat(4_097), [0, 0, 1, true, true], "v2 plus-one neutral");
  exact("!" + invalidRoot.repeat(4_095) + oneProvider, [1, 0, 1, true], "v2 attempt 4096 provider");
  exact("!" + invalidRoot.repeat(4_096) + oneProvider, [0, 0, 1, true, true], "v2 provider beyond cap");
  const exactLongPrefix = "x".repeat(
    MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6 - Buffer.byteLength(oneProvider, "utf8"),
  );
  exact(exactLongPrefix + oneProvider, [1, 0, 1, true], "v2 exact byte cap");
  exact("x" + exactLongPrefix + oneProvider, [0, 0, 1, true, true], "v2 byte cap plus one");
  checked += 6;

  assert.equal(checked, 456);
  assert.equal(461 + checked, 917);
});

test("successor v3 adds 256 malformed escape, unicode-key, surrogate, and nested-wrapper cases", () => {
  const questionJson = (seed: number): string => JSON.stringify({
    direction: `successor-${seed}`,
    options: ["A", "B", "C", "D", "E"],
    correctAnswer: String((seed % 5) + 1),
    explanation: `successor-explanation-${seed}`,
  });
  const envelope = (contents: readonly string[]): string => JSON.stringify({
    id: "successor-v3",
    model: "google/gemini-successor",
    provider: "Google",
    choices: contents.map((content, index) => ({
      index,
      message: { role: "assistant", content },
      finish_reason: "stop",
    })),
  });
  const oneProvider = envelope(["opaque"]);
  const twoProvider = envelope(["left", "right"]);
  const twoQuestions = questionJson(60_001) + " " + questionJson(60_002);
  const payloads = [
    oneProvider,
    twoProvider,
    oneProvider + " " + oneProvider,
    twoQuestions,
    questionJson(60_003) + " " + oneProvider,
  ] as const;
  const malformedLexemes = [
    "\\q ", "\\x ", "\\8 ", "\\u12 ", "\\uZZZZ ", "\\uD83 ",
    `${String.fromCharCode(0x1f)}control `, `\\${String.fromCharCode(0x0a)}line `,
  ] as const;
  const safe = (raw: string, label: string): void => {
    const observed = observeRawCandidateCardinalityV6(raw);
    assert.equal(observed.cardinalityAmbiguous, true, label);
    assert.equal(observed.observationSaturated, false, label);
  };
  let checked = 0;
  for (let escapeIndex = 0; escapeIndex < malformedLexemes.length; escapeIndex += 1) {
    for (let payloadIndex = 0; payloadIndex < payloads.length; payloadIndex += 1) {
      const payload = payloads[payloadIndex]!;
      const malformed = `"bad-${escapeIndex}-${malformedLexemes[escapeIndex]}` +
        JSON.stringify(payload).slice(1, -1);
      safe(malformed, `malformed raw ${escapeIndex}/${payloadIndex}`);
      safe(`!${malformed}`, `malformed recovered raw ${escapeIndex}/${payloadIndex}`);
      safe(envelope([malformed]), `malformed message.content ${escapeIndex}/${payloadIndex}`);
      safe(JSON.stringify({ delta: { content: malformed } }), `malformed delta.content ${escapeIndex}/${payloadIndex}`);
      checked += 4;
    }
  }
  assert.equal(checked, 160);

  const unicodeEncodeKeys = (json: string): string => json.replace(
    /"([^"\\]+)"(?=\s*:)/gu,
    (_match, key: string) => `"${[...key].map((character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")}"`,
  );
  const wrapperPrefixes = [
    "  ", "\ufeff", "result: ", "```json\n", ",", ":", "\u200b", "\u00a0",
  ] as const;
  const encodedPayloads = [
    unicodeEncodeKeys(twoProvider),
    unicodeEncodeKeys(twoQuestions),
    unicodeEncodeKeys(questionJson(60_004) + " " + oneProvider),
    unicodeEncodeKeys(JSON.stringify({ questions: [JSON.parse(questionJson(60_005)), JSON.parse(questionJson(60_006))] })),
  ] as const;
  for (let prefixIndex = 0; prefixIndex < wrapperPrefixes.length; prefixIndex += 1) {
    for (let payloadIndex = 0; payloadIndex < encodedPayloads.length; payloadIndex += 1) {
      for (let depth = 1; depth <= 3; depth += 1) {
        let wrapped = wrapperPrefixes[prefixIndex]! + encodedPayloads[payloadIndex]!;
        for (let layer = 0; layer < depth; layer += 1) wrapped = JSON.stringify(wrapped);
        safe(`!${wrapped}`, `unicode wrapper prefix=${prefixIndex} payload=${payloadIndex} depth=${depth}`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 256);
});

test("successor v3 quote storms and exact malformed-string bounds remain linear and fail closed", () => {
  const neutralQuotedStorm = "!" + '"neutral" '.repeat(12_000);
  const neutralQuoted = observeRawCandidateCardinalityV6(neutralQuotedStorm);
  assert.deepEqual(
    [neutralQuoted.choicesObserved, neutralQuoted.fullQuestionObjectsObserved,
      neutralQuoted.cardinalityAmbiguous, neutralQuoted.observationSaturated],
    [0, 0, false, false],
  );

  const htmlQuoteStorm = "<html " + 'data-x="neutral" '.repeat(12_000) + ">502</html>";
  const html = observeRawCandidateCardinalityV6(htmlQuoteStorm);
  assert.deepEqual(
    [html.choicesObserved, html.fullQuestionObjectsObserved, html.cardinalityAmbiguous,
      html.observationSaturated],
    [0, 0, false, false],
  );

  const malformedNeutralAtCap = `"${"x".repeat(MAX_RAW_CANDIDATE_OBSERVATION_BYTES_V6 - 1)}`;
  const exactNeutral = observeRawCandidateCardinalityV6(malformedNeutralAtCap);
  assert.deepEqual(
    [exactNeutral.choicesObserved, exactNeutral.fullQuestionObjectsObserved,
      exactNeutral.cardinalityAmbiguous, exactNeutral.observationSaturated],
    [0, 0, false, false],
  );
  const plusOneNeutral = observeRawCandidateCardinalityV6(`${malformedNeutralAtCap}x`);
  assert.deepEqual(
    [plusOneNeutral.choicesObserved, plusOneNeutral.fullQuestionObjectsObserved,
      plusOneNeutral.cardinalityAmbiguous, plusOneNeutral.observationSaturated],
    [0, 0, true, true],
  );

  const malformedNeutralRoot = '"\\q" ';
  const exactAttemptStorm = `!${malformedNeutralRoot.repeat(MAX_JSON_RECOVERY_ATTEMPTS_V6)}`;
  const exactAttempts = observeRawCandidateCardinalityV6(exactAttemptStorm);
  assert.equal(exactAttempts.observationSaturated, false);
  assert.equal(exactAttempts.cardinalityAmbiguous, false);
  const plusOneAttemptStorm = `!${malformedNeutralRoot.repeat(MAX_JSON_RECOVERY_ATTEMPTS_V6 + 1)}`;
  const plusOneAttempts = observeRawCandidateCardinalityV6(plusOneAttemptStorm);
  // Invalid-escape strings are malformed recovery roots, so the 4,097th one
  // must fail closed. Complete neutral strings own the distinct skip-without-
  // attempts contract exercised by the structural quote-storm matrices.
  assert.equal(plusOneAttempts.observationSaturated, true);
  assert.equal(plusOneAttempts.cardinalityAmbiguous, true);

  const encodedNeutralError = JSON.stringify(
    JSON.stringify({ error: { message: "rate limited", code: 429 }, choicesAvailable: false }),
  ).slice(0, -1);
  const neutralError = observeRawCandidateCardinalityV6(encodedNeutralError);
  assert.deepEqual(
    [neutralError.choicesObserved, neutralError.fullQuestionObjectsObserved,
      neutralError.cardinalityAmbiguous, neutralError.observationSaturated],
    [0, 0, false, false],
  );

  const semanticLeaf = {
    direction: "quote-storm liveness",
    options: ["A", "B"],
    correctAnswer: "1",
    explanation: '"neutral" '.repeat(4_096) + " prose {x:[1,2]}",
    keyPoints: ["\\q", "\\u12", "\ud83d", "\ude80", "```json {trace}"],
    metadata: { content: '"quoted" '.repeat(4_096), message: "not a provider carrier" },
  };
  const leaf = observeRawCandidateCardinalityV6(JSON.stringify(semanticLeaf));
  assert.deepEqual(
    [leaf.choicesObserved, leaf.fullQuestionObjectsObserved, leaf.candidateUnitsEffective,
      leaf.cardinalityAmbiguous, leaf.observationSaturated],
    [0, 1, 1, false, false],
  );
});

test("v3 replacement successor locks 692 span-aware quote-boundary cases", () => {
  const question = (seed: number): Record<string, unknown> => ({
    direction: `span-aware-${seed}`,
    options: [`a-${seed}`, `b-${seed}`, `c-${seed}`, `d-${seed}`, `e-${seed}`],
    correctAnswer: String((seed % 5) + 1),
    explanation: `span-aware-explanation-${seed}`,
  });
  const questionJson = (seed: number): string => JSON.stringify(question(seed));
  const envelope = (contents: readonly string[]): string => JSON.stringify({
    id: "span-aware-successor",
    model: "google/gemini-span-aware",
    provider: "Google",
    choices: contents.map((content, index) => ({
      index,
      message: { role: "assistant", content },
      finish_reason: "stop",
    })),
  });
  const exact = (
    raw: string,
    expected: readonly [number, number, number, boolean],
    label: string,
  ): void => {
    const observed = observeRawCandidateCardinalityV6(raw);
    assert.deepEqual(
      [
        observed.choicesObserved,
        observed.fullQuestionObjectsObserved,
        observed.candidateUnitsEffective,
        observed.cardinalityAmbiguous,
        observed.observationSaturated,
      ],
      [...expected, false],
      label,
    );
  };

  const oneProvider = envelope(["opaque"]);
  const twoChoiceProvider = envelope(["left", "right"]);
  const twoQuestions = `${questionJson(70_001)} ${questionJson(70_002)}`;
  const questionsContainer = JSON.stringify({
    questions: [question(70_003), question(70_004)],
  });
  const payloads = [
    {
      name: "two-provider-choices",
      decoded: twoChoiceProvider,
      raw: twoChoiceProvider,
      expected: [2, 0, 2, true] as const,
    },
    {
      name: "two-provider-roots",
      decoded: `${oneProvider} ${oneProvider}`,
      raw: `${oneProvider} ${oneProvider}`,
      expected: [2, 0, 2, true] as const,
    },
    {
      name: "two-question-roots",
      decoded: twoQuestions,
      raw: twoQuestions,
      expected: [0, 2, 2, true] as const,
    },
    {
      name: "questions-container",
      decoded: questionsContainer,
      raw: questionsContainer,
      expected: [0, 2, 2, true] as const,
    },
  ] as const;
  let checked = 0;

  // An odd raw backslash run has no string semantics until an opening quote
  // has been positively established. Each of these roots is a complete JSON
  // string whose decoded payload contains affirmative candidate multiplicity.
  const rawPrefixes = [
    "raw-prefix!", "transport=>", "opaque|", "answer-follows:",
    "garbage~", "###", "\ufeffnoise:", "결과:",
    "préfixe:", "trace@", "payload=", "model-output:",
    "candidate;", "edge-proxy:", "status?", "decode#",
  ] as const;
  const oddSlashRuns = [1, 3, 5, 7, 9, 11, 13, 15] as const;
  for (let prefixIndex = 0; prefixIndex < rawPrefixes.length; prefixIndex += 1) {
    for (const slashCount of oddSlashRuns) {
      for (const payload of payloads) {
        exact(
          `${rawPrefixes[prefixIndex]}${"\\".repeat(slashCount)}${JSON.stringify(payload.decoded)}`,
          payload.expected,
          `odd raw slash prefix=${prefixIndex} slashes=${slashCount} payload=${payload.name}`,
        );
        checked += 1;
      }
    }
  }
  assert.equal(checked, 512);

  // A malformed string owns its real closing quote. Recovery must suppress
  // only that proven span and resume at a later independent quoted root.
  const malformedLexemes = [
    "\\q", "\\x", "\\8", "\\u12", "\\uZZZZ", "\\uD83",
    `\\${String.fromCharCode(0x0a)}`,
    String.fromCharCode(0x1f),
  ] as const;
  const decodedPrefixes = ["", "result=> ", "\ufeff", "```json\n"] as const;
  for (let malformedIndex = 0; malformedIndex < malformedLexemes.length; malformedIndex += 1) {
    for (let prefixIndex = 0; prefixIndex < decodedPrefixes.length; prefixIndex += 1) {
      for (const payload of payloads) {
        exact(
          `"bad-${malformedIndex}${malformedLexemes[malformedIndex]}" ` +
            JSON.stringify(decodedPrefixes[prefixIndex] + payload.decoded),
          payload.expected,
          `closed malformed=${malformedIndex} prefix=${prefixIndex} payload=${payload.name}`,
        );
        checked += 1;
      }
    }
  }
  assert.equal(checked, 640);

  // Complete neutral strings may contain raw braces and brackets. They are
  // scanned and skipped as whole tokens, leaving the later candidate root
  // reachable without consuming the 4,096 recovery-attempt allowance.
  const neutralStormTokens = [
    "neutral prose {} []",
    "math {x:[1,2,3]} remains prose",
    'escaped quote "trace" with {box} and [list]',
    "한국어 중립 문장 {표현} [보기]",
  ] as const;
  for (let stormIndex = 0; stormIndex < neutralStormTokens.length; stormIndex += 1) {
    const storm = `!${`${JSON.stringify(neutralStormTokens[stormIndex])} `.repeat(
      MAX_JSON_RECOVERY_ATTEMPTS_V6 + 1,
    )}`;
    for (const payload of payloads) {
      exact(
        `${storm}${payload.raw}`,
        payload.expected,
        `neutral structural quote storm=${stormIndex} payload=${payload.name}`,
      );
      checked += 1;
    }
    exact(storm, [0, 0, 1, false], `neutral structural quote storm=${stormIndex} control`);
    checked += 1;
  }
  assert.equal(checked, 660);

  // A quote after an identifier character is not a positively established
  // opening token: treating it as such could swallow the first key quote of
  // the following raw object. Bytewise recovery must still expose that root.
  const strayClosingPrefixes = [
    "garbageTail", "transport9", "opaque_", "binding$",
    "끝문자", "préfixe", "var_2", "traceZ0",
  ] as const;
  for (let prefixIndex = 0; prefixIndex < strayClosingPrefixes.length; prefixIndex += 1) {
    for (const payload of payloads) {
      exact(
        `${strayClosingPrefixes[prefixIndex]}" ${payload.raw}`,
        payload.expected,
        `stray close prefix=${prefixIndex} payload=${payload.name}`,
      );
      checked += 1;
    }
  }
  assert.equal(checked, 692);
});

test("response parser rejects truncated length finish reason", () => {
  assert.throws(() => parseConnectivityResponseV6(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { finishReason: "length" }),
  )), /terminal non-truncated/u);
});

test("response parser rejects a schema-invalid single object", () => {
  assert.throws(() => parseConnectivityResponseV6(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { content: { questions: [{ unexpected: true }] } }),
  )), /exact response schema|required/u);
});

test("response parser rejects fractional token usage", () => {
  assert.throws(() => parseConnectivityResponseV6(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", {
      usage: { prompt_tokens: 1.5, completion_tokens: 0.5, total_tokens: 2, cost: 0 },
    }),
  )), /exact final usage/u);
});

test("response parser requires exact token total consistency", () => {
  assert.throws(() => parseConnectivityResponseV6(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", {
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 16, cost: 0 },
    }),
  )), /exact final usage/u);
});

for (const forbidden of ["tool_calls", "function_call", "refusal", "audio"] as const) {
  test(`response parser rejects assistant message extra ${forbidden} even when null`, () => {
    const raw = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519"), (response) => {
      const choice = (response.choices as JsonObject[])[0]!;
      (choice.message as JsonObject)[forbidden] = null;
    });
    assert.throws(() => parseConnectivityResponseV6(parserInput(raw)), /unexpected fields/u);
  });
}

test("response parser rejects any unexpected top-level or choice field", () => {
  const top = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519"), (response) => {
    response.service_tier = "default";
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(top)), /response contains unexpected fields/u);
  const choice = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519"), (response) => {
    (response.choices as JsonObject[])[0]!.text = "shadow content";
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(choice)), /choices\[0\].*unexpected fields/u);
});

test("billing is independently attributed on HTTP, schema/parser, and cost-cap terminal failures", () => {
  const validButHttpFailed = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.02 },
  });
  const httpCharge = billingCharge(validButHttpFailed, 1, "STANDARD", 0.1);
  assert.deepEqual([httpCharge.actualKnown, httpCharge.actualCostUsd, httpCharge.effectiveCostUsd], [true, 0.02, 0.02]);

  const parserFailed = responseRaw("google/gemini-3.5-flash-20260519", {
    content: { questions: [{ unexpected: true }] },
    usage: { prompt_tokens: 101, completion_tokens: 21, total_tokens: 122, cost: 0.03 },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(parserFailed)), /exact response schema|required/u);
  const parserCharge = billingCharge(parserFailed, 1, "STANDARD", 0.1);
  assert.deepEqual([parserCharge.actualKnown, parserCharge.actualCostUsd, parserCharge.effectiveCostUsd], [true, 0.03, 0.03]);

  const costCapFailed = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: 102, completion_tokens: 22, total_tokens: 124, cost: 0.5 },
  });
  const capCharge = billingCharge(costCapFailed, 1, "STANDARD", 0.1);
  assert.deepEqual([capCharge.actualKnown, capCharge.actualCostUsd, capCharge.effectiveCostUsd], [true, 0.5, 0.5]);
});

test("reasoning-disabled request rejects positive response reasoning usage while preserving actual billing", () => {
  const raw = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      cost: 0.02,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 5 },
      is_byok: false,
      cost_details: {
        upstream_inference_cost: 0.02,
        upstream_inference_prompt_cost: 0.01,
        upstream_inference_completions_cost: 0.01,
      },
    },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(raw)), /reasoning tokens despite/u);
  const billing = extractConnectivityBillingEvidenceV6(raw);
  assert.equal(billing.costActualKnown, true);
  assert.equal(billing.actualCostUsd, 0.02);
  assert.equal(billing.reasoningTokens, 5);
  assert.equal(billing.reasoningDisabledResponseCompliant, false);
});

test("reasoning-charged failed response without cost evidence consumes the reasoning-inclusive reserve", () => {
  const raw = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      completion_tokens_details: { reasoning_tokens: 5 },
      is_byok: false,
    },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(raw)), /actual cost evidence|reasoning tokens/u);
  const billing = extractConnectivityBillingEvidenceV6(raw);
  assert.equal(billing.costActualKnown, false);
  assert.equal(billing.reasoningDisabledResponseCompliant, false);
  const charge = billingCharge(raw, 1, "STANDARD", 0.123);
  assert.deepEqual([charge.actualKnown, charge.actualCostUsd, charge.effectiveCostUsd], [false, null, 0.123]);
  const price = priceEvidenceForModelV6(priceSnapshot(), "google/gemini-3.5-flash");
  assert.equal(price.emergencyInternalReasoningUsdPer1M, 16.2);
  assert.equal(price.emergencyCompletionUsdPer1M, 32.4);
});

test("BYOK true or malformed billing never claims zero actual cost and hashes positive upstream evidence", () => {
  const absentByok = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0 },
  }), (response) => {
    delete (response.usage as JsonObject).is_byok;
  });
  const absentEvidence = extractConnectivityBillingEvidenceV6(absentByok);
  assert.equal(absentEvidence.costDisposition, "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION");
  assert.deepEqual([absentEvidence.costActualKnown, absentEvidence.actualCostUsd], [false, null]);
  assert.equal(billingCharge(absentByok, 1, "STANDARD", 0.1).effectiveCostUsd, 0.1);

  const byokZero = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0, is_byok: true,
    },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(byokZero)), /is_byok.*explicitly false/u);
  const zeroEvidence = extractConnectivityBillingEvidenceV6(byokZero);
  assert.equal(zeroEvidence.costDisposition, "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION");
  assert.deepEqual([zeroEvidence.costActualKnown, zeroEvidence.actualCostUsd], [false, null]);
  const zeroCharge = billingCharge(byokZero, 1, "STANDARD", 0.1);
  assert.deepEqual([zeroCharge.actualKnown, zeroCharge.effectiveCostUsd,
    zeroCharge.manualCostReconciliationRequired], [false, 0.1, true]);

  const byokUpstream = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0, is_byok: true,
      cost_details: {
        upstream_inference_cost: 0.07,
        upstream_inference_prompt_cost: 0.02,
        upstream_inference_completions_cost: 0.05,
      },
    },
  });
  const upstreamEvidence = extractConnectivityBillingEvidenceV6(byokUpstream);
  assert.equal(upstreamEvidence.costDisposition, "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION");
  assert.match(String(upstreamEvidence.explicitPositiveCostEvidenceHash), /^[a-f0-9]{64}$/u);
  assert.equal(billingCharge(byokUpstream, 1, "STANDARD", 0.1).effectiveCostUsd, 0.1);

  const malformedByok = mutateResponse(byokZero, (response) => {
    (response.usage as JsonObject).is_byok = "false";
  });
  const malformedEvidence = extractConnectivityBillingEvidenceV6(malformedByok);
  assert.equal(malformedEvidence.costDisposition, "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION");
  assert.equal(malformedEvidence.manualCostReconciliationRequired, true);
});

test("cacheless request rejects positive, malformed, and unknown cache usage while preserving actual billing", () => {
  const positive = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0.02,
      prompt_tokens_details: { cached_tokens: 1 },
    },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(positive)), /cached tokens|cache usage/u);
  const positiveBilling = extractConnectivityBillingEvidenceV6(positive);
  assert.equal(positiveBilling.actualCostUsd, 0.02);
  assert.equal(positiveBilling.cachedTokens, 1);
  assert.equal(positiveBilling.cacheDisabledResponseCompliant, false);
  assert(positiveBilling.defects.includes("cached_tokens_positive_despite_cacheless_request"));

  const malformed = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0.03,
      prompt_tokens_details: { cached_tokens: "unknown" },
    },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(malformed)), /safe integer/u);
  assert.equal(extractConnectivityBillingEvidenceV6(malformed).cacheDisabledResponseCompliant, false);

  const unknown = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0.04,
      cache_read_tokens: 1,
    },
  });
  assert.throws(() => parseConnectivityResponseV6(parserInput(unknown)), /unexpected fields/u);
  const unknownBilling = extractConnectivityBillingEvidenceV6(unknown);
  assert.equal(unknownBilling.actualCostUsd, 0.04);
  assert(unknownBilling.defects.includes("unknown_cache_usage_field"));
});

test("any duplicate or strict-observer failure makes otherwise parseable billing manual", () => {
  const baseline = responseRaw("google/gemini-3.5-flash-20260519");
  const prefix = Array.from({ length: 65 }, (_unused, index) =>
    `"irrelevant_${index}":0,"irrelevant_${index}":1,`).join("");
  const duplicateCost = baseline.replace('"cost":0.01', '"cost":999,"cost":0.01');
  const hiddenAfterPrefix = `{${prefix}${duplicateCost.slice(1)}`;
  const duplicateEvidence = extractConnectivityBillingEvidenceV6(hiddenAfterPrefix);
  assert.equal(duplicateEvidence.costDisposition, "AMBIGUOUS_DUPLICATE_BILLING_KEYS");
  assert.equal(duplicateEvidence.manualCostReconciliationRequired, true);
  assert.equal(observeRawCandidateCardinalityV6(hiddenAfterPrefix).cardinalityAmbiguous, true);

  let deep: unknown = 0;
  for (let depth = 0; depth < 130; depth += 1) deep = [deep];
  const deepRaw = mutateResponse(baseline, (response) => { response.deep_but_valid_json = deep; });
  assert.doesNotThrow(() => JSON.parse(deepRaw));
  const deepEvidence = extractConnectivityBillingEvidenceV6(deepRaw);
  assert.equal(deepEvidence.costDisposition, "AMBIGUOUS_DUPLICATE_BILLING_KEYS");
  assert.equal(deepEvidence.manualCostReconciliationRequired, true);
  assert.equal(observeRawCandidateCardinalityV6(deepRaw).cardinalityAmbiguous, true);
});

test("unknown billing reserves the full cap while distinguishing actualKnown from effective", () => {
  const charge = billingCharge("not-json", 1, "STANDARD", 0.123456789);
  assert.equal(charge.actualKnown, false);
  assert.equal(charge.actualCostUsd, null);
  assert.equal(charge.effectiveCostUsd, 0.123456789);
  assert.equal(charge.conservativeUnknownBilling, false);
  assert.equal(charge.manualCostReconciliationRequired, true);
});

test("huge finite response cost forces manual reconciliation and forbids silent reserved settlement", () => {
  const raw = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 1e300 },
  });
  const evidence = extractConnectivityBillingEvidenceV6(raw);
  assert.equal(evidence.costActualKnown, false);
  assert.equal(evidence.costDisposition, "EXPLICIT_POSITIVE_UNREPRESENTABLE");
  assert.equal(evidence.manualCostReconciliationRequired, true);
  assert.match(String(evidence.explicitPositiveCostEvidenceHash), /^[a-f0-9]{64}$/u);
  const charge = billingCharge(raw, 1, "STANDARD", 0.1);
  const secondCharge = billingCharge(raw, 2, "PREMIUM", 0.2);
  const settlement = buildRunLedgerSettlementV6([charge, secondCharge]);
  assert.equal(settlement.actualCostUsd, 0);
  assert.equal(settlement.effectiveCostUsd, 0.3);
  assert.equal(settlement.manualReconciliationRequired, true);
  assert.equal(settlement.manualCostReconciliationAssignments, 2);
  assert.equal(settlement.conservativeUnknownBillingAssignments, 0);
  assert(Number.isFinite(settlement.effectiveCostUsd));
});

test("valid JSON cost lexeme 1e309 is explicit overflow and forces manual reconciliation", () => {
  const baseline = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.01 },
  });
  const raw = baseline.replace('"cost":0.01', '"cost":1e309');
  assert.notEqual(raw, baseline);
  const evidence = extractConnectivityBillingEvidenceV6(raw);
  assert.equal(evidence.costDisposition, "EXPLICIT_POSITIVE_UNREPRESENTABLE");
  assert.equal(evidence.manualCostReconciliationRequired, true);
  assert.match(String(evidence.explicitPositiveCostEvidenceHash), /^[a-f0-9]{64}$/u);
  const settlement = buildRunLedgerSettlementV6([billingCharge(raw, 1, "STANDARD", 0.1)]);
  assert.equal(settlement.manualReconciliationRequired, true);
  assert.equal(settlement.conservativeUnknownBillingAssignments, 0);
});

test("two near-MAX_SAFE usage rows become usage-unknown before aggregate overflow", () => {
  const nearMax = Number.MAX_SAFE_INTEGER - 1;
  const raw = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: nearMax, completion_tokens: 0, total_tokens: nearMax, cost: 0.01 },
  });
  const first = billingCharge(raw, 1, "STANDARD", 0.1);
  const second = billingCharge(raw, 2, "PREMIUM", 0.1);
  assert.deepEqual([first.usageKnown, second.usageKnown], [false, false]);
  const settlement = buildRunLedgerSettlementV6([first, second]);
  assert.deepEqual([settlement.inputTokens, settlement.outputTokens, settlement.usageKnownAssignments], [0, 0, 0]);
  assert(Number.isSafeInteger(settlement.inputTokens));
});

test("bounded reader rejects declared oversize before pulling and cancels stream overflow", async () => {
  let pulls = 0;
  let cancelled = false;
  const declaredStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() { cancelled = true; },
  });
  const declared = new Response(declaredStream, { headers: { "content-length": "5" } });
  const pullsBeforeRead = pulls;
  await assert.rejects(
    readBoundedUtf8ResponseBodyV6({ response: declared, maximumBytes: 4, label: "declared hostile" }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV6 && error.code === "DECLARED_LENGTH_EXCEEDED",
  );
  assert.equal(pulls, pullsBeforeRead);
  assert.equal(cancelled, true);

  const streamed = new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
  }));
  await assert.rejects(
    readBoundedUtf8ResponseBodyV6({ response: streamed, maximumBytes: 4, label: "stream hostile" }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV6 && error.code === "STREAM_LENGTH_EXCEEDED",
  );
});

test("bounded reader caps zero-byte chunk count and uses one preallocated byte buffer", async () => {
  let emitted = 0;
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      emitted += 1;
      controller.enqueue(new Uint8Array(0));
    },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(
    readBoundedUtf8ResponseBodyV6({ response, maximumBytes: 32, label: "zero chunk hostile" }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV6 && error.code === "STREAM_CHUNK_COUNT_EXCEEDED",
  );
  assert.equal(emitted, RESPONSE_BODY_MAX_CHUNKS_V6 + 1);
  assert.equal(cancelled, true);
  const source = readFileSync(path.join(here, "bounded-response-body.ts"), "utf8");
  assert.match(source, /const storage = new Uint8Array\(input\.maximumBytes\)/u);
  assert.doesNotMatch(source, /chunks\.push/u);
});

test("bounded reader enforces identity Content-Length equality but not compressed encoded length", async () => {
  await assert.rejects(
    readBoundedUtf8ResponseBodyV6({
      response: new Response("abc", { headers: { "content-length": "2" } }),
      maximumBytes: 16,
      label: "identity mismatch",
    }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV6 && error.code === "CONTENT_LENGTH_MISMATCH",
  );
  const compressed = await readBoundedUtf8ResponseBodyV6({
    response: new Response("decoded", { headers: { "content-length": "3", "content-encoding": "gzip" } }),
    maximumBytes: 16,
    label: "decoded compressed body",
  });
  assert.equal(compressed.text, "decoded");
  assert.equal(compressed.contentLengthEqualityChecked, false);
});

test("every post-response bounded-body observation failure forces global candidate quarantine", async () => {
  const twoQuestionPrefix = new TextEncoder().encode(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      questions: [validContent.questions[0], validContent.questions[0]],
    }) } }],
  }));
  const assertFailureQuarantines = async (response: Response, maximumBytes: number, code: string): Promise<void> => {
    let failure: unknown = null;
    try {
      await readBoundedUtf8ResponseBodyV6({ response, maximumBytes, label: `hostile ${code}` });
    } catch (error) {
      failure = error;
    }
    assert(failure instanceof BoundedBodyReadErrorV6);
    assert.equal(failure.code, code);
    const charge = billingCharge("", 1, "STANDARD", 0.1, true);
    assert.equal(charge.responseCandidateCardinalityUnobservableAfterSend, true);
    assert.equal(charge.candidateCardinalityAmbiguous, true);
    assert.equal(buildRunLedgerSettlementV6([charge]).globalCandidateQuarantineRequired, true);
  };

  await assertFailureQuarantines(
    new Response("", { headers: { "content-length": String(MODEL_RESPONSE_BODY_MAX_BYTES_V6 + 1) } }),
    MODEL_RESPONSE_BODY_MAX_BYTES_V6,
    "DECLARED_LENGTH_EXCEEDED",
  );
  await assertFailureQuarantines(new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(twoQuestionPrefix);
      controller.enqueue(new Uint8Array([0x20]));
    },
  })), twoQuestionPrefix.byteLength, "STREAM_LENGTH_EXCEEDED");

  let chunkOrdinal = 0;
  await assertFailureQuarantines(new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkOrdinal === 0) controller.enqueue(twoQuestionPrefix);
      else controller.enqueue(new Uint8Array(0));
      chunkOrdinal += 1;
    },
  })), twoQuestionPrefix.byteLength + 1, "STREAM_CHUNK_COUNT_EXCEEDED");
  await assertFailureQuarantines(
    new Response(twoQuestionPrefix, { headers: { "content-length": String(twoQuestionPrefix.byteLength + 1) } }),
    twoQuestionPrefix.byteLength + 1,
    "CONTENT_LENGTH_MISMATCH",
  );
  const invalidUtf8 = new Uint8Array(twoQuestionPrefix.byteLength + 1);
  invalidUtf8.set(twoQuestionPrefix);
  invalidUtf8[invalidUtf8.length - 1] = 0xff;
  await assertFailureQuarantines(
    new Response(invalidUtf8),
    invalidUtf8.byteLength,
    "INVALID_UTF8",
  );

  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  assert.match(source, /dispatchAttempted = true;[\s\S]+responseBodyObservationComplete = true;/u);
  assert.match(source,
    /responseCandidateCardinalityUnobservableAfterSend: dispatchAttempted && !responseBodyObservationComplete/u);

  const preHeaderTimeoutCharge = billingCharge("", 1, "STANDARD", 0.1, true);
  assert.equal(preHeaderTimeoutCharge.responseCandidateCardinalityUnobservableAfterSend, true);
  assert.equal(buildRunLedgerSettlementV6([preHeaderTimeoutCharge]).globalCandidateQuarantineRequired, true);
});

test("terminal reconciliation intent and failure evidence are durable no-replay dispositions", () => {
  const settlement = buildRunLedgerSettlementV6([billingCharge("not-json", 1, "STANDARD", 0.1)]);
  const intent = buildTerminalReconciliationIntentV6({
    runId: "offline-fault-injection",
    journalHeadHash: "0".repeat(64),
    settlement,
    status: "JOURNAL_FAILURE_AFTER_RESERVE",
  });
  assert.equal(intent.noReplay, true);
  assert.equal(intent.globalSettlementState, "PENDING_FAIL_CLOSED");
  const failure = buildSettlementFailureEvidenceV6({
    intentSha256: String(intent.intentSha256),
    settlement,
    error: new Error("injected settlement failure"),
  });
  assert.equal(failure.noReplay, true);
  assert.equal(failure.manualReconciliationRequired, true);
  const postSettlementFailure = buildPostSettlementMarkerFailureEvidenceV6({
    intentSha256: String(intent.intentSha256),
    settlement,
    error: new Error("injected success marker failure after settled ledger"),
  });
  assert.equal(postSettlementFailure.globalLedgerSettlementSucceeded, true);
  assert.equal(postSettlementFailure.reservationMayRemain, false);
  assert.equal(postSettlementFailure.noReplay, true);
});

test("intent partial-write, fsync, rename, and cleanup failures make global settlement unreachable", () => {
  for (const phase of ["partial write", "fsync", "rename", "cleanup"] as const) {
    let settleCalls = 0;
    let quarantineCalls = 0;
    assert.throws(() => commitGlobalSettlementAfterDurableIntentV6({
      persistIntent() { throw new Error(`injected terminal intent ${phase} failure`); },
      globalCandidateQuarantineRequired: phase === "cleanup",
      settle() { settleCalls += 1; return []; },
      quarantine() { quarantineCalls += 1; return []; },
    }), (error: unknown) => error instanceof TerminalIntentNotDurableErrorV6 &&
      error.persistenceError instanceof Error && error.persistenceError.message.includes(phase));
    assert.deepEqual([settleCalls, quarantineCalls], [0, 0], phase);
  }

  let durableIntents = 0;
  let settleCalls = 0;
  const result = commitGlobalSettlementAfterDurableIntentV6({
    persistIntent() { durableIntents += 1; },
    globalCandidateQuarantineRequired: false,
    settle() { settleCalls += 1; return ["settled"]; },
    quarantine() { throw new Error("wrong global branch"); },
  });
  assert.deepEqual(result, ["settled"]);
  assert.deepEqual([durableIntents, settleCalls], [1, 1]);

  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  assert.match(source, /commitGlobalSettlementAfterDurableIntentV6\(\{[\s\S]+persistIntent:[\s\S]+settle:[\s\S]+quarantine:/u);
  assert.match(source, /TERMINAL_INTENT_NOT_DURABLE_GLOBAL_RESERVED_NO_REPLAY_MANUAL_INTERVENTION/u);
});

test("post-send extractor, observer, or charge failure synthesizes one conservative charge and forbids zero settlement", () => {
  for (const injectedStage of ["billing extractor", "candidate observer", "charge constructor"] as const) {
    const result = constructPostSendChargeFailClosedV6({
      ordinal: 1,
      plan: "STANDARD",
      reservedCostUsd: 0.125,
      constructPrimaryCharge() { throw new Error(`injected ${injectedStage} failure`); },
    });
    assert(result.constructionError instanceof Error);
    assert.equal(result.charge.candidateUnitsEffective, 1);
    assert.equal(result.charge.effectiveCostUsd, 0.125);
    assert.equal(result.charge.manualCostReconciliationRequired, true);
    assert.equal(result.charge.responseCandidateCardinalityUnobservableAfterSend, true);
    assert.equal(result.charge.globalCandidateQuarantineRequired, true);
    const settlement = buildRunLedgerSettlementForDispatchV6({
      charges: [result.charge],
      physicalFetches: 1,
      candidateOpportunitiesConsumed: 1,
    });
    assert.deepEqual([settlement.used, settlement.modelCalls], [1, 1]);
    assert.equal(settlement.globalCandidateQuarantineRequired, true);
  }
  assert.throws(() => buildRunLedgerSettlementForDispatchV6({
    charges: [],
    physicalFetches: 1,
    candidateOpportunitiesConsumed: 1,
  }), /charge coverage differs/u);
  assert.equal(buildFailClosedPostSendChargeV6({
    ordinal: 2,
    plan: "PREMIUM",
    reservedCostUsd: 0.2,
    failure: new Error("outer finally injection"),
  }).ordinal, 2);
});

test("pure offline scenario completes only Standard then Premium", () => {
  const result = runDeterministicLocalScenarioV6([
    { plan: "STANDARD", rawText: responseRaw("std-canonical"), requestedModel: "std", allowedServedModels: ["std-canonical"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema },
    { plan: "PREMIUM", rawText: responseRaw("pro-canonical"), requestedModel: "pro", allowedServedModels: ["pro-canonical"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema },
  ]);
  assert.equal(result.terminal, "COMPLETED");
  assert.deepEqual([result.candidateOpportunities, result.physicalFetches, result.completions], [2, 2, 2]);
});

test("pure offline failure is terminal and never reaches Premium", () => {
  const result = runDeterministicLocalScenarioV6(["FAIL_BEFORE_RESPONSE", {
    plan: "PREMIUM", rawText: responseRaw("pro"), requestedModel: "pro", allowedServedModels: ["pro"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema,
  }]);
  assert.equal(result.terminal, "FAILED_TERMINAL");
  assert.equal(result.started, 1);
});

test("pure offline unknown-after-send is terminal and consumes one opportunity", () => {
  const result = runDeterministicLocalScenarioV6(["UNKNOWN_AFTER_SEND"]);
  assert.equal(result.terminal, "UNKNOWN_AFTER_SEND_TERMINAL");
  assert.equal(result.candidateOpportunities, 1);
});

test("live entrypoint set is exact, sorted, and versioned v6", () => {
  assert.deepEqual([...LIVE_ENTRYPOINTS_V6], [...LIVE_ENTRYPOINTS_V6].sort());
  assert(LIVE_ENTRYPOINTS_V6.every((entry) => entry.includes("campaign-v6-connectivity-pilot-v6")));
});

test("computed live closure excludes every offline test-support and author tool", async () => {
  const closure = computeLiveClosureV6({ declaredRuntimeArtifactBytes: await frozenClosureOverrides() });
  const paths = closure.files.map((row) => row.path);
  assert(!paths.some((entry) => /offline\.test|test-support|verify|build-offline/u.test(entry)));
});

test("computed live closure has exact bytes/hash rows and no minimum-count rule", async () => {
  const overrides = await frozenClosureOverrides();
  const closure = computeLiveClosureV6({ declaredRuntimeArtifactBytes: overrides });
  for (const row of closure.files) {
    const bytes = overrides.get(row.path) ?? readFileSync(path.join(repoRoot, row.path));
    assert.equal(bytes.byteLength, row.bytes);
    assert.equal(sha256V6(bytes), row.sha256);
  }
  assert.equal(closure.completeness.minimumCountAcceptanceUsed, false);
  assert.equal(closure.files.length, Number(protocol.liveClosureContract.exactExpectedFiles));
  assert.equal(closure.externalRuntimeFiles.length, 1);
  assert.equal(closure.externalRuntimeFiles[0]!.sha256, sha256V6(readFileSync(process.execPath)));
  const omitted = new Map(overrides);
  omitted.delete([...omitted.keys()][0]!);
  assert.throws(
    () => computeLiveClosureV6({ declaredRuntimeArtifactBytes: omitted }),
    /override set differs/u,
  );
  const extra = new Map(overrides);
  extra.set("experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/extra.mjs", new Uint8Array([1]));
  assert.throws(
    () => computeLiveClosureV6({ declaredRuntimeArtifactBytes: extra }),
    /override set differs/u,
  );
  const mutated = new Map(overrides);
  const firstPath = [...mutated.keys()][0]!;
  const hostileBytes = Buffer.from(mutated.get(firstPath)!);
  hostileBytes[0] = hostileBytes[0]! ^ 1;
  mutated.set(firstPath, hostileBytes);
  assert.notEqual(
    computeLiveClosureV6({ declaredRuntimeArtifactBytes: mutated }).exactFileSetAndBytesSha256,
    closure.exactFileSetAndBytesSha256,
  );
});

test("compiler closure is a complete exact set, not the inherited 32-row subset", () => {
  const closure = runIsolatedCompilerV6().compilerClosure;
  assert(closure.sourceFiles.length > 0);
  assert.equal(closure.dynamicSourceInputs.length, 3);
  assert.equal(closure.declaredDataInputs.length, 4);
  assert.equal(closure.files.length, closure.sourceFiles.length + 3 + 4);
  const resolution = closure.resolutionEvidence as { unresolvedLocalSpecifiers: unknown[]; nonliteralDynamicLoads: unknown[] };
  assert.deepEqual(resolution.unresolvedLocalSpecifiers, []);
  assert.deepEqual(resolution.nonliteralDynamicLoads, []);
  const v3 = JSON.parse(readFileSync(path.join(here, "../campaign-v6-connectivity-pilot-v3/private/exact-wire-v3.private.json"), "utf8")) as { productionSourceClosure: Array<{ path: string }> };
  assert.equal(v3.productionSourceClosure.length, 32);
  assert.notDeepEqual(v3.productionSourceClosure.map((row) => row.path).sort(), closure.files.map((row) => row.path));
  const completeness = closure.completeness as { minimumCountAcceptanceUsed: boolean; inheritedThirtyTwoRowSubsetTrustedAsAuthority: boolean };
  assert.equal(completeness.minimumCountAcceptanceUsed, false);
  assert.equal(completeness.inheritedThirtyTwoRowSubsetTrustedAsAuthority, false);
});

test("production runner exposes no test/injected/delegate/transport authority", () => {
  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  assert.doesNotMatch(source, /QUESTION_QUALITY_CONNECTIVITY_PILOT_TEST|TEST_MODE|createOffline|InjectedTransport|\bdelegate\b|\bpermit\b/iu);
  assert.deepEqual([...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/gu)].map((match) => match[1]), ["runSealedConnectivityPilotV6"]);
});

test("test support has no network, child-process, env, filesystem, or production-runner import capability", () => {
  const source = readFileSync(path.join(here, "test-support.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:(?:http|https|net|tls|dns|fs|child_process|worker_threads)["']|process\.env|globalThis\.fetch|\bfetch\s*\(|production-runner/iu);
});

test("operator freeze has no callable CLI dispatch path", () => {
  const source = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.match(source, /assertAuthorFreezePermanentlyNoDispatchV6/u);
  assert.match(source, /authorization\.dispatchCommandPresent !== true/u);
  const liveStart = source.indexOf("export async function launchConnectivityPilotV6AfterFutureAuthorization");
  const handoffLookup = source.indexOf("priceCaptureHandoffsV6.get", liveStart);
  const pinnedValidation = source.indexOf("validatePinnedPrivatePriceEvidenceBundleV6", handoffLookup);
  const handoffDelete = source.indexOf("priceCaptureHandoffsV6.delete", pinnedValidation);
  const credentialRead = source.indexOf("readOnlyOpenRouterAssignment()", handoffDelete);
  const spawnCall = source.indexOf("const child = spawn", credentialRead);
  assert(liveStart >= 0 && handoffLookup > liveStart && pinnedValidation > handoffLookup &&
    handoffDelete > pinnedValidation && credentialRead > handoffDelete && spawnCall > credentialRead,
  "capture file/bundle hashes must be one-shot validated before credential read or live child spawn");
  const captureStart = source.indexOf("export async function launchPriceMetadataCaptureV6AfterFutureAuthorization");
  const captureExit = source.indexOf("const exitCode = await waitForChild", captureStart);
  const captureEvidence = source.indexOf("readPrivateAttestedJsonEvidenceV6", captureExit);
  const captureMapSet = source.indexOf("priceCaptureHandoffsV6.set", captureEvidence);
  assert(captureStart >= 0 && captureExit > captureStart && captureEvidence > captureExit && captureMapSet > captureEvidence,
    "only a successful metadata child may create the in-memory live handoff");
});

test("operator parses the no-BOM protocol and rejects both dormant launch paths before spawn", async () => {
  const wrapperModule = await import("./operator-wrapper.mts");
  const wrapper = (wrapperModule as unknown as { default?: typeof wrapperModule }).default ?? wrapperModule;
  await assert.rejects(
    wrapper.launchConnectivityPilotV6AfterFutureAuthorization({ runId: "offline", priceSnapshotPath: "offline" }),
    /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
  );
  await assert.rejects(
    wrapper.launchPriceMetadataCaptureV6AfterFutureAuthorization({ outputPath: "offline" }),
    /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
  );
});

test("frozen plain-ESM runtime binds every bundle and the exact Node executable without tsx", async () => {
  const frozen = await getFrozenBuild();
  assert.equal(frozen.artifact.bundles.length, 3);
  assert(frozen.artifact.externalRuntimeSpecifiers.every((specifier) => specifier.startsWith("node:")));
  assertCurrentNodeRuntimeV6(frozen.artifact.nodeRuntime);
  for (const row of frozen.artifact.bundles) {
    const bytes = frozen.bundleBytesByRole.get(row.role)!;
    assertFrozenBundleBytesV6(frozen.artifact, row.role, bytes);
    const hostile = Buffer.from(bytes);
    hostile[Math.floor(hostile.length / 2)] = hostile[Math.floor(hostile.length / 2)]! ^ 1;
    assert.throws(() => assertFrozenBundleBytesV6(frozen.artifact, row.role, hostile), /bundle bytes differ/u);
  }
  const hostileNode = structuredClone(frozen.artifact.nodeRuntime);
  hostileNode.nodeVersion = "v0.0.0-hostile";
  assert.throws(() => assertCurrentNodeRuntimeV6(hostileNode), /Node executable identity differs/u);
  const hostileBuiltin = structuredClone(frozen.artifact);
  hostileBuiltin.bundles[0]!.externalRuntimeSpecifiers.push("node:net");
  assert.throws(() => validateFrozenRuntimeArtifactV6(hostileBuiltin), /Node builtin allowlist differs/u);
  const hostileDynamicCode = structuredClone(frozen.artifact);
  hostileDynamicCode.bundles[1]!.forbiddenSyntaxCounts.dynamicImport = 1 as 0;
  assert.throws(() => validateFrozenRuntimeArtifactV6(hostileDynamicCode), /forbidden dynamic/u);
  const operatorBytes = frozen.bundleBytesByRole.get("OPERATOR")!.toString("utf8");
  assert.doesNotMatch(operatorBytes, /node_modules[\\/]tsx|tsx\/dist|tsxCli/u);
  const wrapperSource = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.doesNotMatch(wrapperSource, /node_modules[\\/]tsx|tsx\/dist|tsxCli/u);

  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-frozen-no-dispatch-"));
  try {
    const frozenDirectory = path.join(fixture, "frozen-live");
    mkdirSync(frozenDirectory);
    for (const row of frozen.artifact.bundles) {
      writeFileSync(path.join(frozenDirectory, path.basename(row.path)), frozen.bundleBytesByRole.get(row.role)!);
    }
    const hostileProtocol = structuredClone(protocol) as unknown as JsonObject;
    hostileProtocol.authorization = {
      liveExecutionAuthorized: true,
      metadataNetworkAuthorized: true,
      hostileAuditPassed: true,
      dispatchCommandPresent: true,
    };
    writeFileSync(path.join(fixture, "protocol-v6.json"), `${JSON.stringify(hostileProtocol)}\n`, "utf8");
    const frozenOperator = await import(`${pathToFileURL(path.join(frozenDirectory, "operator-wrapper-v6.bundle.mjs")).href}?offline=${Date.now()}`);
    await assert.rejects(
      frozenOperator.launchConnectivityPilotV6AfterFutureAuthorization({ runId: "hostile", priceSnapshotPath: "hostile" }),
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
    );
    await assert.rejects(
      frozenOperator.launchPriceMetadataCaptureV6AfterFutureAuthorization({ outputPath: "hostile" }),
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u,
    );
    for (const entry of ["live-child-v6.bundle.mjs", "capture-price-snapshot-v6.bundle.mjs"]) {
      const child = spawnSync(process.execPath, [path.join(frozenDirectory, entry)], {
        cwd: fixture,
        env: {} as NodeJS.ProcessEnv,
        encoding: "utf8",
        windowsHide: true,
      });
      assert.notEqual(child.status, 0);
      assert.match(`${child.stdout}\n${child.stderr}`, /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("live and metadata child launchers share exact minimal environment names with no ambient preload", () => {
  const source = {
    SystemRoot: "C:\\Windows", PATH: "C:\\Windows\\System32", TEMP: "C:\\Temp", WINDIR: "C:\\Windows",
    PATHEXT: ".EXE", TMP: "C:\\Temp", COMSPEC: "C:\\Windows\\System32\\cmd.exe",
  } as unknown as NodeJS.ProcessEnv;
  const metadata = buildExactMetadataEnvironmentV6(source);
  assert.deepEqual(Object.keys(metadata).sort(), MINIMAL_OS_ENV_NAMES_V6.filter((name) => source[name]).sort());
  const injected = process.platform === "win32"
    ? Object.fromEntries(WINDOWS_AUTOINJECTED_ENV_NAMES_V6.map((name) => [name, `os-${name}`]))
    : {};
  const observedMetadata = { ...metadata, ...injected };
  assert.doesNotThrow(() => assertExactMetadataEnvironmentV6(observedMetadata));
  const live = buildExactLiveChildEnvironmentV6(source, "dummy-openrouter-key");
  assert.deepEqual(Object.keys(live).sort(), LIVE_CHILD_ENV_NAMES_V6.filter((name) => live[name]).sort());
  assert.equal(live[LIVE_CHILD_MARKER_ENV_V6], "1");
  const observedLive = { ...live, ...injected };
  assert.doesNotThrow(() => assertExactLiveChildEnvironmentV6(observedLive));
  assert.throws(() => assertExactLiveChildEnvironmentV6({ ...observedLive, NODE_OPTIONS: "--require=hostile" }), /exact environment name set differs|non-allowlisted/u);
  assert.throws(() => assertExactLiveChildEnvironmentV6({ ...observedLive, GEMINI_API_KEY: "hostile" }), /exact environment name set differs|non-allowlisted/u);
  const missingInjected = { ...observedMetadata };
  if (process.platform === "win32") delete missingInjected.HOMEDRIVE;
  else delete missingInjected.PATH;
  assert.throws(() => assertExactMetadataEnvironmentV6(missingInjected), /exact environment name set differs/u);
  assert.throws(() => assertExactMetadataEnvironmentV6({ ...observedMetadata, APPDATA: "hostile" }), /exact environment name set differs|non-allowlisted/u);
  const wrapperSource = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.doesNotMatch(wrapperSource, /import\s+.*capture-price-snapshot|from\s+["'].+capture-price-snapshot/iu);
  assert.match(wrapperSource, /buildExactMetadataEnvironmentV6/u);
  assert.match(wrapperSource, /`--output=\$\{path\.resolve\(input\.outputPath\)\}`/u);
});

test("metadata authorization policy exhaustively checks all 16 boolean permutations", () => {
  for (const liveExecutionAuthorized of [false, true]) {
    for (const metadataNetworkAuthorized of [false, true]) {
      for (const hostileAuditPassed of [false, true]) {
        for (const dispatchCommandPresent of [false, true]) {
          const actual = metadataNetworkDispatchAuthorizedV6({
            liveExecutionAuthorized,
            metadataNetworkAuthorized,
            hostileAuditPassed,
            dispatchCommandPresent,
          });
          assert.equal(
            actual,
            metadataNetworkAuthorized && hostileAuditPassed && dispatchCommandPresent,
            JSON.stringify({ liveExecutionAuthorized, metadataNetworkAuthorized, hostileAuditPassed, dispatchCommandPresent }),
          );
        }
      }
    }
  }
});

test("price capture CLI rejects duplicate/extra flags and confines output to a canonical direct private child", () => {
  assert.deepEqual(parsePriceCaptureCliArgumentsV6(["--output=x.json"]), { outputPath: "x.json" });
  for (const args of [
    [] as string[],
    ["--output=a.json", "--output=b.json"],
    ["--output=a.json", "--extra"],
    ["--extra"],
    ["--output=a--output=b.json"],
  ]) assert.throws(() => parsePriceCaptureCliArgumentsV6(args), /exactly one --output/u);

  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-output-boundary-"));
  try {
    const realRoot = path.join(fixture, "private");
    mkdirSync(realRoot);
    const direct = path.join(realRoot, "price-snapshot.json");
    assert.equal(assertCanonicalDirectPrivateOutputV6(direct, realRoot), direct);
    assert.throws(
      () => assertCanonicalDirectPrivateOutputV6(path.join(realRoot, "nested/escape.json"), realRoot),
      /direct child/u,
    );
    const linkedRoot = path.join(fixture, "private-link");
    symlinkSync(realRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => assertCanonicalDirectPrivateOutputV6(path.join(linkedRoot, "escape.json"), linkedRoot),
      /real directory|symlink|junction/u,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("private input and run-directory boundaries reject symlink and junction traversal", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-private-boundary-"));
  try {
    const privateRoot = path.join(fixture, "private");
    const externalRoot = path.join(fixture, "external");
    mkdirSync(privateRoot);
    mkdirSync(externalRoot);
    const realFile = path.join(externalRoot, "price.json");
    writeFileSync(realFile, "{}\n", "utf8");
    const linkedPrivateRoot = path.join(fixture, "private-link");
    symlinkSync(externalRoot, linkedPrivateRoot, process.platform === "win32" ? "junction" : "dir");
    const linkedFile = path.join(linkedPrivateRoot, "price.json");
    assert.throws(() => assertDirectRealPrivateInputPathV6(linkedFile, linkedPrivateRoot), /real directory|symlink|junction/u);
    assert.throws(() => assertRealRegularFileV6(linkedFile, "hostile private input"), /parent.*symlink|junction|traverses/u);

    const runsJunction = path.join(privateRoot, "runs");
    symlinkSync(externalRoot, runsJunction, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertRealDirectoryV6(runsJunction, "hostile runs root"), /real directory|symlink|junction/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("sole credential source is a stable direct real file and rejects file links, junction roots, and disappearance", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-credential-boundary-"));
  try {
    const realRoot = path.join(fixture, "repo");
    mkdirSync(realRoot);
    const envPath = path.join(realRoot, ".env.local");
    writeFileSync(envPath, "UNRELATED=fixture\n", "utf8");
    assert.equal(readDirectRealEnvLocalCredentialTextV6(realRoot, envPath), "UNRELATED=fixture\n");

    const external = path.join(fixture, process.platform === "win32" ? "external-dir" : "external.env");
    if (process.platform === "win32") mkdirSync(external);
    else writeFileSync(external, "UNRELATED=external\n", "utf8");
    rmSync(envPath);
    symlinkSync(external, envPath, process.platform === "win32" ? "junction" : "file");
    assert.throws(() => readDirectRealEnvLocalCredentialTextV6(realRoot, envPath), /real regular file|symlink|junction/u);
    rmSync(envPath, { recursive: true, force: true });

    const linkedRoot = path.join(fixture, "repo-link");
    symlinkSync(realRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => readDirectRealEnvLocalCredentialTextV6(linkedRoot, path.join(linkedRoot, ".env.local")),
      /real directory|symlink|junction|ENOENT/u,
    );

    writeFileSync(envPath, "UNRELATED=renamed\n", "utf8");
    renameSync(envPath, path.join(realRoot, ".env.local.moved"));
    assert.throws(() => readDirectRealEnvLocalCredentialTextV6(realRoot, envPath), /ENOENT/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("credential read fails closed on grow, truncate, and same-size in-place rewrite races", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-credential-races-"));
  try {
    const envPath = path.join(fixture, ".env.local");
    const original = "OPENROUTER_API_KEY=fixture-only-not-secret\n";

    writeFileSync(envPath, original, "utf8");
    assert.throws(() => readDirectRealEnvLocalCredentialTextV6(fixture, envPath, {
      afterOpenBeforeRead() {
        writeFileSync(envPath, "GROW", { encoding: "utf8", flag: "a" });
      },
    }), /grew beyond|changed during/u);

    writeFileSync(envPath, original, "utf8");
    assert.throws(() => readDirectRealEnvLocalCredentialTextV6(fixture, envPath, {
      afterOpenBeforeRead() { truncateSync(envPath, 2); },
    }), /truncated during|changed during/u);

    writeFileSync(envPath, original, "utf8");
    const replacement = original.replace("fixture-only-not-secret", "hostile-only-not-secret");
    assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
    assert.throws(() => readDirectRealEnvLocalCredentialTextV6(fixture, envPath, {
      afterOpenBeforeRead() {
        writeFileSync(envPath, replacement, "utf8");
        const forcedTime = new Date("2035-01-01T00:00:00.000Z");
        utimesSync(envPath, forcedTime, forcedTime);
      },
    }), /changed during/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("mutable ledger reader rejects duplicate keys, BOM, read races, target swaps, and parent junction swaps", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-ledger-races-"));
  try {
    const parent = path.join(fixture, "ledger-parent");
    mkdirSync(parent);
    const target = path.join(parent, "budget-ledger.json");

    writeFileSync(target, '{"usedFullQuestionCandidates":900,"usedFullQuestionCandidates":0}\n', "utf8");
    assert.throws(
      () => readStableMutableJsonV6(attestJsonTransactionTargetV6(target), {}),
      /duplicate JSON keys/u,
    );

    writeFileSync(target, '\uFEFF{"usedFullQuestionCandidates":0}\n', "utf8");
    assert.throws(
      () => readStableMutableJsonV6(attestJsonTransactionTargetV6(target), {}),
      /must not contain a UTF-8 BOM/u,
    );

    writeFileSync(target, '{"usedFullQuestionCandidates":0}\n', "utf8");
    const readAttestation = attestJsonTransactionTargetV6(target);
    assert.throws(() => readStableMutableJsonV6(readAttestation, {
      afterTargetOpenBeforeRead() {
        writeFileSync(target, '{"usedFullQuestionCandidates":0,"padding":"growth"}\n', "utf8");
      },
    }), /grew during|changed during/u);

    writeFileSync(target, '{"usedFullQuestionCandidates":0}\n', "utf8");
    const targetSwapAttestation = attestJsonTransactionTargetV6(target);
    renameSync(target, `${target}.old`);
    writeFileSync(target, '{"usedFullQuestionCandidates":0}\n', "utf8");
    assert.throws(
      () => assertJsonTransactionTargetUnchangedV6(targetSwapAttestation),
      /changed identity/u,
    );
    rmSync(`${target}.old`);

    const parentAttestation = attestJsonTransactionTargetV6(target);
    const movedParent = `${parent}.moved`;
    const externalParent = path.join(fixture, "external-parent");
    mkdirSync(externalParent);
    writeFileSync(path.join(externalParent, "budget-ledger.json"), '{"usedFullQuestionCandidates":0}\n', "utf8");
    renameSync(parent, movedParent);
    symlinkSync(externalParent, parent, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => assertJsonTransactionTargetUnchangedV6(parentAttestation),
      /real directory|symlink|junction|changed identity|traverses/u,
    );
    rmSync(parent, { recursive: true, force: true });
    renameSync(movedParent, parent);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("ledger commit rejects temp unlink, replacement, hardlink, symlink, and junction swaps without touching the global ledger", () => {
  const root = mkdtempSync(path.join(here, "private/offline-v6-temp-commit-"));
  const relative = (absolute: string) => path.relative(repoRoot, absolute).split(path.sep).join("/");
  const scenarios = ["unlink", "replace", "hardlink", "symlink", "junction"] as const;
  try {
    for (const scenario of scenarios) {
      const parent = path.join(root, scenario);
      mkdirSync(parent);
      const target = path.join(parent, "local-ledger.json");
      const original = { phase: "ORIGINAL", used: 0 };
      writeFileSync(target, `${JSON.stringify(original)}\n`, "utf8");
      assert.throws(() => withExclusiveRepoJsonTransactionV6({
        relativePath: relative(target),
        lockSuffix: `offline-${scenario}`,
        mutate: () => ({ next: { phase: "EXPECTED", used: 1 }, value: "must-not-commit" }),
        // Synthetic POSIX boundary: these hostile fixtures fail before rename,
        // so they authorize the transaction path without claiming host durability.
        operationsForOfflineTestOnly: { parentDirectoryPlatform: "linux" },
        raceHooksForOfflineTestOnly: {
          beforeCommitReattestation(tempPath) {
            unlinkSync(tempPath);
            if (scenario === "unlink") return;
            if (scenario === "replace") {
              writeFileSync(tempPath, '{"phase":"HOSTILE","used":999}\n', "utf8");
              return;
            }
            if (scenario === "hardlink") {
              const hostile = path.join(parent, "hostile-hardlink.json");
              writeFileSync(hostile, '{"phase":"HOSTILE","used":999}\n', "utf8");
              linkSync(hostile, tempPath);
              return;
            }
            if (scenario === "symlink") {
              const hostile = path.join(parent, "hostile-symlink.json");
              writeFileSync(hostile, '{"phase":"HOSTILE","used":999}\n', "utf8");
              symlinkSync(hostile, tempPath, "file");
              return;
            }
            const hostileDirectory = path.join(parent, "hostile-junction");
            mkdirSync(hostileDirectory);
            writeFileSync(path.join(hostileDirectory, "payload.json"), '{"phase":"HOSTILE","used":999}\n', "utf8");
            symlinkSync(hostileDirectory, tempPath, process.platform === "win32" ? "junction" : "dir");
          },
        },
      }), /temp|regular file|identity|changed|EISDIR|EPERM|unlink/u, scenario);
      assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), original, scenario);
    }

    const successfulParent = path.join(root, "successful");
    mkdirSync(successfulParent);
    const successfulTarget = path.join(successfulParent, "local-ledger.json");
    writeFileSync(successfulTarget, '{"revision":0}\n', "utf8");
    const observedTempPaths: string[] = [];
    for (let revision = 1; revision <= 2; revision += 1) {
      const outcome = withExclusiveRepoJsonTransactionV6({
        relativePath: relative(successfulTarget),
        lockSuffix: `offline-success-${revision}`,
        mutate: () => ({ next: { revision }, value: revision }),
        // Synthetic POSIX durability boundary for deterministic offline success.
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: { fsyncDirectory() {} },
        },
        raceHooksForOfflineTestOnly: {
          beforeCommitReattestation(tempPath) { observedTempPaths.push(tempPath); },
        },
      });
      assert.equal(outcome.committed, true);
      assert.equal(outcome.value, revision);
    }
    assert.equal(new Set(observedTempPaths).size, 2);
    assert.equal(observedTempPaths.every((tempPath) => /\.[a-f0-9]{48}\.tmp$/u.test(tempPath)), true);
    assert.deepEqual(JSON.parse(readFileSync(successfulTarget, "utf8")), { revision: 2 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("committed ledger mutation survives close/unlink cleanup faults and oversized bundle is rejected before read", () => {
  const outcome = classifyCommittedTransactionCleanupV6(true, "settled", [
    "LOCK_CLOSE_FAILED_AFTER_COMMIT",
    "LOCK_UNLINK_FAILED_AFTER_COMMIT",
  ]);
  assert.equal(outcome.committed, true);
  assert.equal(outcome.value, "settled");
  assert.deepEqual(outcome.cleanupWarningKinds, [
    "LOCK_CLOSE_FAILED_AFTER_COMMIT",
    "LOCK_UNLINK_FAILED_AFTER_COMMIT",
  ]);
  assert.throws(
    () => classifyCommittedTransactionCleanupV6(false, "not-settled", []),
    /not committed/u,
  );

  const oversized = path.join(here, "private/offline-hostile-oversized-price-bundle.json");
  assert.equal(existsSync(oversized), false);
  try {
    writeFileSync(oversized, "{}", "utf8");
    truncateSync(oversized, PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V6 + 1);
    assert.throws(() => readPrivateAttestedJsonV6(oversized), /pre-read byte ceiling/u);
  } finally {
    rmSync(oversized, { force: true });
  }
});

test("price metadata CLI is blocked before output or fetch under the author protocol", () => {
  const forbiddenOutput = path.join(here, "private/author-freeze-metadata-must-not-exist.json");
  assert.equal(existsSync(forbiddenOutput), false);
  const env = Object.fromEntries([
    "COMSPEC", "PATH", "PATHEXT", "SystemRoot", "TEMP", "TMP", "WINDIR",
  ].flatMap((name) => typeof process.env[name] === "string" ? [[name, process.env[name]!]] : [])) as NodeJS.ProcessEnv;
  const child = spawnSync(process.execPath, [
    tsxCli,
    path.join(here, "capture-price-snapshot.mts"),
    `--output=${forbiddenOutput}`,
  ], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  assert.notEqual(child.status, 0);
  assert.match(String(child.stderr), /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6/u);
  assert.equal(String(child.stdout), "");
  assert.equal(existsSync(forbiddenOutput), false);
});

test("runner structurally reconciles every post-reserve path and forbids unbounded body materialization", () => {
  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  const runStart = source.indexOf("export async function runSealedConnectivityPilotV6");
  const bodyMarker = "): Promise<PublicConnectivityResultV6> {";
  const bodyOpen = source.indexOf(bodyMarker, runStart) + bodyMarker.length;
  const permanentGate = source.indexOf("assertAuthorFreezePermanentlyNoDispatchV6();", runStart);
  const exactWireLoad = source.indexOf("const loaded = exactWire();", runStart);
  const frozenReference = source.indexOf("const frozenReference = frozenRuntimeReferenceFromProtocolV6", runStart);
  const frozenAttestation = source.indexOf("assertFrozenRuntimeEntrypointV6({", frozenReference);
  const authorization = source.indexOf("assertAuthorized(loaded.protocol);", frozenAttestation);
  const priceSnapshot = source.indexOf("const snapshot = validateFreshPriceSnapshot", authorization);
  const create = source.indexOf("const run = createPrivateState", runStart);
  const tryStart = source.indexOf("try {", create);
  const reserve = source.indexOf("reserveGlobalTwo()", tryStart);
  const finallyStart = source.indexOf("} finally {", reserve);
  const intent = source.indexOf('run.writeMarker("terminal-reconciliation-intent.private.json"', finallyStart);
  const settle = source.indexOf("settleGlobal(settlement)", intent);
  assert(runStart >= 0 && permanentGate > runStart, "permanent author freeze must be the first executable statement");
  assert(bodyOpen >= bodyMarker.length && permanentGate >= bodyOpen && source.slice(bodyOpen, permanentGate).trim() === "",
    "no executable statement may precede the permanent author freeze");
  assert(permanentGate < exactWireLoad, "permanent author freeze must precede protocol reads");
  assert(exactWireLoad < frozenReference && frozenReference < frozenAttestation,
    "the exact protocol must bind the frozen entrypoint attestation");
  assert(frozenAttestation < authorization && authorization < priceSnapshot && priceSnapshot < create,
    "frozen entrypoint attestation must precede mutable authorization, pricing, and state creation");
  assert(create > runStart && tryStart > create && reserve > tryStart && finallyStart > reserve);
  assert(intent > finallyStart && settle > intent);
  assert.match(source, /input\.manualReconciliationRequired !== false/u);
  assert.match(source, /if \(primaryError\) throw primaryError;/u);
  assert.match(source, /GLOBAL_SETTLED_SUCCESS_MARKER_FAILED_TERMINAL_NO_REPLAY/u);
  assert.match(source, /globalSettlementSucceeded = true;[\s\S]+terminal-reconciliation-success\.private\.json/u);
  assert.match(source, /while \(run\.state\.charges\.length < run\.state\.physicalFetches\)/u);
  assert.match(source, /buildRunLedgerSettlementForDispatchV6\(\{[\s\S]+physicalFetches: run\.state\.physicalFetches,[\s\S]+candidateOpportunitiesConsumed: run\.state\.candidateOpportunitiesConsumed/u);
  assert.doesNotMatch(source, /response\.text\s*\(/u);
  const charge = source.indexOf("run.state.charges.push(charge)");
  const terminalJournal = source.indexOf('run.append("ASSIGNMENT_', charge);
  assert(charge >= 0 && terminalJournal > charge, "billing charge must precede any fallible terminal journal append");
  const reservationMarker = source.indexOf('writeMarker("private-reservation.private.json"');
  assert(reservationMarker >= 0 && reservationMarker < runStart, "durable no-replay marker construction must precede global reservation orchestration");
});

test("manifest-bound JSON artifacts contain no duration, elapsed time, or random temp path", () => {
  const manifestExists = existsSync(path.join(here, "MANIFEST.sha256"));
  if (!manifestExists) {
    assert.equal(existsSync(path.join(here, "AUTHOR-REPORT.json")), false,
      "an unfrozen development package must not expose an author-freeze report");
  }
  for (const name of [
    "AUTHOR-REPORT.json", "protocol-v6.json", "compiler-closure-v6.json",
    "live-closure-v6.json", "offline-exact-wire-seal-v6.json", "private/exact-wire-v6.private.json",
  ]) {
    if (!existsSync(path.join(here, name))) continue;
    const raw = readFileSync(path.join(here, name), "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/u, "")) as unknown;
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        assert.doesNotMatch(key, /duration|elapsed|wall.?clock|random.?temp|temporary.?directory/iu, `${name}:${key}`);
        visit(child);
      }
    };
    visit(parsed);
    assert.doesNotMatch(raw, /[A-Z]:\\[^"\r\n]*\\Temp\\qgen-connectivity-v6-compiler-|\/tmp\/qgen-connectivity-v6-compiler-/iu);
  }
});

test("global ledger remains exactly 0 used, 0 reserved during author tests", () => {
  const ledger = JSON.parse(readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/budget-ledger.json"), "utf8")) as Record<string, unknown>;
  assert.equal(ledger.capFullQuestionCandidates, 1000);
  for (const field of [
    "usedFullQuestionCandidates", "reservedFullQuestionCandidates", "acceptedQuestions",
    "modelCalls", "inputTokens", "outputTokens", "costUsd",
  ]) assert.equal(ledger[field], 0, field);
  assert.deepEqual(ledger.batches, []);
});
