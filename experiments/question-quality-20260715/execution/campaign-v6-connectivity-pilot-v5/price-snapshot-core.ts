import {
  modelIdsV5,
  sha256V5,
  stableJsonV5,
  validatePriceSnapshotV5,
  type EndpointPriceV5,
  type JsonObject,
  type PublicPriceSnapshotV5,
} from "./protocol-core";
import { METADATA_RESPONSE_BODY_MAX_BYTES_V5 } from "./bounded-response-body";
import { observeDuplicateJsonKeysV5 } from "./strict-json-observer";

export interface RawPublicHttpResponseV5 {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly bodyText: string;
}

export interface RawPublicPriceInputsV5 {
  readonly fetchedAt: string;
  readonly modelsPayload: unknown;
  readonly endpointPayloads: Readonly<Record<string, unknown>>;
  readonly rawHttpResponses: readonly RawPublicHttpResponseV5[];
}

export interface PrivatePriceEvidenceBundleV5 extends JsonObject {
  schemaVersion: "question-quality-openrouter-private-price-evidence-bundle-v5";
  snapshot: PublicPriceSnapshotV5;
  rawHttpResponses: RawPublicHttpResponseV5[];
  bundleSha256: string;
}

function record(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function rows(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a nonempty array`);
  return value.map((entry, index) => record(entry, `${label}[${index}]`));
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  return value;
}

function decimal(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} is not a non-negative decimal`);
  return parsed;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} is not a positive integer`);
  return parsed;
}

function uniqueSortedStrings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    throw new Error(`${label} must be a string array`);
  }
  if (new Set(value as string[]).size !== value.length) {
    throw new Error(`${label} must not contain duplicate declarations`);
  }
  return [...value as string[]].sort();
}

function rawResponseCommitments(input: RawPublicPriceInputsV5): PublicPriceSnapshotV5["sources"]["rawResponseCommitments"] {
  const expectedUrls = [
    "https://openrouter.ai/api/v1/models",
    ...modelIdsV5().map((modelId) => `https://openrouter.ai/api/v1/models/${modelId}/endpoints`),
  ].sort();
  if (input.rawHttpResponses.length !== expectedUrls.length) {
    throw new Error("public pricing capture must bind exactly three raw HTTP responses");
  }
  const ordered = [...input.rawHttpResponses].sort((left, right) => left.url.localeCompare(right.url, "en"));
  if (stableJsonV5(ordered.map((row) => row.url)) !== stableJsonV5(expectedUrls)) {
    throw new Error("public pricing raw HTTP response URL set differs");
  }
  const parsedByUrl = new Map<string, unknown>();
  const commitments = ordered.map((row) => {
    if (row.status !== 200) throw new Error(`${row.url} raw HTTP status must equal 200`);
    if (typeof row.contentType !== "string" ||
        !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(row.contentType.trim())) {
      throw new Error(`${row.url} raw HTTP Content-Type is not JSON`);
    }
    const bodyUtf8Bytes = Buffer.byteLength(row.bodyText, "utf8");
    if (bodyUtf8Bytes < 1 || bodyUtf8Bytes > METADATA_RESPONSE_BODY_MAX_BYTES_V5) {
      throw new Error(`${row.url} raw HTTP body exceeds metadata bound`);
    }
    if (observeDuplicateJsonKeysV5(row.bodyText).length > 0) {
      throw new Error(`${row.url} raw HTTP JSON contains duplicate object keys`);
    }
    parsedByUrl.set(row.url, JSON.parse(row.bodyText) as unknown);
    return {
      url: row.url,
      status: 200 as const,
      contentType: row.contentType,
      bodyUtf8Bytes,
      bodySha256: sha256V5(row.bodyText),
    };
  });
  const modelsUrl = expectedUrls[0]!;
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

const KNOWN_EXTRA_UNIT_DIMENSIONS_V5 = new Set([
  "image",
  "web_search",
  "internal_reasoning",
  "input_cache_read",
  "input_cache_write",
]);

const INAPPLICABLE_UNIT_DIMENSIONS_V5 = new Set([
  "image",
  "web_search",
]);

const BOUNDED_INPUT_TOKEN_DIMENSIONS_V5 = new Set([
  "input_cache_read",
  "input_cache_write",
]);

const BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V5 = new Set([
  "internal_reasoning",
]);

const REQUEST_NON_USE_CONTRACT_V5 = {
  image: "TEXT_ONLY_MESSAGE_CONTENT",
  web_search: "NO_PLUGIN_OR_TOOL_SURFACE",
  internal_reasoning: "REQUEST_DISABLED_RESPONSE_REASONING_TOKENS_MUST_BE_ZERO_IF_PRESENT_AND_MAX_RATE_INCLUDED_IN_OUTPUT_CEILING",
  input_cache_read: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
  input_cache_write: "NO_CACHE_CONTROL_OR_CACHE_REFERENCE_AND_MAX_RATE_INCLUDED_IN_INPUT_CEILING",
} as const;

interface NormalizedPricingV5 {
  prompt: number;
  completion: number;
  request: number;
  extraChargeUsdPerUnit: Record<string, number>;
}

function pricingObject(
  value: unknown,
  label: string,
  chargeDimensions: Set<string>,
  inherited?: NormalizedPricingV5,
  allowOverrides = false,
): NormalizedPricingV5 {
  const pricing = record(value, label);
  const prompt = pricing.prompt === undefined && inherited
    ? inherited.prompt
    : decimal(pricing.prompt, `${label}.prompt`);
  const completion = pricing.completion === undefined && inherited
    ? inherited.completion
    : decimal(pricing.completion, `${label}.completion`);
  if (pricing.request === undefined && !inherited) {
    throw new Error(`${label}.request is absent; v5 does not assume an omitted fixed request fee is zero`);
  }
  const request = pricing.request === undefined
    ? inherited!.request
    : decimal(pricing.request, `${label}.request`);
  const extraChargeUsdPerUnit: Record<string, number> = inherited
    ? { ...inherited.extraChargeUsdPerUnit }
    : {};
  chargeDimensions.add("prompt");
  chargeDimensions.add("completion");
  chargeDimensions.add("request");
  for (const [dimension, raw] of Object.entries(pricing)) {
    if (dimension === "prompt" || dimension === "completion" || dimension === "request") continue;
    if (dimension === "overrides" && allowOverrides) continue;
    if (!KNOWN_EXTRA_UNIT_DIMENSIONS_V5.has(dimension)) {
      throw new Error(`${label}.${dimension} is an unknown charge dimension`);
    }
    const rate = decimal(raw, `${label}.${dimension}`);
    chargeDimensions.add(dimension);
    extraChargeUsdPerUnit[dimension] = rate;
  }
  return { prompt, completion, request, extraChargeUsdPerUnit };
}

function normalizeOverrides(
  pricingRoot: JsonObject,
  basePricing: NormalizedPricingV5,
  label: string,
  chargeDimensions: Set<string>,
): EndpointPriceV5["overrides"] {
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
      basePricing,
    );
    return {
      minPromptTokens: positiveInteger(threshold, `${label}.pricing.overrides[${index}].min_prompt_tokens`),
      promptUsdPerToken: pricing.prompt,
      completionUsdPerToken: pricing.completion,
      fixedRequestUsd: pricing.request,
      extraChargeUsdPerUnit: pricing.extraChargeUsdPerUnit,
    };
  });
  result.sort((left, right) => left.minPromptTokens - right.minPromptTokens);
  if (new Set(result.map((row) => row.minPromptTokens)).size !== result.length) {
    throw new Error(`${label}.pricing.overrides has duplicate thresholds`);
  }
  return result;
}

function normalizeStatus(endpoint: JsonObject, label: string): "active" | "inactive" {
  if (endpoint.status === "active" || endpoint.status === "inactive") return endpoint.status;
  if (Object.hasOwn(endpoint, "status")) throw new Error(`${label}.status is invalid`);
  if (endpoint.is_available === true || endpoint.isAvailable === true) return "active";
  if (endpoint.is_available === false || endpoint.isAvailable === false) return "inactive";
  if (Object.hasOwn(endpoint, "is_available") || Object.hasOwn(endpoint, "isAvailable")) {
    throw new Error(`${label}.is_available is invalid`);
  }
  // OpenRouter's model-specific /endpoints resource is the active routing
  // surface and historically omits a status field. A present status still
  // wins and is validated above; omission on this exact resource means active.
  return "active";
}

function endpointArray(payload: unknown, label: string): JsonObject[] {
  const root = record(payload, label);
  const data = root.data === undefined ? root : record(root.data, `${label}.data`);
  return rows(data.endpoints, `${label}.data.endpoints`);
}

function normalizeEndpoint(endpoint: JsonObject, label: string, chargeDimensions: Set<string>): EndpointPriceV5 {
  for (const forbidden of ["pricing_overrides", "pricingOverrides", "overrides"] as const) {
    if (Object.prototype.hasOwnProperty.call(endpoint, forbidden)) {
      throw new Error(`${label}.${forbidden} is forbidden; endpoint.pricing.overrides is canonical`);
    }
  }
  const pricingRoot = record(endpoint.pricing, `${label}.pricing`);
  const pricing = pricingObject(pricingRoot, `${label}.pricing`, chargeDimensions, undefined, true);
  const supported = uniqueSortedStrings(
    endpoint.supported_parameters ?? endpoint.supportedParameters,
    `${label}.supported_parameters`,
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
    overrides: normalizeOverrides(pricingRoot, pricing, label, chargeDimensions),
  };
}

function modelRows(payload: unknown): JsonObject[] {
  const root = record(payload, "models payload");
  return rows(root.data, "models payload.data");
}

export function buildPublicPriceSnapshotV5(input: RawPublicPriceInputsV5): PublicPriceSnapshotV5 {
  const commitments = rawResponseCommitments(input);
  const requestedIds = modelIdsV5();
  const rawModels = modelRows(input.modelsPayload);
  const chargeDimensions = new Set<string>();
  const models = requestedIds.map((requestedModelId) => {
    const matches = rawModels.filter((row) => row.id === requestedModelId);
    if (matches.length !== 1) throw new Error(`models payload must contain exactly one ${requestedModelId}`);
    const model = matches[0]!;
    const canonicalSlug = nonempty(model.canonical_slug ?? model.canonicalSlug, `${requestedModelId}.canonical_slug`);
    const topPricing = pricingObject(model.pricing, `${requestedModelId}.pricing`, chargeDimensions);
    const payload = input.endpointPayloads[requestedModelId];
    if (payload === undefined) throw new Error(`missing endpoint payload for ${requestedModelId}`);
    const endpointRates = endpointArray(payload, `${requestedModelId} endpoint payload`)
      .map((endpoint, index) => normalizeEndpoint(endpoint, `${requestedModelId}.endpoints[${index}]`, chargeDimensions))
      .sort((left, right) => {
        const leftKey = `${left.tag}\u0000${left.provider}\u0000${left.endpointName}`;
        const rightKey = `${right.tag}\u0000${right.provider}\u0000${right.endpointName}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    const exactActive = endpointRates.filter((row) => row.tag === "google-vertex/global" && row.status === "active");
    if (exactActive.length !== 1) throw new Error(`${requestedModelId} must have exactly one active google-vertex/global endpoint`);
    for (const required of ["response_format", "structured_outputs"]) {
      if (!exactActive[0]!.supportedParameters.includes(required)) {
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
      endpointRates,
    };
  });
  if (!chargeDimensions.has("prompt") || !chargeDimensions.has("completion")) {
    throw new Error("price snapshot lacks prompt/completion charge dimensions");
  }
  const endpointUrls = Object.fromEntries(requestedIds.map((modelId) => [
    modelId,
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
  ]));
  const core = {
    schemaVersion: "question-quality-openrouter-public-price-snapshot-v5" as const,
    fetchedAt: input.fetchedAt,
    sources: {
      modelsUrl: "https://openrouter.ai/api/v1/models" as const,
      endpointUrls,
      rawResponseCommitments: commitments,
    },
    routingContract: {
      exactEndpointTag: "google-vertex/global" as const,
      emergencyCeilingScope: "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES" as const,
      requestNonUseAndResponseAttestationContract: REQUEST_NON_USE_CONTRACT_V5,
    },
    chargeDimensions: [...chargeDimensions].sort(),
    knownInapplicableUnitChargeDimensions: [...chargeDimensions]
      .filter((dimension) => INAPPLICABLE_UNIT_DIMENSIONS_V5.has(dimension))
      .sort(),
    knownBoundedInputTokenChargeDimensions: [...chargeDimensions]
      .filter((dimension) => BOUNDED_INPUT_TOKEN_DIMENSIONS_V5.has(dimension))
      .sort(),
    knownBoundedOutputTokenChargeDimensions: [...chargeDimensions]
      .filter((dimension) => BOUNDED_OUTPUT_TOKEN_DIMENSIONS_V5.has(dimension))
      .sort(),
    models,
  };
  const snapshot = { ...core, contentSha256: sha256V5(stableJsonV5(core)) };
  return validatePriceSnapshotV5(snapshot);
}

export function buildPrivatePriceEvidenceBundleV5(
  snapshot: PublicPriceSnapshotV5,
  rawHttpResponses: readonly RawPublicHttpResponseV5[],
): PrivatePriceEvidenceBundleV5 {
  const validatedSnapshot = validatePriceSnapshotV5(snapshot);
  const byUrl = new Map(rawHttpResponses.map((row) => [row.url, row]));
  if (byUrl.size !== rawHttpResponses.length ||
      byUrl.size !== validatedSnapshot.sources.rawResponseCommitments.length) {
    throw new Error("private price evidence raw response cardinality differs");
  }
  for (const commitment of validatedSnapshot.sources.rawResponseCommitments) {
    const raw = byUrl.get(commitment.url);
    if (!raw || raw.status !== commitment.status || raw.contentType !== commitment.contentType ||
        Buffer.byteLength(raw.bodyText, "utf8") !== commitment.bodyUtf8Bytes ||
        sha256V5(raw.bodyText) !== commitment.bodySha256) {
      throw new Error(`private raw price evidence differs for ${commitment.url}`);
    }
    if (observeDuplicateJsonKeysV5(raw.bodyText).length > 0) {
      throw new Error(`private raw price evidence has duplicate keys for ${commitment.url}`);
    }
  }
  const core = {
    schemaVersion: "question-quality-openrouter-private-price-evidence-bundle-v5" as const,
    snapshot: validatedSnapshot,
    rawHttpResponses: [...rawHttpResponses].sort((left, right) => left.url.localeCompare(right.url, "en")),
  };
  return { ...core, bundleSha256: sha256V5(stableJsonV5(core)) };
}

export function validatePrivatePriceEvidenceBundleV5(value: unknown): PrivatePriceEvidenceBundleV5 {
  const bundle = record(value, "private price evidence bundle");
  if (Object.keys(bundle).sort().join(",") !== "bundleSha256,rawHttpResponses,schemaVersion,snapshot") {
    throw new Error("private price evidence bundle keys differ");
  }
  if (bundle.schemaVersion !== "question-quality-openrouter-private-price-evidence-bundle-v5" ||
      !Array.isArray(bundle.rawHttpResponses) || typeof bundle.bundleSha256 !== "string") {
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
      if (typeof row.url !== "string" || typeof row.status !== "number" ||
          typeof row.contentType !== "string" || typeof row.bodyText !== "string") {
        throw new Error(`private price evidence rawHttpResponses[${index}] shape differs`);
      }
      if (Object.keys(row).sort().join(",") !== "bodyText,contentType,status,url") {
        throw new Error(`private price evidence rawHttpResponses[${index}] keys differ`);
      }
      return row as unknown as RawPublicHttpResponseV5;
    });
  const byUrl = new Map(rawHttpResponses.map((row) => [row.url, JSON.parse(row.bodyText) as unknown]));
  const rebuiltSnapshot = buildPublicPriceSnapshotV5({
    fetchedAt: snapshot.fetchedAt,
    modelsPayload: byUrl.get("https://openrouter.ai/api/v1/models"),
    endpointPayloads: Object.fromEntries(modelIdsV5().map((modelId) => [
      modelId,
      byUrl.get(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`),
    ])),
    rawHttpResponses,
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

export function validatePinnedPrivatePriceEvidenceBundleV5(input: {
  value: unknown;
  observedFileSha256: string;
  expectedFileSha256: string;
  expectedBundleSha256: string;
}): PrivatePriceEvidenceBundleV5 {
  const hash = /^[a-f0-9]{64}$/u;
  if (!hash.test(input.observedFileSha256) || !hash.test(input.expectedFileSha256) ||
      !hash.test(input.expectedBundleSha256)) {
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

export function priceEvidenceForModelV5(snapshot: PublicPriceSnapshotV5, modelId: string): {
  canonicalSlug: string;
  exactProvider: string;
  exactPromptUsdPer1M: number;
  exactCompletionUsdPer1M: number;
  emergencyPromptUsdPer1M: number;
  emergencyCompletionUsdPer1M: number;
  exactRequestUsd: number;
  emergencyRequestUsd: number;
  emergencyCacheReadUsdPer1M: number;
  emergencyCacheWriteUsdPer1M: number;
  emergencyInternalReasoningUsdPer1M: number;
} {
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
      internalReasoning: row.extraChargeUsdPerUnit.internal_reasoning ?? 0,
    },
    ...row.overrides.map((override) => ({
      prompt: override.promptUsdPerToken,
      completion: override.completionUsdPerToken,
      request: override.fixedRequestUsd,
      cacheRead: override.extraChargeUsdPerUnit.input_cache_read ?? 0,
      cacheWrite: override.extraChargeUsdPerUnit.input_cache_write ?? 0,
      internalReasoning: override.extraChargeUsdPerUnit.internal_reasoning ?? 0,
    })),
  ]);
  if (activeRates.length === 0) throw new Error(`price snapshot has no active rates for ${modelId}`);
  const perMillion = (value: number): number => Math.round(value * 1_000_000 * 1e12) / 1e12;
  const maximumCacheRead = Math.max(
    model.topLevelExtraChargeUsdPerUnit.input_cache_read ?? 0,
    ...activeRates.map((row) => row.cacheRead),
  );
  const maximumCacheWrite = Math.max(
    model.topLevelExtraChargeUsdPerUnit.input_cache_write ?? 0,
    ...activeRates.map((row) => row.cacheWrite),
  );
  const emergencyPrompt = Math.max(model.topLevelPromptUsdPerToken, ...activeRates.map((row) => row.prompt)) +
    maximumCacheRead + maximumCacheWrite;
  const maximumInternalReasoning = Math.max(
    model.topLevelExtraChargeUsdPerUnit.internal_reasoning ?? 0,
    ...activeRates.map((row) => row.internalReasoning),
  );
  const emergencyCompletion = Math.max(
    model.topLevelCompletionUsdPerToken,
    ...activeRates.map((row) => row.completion),
  ) + maximumInternalReasoning;
  return {
    canonicalSlug: model.canonicalSlug,
    exactProvider: exact[0]!.provider,
    exactPromptUsdPer1M: perMillion(exact[0]!.promptUsdPerToken),
    exactCompletionUsdPer1M: perMillion(exact[0]!.completionUsdPerToken),
    exactRequestUsd: exact[0]!.fixedRequestUsd,
    // Cache read/write may be activated by provider-side behavior even when
    // the request contains no cache controls. Count every worst-case input
    // token against both maximum rates instead of treating cache as zero-use.
    emergencyPromptUsdPer1M: perMillion(emergencyPrompt),
    emergencyCompletionUsdPer1M: perMillion(emergencyCompletion),
    emergencyRequestUsd: Math.max(model.topLevelFixedRequestUsd, ...activeRates.map((row) => row.request)),
    emergencyCacheReadUsdPer1M: perMillion(maximumCacheRead),
    emergencyCacheWriteUsdPer1M: perMillion(maximumCacheWrite),
    emergencyInternalReasoningUsdPer1M: perMillion(maximumInternalReasoning),
  };
}
