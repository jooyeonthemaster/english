import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const MODEL_IDS = [
  "google/gemini-3.5-flash",
  "google/gemini-3.1-pro-preview",
] as const;
const MODELS_URL = "https://openrouter.ai/api/v1/models";
const EXACT_ROUTE_TAG = "google-vertex/global";
const outPath = resolve(
  process.cwd(),
  "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
);

type JsonRecord = Record<string, unknown>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function finiteRate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function supportedParameters(value: unknown, modelId: string, tag: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`OpenRouter endpoint ${tag} for ${modelId} lacks supported_parameters`);
  }
  const normalized = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`OpenRouter endpoint ${tag} for ${modelId} has an invalid supported parameter`);
    }
    return item.trim();
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`OpenRouter endpoint ${tag} for ${modelId} repeats supported parameters`);
  }
  return normalized.sort((left, right) => left.localeCompare(right, "en"));
}

async function getJson(url: string): Promise<JsonRecord> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const body = asRecord(await response.json());
  if (!body) throw new Error(`${url} did not return a JSON object`);
  return body;
}

function maxRate(values: Array<number | null>): number {
  const finite = values.filter((value): value is number => value !== null);
  if (finite.length === 0) throw new Error("No finite pricing rates found");
  return Math.max(...finite);
}

async function main(): Promise<void> {
  const modelsBody = await getJson(MODELS_URL);
  const models = Array.isArray(modelsBody.data) ? modelsBody.data : [];
  const captured = [];

  for (const id of MODEL_IDS) {
    const model = models.map(asRecord).find((entry) => entry?.id === id);
    if (!model) throw new Error(`OpenRouter model catalog is missing ${id}`);
    const endpointsUrl = `https://openrouter.ai/api/v1/models/${id}/endpoints`;
    const endpointBody = await getJson(endpointsUrl);
    const endpointData = asRecord(endpointBody.data);
    const endpoints = Array.isArray(endpointData?.endpoints)
      ? endpointData.endpoints.map(asRecord).filter((entry): entry is JsonRecord => entry !== null)
      : [];
    if (endpoints.length === 0) throw new Error(`No active endpoints for ${id}`);

    const endpointTags = new Set<string>();
    const endpointRates = endpoints.map((endpoint) => {
      const pricing = asRecord(endpoint.pricing) ?? {};
      const overrides = Array.isArray(pricing.overrides)
        ? pricing.overrides.map(asRecord).filter((entry): entry is JsonRecord => entry !== null)
        : [];
      const tag = typeof endpoint.tag === "string" ? endpoint.tag.trim() : "";
      if (!tag) {
        throw new Error(`OpenRouter endpoint for ${id} is missing its exact routing tag`);
      }
      if (endpointTags.has(tag)) {
        throw new Error(`OpenRouter endpoint tag ${tag} is duplicated for ${id}`);
      }
      endpointTags.add(tag);
      return {
        provider: endpoint.provider_name ?? null,
        endpointName: endpoint.name ?? null,
        tag,
        // The model endpoint listing is the active endpoint surface. Preserve
        // an explicit state so v2 consumers can distinguish it from archived
        // or independently supplied inactive tiers.
        status: "active" as const,
        contextLength: endpoint.context_length ?? null,
        supportedParameters: supportedParameters(endpoint.supported_parameters, id, tag),
        promptUsdPerToken: finiteRate(pricing.prompt),
        completionUsdPerToken: finiteRate(pricing.completion),
        internalReasoningUsdPerToken: finiteRate(pricing.internal_reasoning),
        overrides: overrides.map((override) => ({
          minPromptTokens: finiteRate(override.min_prompt_tokens),
          promptUsdPerToken: finiteRate(override.prompt),
          completionUsdPerToken: finiteRate(override.completion),
        })),
      };
    });
    const exactRouteRates = endpointRates.filter((rate) => rate.tag === EXACT_ROUTE_TAG);
    if (exactRouteRates.length !== 1) {
      throw new Error(
        `${id} must expose exactly one active ${EXACT_ROUTE_TAG} endpoint; found ${exactRouteRates.length}`,
      );
    }
    const exactRouteSupported = new Set(exactRouteRates[0]!.supportedParameters);
    for (const required of ["response_format", "max_tokens"] as const) {
      if (!exactRouteSupported.has(required)) {
        throw new Error(
          `${id} ${EXACT_ROUTE_TAG} does not publicly attest required ${required} support`,
        );
      }
    }

    const under200kPrompt = endpointRates.map((rate) => rate.promptUsdPerToken);
    const under200kCompletion = endpointRates.map((rate) => rate.completionUsdPerToken);
    const allPrompt = endpointRates.flatMap((rate) => [
      rate.promptUsdPerToken,
      ...rate.overrides.map((override) => override.promptUsdPerToken),
    ]);
    const allCompletion = endpointRates.flatMap((rate) => [
      rate.completionUsdPerToken,
      ...rate.overrides.map((override) => override.completionUsdPerToken),
    ]);

    captured.push({
      id,
      name: model.name ?? null,
      canonicalSlug: model.canonical_slug ?? null,
      contextLength: model.context_length ?? null,
      endpointCount: endpointRates.length,
      conservativeRates: {
        exactRoutePromptAnyTierUsdPerToken: maxRate(exactRouteRates.flatMap((rate) => [
          rate.promptUsdPerToken,
          ...rate.overrides.map((override) => override.promptUsdPerToken),
        ])),
        exactRouteCompletionAnyTierUsdPerToken: maxRate(exactRouteRates.flatMap((rate) => [
          rate.completionUsdPerToken,
          ...rate.overrides.map((override) => override.completionUsdPerToken),
        ])),
        promptUnder200kUsdPerToken: maxRate(under200kPrompt),
        completionUnder200kUsdPerToken: maxRate(under200kCompletion),
        promptAnyTierUsdPerToken: maxRate(allPrompt),
        completionAnyTierUsdPerToken: maxRate(allCompletion),
      },
      exactRouteCapabilities: {
        supportedParameters: exactRouteRates[0]!.supportedParameters,
        responseFormatSupported: true,
        structuredOutputsExplicitlyListed: exactRouteSupported.has("structured_outputs"),
        maxTokensSupported: true,
        capabilityClaimScope:
          "PUBLIC_ENDPOINT_DECLARATION_ONLY_NOT_PROOF_OF_THIS_REQUEST_ACCEPTANCE",
      },
      endpointRates,
      endpointsUrl,
    });
  }

  const payloadWithoutHash = {
    schemaVersion: 2,
    fetchedAt: new Date().toISOString(),
    routingContract: {
      allowedEndpointTags: [EXACT_ROUTE_TAG],
      emergencyCeilingScope: "all-active-model-endpoints",
    },
    source: {
      modelsUrl: MODELS_URL,
      documentationUrl:
        "https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints",
      unit: "USD per token as returned by OpenRouter",
    },
    capabilityPolicy: {
      publicEndpointDeclarationRequired: ["response_format", "max_tokens"],
      routingFieldsProvenSeparatelyByExactRequestBody: [
        "provider.only",
        "provider.order",
        "provider.allow_fallbacks",
        "provider.require_parameters",
        "provider.data_collection",
        "provider.zdr",
      ],
      liveAcceptanceClaimRequiresSuccessfulRouterMetadataEvidence: true,
    },
    policy:
      "Admit only the exact google-vertex/global tag rate; reserve the separately recorded highest rate across every active endpoint/service tier as an emergency ceiling. Refuse execution if the snapshot is stale or its externally preregistered hash changes.",
    models: captured,
  };
  const canonical = JSON.stringify(payloadWithoutHash);
  const payload = { ...payloadWithoutHash, snapshotSha256: sha256(canonical) };
  const output = `${JSON.stringify(payload, null, 2)}\n`;

  if (process.argv.includes("--write")) {
    mkdirSync(join(resolve(outPath, "..")), { recursive: true });
    writeFileSync(outPath, output, "utf8");
  }
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
