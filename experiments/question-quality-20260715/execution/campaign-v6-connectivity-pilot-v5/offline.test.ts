import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BoundedBodyReadErrorV5,
  MODEL_RESPONSE_BODY_MAX_BYTES_V5,
  readBoundedUtf8ResponseBodyV5,
  RESPONSE_BODY_MAX_CHUNKS_V5,
} from "./bounded-response-body";
import { assertCanonicalDirectPrivateOutputV5, parsePriceCaptureCliArgumentsV5 } from "./capture-output-boundary";
import { readDirectRealEnvLocalCredentialTextV5 } from "./credential-file-boundary";
import { runIsolatedCompilerV5 } from "./compiler-client.mts";
import { buildFrozenRuntimeV5 } from "./build-frozen-runtime.mts";
import {
  assertCurrentNodeRuntimeV5,
  assertFrozenBundleBytesV5,
  validateFrozenRuntimeArtifactV5,
} from "./frozen-runtime-core";
import { computeLiveClosureV5, LIVE_ENTRYPOINTS_V5 } from "./live-closure.mts";
import {
  buildPrivatePriceEvidenceBundleV5,
  buildPublicPriceSnapshotV5,
  priceEvidenceForModelV5,
  validatePrivatePriceEvidenceBundleV5,
  validatePinnedPrivatePriceEvidenceBundleV5,
} from "./price-snapshot-core";
import { extractConnectivityBillingEvidenceV5, parseConnectivityResponseV5 } from "./response-parser";
import { observeDuplicateJsonKeysV5, observeRawCandidateCardinalityV5 } from "./strict-json-observer";
import {
  metadataNetworkDispatchAuthorizedV5,
  sha256V5,
  stableJsonV5,
  validatePriceSnapshotV5,
  validateProtocolV5,
  type JsonObject,
} from "./protocol-core";
import {
  buildAssignmentChargeV5,
  buildFailClosedPostSendChargeV5,
  buildPostSettlementMarkerFailureEvidenceV5,
  buildRunLedgerSettlementV5,
  buildRunLedgerSettlementForDispatchV5,
  buildSettlementFailureEvidenceV5,
  buildTerminalReconciliationIntentV5,
  constructPostSendChargeFailClosedV5,
  projectCandidateCapacityQuarantineV5,
} from "./terminal-reconciliation-core";
import { runDeterministicLocalScenarioV5 } from "./test-support";
import {
  assertExactLiveChildEnvironmentV5,
  assertExactMetadataEnvironmentV5,
  buildExactLiveChildEnvironmentV5,
  buildExactMetadataEnvironmentV5,
  LIVE_CHILD_ENV_NAMES_V5,
  LIVE_CHILD_MARKER_ENV_V5,
  MINIMAL_OS_ENV_NAMES_V5,
  WINDOWS_AUTOINJECTED_ENV_NAMES_V5,
} from "./live-environment";
import {
  assertDirectRealPrivateInputPathV5,
  assertJsonTransactionTargetUnchangedV5,
  assertRealDirectoryV5,
  assertRealRegularFileV5,
  attestJsonTransactionTargetV5,
  classifyCommittedTransactionCleanupV5,
  PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V5,
  readPrivateAttestedJsonV5,
  readPrivateAttestedJsonEvidenceV5,
  readStableMutableJsonV5,
} from "./live-io";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const parseJsonFile = (filePath: string): unknown => JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/u, "")) as unknown;
const protocol = validateProtocolV5(parseJsonFile(path.join(here, "protocol-v5.json")));
const exactWire = parseJsonFile(path.join(here, "private/exact-wire-v5.private.json")) as { rows: Array<{ bodyText: string }> };
const standardBody = JSON.parse(exactWire.rows[0]!.bodyText) as JsonObject;
const responseSchema = ((standardBody.response_format as JsonObject).json_schema as JsonObject).schema as JsonObject;
let frozenBuildPromise: ReturnType<typeof buildFrozenRuntimeV5> | null = null;
function getFrozenBuild() {
  frozenBuildPromise ??= buildFrozenRuntimeV5();
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
  return buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
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
    id: `gen-${sha256V5(model).slice(0, 16)}`,
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
  return buildAssignmentChargeV5({
    ordinal,
    plan,
    reservedCostUsd,
    billing: extractConnectivityBillingEvidenceV5(rawText),
    candidateObservation: observeRawCandidateCardinalityV5(rawText),
    responseCandidateCardinalityUnobservableAfterSend,
  });
}

test("protocol is the blocked v5 author freeze", () => {
  assert.equal(protocol.schemaVersion, "question-quality-v6-connectivity-pilot-protocol-v5");
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

test("author freeze records exactly zero external activity and mutation", () => {
  assert(Object.values(protocol.authorFreezeActivity).every((value) => value === 0));
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
  assert.equal(snapshot.contentSha256, sha256V5(stableJsonV5(core)));
});

test("price snapshot is exact-bound to three bounded raw responses and a private evidence bundle", () => {
  const input = rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  });
  const snapshot = buildPublicPriceSnapshotV5(input);
  assert.equal(snapshot.sources.rawResponseCommitments.length, 3);
  const bundle = buildPrivatePriceEvidenceBundleV5(snapshot, input.rawHttpResponses);
  assert.deepEqual(validatePrivatePriceEvidenceBundleV5(bundle), bundle);
  const tampered = structuredClone(bundle);
  (tampered.rawHttpResponses[0]! as { bodyText: string }).bodyText += " ";
  assert.throws(() => validatePrivatePriceEvidenceBundleV5(tampered), /bundle hash differs|raw price evidence differs/u);

  const forgedSnapshot = structuredClone(snapshot);
  forgedSnapshot.models[0]!.endpointRates[0]!.promptUsdPerToken += 0.000001;
  const forgedCore = { ...forgedSnapshot } as JsonObject;
  delete forgedCore.contentSha256;
  forgedSnapshot.contentSha256 = sha256V5(stableJsonV5(forgedCore));
  const forgedBundle = buildPrivatePriceEvidenceBundleV5(forgedSnapshot, input.rawHttpResponses);
  assert.throws(
    () => validatePrivatePriceEvidenceBundleV5(forgedBundle),
    /does not exactly reproduce normalized snapshot/u,
  );

  const duplicateSource = structuredClone(input);
  (duplicateSource.rawHttpResponses[0]! as { bodyText: string }).bodyText = '{"data":[],"data":[]}';
  duplicateSource.modelsPayload = { data: [] };
  assert.throws(() => buildPublicPriceSnapshotV5(duplicateSource), /duplicate object keys/u);
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
    const authentic = buildPrivatePriceEvidenceBundleV5(buildPublicPriceSnapshotV5(input), input.rawHttpResponses);
    writeFileSync(filePath, `${JSON.stringify(authentic)}\n`, "utf8");
    const captured = readPrivateAttestedJsonEvidenceV5(filePath);
    assert.deepEqual(validatePinnedPrivatePriceEvidenceBundleV5({
      value: captured.value,
      observedFileSha256: captured.fileSha256,
      expectedFileSha256: captured.fileSha256,
      expectedBundleSha256: authentic.bundleSha256,
    }), authentic);

    assert.throws(() => readPrivateAttestedJsonEvidenceV5(filePath, {
      afterTargetOpenBeforeRead() {
        writeFileSync(filePath, " ", { encoding: "utf8", flag: "a" });
      },
    }), /grew during|changed during/u);

    writeFileSync(filePath, `${JSON.stringify(authentic)}\n`, "utf8");
    const pinnedAgain = readPrivateAttestedJsonEvidenceV5(filePath);
    const hostileModels = structuredClone(rawModels) as typeof rawModels;
    hostileModels.data[0]!.pricing.prompt = "0.0000001";
    const hostileInput = rawPriceInput(hostileModels, {
      "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
      "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
    });
    const synthetic = buildPrivatePriceEvidenceBundleV5(
      buildPublicPriceSnapshotV5(hostileInput),
      hostileInput.rawHttpResponses,
    );
    renameSync(filePath, movedPath);
    writeFileSync(filePath, `${JSON.stringify(synthetic)}\n`, "utf8");
    const replaced = readPrivateAttestedJsonEvidenceV5(filePath);
    assert.throws(() => validatePinnedPrivatePriceEvidenceBundleV5({
      value: replaced.value,
      observedFileSha256: replaced.fileSha256,
      expectedFileSha256: pinnedAgain.fileSha256,
      expectedBundleSha256: authentic.bundleSha256,
    }), /file differs/u);
    assert.throws(() => validatePinnedPrivatePriceEvidenceBundleV5({
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
  const premium = priceEvidenceForModelV5(snapshot, "google/gemini-3.1-pro-preview");
  assert.equal(premium.emergencyPromptUsdPer1M, 7.2);
  assert.equal(premium.emergencyCompletionUsdPer1M, 64.8);
  assert.equal(premium.emergencyInternalReasoningUsdPer1M, 32.4);
  assert.deepEqual(snapshot.knownBoundedOutputTokenChargeDimensions, ["internal_reasoning"]);

  const hostileTopLevel = structuredClone(rawModels) as typeof rawModels;
  hostileTopLevel.data[0]!.pricing.prompt = "0.0001";
  hostileTopLevel.data[0]!.pricing.completion = "0.0002";
  const topLevelSnapshot = buildPublicPriceSnapshotV5(rawPriceInput(hostileTopLevel, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  }));
  const topLevelEvidence = priceEvidenceForModelV5(topLevelSnapshot, "google/gemini-3.5-flash");
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
    () => buildPublicPriceSnapshotV5(rawPriceInput(modelsPayload, endpointPayloads)),
    /does not assume an omitted fixed request fee is zero/u,
  );
  for (const model of modelsPayload.data) (model.pricing as JsonObject).request = 0;
  for (const payload of Object.values(endpointPayloads)) {
    const endpoints = ((payload as JsonObject).data as JsonObject).endpoints as JsonObject[];
    for (const endpoint of endpoints) ((endpoint.pricing as JsonObject).request) = 0;
  }
  const admitted = buildPublicPriceSnapshotV5(rawPriceInput(modelsPayload, endpointPayloads));
  assert(admitted.models[1]!.endpointRates.every((endpoint) => endpoint.overrides.length === 1));
  assert(admitted.models[1]!.endpointRates.every((endpoint) => endpoint.overrides[0]!.fixedRequestUsd === 0));
});

test("price snapshot rejects duplicate exact active endpoints", () => {
  const payload = endpointPayload("google/gemini-3.5-flash");
  payload.data.endpoints.push({ ...payload.data.endpoints[0]!, name: "duplicate" });
  assert.throws(() => buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": payload,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /exactly one active/u);
});

test("price snapshot rejects tampered content hash", () => {
  const snapshot = { ...priceSnapshot(), contentSha256: "0".repeat(64) };
  assert.throws(() => validatePriceSnapshotV5(snapshot), /contentSha256/u);
});

test("price snapshot reserves request fees, accepts known request-disabled unit rates, and rejects unknown dimensions", () => {
  const hostileModels = structuredClone(rawModels) as typeof rawModels;
  (hostileModels.data[0]!.pricing as JsonObject).request = "0.01";
  const endpoints = {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  };
  const snapshot = buildPublicPriceSnapshotV5(rawPriceInput(hostileModels, endpoints));
  assert.equal(snapshot.models[0]!.topLevelFixedRequestUsd, 0.01);
  assert.equal(priceEvidenceForModelV5(snapshot, "google/gemini-3.5-flash").emergencyRequestUsd, 0.01);
  assert(!snapshot.knownInapplicableUnitChargeDimensions.includes("internal_reasoning"));
  assert(snapshot.knownBoundedOutputTokenChargeDimensions.includes("internal_reasoning"));

  const cachePricedEndpoint = endpointPayload("google/gemini-3.5-flash");
  (cachePricedEndpoint.data.endpoints[0]!.pricing as JsonObject).input_cache_read = "0.000001";
  (cachePricedEndpoint.data.endpoints[0]!.pricing as JsonObject).input_cache_write = "0.000002";
  const cachePricedSnapshot = buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": cachePricedEndpoint,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  }));
  const cachePricedEvidence = priceEvidenceForModelV5(cachePricedSnapshot, "google/gemini-3.5-flash");
  assert.deepEqual(cachePricedSnapshot.knownBoundedInputTokenChargeDimensions, ["input_cache_read", "input_cache_write"]);
  assert.equal(cachePricedEvidence.emergencyCacheReadUsdPer1M, 1);
  assert.equal(cachePricedEvidence.emergencyCacheWriteUsdPer1M, 2);
  assert.equal(cachePricedEvidence.emergencyPromptUsdPer1M, 5.7);

  const knownUnitRateEndpoint = endpointPayload("google/gemini-3.5-flash");
  (knownUnitRateEndpoint.data.endpoints[0]!.pricing as JsonObject).web_search = "0.0001";
  assert.doesNotThrow(() => buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": knownUnitRateEndpoint,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })));

  const unknownDimensionEndpoint = endpointPayload("google/gemini-3.5-flash");
  (unknownDimensionEndpoint.data.endpoints[0]!.pricing as JsonObject).mystery_charge = "0";
  assert.throws(() => buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": unknownDimensionEndpoint,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /unknown charge dimension/u);
});

test("price snapshot requires canonical nested overrides and rejects ambiguous endpoint metadata", () => {
  const topAlias = endpointPayload("google/gemini-3.5-flash");
  (topAlias.data.endpoints[0]! as JsonObject).pricing_overrides = [];
  assert.throws(() => buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": topAlias,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /forbidden.*pricing\.overrides is canonical/u);

  const invalidStatus = endpointPayload("google/gemini-3.5-flash");
  (invalidStatus.data.endpoints[0]! as JsonObject).status = "offline";
  assert.throws(() => buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": invalidStatus,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /status is invalid/u);

  const duplicateParameter = endpointPayload("google/gemini-3.5-flash");
  duplicateParameter.data.endpoints[0]!.supported_parameters.push("response_format");
  assert.throws(() => buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": duplicateParameter,
    "google/gemini-3.1-pro-preview": endpointPayload("google/gemini-3.1-pro-preview"),
  })), /duplicate declarations/u);

  const inheritedOverride = endpointPayload("google/gemini-3.1-pro-preview");
  const override = ((inheritedOverride.data.endpoints[1]!.pricing as JsonObject).overrides as JsonObject[])[0]!;
  delete override.completion;
  const admitted = buildPublicPriceSnapshotV5(rawPriceInput(rawModels, {
    "google/gemini-3.5-flash": endpointPayload("google/gemini-3.5-flash"),
    "google/gemini-3.1-pro-preview": inheritedOverride,
  }));
  const inherited = admitted.models[1]!.endpointRates.find((endpoint) => endpoint.tag === "other/global")!.overrides[0]!;
  assert.equal(inherited.completionUsdPerToken, 0.0000324);
  assert.equal(inherited.fixedRequestUsd, 0.003);
});

test("response parser requires final usage, exact route, and one semantic question", () => {
  const parsed = parseConnectivityResponseV5(parserInput(responseRaw("google/gemini-3.5-flash-20260519")));
  assert.equal(parsed.promptTokens, 100);
  assert.match(parsed.parserEvidenceHash, /^[a-f0-9]{64}$/u);
});

test("response parser rejects wrong provider", () => {
  assert.throws(() => parseConnectivityResponseV5(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { provider: "Fallback Provider" }),
  )), /provider route/u);
});

test("response parser rejects two semantic questions", () => {
  assert.throws(() => parseConnectivityResponseV5(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { questionCount: 2 }),
  )), /array length|exactly one semantic/u);
});

test("raw candidate observer distinguishes shortage from excess and globally quarantines affirmative overflow", () => {
  const base = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const zeroChoices = structuredClone(base);
  zeroChoices.choices = [];
  const zeroRaw = JSON.stringify(zeroChoices);
  const zeroObservation = observeRawCandidateCardinalityV5(zeroRaw);
  assert.equal(zeroObservation.choiceCardinalityShortage, true);
  assert.equal(zeroObservation.cardinalityAmbiguous, false);
  const zeroSettlement = buildRunLedgerSettlementV5([billingCharge(zeroRaw, 1, "STANDARD")]);
  assert.equal(zeroSettlement.used, 1);
  assert.equal(zeroSettlement.globalCandidateQuarantineRequired, false);

  const twoChoices = structuredClone(base);
  (twoChoices.choices as JsonObject[]).push(structuredClone((twoChoices.choices as JsonObject[])[0]!));
  const twoRaw = JSON.stringify(twoChoices);
  const twoObservation = observeRawCandidateCardinalityV5(twoRaw);
  assert.equal(twoObservation.fullQuestionObjectsObserved, 2);
  assert.equal(twoObservation.choiceCardinalityExcess, true);
  const twoSettlement = buildRunLedgerSettlementV5([billingCharge(twoRaw, 1, "STANDARD")]);
  assert.equal(twoSettlement.used, 2);
  assert.equal(twoSettlement.modelCalls, 1);
  assert.equal(twoSettlement.globalCandidateQuarantineRequired, true);

  const validAndMalformed = structuredClone(base);
  (validAndMalformed.choices as JsonObject[]).push({
    index: 1,
    finish_reason: "stop",
    message: { role: "assistant", content: "{not-json" },
  });
  const mixedObservation = observeRawCandidateCardinalityV5(JSON.stringify(validAndMalformed));
  assert.equal(mixedObservation.fullQuestionObjectsObserved, 1);
  assert.equal(mixedObservation.choiceCardinalityExcess, true);
  assert.equal(mixedObservation.cardinalityAmbiguous, true);
});

test("raw candidate observer fails closed on multi-object, alternate-root, duplicate, and two-question content", () => {
  const base = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  const choice = ((base.choices as JsonObject[])[0]!.message as JsonObject);
  const oneQuestion = JSON.stringify(validContent.questions[0]);

  choice.content = `{"questions":[${oneQuestion}]}{"questions":[${oneQuestion}]}`;
  assert.equal(observeRawCandidateCardinalityV5(JSON.stringify(base)).cardinalityAmbiguous, true);

  choice.content = JSON.stringify({ questions: [validContent.questions[0]], alternate: { questions: [validContent.questions[0]] } });
  assert.equal(observeRawCandidateCardinalityV5(JSON.stringify(base)).cardinalityAmbiguous, true);

  choice.content = `{"questions":[${oneQuestion}],"questions":[${oneQuestion},${oneQuestion}]}`;
  const duplicateObservation = observeRawCandidateCardinalityV5(JSON.stringify(base));
  assert.equal(duplicateObservation.cardinalityAmbiguous, true);
  assert.throws(() => parseConnectivityResponseV5(parserInput(JSON.stringify(base))), /duplicate object keys/u);

  choice.content = JSON.stringify({ questions: [validContent.questions[0], validContent.questions[0]] });
  const twoQuestionRaw = JSON.stringify(base);
  const twoQuestionSettlement = buildRunLedgerSettlementV5([billingCharge(twoQuestionRaw, 1, "STANDARD")]);
  assert.equal(twoQuestionSettlement.observedFullQuestionCandidates, 2);
  assert.equal(twoQuestionSettlement.globalCandidateQuarantineRequired, true);

  const quarantine = projectCandidateCapacityQuarantineV5({
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
    const observation = observeRawCandidateCardinalityV5(raw);
    assert.equal(observation.cardinalityAmbiguous, false);
    assert.equal(observation.candidateUnitsEffective, 1);
    const settlement = buildRunLedgerSettlementV5([billingCharge(raw, 1, "STANDARD")]);
    assert.equal(settlement.used, 1);
    assert.equal(settlement.globalCandidateQuarantineRequired, false);
  }
  const concatenated = `${responseRaw("google/gemini-3.5-flash-20260519")}${responseRaw("google/gemini-3.5-flash-20260519")}`;
  const concatenatedObservation = observeRawCandidateCardinalityV5(concatenated);
  assert.equal(concatenatedObservation.cardinalityAmbiguous, true);
  assert.equal(concatenatedObservation.candidateUnitsEffective, 2);
  assert.equal(buildRunLedgerSettlementV5([billingCharge(concatenated, 1, "STANDARD")]).globalCandidateQuarantineRequired, true);
});

test("truncated first model envelope with complete two-question inner content is globally ambiguous", () => {
  const root = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  ((root.choices as JsonObject[])[0]!.message as JsonObject).content = JSON.stringify({
    questions: [validContent.questions[0], validContent.questions[0]],
  });
  const complete = JSON.stringify(root);
  const truncated = complete.slice(0, -1);
  assert.throws(() => JSON.parse(truncated));
  const observation = observeRawCandidateCardinalityV5(truncated);
  assert.equal(observation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV5([
    billingCharge(truncated, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);
});

test("a complete root followed by a truncated extra root is affirmative ambiguity at both envelopes", () => {
  const validRoot = responseRaw("google/gemini-3.5-flash-20260519");
  const rootObservation = observeRawCandidateCardinalityV5(`${validRoot}{"choices":[`);
  assert.equal(rootObservation.candidateUnitsEffective, 1);
  assert.equal(rootObservation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV5([
    billingCharge(`${validRoot}{"choices":[`, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);

  const outer = JSON.parse(validRoot) as JsonObject;
  const message = ((outer.choices as JsonObject[])[0]!.message as JsonObject);
  message.content = `${JSON.stringify({ questions: [validContent.questions[0]] })}{"questions":[`;
  const contentRaw = JSON.stringify(outer);
  const contentObservation = observeRawCandidateCardinalityV5(contentRaw);
  assert.equal(contentObservation.candidateUnitsEffective, 1);
  assert.equal(contentObservation.cardinalityAmbiguous, true);
  assert.equal(buildRunLedgerSettlementV5([
    billingCharge(contentRaw, 1, "STANDARD"),
  ]).globalCandidateQuarantineRequired, true);
});

test("valid JSON beyond strict observation depth globally quarantines root and content cardinality", () => {
  const baseline = JSON.parse(responseRaw("google/gemini-3.5-flash-20260519")) as JsonObject;
  let deepQuestions: unknown = { questions: [validContent.questions[0], validContent.questions[0]] };
  for (let depth = 0; depth < 130; depth += 1) deepQuestions = { nested: deepQuestions };
  const deepRoot = structuredClone(baseline);
  deepRoot.alternate = deepQuestions;
  assert.equal(observeRawCandidateCardinalityV5(JSON.stringify(deepRoot)).cardinalityAmbiguous, true);
  const deepContent = structuredClone(baseline);
  ((deepContent.choices as JsonObject[])[0]!.message as JsonObject).content = JSON.stringify(deepQuestions);
  assert.equal(observeRawCandidateCardinalityV5(JSON.stringify(deepContent)).cardinalityAmbiguous, true);
});

test("response parser rejects truncated length finish reason", () => {
  assert.throws(() => parseConnectivityResponseV5(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { finishReason: "length" }),
  )), /terminal non-truncated/u);
});

test("response parser rejects a schema-invalid single object", () => {
  assert.throws(() => parseConnectivityResponseV5(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", { content: { questions: [{ unexpected: true }] } }),
  )), /exact response schema|required/u);
});

test("response parser rejects fractional token usage", () => {
  assert.throws(() => parseConnectivityResponseV5(parserInput(
    responseRaw("google/gemini-3.5-flash-20260519", {
      usage: { prompt_tokens: 1.5, completion_tokens: 0.5, total_tokens: 2, cost: 0 },
    }),
  )), /exact final usage/u);
});

test("response parser requires exact token total consistency", () => {
  assert.throws(() => parseConnectivityResponseV5(parserInput(
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
    assert.throws(() => parseConnectivityResponseV5(parserInput(raw)), /unexpected fields/u);
  });
}

test("response parser rejects any unexpected top-level or choice field", () => {
  const top = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519"), (response) => {
    response.service_tier = "default";
  });
  assert.throws(() => parseConnectivityResponseV5(parserInput(top)), /response contains unexpected fields/u);
  const choice = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519"), (response) => {
    (response.choices as JsonObject[])[0]!.text = "shadow content";
  });
  assert.throws(() => parseConnectivityResponseV5(parserInput(choice)), /choices\[0\].*unexpected fields/u);
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
  assert.throws(() => parseConnectivityResponseV5(parserInput(parserFailed)), /exact response schema|required/u);
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
  assert.throws(() => parseConnectivityResponseV5(parserInput(raw)), /reasoning tokens despite/u);
  const billing = extractConnectivityBillingEvidenceV5(raw);
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
  assert.throws(() => parseConnectivityResponseV5(parserInput(raw)), /actual cost evidence|reasoning tokens/u);
  const billing = extractConnectivityBillingEvidenceV5(raw);
  assert.equal(billing.costActualKnown, false);
  assert.equal(billing.reasoningDisabledResponseCompliant, false);
  const charge = billingCharge(raw, 1, "STANDARD", 0.123);
  assert.deepEqual([charge.actualKnown, charge.actualCostUsd, charge.effectiveCostUsd], [false, null, 0.123]);
  const price = priceEvidenceForModelV5(priceSnapshot(), "google/gemini-3.5-flash");
  assert.equal(price.emergencyInternalReasoningUsdPer1M, 16.2);
  assert.equal(price.emergencyCompletionUsdPer1M, 32.4);
});

test("BYOK true or malformed billing never claims zero actual cost and hashes positive upstream evidence", () => {
  const absentByok = mutateResponse(responseRaw("google/gemini-3.5-flash-20260519", {
    usage: { prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0 },
  }), (response) => {
    delete (response.usage as JsonObject).is_byok;
  });
  const absentEvidence = extractConnectivityBillingEvidenceV5(absentByok);
  assert.equal(absentEvidence.costDisposition, "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION");
  assert.deepEqual([absentEvidence.costActualKnown, absentEvidence.actualCostUsd], [false, null]);
  assert.equal(billingCharge(absentByok, 1, "STANDARD", 0.1).effectiveCostUsd, 0.1);

  const byokZero = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0, is_byok: true,
    },
  });
  assert.throws(() => parseConnectivityResponseV5(parserInput(byokZero)), /is_byok.*explicitly false/u);
  const zeroEvidence = extractConnectivityBillingEvidenceV5(byokZero);
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
  const upstreamEvidence = extractConnectivityBillingEvidenceV5(byokUpstream);
  assert.equal(upstreamEvidence.costDisposition, "BYOK_OR_MALFORMED_BILLING_MANUAL_RECONCILIATION");
  assert.match(String(upstreamEvidence.explicitPositiveCostEvidenceHash), /^[a-f0-9]{64}$/u);
  assert.equal(billingCharge(byokUpstream, 1, "STANDARD", 0.1).effectiveCostUsd, 0.1);

  const malformedByok = mutateResponse(byokZero, (response) => {
    (response.usage as JsonObject).is_byok = "false";
  });
  const malformedEvidence = extractConnectivityBillingEvidenceV5(malformedByok);
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
  assert.throws(() => parseConnectivityResponseV5(parserInput(positive)), /cached tokens|cache usage/u);
  const positiveBilling = extractConnectivityBillingEvidenceV5(positive);
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
  assert.throws(() => parseConnectivityResponseV5(parserInput(malformed)), /safe integer/u);
  assert.equal(extractConnectivityBillingEvidenceV5(malformed).cacheDisabledResponseCompliant, false);

  const unknown = responseRaw("google/gemini-3.5-flash-20260519", {
    usage: {
      prompt_tokens: 100, completion_tokens: 25, total_tokens: 125, cost: 0.04,
      cache_read_tokens: 1,
    },
  });
  assert.throws(() => parseConnectivityResponseV5(parserInput(unknown)), /unexpected fields/u);
  const unknownBilling = extractConnectivityBillingEvidenceV5(unknown);
  assert.equal(unknownBilling.actualCostUsd, 0.04);
  assert(unknownBilling.defects.includes("unknown_cache_usage_field"));
});

test("any duplicate or strict-observer failure makes otherwise parseable billing manual", () => {
  const baseline = responseRaw("google/gemini-3.5-flash-20260519");
  const prefix = Array.from({ length: 65 }, (_unused, index) =>
    `"irrelevant_${index}":0,"irrelevant_${index}":1,`).join("");
  const duplicateCost = baseline.replace('"cost":0.01', '"cost":999,"cost":0.01');
  const hiddenAfterPrefix = `{${prefix}${duplicateCost.slice(1)}`;
  const duplicateEvidence = extractConnectivityBillingEvidenceV5(hiddenAfterPrefix);
  assert.equal(duplicateEvidence.costDisposition, "AMBIGUOUS_DUPLICATE_BILLING_KEYS");
  assert.equal(duplicateEvidence.manualCostReconciliationRequired, true);
  assert.equal(observeRawCandidateCardinalityV5(hiddenAfterPrefix).cardinalityAmbiguous, true);

  let deep: unknown = 0;
  for (let depth = 0; depth < 130; depth += 1) deep = [deep];
  const deepRaw = mutateResponse(baseline, (response) => { response.deep_but_valid_json = deep; });
  assert.doesNotThrow(() => JSON.parse(deepRaw));
  const deepEvidence = extractConnectivityBillingEvidenceV5(deepRaw);
  assert.equal(deepEvidence.costDisposition, "AMBIGUOUS_DUPLICATE_BILLING_KEYS");
  assert.equal(deepEvidence.manualCostReconciliationRequired, true);
  assert.equal(observeRawCandidateCardinalityV5(deepRaw).cardinalityAmbiguous, true);
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
  const evidence = extractConnectivityBillingEvidenceV5(raw);
  assert.equal(evidence.costActualKnown, false);
  assert.equal(evidence.costDisposition, "EXPLICIT_POSITIVE_UNREPRESENTABLE");
  assert.equal(evidence.manualCostReconciliationRequired, true);
  assert.match(String(evidence.explicitPositiveCostEvidenceHash), /^[a-f0-9]{64}$/u);
  const charge = billingCharge(raw, 1, "STANDARD", 0.1);
  const secondCharge = billingCharge(raw, 2, "PREMIUM", 0.2);
  const settlement = buildRunLedgerSettlementV5([charge, secondCharge]);
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
  const evidence = extractConnectivityBillingEvidenceV5(raw);
  assert.equal(evidence.costDisposition, "EXPLICIT_POSITIVE_UNREPRESENTABLE");
  assert.equal(evidence.manualCostReconciliationRequired, true);
  assert.match(String(evidence.explicitPositiveCostEvidenceHash), /^[a-f0-9]{64}$/u);
  const settlement = buildRunLedgerSettlementV5([billingCharge(raw, 1, "STANDARD", 0.1)]);
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
  const settlement = buildRunLedgerSettlementV5([first, second]);
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
    readBoundedUtf8ResponseBodyV5({ response: declared, maximumBytes: 4, label: "declared hostile" }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV5 && error.code === "DECLARED_LENGTH_EXCEEDED",
  );
  assert.equal(pulls, pullsBeforeRead);
  assert.equal(cancelled, true);

  const streamed = new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
  }));
  await assert.rejects(
    readBoundedUtf8ResponseBodyV5({ response: streamed, maximumBytes: 4, label: "stream hostile" }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV5 && error.code === "STREAM_LENGTH_EXCEEDED",
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
    readBoundedUtf8ResponseBodyV5({ response, maximumBytes: 32, label: "zero chunk hostile" }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV5 && error.code === "STREAM_CHUNK_COUNT_EXCEEDED",
  );
  assert.equal(emitted, RESPONSE_BODY_MAX_CHUNKS_V5 + 1);
  assert.equal(cancelled, true);
  const source = readFileSync(path.join(here, "bounded-response-body.ts"), "utf8");
  assert.match(source, /const storage = new Uint8Array\(input\.maximumBytes\)/u);
  assert.doesNotMatch(source, /chunks\.push/u);
});

test("bounded reader enforces identity Content-Length equality but not compressed encoded length", async () => {
  await assert.rejects(
    readBoundedUtf8ResponseBodyV5({
      response: new Response("abc", { headers: { "content-length": "2" } }),
      maximumBytes: 16,
      label: "identity mismatch",
    }),
    (error: unknown) => error instanceof BoundedBodyReadErrorV5 && error.code === "CONTENT_LENGTH_MISMATCH",
  );
  const compressed = await readBoundedUtf8ResponseBodyV5({
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
      await readBoundedUtf8ResponseBodyV5({ response, maximumBytes, label: `hostile ${code}` });
    } catch (error) {
      failure = error;
    }
    assert(failure instanceof BoundedBodyReadErrorV5);
    assert.equal(failure.code, code);
    const charge = billingCharge("", 1, "STANDARD", 0.1, true);
    assert.equal(charge.responseCandidateCardinalityUnobservableAfterSend, true);
    assert.equal(charge.candidateCardinalityAmbiguous, true);
    assert.equal(buildRunLedgerSettlementV5([charge]).globalCandidateQuarantineRequired, true);
  };

  await assertFailureQuarantines(
    new Response("", { headers: { "content-length": String(MODEL_RESPONSE_BODY_MAX_BYTES_V5 + 1) } }),
    MODEL_RESPONSE_BODY_MAX_BYTES_V5,
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
  assert.equal(buildRunLedgerSettlementV5([preHeaderTimeoutCharge]).globalCandidateQuarantineRequired, true);
});

test("terminal reconciliation intent and failure evidence are durable no-replay dispositions", () => {
  const settlement = buildRunLedgerSettlementV5([billingCharge("not-json", 1, "STANDARD", 0.1)]);
  const intent = buildTerminalReconciliationIntentV5({
    runId: "offline-fault-injection",
    journalHeadHash: "0".repeat(64),
    settlement,
    status: "JOURNAL_FAILURE_AFTER_RESERVE",
  });
  assert.equal(intent.noReplay, true);
  assert.equal(intent.globalSettlementState, "PENDING_FAIL_CLOSED");
  const failure = buildSettlementFailureEvidenceV5({
    intentSha256: String(intent.intentSha256),
    settlement,
    error: new Error("injected settlement failure"),
  });
  assert.equal(failure.noReplay, true);
  assert.equal(failure.manualReconciliationRequired, true);
  const postSettlementFailure = buildPostSettlementMarkerFailureEvidenceV5({
    intentSha256: String(intent.intentSha256),
    settlement,
    error: new Error("injected success marker failure after settled ledger"),
  });
  assert.equal(postSettlementFailure.globalLedgerSettlementSucceeded, true);
  assert.equal(postSettlementFailure.reservationMayRemain, false);
  assert.equal(postSettlementFailure.noReplay, true);
});

test("post-send extractor, observer, or charge failure synthesizes one conservative charge and forbids zero settlement", () => {
  for (const injectedStage of ["billing extractor", "candidate observer", "charge constructor"] as const) {
    const result = constructPostSendChargeFailClosedV5({
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
    const settlement = buildRunLedgerSettlementForDispatchV5({
      charges: [result.charge],
      physicalFetches: 1,
      candidateOpportunitiesConsumed: 1,
    });
    assert.deepEqual([settlement.used, settlement.modelCalls], [1, 1]);
    assert.equal(settlement.globalCandidateQuarantineRequired, true);
  }
  assert.throws(() => buildRunLedgerSettlementForDispatchV5({
    charges: [],
    physicalFetches: 1,
    candidateOpportunitiesConsumed: 1,
  }), /charge coverage differs/u);
  assert.equal(buildFailClosedPostSendChargeV5({
    ordinal: 2,
    plan: "PREMIUM",
    reservedCostUsd: 0.2,
    failure: new Error("outer finally injection"),
  }).ordinal, 2);
});

test("pure offline scenario completes only Standard then Premium", () => {
  const result = runDeterministicLocalScenarioV5([
    { plan: "STANDARD", rawText: responseRaw("std-canonical"), requestedModel: "std", allowedServedModels: ["std-canonical"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema },
    { plan: "PREMIUM", rawText: responseRaw("pro-canonical"), requestedModel: "pro", allowedServedModels: ["pro-canonical"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema },
  ]);
  assert.equal(result.terminal, "COMPLETED");
  assert.deepEqual([result.candidateOpportunities, result.physicalFetches, result.completions], [2, 2, 2]);
});

test("pure offline failure is terminal and never reaches Premium", () => {
  const result = runDeterministicLocalScenarioV5(["FAIL_BEFORE_RESPONSE", {
    plan: "PREMIUM", rawText: responseRaw("pro"), requestedModel: "pro", allowedServedModels: ["pro"], expectedProvider: "Google Vertex", allowedFinishReasons: ["stop"], responseSchema,
  }]);
  assert.equal(result.terminal, "FAILED_TERMINAL");
  assert.equal(result.started, 1);
});

test("pure offline unknown-after-send is terminal and consumes one opportunity", () => {
  const result = runDeterministicLocalScenarioV5(["UNKNOWN_AFTER_SEND"]);
  assert.equal(result.terminal, "UNKNOWN_AFTER_SEND_TERMINAL");
  assert.equal(result.candidateOpportunities, 1);
});

test("live entrypoint set is exact, sorted, and versioned v5", () => {
  assert.deepEqual([...LIVE_ENTRYPOINTS_V5], [...LIVE_ENTRYPOINTS_V5].sort());
  assert(LIVE_ENTRYPOINTS_V5.every((entry) => entry.includes("campaign-v6-connectivity-pilot-v5")));
});

test("computed live closure excludes every offline test-support and author tool", async () => {
  const closure = computeLiveClosureV5({ declaredRuntimeArtifactBytes: await frozenClosureOverrides() });
  const paths = closure.files.map((row) => row.path);
  assert(!paths.some((entry) => /offline\.test|test-support|verify|build-offline/u.test(entry)));
});

test("computed live closure has exact bytes/hash rows and no minimum-count rule", async () => {
  const overrides = await frozenClosureOverrides();
  const closure = computeLiveClosureV5({ declaredRuntimeArtifactBytes: overrides });
  for (const row of closure.files) {
    const bytes = overrides.get(row.path) ?? readFileSync(path.join(repoRoot, row.path));
    assert.equal(bytes.byteLength, row.bytes);
    assert.equal(sha256V5(bytes), row.sha256);
  }
  assert.equal(closure.completeness.minimumCountAcceptanceUsed, false);
  assert.equal(closure.files.length, Number(protocol.liveClosureContract.exactExpectedFiles));
  assert.equal(closure.externalRuntimeFiles.length, 1);
  assert.equal(closure.externalRuntimeFiles[0]!.sha256, sha256V5(readFileSync(process.execPath)));
  const omitted = new Map(overrides);
  omitted.delete([...omitted.keys()][0]!);
  assert.throws(
    () => computeLiveClosureV5({ declaredRuntimeArtifactBytes: omitted }),
    /override set differs/u,
  );
  const extra = new Map(overrides);
  extra.set("experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/extra.mjs", new Uint8Array([1]));
  assert.throws(
    () => computeLiveClosureV5({ declaredRuntimeArtifactBytes: extra }),
    /override set differs/u,
  );
  const mutated = new Map(overrides);
  const firstPath = [...mutated.keys()][0]!;
  const hostileBytes = Buffer.from(mutated.get(firstPath)!);
  hostileBytes[0] = hostileBytes[0]! ^ 1;
  mutated.set(firstPath, hostileBytes);
  assert.notEqual(
    computeLiveClosureV5({ declaredRuntimeArtifactBytes: mutated }).exactFileSetAndBytesSha256,
    closure.exactFileSetAndBytesSha256,
  );
});

test("compiler closure is a complete exact set, not the inherited 32-row subset", () => {
  const closure = runIsolatedCompilerV5().compilerClosure;
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
  assert.deepEqual([...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/gu)].map((match) => match[1]), ["runSealedConnectivityPilotV5"]);
});

test("test support has no network, child-process, env, filesystem, or production-runner import capability", () => {
  const source = readFileSync(path.join(here, "test-support.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["']node:(?:http|https|net|tls|dns|fs|child_process|worker_threads)["']|process\.env|globalThis\.fetch|\bfetch\s*\(|production-runner/iu);
});

test("operator freeze has no callable CLI dispatch path", () => {
  const source = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.match(source, /assertAuthorFreezePermanentlyNoDispatchV5/u);
  assert.match(source, /authorization\.dispatchCommandPresent !== true/u);
  const liveStart = source.indexOf("export async function launchConnectivityPilotV5AfterFutureAuthorization");
  const handoffLookup = source.indexOf("priceCaptureHandoffsV5.get", liveStart);
  const pinnedValidation = source.indexOf("validatePinnedPrivatePriceEvidenceBundleV5", handoffLookup);
  const handoffDelete = source.indexOf("priceCaptureHandoffsV5.delete", pinnedValidation);
  const credentialRead = source.indexOf("readOnlyOpenRouterAssignment()", handoffDelete);
  const spawnCall = source.indexOf("const child = spawn", credentialRead);
  assert(liveStart >= 0 && handoffLookup > liveStart && pinnedValidation > handoffLookup &&
    handoffDelete > pinnedValidation && credentialRead > handoffDelete && spawnCall > credentialRead,
  "capture file/bundle hashes must be one-shot validated before credential read or live child spawn");
  const captureStart = source.indexOf("export async function launchPriceMetadataCaptureV5AfterFutureAuthorization");
  const captureExit = source.indexOf("const exitCode = await waitForChild", captureStart);
  const captureEvidence = source.indexOf("readPrivateAttestedJsonEvidenceV5", captureExit);
  const captureMapSet = source.indexOf("priceCaptureHandoffsV5.set", captureEvidence);
  assert(captureStart >= 0 && captureExit > captureStart && captureEvidence > captureExit && captureMapSet > captureEvidence,
    "only a successful metadata child may create the in-memory live handoff");
});

test("operator parses the no-BOM protocol and rejects both dormant launch paths before spawn", async () => {
  const wrapperModule = await import("./operator-wrapper.mts");
  const wrapper = (wrapperModule as unknown as { default?: typeof wrapperModule }).default ?? wrapperModule;
  await assert.rejects(
    wrapper.launchConnectivityPilotV5AfterFutureAuthorization({ runId: "offline", priceSnapshotPath: "offline" }),
    /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5/u,
  );
  await assert.rejects(
    wrapper.launchPriceMetadataCaptureV5AfterFutureAuthorization({ outputPath: "offline" }),
    /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5/u,
  );
});

test("frozen plain-ESM runtime binds every bundle and the exact Node executable without tsx", async () => {
  const frozen = await getFrozenBuild();
  assert.equal(frozen.artifact.bundles.length, 3);
  assert(frozen.artifact.externalRuntimeSpecifiers.every((specifier) => specifier.startsWith("node:")));
  assertCurrentNodeRuntimeV5(frozen.artifact.nodeRuntime);
  for (const row of frozen.artifact.bundles) {
    const bytes = frozen.bundleBytesByRole.get(row.role)!;
    assertFrozenBundleBytesV5(frozen.artifact, row.role, bytes);
    const hostile = Buffer.from(bytes);
    hostile[Math.floor(hostile.length / 2)] = hostile[Math.floor(hostile.length / 2)]! ^ 1;
    assert.throws(() => assertFrozenBundleBytesV5(frozen.artifact, row.role, hostile), /bundle bytes differ/u);
  }
  const hostileNode = structuredClone(frozen.artifact.nodeRuntime);
  hostileNode.nodeVersion = "v0.0.0-hostile";
  assert.throws(() => assertCurrentNodeRuntimeV5(hostileNode), /Node executable identity differs/u);
  const hostileBuiltin = structuredClone(frozen.artifact);
  hostileBuiltin.bundles[0]!.externalRuntimeSpecifiers.push("node:net");
  assert.throws(() => validateFrozenRuntimeArtifactV5(hostileBuiltin), /Node builtin allowlist differs/u);
  const hostileDynamicCode = structuredClone(frozen.artifact);
  hostileDynamicCode.bundles[1]!.forbiddenSyntaxCounts.dynamicImport = 1 as 0;
  assert.throws(() => validateFrozenRuntimeArtifactV5(hostileDynamicCode), /forbidden dynamic/u);
  const operatorBytes = frozen.bundleBytesByRole.get("OPERATOR")!.toString("utf8");
  assert.doesNotMatch(operatorBytes, /node_modules[\\/]tsx|tsx\/dist|tsxCli/u);
  const wrapperSource = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.doesNotMatch(wrapperSource, /node_modules[\\/]tsx|tsx\/dist|tsxCli/u);

  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v5-frozen-no-dispatch-"));
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
    writeFileSync(path.join(fixture, "protocol-v5.json"), `${JSON.stringify(hostileProtocol)}\n`, "utf8");
    const frozenOperator = await import(`${pathToFileURL(path.join(frozenDirectory, "operator-wrapper-v5.bundle.mjs")).href}?offline=${Date.now()}`);
    await assert.rejects(
      frozenOperator.launchConnectivityPilotV5AfterFutureAuthorization({ runId: "hostile", priceSnapshotPath: "hostile" }),
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5/u,
    );
    await assert.rejects(
      frozenOperator.launchPriceMetadataCaptureV5AfterFutureAuthorization({ outputPath: "hostile" }),
      /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5/u,
    );
    for (const entry of ["live-child-v5.bundle.mjs", "capture-price-snapshot-v5.bundle.mjs"]) {
      const child = spawnSync(process.execPath, [path.join(frozenDirectory, entry)], {
        cwd: fixture,
        env: {},
        encoding: "utf8",
        windowsHide: true,
      });
      assert.notEqual(child.status, 0);
      assert.match(`${child.stdout}\n${child.stderr}`, /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5/u);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("live and metadata child launchers share exact minimal environment names with no ambient preload", () => {
  const source: NodeJS.ProcessEnv = {
    SystemRoot: "C:\\Windows", PATH: "C:\\Windows\\System32", TEMP: "C:\\Temp", WINDIR: "C:\\Windows",
    PATHEXT: ".EXE", TMP: "C:\\Temp", COMSPEC: "C:\\Windows\\System32\\cmd.exe",
  };
  const metadata = buildExactMetadataEnvironmentV5(source);
  assert.deepEqual(Object.keys(metadata).sort(), MINIMAL_OS_ENV_NAMES_V5.filter((name) => source[name]).sort());
  const injected = process.platform === "win32"
    ? Object.fromEntries(WINDOWS_AUTOINJECTED_ENV_NAMES_V5.map((name) => [name, `os-${name}`]))
    : {};
  const observedMetadata = { ...metadata, ...injected };
  assert.doesNotThrow(() => assertExactMetadataEnvironmentV5(observedMetadata));
  const live = buildExactLiveChildEnvironmentV5(source, "dummy-openrouter-key");
  assert.deepEqual(Object.keys(live).sort(), LIVE_CHILD_ENV_NAMES_V5.filter((name) => live[name]).sort());
  assert.equal(live[LIVE_CHILD_MARKER_ENV_V5], "1");
  const observedLive = { ...live, ...injected };
  assert.doesNotThrow(() => assertExactLiveChildEnvironmentV5(observedLive));
  assert.throws(() => assertExactLiveChildEnvironmentV5({ ...observedLive, NODE_OPTIONS: "--require=hostile" }), /exact environment name set differs|non-allowlisted/u);
  assert.throws(() => assertExactLiveChildEnvironmentV5({ ...observedLive, GEMINI_API_KEY: "hostile" }), /exact environment name set differs|non-allowlisted/u);
  const missingInjected = { ...observedMetadata };
  if (process.platform === "win32") delete missingInjected.HOMEDRIVE;
  else delete missingInjected.PATH;
  assert.throws(() => assertExactMetadataEnvironmentV5(missingInjected), /exact environment name set differs/u);
  assert.throws(() => assertExactMetadataEnvironmentV5({ ...observedMetadata, APPDATA: "hostile" }), /exact environment name set differs|non-allowlisted/u);
  const wrapperSource = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.doesNotMatch(wrapperSource, /import\s+.*capture-price-snapshot|from\s+["'].+capture-price-snapshot/iu);
  assert.match(wrapperSource, /buildExactMetadataEnvironmentV5/u);
  assert.match(wrapperSource, /`--output=\$\{path\.resolve\(input\.outputPath\)\}`/u);
});

test("metadata authorization policy exhaustively checks all 16 boolean permutations", () => {
  for (const liveExecutionAuthorized of [false, true]) {
    for (const metadataNetworkAuthorized of [false, true]) {
      for (const hostileAuditPassed of [false, true]) {
        for (const dispatchCommandPresent of [false, true]) {
          const actual = metadataNetworkDispatchAuthorizedV5({
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
  assert.deepEqual(parsePriceCaptureCliArgumentsV5(["--output=x.json"]), { outputPath: "x.json" });
  for (const args of [
    [] as string[],
    ["--output=a.json", "--output=b.json"],
    ["--output=a.json", "--extra"],
    ["--extra"],
    ["--output=a--output=b.json"],
  ]) assert.throws(() => parsePriceCaptureCliArgumentsV5(args), /exactly one --output/u);

  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v5-output-boundary-"));
  try {
    const realRoot = path.join(fixture, "private");
    mkdirSync(realRoot);
    const direct = path.join(realRoot, "price-snapshot.json");
    assert.equal(assertCanonicalDirectPrivateOutputV5(direct, realRoot), direct);
    assert.throws(
      () => assertCanonicalDirectPrivateOutputV5(path.join(realRoot, "nested/escape.json"), realRoot),
      /direct child/u,
    );
    const linkedRoot = path.join(fixture, "private-link");
    symlinkSync(realRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => assertCanonicalDirectPrivateOutputV5(path.join(linkedRoot, "escape.json"), linkedRoot),
      /real directory|symlink|junction/u,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("private input and run-directory boundaries reject symlink and junction traversal", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v5-private-boundary-"));
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
    assert.throws(() => assertDirectRealPrivateInputPathV5(linkedFile, linkedPrivateRoot), /real directory|symlink|junction/u);
    assert.throws(() => assertRealRegularFileV5(linkedFile, "hostile private input"), /parent.*symlink|junction|traverses/u);

    const runsJunction = path.join(privateRoot, "runs");
    symlinkSync(externalRoot, runsJunction, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertRealDirectoryV5(runsJunction, "hostile runs root"), /real directory|symlink|junction/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("sole credential source is a stable direct real file and rejects file links, junction roots, and disappearance", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v5-credential-boundary-"));
  try {
    const realRoot = path.join(fixture, "repo");
    mkdirSync(realRoot);
    const envPath = path.join(realRoot, ".env.local");
    writeFileSync(envPath, "UNRELATED=fixture\n", "utf8");
    assert.equal(readDirectRealEnvLocalCredentialTextV5(realRoot, envPath), "UNRELATED=fixture\n");

    const external = path.join(fixture, process.platform === "win32" ? "external-dir" : "external.env");
    if (process.platform === "win32") mkdirSync(external);
    else writeFileSync(external, "UNRELATED=external\n", "utf8");
    rmSync(envPath);
    symlinkSync(external, envPath, process.platform === "win32" ? "junction" : "file");
    assert.throws(() => readDirectRealEnvLocalCredentialTextV5(realRoot, envPath), /real regular file|symlink|junction/u);
    rmSync(envPath, { recursive: true, force: true });

    const linkedRoot = path.join(fixture, "repo-link");
    symlinkSync(realRoot, linkedRoot, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => readDirectRealEnvLocalCredentialTextV5(linkedRoot, path.join(linkedRoot, ".env.local")),
      /real directory|symlink|junction|ENOENT/u,
    );

    writeFileSync(envPath, "UNRELATED=renamed\n", "utf8");
    renameSync(envPath, path.join(realRoot, ".env.local.moved"));
    assert.throws(() => readDirectRealEnvLocalCredentialTextV5(realRoot, envPath), /ENOENT/u);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("credential read fails closed on grow, truncate, and same-size in-place rewrite races", () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v5-credential-races-"));
  try {
    const envPath = path.join(fixture, ".env.local");
    const original = "OPENROUTER_API_KEY=fixture-only-not-secret\n";

    writeFileSync(envPath, original, "utf8");
    assert.throws(() => readDirectRealEnvLocalCredentialTextV5(fixture, envPath, {
      afterOpenBeforeRead() {
        writeFileSync(envPath, "GROW", { encoding: "utf8", flag: "a" });
      },
    }), /grew beyond|changed during/u);

    writeFileSync(envPath, original, "utf8");
    assert.throws(() => readDirectRealEnvLocalCredentialTextV5(fixture, envPath, {
      afterOpenBeforeRead() { truncateSync(envPath, 2); },
    }), /truncated during|changed during/u);

    writeFileSync(envPath, original, "utf8");
    const replacement = original.replace("fixture-only-not-secret", "hostile-only-not-secret");
    assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
    assert.throws(() => readDirectRealEnvLocalCredentialTextV5(fixture, envPath, {
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
  const fixture = mkdtempSync(path.join(os.tmpdir(), "qgen-v5-ledger-races-"));
  try {
    const parent = path.join(fixture, "ledger-parent");
    mkdirSync(parent);
    const target = path.join(parent, "budget-ledger.json");

    writeFileSync(target, '{"usedFullQuestionCandidates":900,"usedFullQuestionCandidates":0}\n', "utf8");
    assert.throws(
      () => readStableMutableJsonV5(attestJsonTransactionTargetV5(target), {}),
      /duplicate JSON keys/u,
    );

    writeFileSync(target, '\uFEFF{"usedFullQuestionCandidates":0}\n', "utf8");
    assert.throws(
      () => readStableMutableJsonV5(attestJsonTransactionTargetV5(target), {}),
      /must not contain a UTF-8 BOM/u,
    );

    writeFileSync(target, '{"usedFullQuestionCandidates":0}\n', "utf8");
    const readAttestation = attestJsonTransactionTargetV5(target);
    assert.throws(() => readStableMutableJsonV5(readAttestation, {
      afterTargetOpenBeforeRead() {
        writeFileSync(target, '{"usedFullQuestionCandidates":0,"padding":"growth"}\n', "utf8");
      },
    }), /grew during|changed during/u);

    writeFileSync(target, '{"usedFullQuestionCandidates":0}\n', "utf8");
    const targetSwapAttestation = attestJsonTransactionTargetV5(target);
    renameSync(target, `${target}.old`);
    writeFileSync(target, '{"usedFullQuestionCandidates":0}\n', "utf8");
    assert.throws(
      () => assertJsonTransactionTargetUnchangedV5(targetSwapAttestation),
      /changed identity/u,
    );
    rmSync(`${target}.old`);

    const parentAttestation = attestJsonTransactionTargetV5(target);
    const movedParent = `${parent}.moved`;
    const externalParent = path.join(fixture, "external-parent");
    mkdirSync(externalParent);
    writeFileSync(path.join(externalParent, "budget-ledger.json"), '{"usedFullQuestionCandidates":0}\n', "utf8");
    renameSync(parent, movedParent);
    symlinkSync(externalParent, parent, process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => assertJsonTransactionTargetUnchangedV5(parentAttestation),
      /real directory|symlink|junction|changed identity|traverses/u,
    );
    rmSync(parent, { recursive: true, force: true });
    renameSync(movedParent, parent);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("committed ledger mutation survives close/unlink cleanup faults and oversized bundle is rejected before read", () => {
  const outcome = classifyCommittedTransactionCleanupV5(true, "settled", [
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
    () => classifyCommittedTransactionCleanupV5(false, "not-settled", []),
    /not committed/u,
  );

  const oversized = path.join(here, "private/offline-hostile-oversized-price-bundle.json");
  assert.equal(existsSync(oversized), false);
  try {
    writeFileSync(oversized, "{}", "utf8");
    truncateSync(oversized, PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V5 + 1);
    assert.throws(() => readPrivateAttestedJsonV5(oversized), /pre-read byte ceiling/u);
  } finally {
    rmSync(oversized, { force: true });
  }
});

test("price metadata CLI is blocked before output or fetch under the author protocol", () => {
  const forbiddenOutput = path.join(here, "private/author-freeze-metadata-must-not-exist.json");
  assert.equal(existsSync(forbiddenOutput), false);
  const env = Object.fromEntries([
    "COMSPEC", "PATH", "PATHEXT", "SystemRoot", "TEMP", "TMP", "WINDIR",
  ].flatMap((name) => typeof process.env[name] === "string" ? [[name, process.env[name]!]] : []));
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
  assert.match(String(child.stderr), /AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5/u);
  assert.equal(String(child.stdout), "");
  assert.equal(existsSync(forbiddenOutput), false);
});

test("runner structurally reconciles every post-reserve path and forbids unbounded body materialization", () => {
  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  const runStart = source.indexOf("export async function runSealedConnectivityPilotV5");
  const bodyMarker = "): Promise<PublicConnectivityResultV5> {";
  const bodyOpen = source.indexOf(bodyMarker, runStart) + bodyMarker.length;
  const permanentGate = source.indexOf("assertAuthorFreezePermanentlyNoDispatchV5();", runStart);
  const exactWireLoad = source.indexOf("const loaded = exactWire();", runStart);
  const frozenReference = source.indexOf("const frozenReference = frozenRuntimeReferenceFromProtocolV5", runStart);
  const frozenAttestation = source.indexOf("assertFrozenRuntimeEntrypointV5({", frozenReference);
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
  assert.match(source, /buildRunLedgerSettlementForDispatchV5\(\{[\s\S]+physicalFetches: run\.state\.physicalFetches,[\s\S]+candidateOpportunitiesConsumed: run\.state\.candidateOpportunitiesConsumed/u);
  assert.doesNotMatch(source, /response\.text\s*\(/u);
  const charge = source.indexOf("run.state.charges.push(charge)");
  const terminalJournal = source.indexOf('run.append("ASSIGNMENT_', charge);
  assert(charge >= 0 && terminalJournal > charge, "billing charge must precede any fallible terminal journal append");
  const reservationMarker = source.indexOf('writeMarker("private-reservation.private.json"');
  assert(reservationMarker >= 0 && reservationMarker < runStart, "durable no-replay marker construction must precede global reservation orchestration");
});

test("manifest-bound JSON artifacts contain no duration, elapsed time, or random temp path", () => {
  for (const name of [
    "AUTHOR-REPORT.json", "protocol-v5.json", "compiler-closure-v5.json",
    "live-closure-v5.json", "offline-exact-wire-seal-v5.json", "private/exact-wire-v5.private.json",
  ]) {
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
    assert.doesNotMatch(raw, /[A-Z]:\\[^"\r\n]*\\Temp\\qgen-connectivity-v5-compiler-|\/tmp\/qgen-connectivity-v5-compiler-/iu);
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
