import {
  createOpenAICompatible,
  type MetadataExtractor,
} from "@ai-sdk/openai-compatible";

export const ATLAS_CLOUD_PROVIDER = "atlascloud" as const;

const ATLAS_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const GEMINI_FLASH_LITE_MODEL = "google/gemini-3.1-flash-lite";
const GEMINI_FLASH_MODEL = "google/gemini-3.5-flash";
const CLAUDE_SONNET_MODEL = "anthropic/claude-sonnet-5";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readFirstEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return undefined;
}

export function normalizeAtlasModelId(modelId: string | undefined | null): string {
  const raw = modelId?.trim();
  if (!raw) return GEMINI_FLASH_MODEL;
  const lower = raw.toLowerCase();

  if (
    lower === "gemini-3.1-flash-lite" ||
    lower === "google/gemini-3.1-flash-lite" ||
    lower === "gemini-3.1-flash-lite-preview" ||
    lower === "google/gemini-3.1-flash-lite-preview"
  ) {
    return GEMINI_FLASH_LITE_MODEL;
  }

  if (lower === "gemini-3.5-flash" || lower === "google/gemini-3.5-flash") {
    return GEMINI_FLASH_MODEL;
  }

  if (
    lower === "claude" ||
    lower === "sonnet" ||
    lower === "claude-sonnet" ||
    lower === "claude-sonnet-4-6" ||
    lower === "claude-sonnet-4.6" ||
    lower === "anthropic/claude-sonnet-4-6" ||
    lower === "anthropic/claude-sonnet-4.6" ||
    lower === "anthropic/claude-sonnet-5"
  ) {
    return CLAUDE_SONNET_MODEL;
  }

  if (lower.startsWith("google/") || lower.startsWith("anthropic/")) {
    return raw;
  }

  if (lower.startsWith("gemini-")) {
    return `google/${raw}`;
  }

  if (lower.startsWith("claude-")) {
    return CLAUDE_SONNET_MODEL;
  }

  return raw;
}

function resolveAtlasModel(envNames: readonly string[], fallback: string): string {
  return normalizeAtlasModelId(readFirstEnv(envNames) ?? fallback);
}

export const ATLASCLOUD_BASE_URL =
  readFirstEnv(["OPENROUTER_BASE_URL", "ATLASCLOUD_TEXT_BASE_URL", "ATLASCLOUD_BASE_URL"]) ??
  ATLAS_DEFAULT_BASE_URL;

export const ATLASCLOUD_API_KEY =
  readFirstEnv(["OPENROUTER_API_KEY", "ATLASCLOUD_TEXT_API_KEY", "ATLASCLOUD_API_KEY"]) ?? "";

/**
 * 텍스트/비전 LLM 트래픽이 실제로 통과하는 게이트웨이. 원가 원장(platform-api-costs)의
 * provider 버킷으로 그대로 쓰인다 — OpenRouter 로 라우팅 중이면 OPENROUTER,
 * 아니면 레거시 ATLASCLOUD. (이미지 생성 atlas.ts 는 항상 AtlasCloud 직행.)
 */
export const ATLAS_GATEWAY_PROVIDER: "OPENROUTER" | "ATLASCLOUD" =
  ATLASCLOUD_BASE_URL.toLowerCase().includes("openrouter")
    ? "OPENROUTER"
    : "ATLASCLOUD";

export const ATLAS_FREE_MODEL_ID = resolveAtlasModel(
  [
    "OPENROUTER_FREE_MODEL",
    "OPENROUTER_GEMINI_FLASH_LITE_MODEL",
    "ATLASCLOUD_FREE_MODEL",
    "ATLASCLOUD_GEMINI_FLASH_LITE_MODEL",
    "GEMINI_LITE_MODEL",
  ],
  GEMINI_FLASH_LITE_MODEL,
);

export const ATLAS_STANDARD_MODEL_ID = resolveAtlasModel(
  [
    "OPENROUTER_STANDARD_MODEL",
    "OPENROUTER_GEMINI_FLASH_MODEL",
    "ATLASCLOUD_TEXT_MODEL",
    "ATLASCLOUD_STANDARD_MODEL",
    "ATLASCLOUD_GEMINI_FLASH_MODEL",
    "GEMINI_MODEL",
  ],
  GEMINI_FLASH_MODEL,
);

export const ATLAS_PREMIUM_MODEL_ID = resolveAtlasModel(
  [
    "OPENROUTER_PREMIUM_MODEL",
    "OPENROUTER_CLAUDE_SONNET_MODEL",
    "ATLASCLOUD_PREMIUM_MODEL",
    "ATLASCLOUD_CLAUDE_SONNET_MODEL",
    "ANTHROPIC_MODEL",
  ],
  CLAUDE_SONNET_MODEL,
);

export const ATLAS_OCR_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_OCR_MODEL", "OPENROUTER_OCR_MODEL", "GEMINI_OCR_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

export const ATLAS_RESTORATION_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_RESTORATION_MODEL", "OPENROUTER_RESTORATION_MODEL", "GEMINI_RESTORATION_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

export const ATLAS_TRANSFORM_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_TRANSFORM_MODEL", "OPENROUTER_TRANSFORM_MODEL", "GEMINI_TRANSFORM_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

export const ATLAS_VARIANT_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_VARIANT_MODEL", "OPENROUTER_VARIANT_MODEL", "GEMINI_VARIANT_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

export const ATLAS_TUTOR_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_TUTOR_MODEL", "OPENROUTER_TUTOR_MODEL", "TUTOR_AI_MODEL", "GEMINI_MODEL"],
  ATLAS_STANDARD_MODEL_ID,
);

export const ATLAS_WEBTOON_DETECT_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_WEBTOON_DETECT_MODEL", "OPENROUTER_WEBTOON_DETECT_MODEL", "GEMINI_WEBTOON_DETECT_MODEL", "GEMINI_MODEL"],
  ATLAS_STANDARD_MODEL_ID,
);

export const ATLAS_WEBTOON_REVIEW_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_WEBTOON_REVIEW_MODEL", "OPENROUTER_WEBTOON_REVIEW_MODEL", "GEMINI_WEBTOON_REVIEW_MODEL", "GEMINI_MODEL"],
  ATLAS_STANDARD_MODEL_ID,
);

export function isAtlasGeminiModel(modelId: string): boolean {
  return normalizeAtlasModelId(modelId).toLowerCase().startsWith("google/gemini-");
}

export function isAtlasClaudeModel(modelId: string): boolean {
  return normalizeAtlasModelId(modelId).toLowerCase().startsWith("anthropic/claude-");
}

export function assertAtlasCloudConfigured(): void {
  if (!ATLASCLOUD_API_KEY) {
    throw new Error("Missing env var: ATLASCLOUD_API_KEY or OPENROUTER_API_KEY");
  }
}

export function getAtlasCloudHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const referer = readFirstEnv(["OPENROUTER_HTTP_REFERER", "ATLASCLOUD_HTTP_REFERER"]);
  const title = readFirstEnv(["OPENROUTER_X_TITLE", "ATLASCLOUD_X_TITLE"]);
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;
  return headers;
}

export function atlasReasoningEffortFor(modelId: string): string | undefined {
  const normalized = normalizeAtlasModelId(modelId);
  if (isAtlasGeminiModel(normalized)) {
    const explicitGeminiReasoning = readFirstEnv([
      "OPENROUTER_GEMINI_REASONING_EFFORT",
      "ATLASCLOUD_GEMINI_REASONING_EFFORT",
    ]);
    if (explicitGeminiReasoning) return explicitGeminiReasoning;
    return "none";
  }
  if (isAtlasClaudeModel(normalized)) {
    return readFirstEnv([
      "OPENROUTER_CLAUDE_REASONING_EFFORT",
      "ATLASCLOUD_CLAUDE_REASONING_EFFORT",
    ]);
  }
  return readFirstEnv(["OPENROUTER_REASONING_EFFORT", "ATLASCLOUD_REASONING_EFFORT"]);
}

export function atlasReasoningRequestFor(
  modelId: string,
  requestReasoning?: unknown,
  requestReasoningEffort?: unknown,
): Record<string, unknown> {
  const requestedEffort =
    typeof requestReasoningEffort === "string" && requestReasoningEffort.trim()
      ? requestReasoningEffort.trim()
      : undefined;
  const normalized = normalizeAtlasModelId(modelId);
  const effort = requestedEffort ?? atlasReasoningEffortFor(normalized);

  if (isAtlasGeminiModel(normalized)) {
    if (effort && effort.toLowerCase() !== "none") {
      return {
        reasoning: {
          enabled: true,
          effort,
          exclude: true,
        },
      };
    }
    return {
      reasoning: {
        enabled: false,
        effort: "none",
        exclude: true,
      },
    };
  }

  if (isRecord(requestReasoning)) {
    return { reasoning: requestReasoning };
  }

  return effort ? { reasoning_effort: effort } : {};
}

function compactRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUnsupportedAnthropicJsonSchemaKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedAnthropicJsonSchemaKeys);
  }
  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    // Anthropic's structured-output schema accepts a narrower JSON Schema subset.
    // Keep the original Zod validation in the SDK; only loosen the provider hint.
    if (
      key === "maxItems" ||
      key === "minItems" ||
      key === "maximum" ||
      key === "minimum" ||
      key === "exclusiveMaximum" ||
      key === "exclusiveMinimum" ||
      key === "maxLength" ||
      key === "minLength" ||
      key === "multipleOf" ||
      key === "pattern" ||
      key === "format"
    ) {
      continue;
    }
    sanitized[key] = stripUnsupportedAnthropicJsonSchemaKeys(child);
  }
  return sanitized;
}

function normalizeClaudeResponseFormat(
  modelId: string,
  responseFormat: unknown,
): unknown {
  if (!isAtlasClaudeModel(modelId) || !isRecord(responseFormat)) {
    return responseFormat;
  }
  if (responseFormat.type !== "json_schema") {
    return responseFormat;
  }

  const jsonSchema = responseFormat.json_schema;
  if (!isRecord(jsonSchema) || !("schema" in jsonSchema)) {
    return responseFormat;
  }

  return {
    ...responseFormat,
    json_schema: {
      ...jsonSchema,
      schema: stripUnsupportedAnthropicJsonSchemaKeys(jsonSchema.schema),
    },
  };
}

// ── 실측 원가(usage accounting) ─────────────────────────────────────────────
// OpenRouter 는 모든 응답(스트리밍은 마지막 SSE 청크)의 usage 에 실제 청구액
// usage.cost(USD)를 담아준다. metadataExtractor 로 이를 providerMetadata 에
// 노출하고, atlasUsageWithCost() 가 usage 객체에 병합해 recordAiCost 까지
// 흘려보낸다 → 원장 pricingSource 가 ESTIMATE(정가표 추정) 대신 RECORDED(실측).

interface AtlasCostMetadata {
  /** 이 호출의 실제 청구액(USD). BYOK 면 upstream 비용까지 합산한 총지출. */
  costUsd?: number;
  /** OpenRouter generation id — GET /api/v1/generation?id= 로 행 단위 감사 가능. */
  generationId?: string;
  /** 실제 라우팅된 상위 프로바이더명 (예: "Google", "Anthropic"). */
  upstreamProvider?: string;
  /** 실제 서빙된 모델 id (라우팅 변동 감사용). */
  servedModel?: string;
}

function readAtlasCostFields(parsedBody: unknown): AtlasCostMetadata | undefined {
  if (!isRecord(parsedBody)) return undefined;
  const usage = isRecord(parsedBody.usage) ? parsedBody.usage : undefined;
  const fields: AtlasCostMetadata = {};

  if (usage && typeof usage.cost === "number" && Number.isFinite(usage.cost)) {
    let costUsd = usage.cost;
    // BYOK 요청은 usage.cost 가 OpenRouter 수수료뿐 — upstream 실비를 합산해야
    // 총지출이 된다. (일반 크레딧 결제에선 upstream_inference_cost 가 0/null.)
    if (usage.is_byok === true && isRecord(usage.cost_details)) {
      const upstream = usage.cost_details.upstream_inference_cost;
      if (typeof upstream === "number" && Number.isFinite(upstream)) {
        costUsd += upstream;
      }
    }
    if (costUsd > 0) fields.costUsd = costUsd;
  }
  if (typeof parsedBody.id === "string" && parsedBody.id) {
    fields.generationId = parsedBody.id;
  }
  if (typeof parsedBody.provider === "string" && parsedBody.provider) {
    fields.upstreamProvider = parsedBody.provider;
  }
  if (typeof parsedBody.model === "string" && parsedBody.model) {
    fields.servedModel = parsedBody.model;
  }
  return Object.keys(fields).length > 0 ? fields : undefined;
}

function toAtlasProviderMetadata(fields: AtlasCostMetadata | undefined) {
  if (!fields) return undefined;
  return {
    [ATLAS_CLOUD_PROVIDER]: Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ),
  };
}

const atlasCostMetadataExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }) =>
    toAtlasProviderMetadata(readAtlasCostFields(parsedBody)),
  createStreamExtractor: () => {
    // usage 는 마지막 청크에만 실리고 id/provider/model 은 첫 청크부터 온다 —
    // 청크별 필드를 누적 병합해 마지막에 빌드한다.
    const accumulated: AtlasCostMetadata = {};
    return {
      processChunk(parsedChunk: unknown) {
        const fields = readAtlasCostFields(parsedChunk);
        if (fields) Object.assign(accumulated, fields);
      },
      buildMetadata: () =>
        toAtlasProviderMetadata(
          Object.keys(accumulated).length > 0 ? accumulated : undefined,
        ),
    };
  },
};

/**
 * generateText/generateObject 결과(또는 onFinish 이벤트)의 usage 에 실측 원가
 * 필드(costUsd/generationId/…)를 병합해 반환한다. 하류의 recordAiCost 가 이
 * 필드를 읽어 pricingSource=RECORDED 로 기록한다. 메타데이터가 없으면 원본
 * usage 를 그대로 돌려주므로 어디에나 안전하게 감쌀 수 있다.
 */
export function atlasUsageWithCost(result: {
  usage?: unknown;
  providerMetadata?: unknown;
}): unknown {
  const metadata = isRecord(result.providerMetadata)
    ? result.providerMetadata[ATLAS_CLOUD_PROVIDER]
    : undefined;
  if (!isRecord(metadata)) return result.usage;

  const merged: Record<string, unknown> = isRecord(result.usage)
    ? { ...result.usage }
    : {};
  if (typeof metadata.costUsd === "number" && metadata.costUsd > 0) {
    merged.costUsd = metadata.costUsd;
  }
  if (typeof metadata.generationId === "string") {
    merged.generationId = metadata.generationId;
  }
  if (typeof metadata.upstreamProvider === "string") {
    merged.upstreamProvider = metadata.upstreamProvider;
  }
  if (typeof metadata.servedModel === "string") {
    merged.servedModel = metadata.servedModel;
  }
  return Object.keys(merged).length > 0 ? merged : result.usage;
}

export const atlasCloud = createOpenAICompatible({
  baseURL: ATLASCLOUD_BASE_URL,
  name: ATLAS_CLOUD_PROVIDER,
  apiKey: ATLASCLOUD_API_KEY || undefined,
  headers: getAtlasCloudHeaders(),
  includeUsage: true,
  supportsStructuredOutputs: true,
  metadataExtractor: atlasCostMetadataExtractor,
  transformRequestBody(args) {
    const model = normalizeAtlasModelId(String(args.model ?? ""));
    const reasoningRequest = atlasReasoningRequestFor(
      model,
      args.reasoning,
      args.reasoning_effort,
    );
    return compactRequestBody({
      ...args,
      model,
      response_format: normalizeClaudeResponseFormat(model, args.response_format),
      reasoning: reasoningRequest.reasoning,
      reasoning_effort: reasoningRequest.reasoning_effort,
    });
  },
});

export function atlasChatModel(modelId: string) {
  return atlasCloud.chatModel(normalizeAtlasModelId(modelId));
}

export function getAtlasModelForAudit(modelId: string): string {
  return normalizeAtlasModelId(modelId);
}
