import {
  createOpenAICompatible,
  type MetadataExtractor,
} from "@ai-sdk/openai-compatible";

import { atlasProductionAssignmentFetch } from "@/lib/atlas-production-assignment-fetch-boundary";
import { getQuestionGenerationResearchExpectedQuestionCount } from "@/lib/question-generation-research-runtime";

export const ATLAS_CLOUD_PROVIDER = "atlascloud" as const;

const ATLAS_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const GEMINI_FLASH_LITE_MODEL = "google/gemini-3.1-flash-lite";
// 26-07-27 유저 지시: "AI로 원문 복원"(크롭 복원·passage-restoration)은 3.5-flash-lite
// 로 상향. 3.1-flash-lite 가 크롭 복원 JSON 키를 자유작명(rawText→ocrText)해 전건
// EMPTY_OUTPUT 으로 죽던 장애의 모델 축 대응(스키마 강제는 crop-native 에서 별도).
// 롤백은 env OPENROUTER_RESTORATION_MODEL=google/gemini-3.1-flash-lite.
const GEMINI_FLASH_LITE_35_MODEL = "google/gemini-3.5-flash-lite";
// 26-07-22 유저 지시: 광역 표준 모델 3.5-flash → 3.6-flash 전면 전환 (O213 벤치:
// 3.6-flash 품질 압승). 롤백은 env OPENROUTER_STANDARD_MODEL=google/gemini-3.5-flash.
const GEMINI_FLASH_MODEL = "google/gemini-3.6-flash";
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

  // 명시적 3.5-flash 핀(env 롤백용)은 기본값(3.6-flash)으로 흡수하지 않고 그대로 둔다.
  if (lower === "gemini-3.5-flash" || lower === "google/gemini-3.5-flash") {
    return "google/gemini-3.5-flash";
  }

  if (lower === "gemini-3.6-flash" || lower === "google/gemini-3.6-flash") {
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

/**
 * 모델 호출 단위 하드 타임아웃(ms) — T5. 상위 시간예산(deadlineAt)·SDK abort 와
 * 별개로 물리 fetch 1건을 강제 종료한다. grok(x-ai/grok-4.5) 대형 응답이 비스트리밍
 * 기대와 달리 SSE/빈 본문으로 와 파서(response.text())가 커넥션을 문 채 상위
 * 데드라인(최대 282s)까지 매달리는 결함을 콜 단위로 차단한다.
 *
 * 기본 240s — 콜 단위 하드 타임아웃은 상위 시간예산(PREMIUM 180s·JSON 폴백 240s)
 * 보다 짧으면 안 된다(T5 리뷰 §1). 짧으면 정상적으로 긴 호출(특히 240s 하드캡의
 * grammar-too-large JSON 폴백)을 하드 타임아웃이 먼저 죽여 버려, 데드라인 안에서
 * 아직 유효한 호출을 조기 중단시킨다. 240s 로 두면 물리 fetch 가 상위 예산의 벽을
 * 실제로 넘겼을 때에만(진짜 hang) 발동한다. env ATLAS_MODEL_CALL_TIMEOUT_MS 로
 * 오버라이드(0·비정상 값이면 기본값 유지). gemini 경로는 대상이 아니다(요청
 * 바이트·동작 불변 계약).
 */
export const ATLAS_MODEL_CALL_TIMEOUT_MS = (() => {
  const raw = readEnv("ATLAS_MODEL_CALL_TIMEOUT_MS");
  if (raw) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return 240_000;
})();

/**
 * 비스트리밍(generateObject/generateText) 호출에서 status 200 인데 응답이
 * SSE(text/event-stream)/빈 본문으로 와 파서가 매달리거나 즉시 실패하는 유형을
 * 즉시 재시도 가능한 transient 오류로 표면화한다(T5). code 로 원인을 구분한다:
 *  - "streamed": 비스트리밍 요청인데 text/event-stream 응답(헤더 단계 즉시 감지).
 *  - "timeout":  콜 단위 하드 타임아웃(ATLAS_MODEL_CALL_TIMEOUT_MS) 초과.
 * name 을 AbortError/TimeoutError 와 겹치지 않게 둬 SDK 가 이 오류를 조용히 abort
 * 로 삼키지 않고 상위 재시도 루프까지 전달하게 한다.
 */
export class AtlasTransientResponseError extends Error {
  readonly transient = true as const;
  readonly code: "streamed" | "timeout";
  readonly modelId: string;
  constructor(code: "streamed" | "timeout", modelId: string, message: string) {
    super(message);
    this.name = "AtlasTransientResponseError";
    this.code = code;
    this.modelId = modelId;
  }
}

/**
 * Fail-closed routing for opt-in structured research calls. The full endpoint
 * slug is intentionally used instead of the broad `google-vertex` base slug:
 * service-tier variants require separate opt-in and may have different price
 * or availability behavior. Ordinary production calls remain byte-for-byte
 * unchanged when no research runtime is active.
 */
export const ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING = Object.freeze({
  order: Object.freeze(["google-vertex/global"]),
  only: Object.freeze(["google-vertex/global"]),
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny" as const,
  zdr: true,
});

/**
 * 연구 캠페인 전용 라우팅 오버라이드 (26-07-16 실측 근거: gemini-3.1-pro-preview 의
 * google-vertex/global 대형 structured 응답이 간헐 mid-stream error 로 전멸해 품질이
 * 아닌 transport 를 측정하게 됨 — campaign-20260716 phaseA O149). 연구 런타임이
 * 활성일 때만 소비되며, env 미설정 시 기존 고정 라우팅과 바이트 동일. 값 "none" 은
 * provider 블록 자체를 생략해 프로덕션과 동일한 자유 라우팅이 된다.
 * 프로덕션(비연구) 호출은 이 상수를 아예 읽지 않는다.
 */
function resolveResearchProviderRouting():
  | Record<string, unknown>
  | "none"
  | undefined {
  const raw = readEnv("RESEARCH_OPENROUTER_PROVIDER_ROUTING_JSON");
  if (!raw) return undefined;
  if (raw.trim().toLowerCase() === "none") return "none";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* malformed → 기본 고정 라우팅 유지 (fail-closed) */
  }
  return undefined;
}

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

/**
 * 문제 생성(question generation) 전용 PREMIUM 모델 — 26-07-20 차세대 이원 티어
 * 전환(캠페인 O197~O201 3중 재현 확증): gemini-3.1-pro-preview → google/
 * gemini-3-flash-preview. 프리미엄 풀 파이프라인(생성+E-gate 풀계약)을 flash3 로
 * 돌렸을 때 실질 F 2.2%·77~81원·~100s 로 현행 grok(F 8%·105~158원·어법 데드라인
 * 클램프)을 전면 대체한다. preview 만료/롤백에 대비해 env PREMIUM_QGEN_MODEL_ID
 * 로 오버라이드한다(어법 사다리의 GRAMMAR_PREMIUM_MODEL_ID 와 동일 패턴 — 그쪽은
 * 자체 env·자체 modelId 라 별개).
 * 다른 PREMIUM 소비자(exam-report·question-ai-edit·similar-exam-generation·
 * 지문분석 generateQuestionText 경로)는 ATLAS_PREMIUM_MODEL_ID(Claude)를 그대로
 * 쓴다 — 이 상수는 generateQuestionObject 의 PREMIUM 플랜 매핑 전용이다.
 */
export const ATLAS_PREMIUM_QGEN_MODEL_ID = resolveAtlasModel(
  ["PREMIUM_QGEN_MODEL_ID"],
  "google/gemini-3-flash-preview",
);

/**
 * 문제 생성 전용 STANDARD 모델 (26-07-20 차세대 이원 티어, O201 S3i 확정 스펙:
 * flash3 2콜(생성+통합 검수리)+결정형 게이트 = 콘텐츠성 F 0/46·38원·63s).
 * ⚠️ ATLAS_STANDARD_MODEL_ID(OPENROUTER_STANDARD_MODEL)를 그대로 뒤집지 않는
 * 이유: 그 상수는 튜터·웹툰 detect/review·지문분석·exam-report 등 문제 생성이
 * 아닌 광역 소비자가 공유하는 노브라 방사 피해가 크다. 문제 생성의 STANDARD
 * 플랜 매핑(QUESTION_GENERATION_MODEL_CONFIGS)만 이 상수를 쓴다.
 * env STANDARD_QGEN_MODEL_ID 로 오버라이드(롤백: google/gemini-3.5-flash).
 */
export const ATLAS_STANDARD_QGEN_MODEL_ID = resolveAtlasModel(
  ["STANDARD_QGEN_MODEL_ID"],
  "google/gemini-3-flash-preview",
);

export const ATLAS_OCR_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_OCR_MODEL", "OPENROUTER_OCR_MODEL", "GEMINI_OCR_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

export const ATLAS_RESTORATION_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_RESTORATION_MODEL", "OPENROUTER_RESTORATION_MODEL", "GEMINI_RESTORATION_MODEL"],
  GEMINI_FLASH_LITE_35_MODEL,
);

export const ATLAS_TRANSFORM_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_TRANSFORM_MODEL", "OPENROUTER_TRANSFORM_MODEL", "GEMINI_TRANSFORM_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

export const ATLAS_VARIANT_MODEL_ID = resolveAtlasModel(
  ["ATLASCLOUD_VARIANT_MODEL", "OPENROUTER_VARIANT_MODEL", "GEMINI_VARIANT_MODEL"],
  ATLAS_FREE_MODEL_ID,
);

// AI 지문 생성 전용 모델. 변형(flash-lite)과 달리 3.6-flash 로 한 단계 올린다 —
// 여기선 입력이 "어법 교재·단어장·외부 지문" 같은 잡다한 자료 묶음이고, 그걸
// 읽어 새 지문을 처음부터 써야 해서 지시 준수·장문 일관성이 품질을 좌우한다
// (O213 벤치: 3.6-flash 가 3.5-flash 대비 품질 압승 — 광역 표준값과 동일 근거).
export const ATLAS_AUTHORING_MODEL_ID = resolveAtlasModel(
  ["OPENROUTER_AUTHORING_MODEL", "PASSAGE_AUTHORING_MODEL"],
  GEMINI_FLASH_MODEL,
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

type AtlasFetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * transformRequestBody 가 비-gemini 비스트리밍 요청에만 실어 준 stream:false 를
 * 근거로, 하드 타임아웃/SSE 가드를 씌울 요청인지 판별한다. gemini(stream 키 없음)·
 * 스트리밍(stream:true)·비-JSON 바디는 대상이 아니다(원본 fetch 그대로 위임 →
 * 시그널·본문 무변경). 모델명은 진단 로그용으로만 읽는다.
 */
function readGuardedAtlasRequest(
  init: RequestInit | undefined,
): { model: string } | undefined {
  const body = init?.body;
  if (typeof body !== "string") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.stream !== false) return undefined;
  return {
    model: typeof parsed.model === "string" ? parsed.model : "unknown",
  };
}

/** 비스트리밍 요청에 SSE(text/event-stream) 응답이 오면 즉시 실패시키기 위한 감지. */
function atlasResponseLooksStreamed(response: Response): boolean {
  const contentType = response?.headers?.get?.("content-type");
  return (
    typeof contentType === "string" &&
    contentType.toLowerCase().includes("text/event-stream")
  );
}

/**
 * 가드 컨텍스트 상태(T5 리뷰 §3). '가드 하드 타임아웃 발동' 여부를 여기에 기록하고,
 * abort 분류는 controller.abort(reason) 의 reason 전파(런타임마다 generic
 * AbortError/DOMException 으로 갈아치울 수 있어 신뢰 불가)가 아니라 이 플래그를
 * 1차 근거로 판정한다.
 */
interface AtlasCallGuardState {
  hardTimedOut: boolean;
}

/**
 * 성공 경로 타이머 정리(T5 리뷰 §4) + 본문 읽기 중 하드 타임아웃 표면화(§3).
 * response.body 를 바이트 무변경으로 흘려보내되, 스트림이 정상 종료되거나(본문
 * 소비 완료)·취소되면 onSettled 로 하드 타임아웃 타이머를 회수한다 — 완료 후
 * 스푸리어스 abort 가 매 호출 발생하지 않게 한다. 본문 읽기 도중 가드 하드
 * 타임아웃이 나면 guardState.hardTimedOut 를 1차 근거로(런타임 abort reason 전파에
 * 무의존) timeout transient 로 표면화한다.
 *
 * getReader() 는 pull 최초 호출(=SDK 가 본문을 읽기 시작하는 시점)까지 지연
 * 취득한다. 상위 원가 경계(production-assignment)가 응답을 detached 로 clone 해
 * 관찰하는데, 그 clone 은 delegate 반환 직후 마이크로태스크에서 먼저 일어나고 SDK
 * 본문 읽기는 그보다 훨씬 뒤이므로, 지연 취득이면 clone 이 항상 먼저 tee 를 잡아
 * 관찰이 깨지지 않는다(research 경계는 이미 본문을 소비·재구성해 넘겨 무관).
 */
function wrapResponseClearingTimerOnBodyEnd(
  response: Response,
  guardState: AtlasCallGuardState,
  model: string,
  onSettled: () => void,
): Response {
  if (!response.body) {
    // 본문 없음 → 읽기 도중 hang 불가. 즉시 타이머 회수.
    onSettled();
    return response;
  }
  const source = response;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const monitored = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!reader) {
        const body = source.body;
        if (!body) {
          onSettled();
          controller.close();
          return;
        }
        reader = body.getReader();
      }
      return reader.read().then(
        ({ done, value }) => {
          if (done) {
            // 본문 스트림 정상 종료 = 콜 완료 → 타이머 회수.
            onSettled();
            controller.close();
            return;
          }
          controller.enqueue(value);
        },
        (error: unknown) => {
          onSettled();
          // §3: 본문 읽기 중 가드 하드 타임아웃이면 플래그 1차 근거로 timeout
          // transient 로 표면화한다(런타임의 abort reason 전파에 무의존).
          controller.error(
            guardState.hardTimedOut
              ? new AtlasTransientResponseError(
                  "timeout",
                  model,
                  `Atlas model call body read exceeded ${ATLAS_MODEL_CALL_TIMEOUT_MS}ms hard timeout (${model})`,
                )
              : error,
          );
        },
      );
    },
    cancel(reason) {
      onSettled();
      if (!reader && source.body) {
        try {
          reader = source.body.getReader();
        } catch {
          /* 이미 잠김/소비됨 — 무시 */
        }
      }
      return reader?.cancel(reason);
    },
  });
  const wrapped = new Response(monitored, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  // fetch 가 채우는 메타데이터는 Response() 생성자로 초기화할 수 없다 — 원본
  // 스냅샷을 그대로 노출해(SDK 는 요청 url 을 쓰므로 기능엔 무영향) 관찰 표면을
  // 보존한다. 일부 런타임은 재정의를 막을 수 있어 실패해도 무시한다.
  try {
    Object.defineProperties(wrapped, {
      url: { configurable: true, value: response.url },
      type: { configurable: true, value: response.type },
      redirected: { configurable: true, value: response.redirected },
    });
  } catch {
    /* 기능엔 무영향이라 무시 */
  }
  return wrapped;
}

/**
 * 비-gemini(grok 등) 비스트리밍 호출에 (1) 콜 단위 하드 타임아웃과 (2) SSE 응답
 * 즉시 실패를 씌운다(T5). gemini·스트리밍·미인식 요청은 delegate 를 시그널·본문
 * 무변경으로 그대로 위임한다(바이트·동작 불변 계약). 상위 SDK abort 시그널이
 * 들어오면 그대로 존중하되, 그와 별개로 하드 타임아웃을 독립적으로 건다.
 * (export 는 단위테스트가 커스텀 delegate 로 가드 단독 동작을 검증하기 위함.)
 */
export function createAtlasModelCallGuardFetch(
  delegate: AtlasFetchLike,
): AtlasFetchLike {
  return async (input, init) => {
    const guarded = readGuardedAtlasRequest(init);
    if (!guarded) return delegate(input, init);
    const { model } = guarded;

    const controller = new AbortController();
    // §3: 가드 하드 타임아웃 발동 여부를 컨텍스트 플래그로 기록한다.
    const guardState: AtlasCallGuardState = { hardTimedOut: false };
    const incoming = init?.signal ?? undefined;
    const onIncomingAbort = () => controller.abort(incoming?.reason);
    if (incoming) {
      if (incoming.aborted) controller.abort(incoming.reason);
      else incoming.addEventListener("abort", onIncomingAbort, { once: true });
    }
    const hardTimeout = setTimeout(() => {
      guardState.hardTimedOut = true;
      controller.abort(
        new AtlasTransientResponseError(
          "timeout",
          model,
          `Atlas model call exceeded ${ATLAS_MODEL_CALL_TIMEOUT_MS}ms hard timeout (${model})`,
        ),
      );
    }, ATLAS_MODEL_CALL_TIMEOUT_MS);
    // unref: 하드 타임아웃 타이머가 프로세스 종료를 막지 않게 한다.
    if (
      typeof hardTimeout === "object" &&
      typeof (hardTimeout as { unref?: () => void }).unref === "function"
    ) {
      (hardTimeout as { unref: () => void }).unref();
    }
    // §4: 타이머 정리는 최초 1회만 — 성공 본문 종료·abort·delegate 실패 어느
    // 경로로 들어와도 중복 clearTimeout/리스너 해제가 안전하게 no-op 이 된다.
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      if (incoming) incoming.removeEventListener("abort", onIncomingAbort);
    };
    controller.signal.addEventListener("abort", cleanup, { once: true });

    let response: Response;
    try {
      response = await delegate(input, { ...init, signal: controller.signal });
    } catch (error) {
      cleanup();
      // §3: 헤더 단계 abort — 가드 하드 타임아웃 플래그를 1차 근거로 분류한다.
      // delegate/런타임이 reason 대신 generic AbortError 를 던져도 안정적으로
      // timeout transient 로 표면화된다(상위 재시도 루프가 인식). 하드 타임아웃이
      // 아닌 실패(상위 SDK abort·네트워크 오류 등)는 원본을 그대로 전파한다.
      if (guardState.hardTimedOut) {
        throw new AtlasTransientResponseError(
          "timeout",
          model,
          `Atlas model call exceeded ${ATLAS_MODEL_CALL_TIMEOUT_MS}ms hard timeout (${model})`,
        );
      }
      throw error;
    }
    if (atlasResponseLooksStreamed(response)) {
      // 비스트리밍 요청인데 SSE 응답 — 본문 버퍼링(response.text) 전에 커넥션을
      // 끊고 즉시 transient 실패시킨다(파서가 데드라인까지 매달리는 결함의 직접
      // 차단). 하드 타임아웃 경로와 달리 헤더 단계에서 <1s 내 반환한다.
      const streamedError = new AtlasTransientResponseError(
        "streamed",
        model,
        `Atlas non-streaming request received a text/event-stream response (${model})`,
      );
      controller.abort(streamedError); // abort 리스너가 cleanup 을 돌린다.
      throw streamedError;
    }
    // §4: 정상 경로 — 본문 스트림이 끝나면(=SDK 가 response.text() 로 다 읽으면)
    // 타이머를 회수해 완료 후 스푸리어스 abort 를 차단한다. 하드 타임아웃은 본문
    // 읽기까지 살아 있어 body-read hang 도 콜 단위로 끊고(§3 로 표면화), 정상
    // 소비가 끝나면 곧바로 정리된다. 바이트·상태·헤더는 무변경으로 흘려보낸다.
    return wrapResponseClearingTimerOnBodyEnd(
      response,
      guardState,
      model,
      cleanup,
    );
  };
}

/**
 * 비스트리밍 와이어 플래그(T5). 이미 stream 이 실려 있으면(스트리밍 경로) 원본을
 * 보존하고, 없으면 gemini 는 undefined(=키 미포함 → compactRequestBody 가 제거,
 * 바이트 불변), 그 외(grok 등)는 false 를 명시한다.
 */
export function atlasNonStreamingWireFlag(
  model: string,
  existingStream: unknown,
): boolean | undefined {
  if (existingStream !== undefined) return existingStream as boolean | undefined;
  return isAtlasGeminiModel(model) ? undefined : false;
}

const atlasModelCallGuardFetch = createAtlasModelCallGuardFetch(
  atlasProductionAssignmentFetch,
);

export const atlasCloud = createOpenAICompatible({
  baseURL: ATLASCLOUD_BASE_URL,
  name: ATLAS_CLOUD_PROVIDER,
  apiKey: ATLASCLOUD_API_KEY || undefined,
  headers: getAtlasCloudHeaders(),
  // Exact no-scope passthrough for the assignment/research boundaries, wrapped by
  // a per-call hard timeout + SSE guard (T5). Workbench assignment scopes durably
  // lease each physical fetch; research scopes retain their separate controller.
  fetch: atlasModelCallGuardFetch,
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
    const responseFormat = normalizeClaudeResponseFormat(
      model,
      args.response_format,
    );
    const transformed = compactRequestBody({
      ...args,
      model,
      response_format: responseFormat,
      reasoning: reasoningRequest.reasoning,
      reasoning_effort: reasoningRequest.reasoning_effort,
      // 비스트리밍(generateObject/generateText) 경로임을 와이어에 명시한다(T5) —
      // grok 등 비-gemini 에서 OpenRouter 가 대형 응답을 SSE 로 흘려 파서가 상위
      // 데드라인까지 매달리는 결함을 예방한다. gemini 는 undefined 를 실어
      // compactRequestBody 가 제거 → 기존 요청 본문과 바이트 동일하게 유지된다.
      // 프로덕션/연구 fetch 경계 모두 stream:false 를 허용한다.
      stream: atlasNonStreamingWireFlag(model, args.stream),
    });
    const researchQuestionCount =
      getQuestionGenerationResearchExpectedQuestionCount();
    const isStructuredResearchRequest =
      researchQuestionCount !== undefined &&
      isRecord(responseFormat) &&
      responseFormat.type === "json_schema";
    if (!isStructuredResearchRequest) return transformed;
    if (ATLAS_GATEWAY_PROVIDER !== "OPENROUTER") {
      throw new Error(
        "structured question-generation research requires the pinned OpenRouter route",
      );
    }
    const routingOverride = resolveResearchProviderRouting();
    if (routingOverride === "none") return transformed;
    return compactRequestBody({
      ...transformed,
      provider: routingOverride ?? ATLAS_RESEARCH_OPENROUTER_PROVIDER_ROUTING,
    });
  },
});

export function atlasChatModel(modelId: string) {
  return atlasCloud.chatModel(normalizeAtlasModelId(modelId));
}

export function getAtlasModelForAudit(modelId: string): string {
  return normalizeAtlasModelId(modelId);
}
