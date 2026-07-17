import {
  modelIdsV3,
  sha256V3,
  stableJsonV3,
  validatePriceSnapshotV3,
  type EndpointPriceV3,
  type JsonObject,
  type PublicPriceSnapshotV3,
} from "./protocol-core";

export interface RawPublicPriceInputsV3 {
  readonly fetchedAt: string;
  readonly modelsPayload: unknown;
  readonly endpointPayloads: Readonly<Record<string, unknown>>;
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
  return [...new Set(value as string[])].sort();
}

function pricingObject(value: unknown, label: string): JsonObject {
  const pricing = record(value, label);
  decimal(pricing.prompt, `${label}.prompt`);
  decimal(pricing.completion, `${label}.completion`);
  return pricing;
}

function normalizeOverrides(endpoint: JsonObject, label: string): EndpointPriceV3["overrides"] {
  const candidates = endpoint.pricing_overrides ?? endpoint.pricingOverrides ?? endpoint.overrides ?? [];
  if (!Array.isArray(candidates)) throw new Error(`${label}.pricing_overrides must be an array`);
  const result = candidates.map((candidate, index) => {
    const row = record(candidate, `${label}.pricing_overrides[${index}]`);
    const pricing = record(row.pricing ?? row, `${label}.pricing_overrides[${index}].pricing`);
    return {
      minPromptTokens: positiveInteger(
        row.min_prompt_tokens ?? row.minPromptTokens ?? row.min_tokens,
        `${label}.pricing_overrides[${index}].min_prompt_tokens`,
      ),
      promptUsdPerToken: decimal(pricing.prompt, `${label}.pricing_overrides[${index}].prompt`),
      completionUsdPerToken: decimal(pricing.completion, `${label}.pricing_overrides[${index}].completion`),
    };
  });
  result.sort((left, right) => left.minPromptTokens - right.minPromptTokens);
  if (new Set(result.map((row) => row.minPromptTokens)).size !== result.length) {
    throw new Error(`${label}.pricing_overrides has duplicate thresholds`);
  }
  return result;
}

function normalizeStatus(endpoint: JsonObject, label: string): "active" | "inactive" {
  if (endpoint.status === "active" || endpoint.status === "inactive") return endpoint.status;
  if (endpoint.is_available === true || endpoint.isAvailable === true) return "active";
  if (endpoint.is_available === false || endpoint.isAvailable === false) return "inactive";
  throw new Error(`${label} lacks an explicit active/inactive status`);
}

function endpointArray(payload: unknown, label: string): JsonObject[] {
  const root = record(payload, label);
  const data = root.data === undefined ? root : record(root.data, `${label}.data`);
  return rows(data.endpoints, `${label}.data.endpoints`);
}

function normalizeEndpoint(endpoint: JsonObject, label: string, chargeDimensions: Set<string>): EndpointPriceV3 {
  const pricing = pricingObject(endpoint.pricing, `${label}.pricing`);
  for (const key of Object.keys(pricing)) chargeDimensions.add(key);
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
    supportedParameters: supported,
    overrides: normalizeOverrides(endpoint, label),
  };
}

function modelRows(payload: unknown): JsonObject[] {
  const root = record(payload, "models payload");
  return rows(root.data, "models payload.data");
}

export function buildPublicPriceSnapshotV3(input: RawPublicPriceInputsV3): PublicPriceSnapshotV3 {
  const requestedIds = modelIdsV3();
  const rawModels = modelRows(input.modelsPayload);
  const chargeDimensions = new Set<string>();
  const models = requestedIds.map((requestedModelId) => {
    const matches = rawModels.filter((row) => row.id === requestedModelId);
    if (matches.length !== 1) throw new Error(`models payload must contain exactly one ${requestedModelId}`);
    const model = matches[0]!;
    const canonicalSlug = nonempty(model.canonical_slug ?? model.canonicalSlug, `${requestedModelId}.canonical_slug`);
    const topPricing = pricingObject(model.pricing, `${requestedModelId}.pricing`);
    for (const key of Object.keys(topPricing)) chargeDimensions.add(key);
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
    return { requestedModelId, canonicalSlug, endpointRates };
  });
  if (!chargeDimensions.has("prompt") || !chargeDimensions.has("completion")) {
    throw new Error("price snapshot lacks prompt/completion charge dimensions");
  }
  const endpointUrls = Object.fromEntries(requestedIds.map((modelId) => [
    modelId,
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
  ]));
  const core = {
    schemaVersion: "question-quality-openrouter-public-price-snapshot-v3" as const,
    fetchedAt: input.fetchedAt,
    sources: {
      modelsUrl: "https://openrouter.ai/api/v1/models" as const,
      endpointUrls,
    },
    routingContract: {
      exactEndpointTag: "google-vertex/global" as const,
      emergencyCeilingScope: "ALL_ACTIVE_ENDPOINTS_AND_OVERRIDES" as const,
    },
    chargeDimensions: [...chargeDimensions].sort(),
    models,
  };
  const snapshot = { ...core, contentSha256: sha256V3(stableJsonV3(core)) };
  return validatePriceSnapshotV3(snapshot);
}

export function priceEvidenceForModelV3(snapshot: PublicPriceSnapshotV3, modelId: string): {
  canonicalSlug: string;
  exactProvider: string;
  exactPromptUsdPer1M: number;
  exactCompletionUsdPer1M: number;
  emergencyPromptUsdPer1M: number;
  emergencyCompletionUsdPer1M: number;
} {
  const model = snapshot.models.find((row) => row.requestedModelId === modelId);
  if (!model) throw new Error(`price snapshot lacks ${modelId}`);
  const exact = model.endpointRates.filter((row) => row.tag === "google-vertex/global" && row.status === "active");
  if (exact.length !== 1) throw new Error(`price snapshot exact endpoint cardinality failed for ${modelId}`);
  const activeRates = model.endpointRates.filter((row) => row.status === "active").flatMap((row) => [
    { prompt: row.promptUsdPerToken, completion: row.completionUsdPerToken },
    ...row.overrides.map((override) => ({ prompt: override.promptUsdPerToken, completion: override.completionUsdPerToken })),
  ]);
  if (activeRates.length === 0) throw new Error(`price snapshot has no active rates for ${modelId}`);
  const perMillion = (value: number): number => Math.round(value * 1_000_000 * 1e12) / 1e12;
  return {
    canonicalSlug: model.canonicalSlug,
    exactProvider: exact[0]!.provider,
    exactPromptUsdPer1M: perMillion(exact[0]!.promptUsdPerToken),
    exactCompletionUsdPer1M: perMillion(exact[0]!.completionUsdPerToken),
    emergencyPromptUsdPer1M: perMillion(Math.max(...activeRates.map((row) => row.prompt))),
    emergencyCompletionUsdPer1M: perMillion(Math.max(...activeRates.map((row) => row.completion))),
  };
}
