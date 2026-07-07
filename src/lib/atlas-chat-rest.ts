import {
  ATLASCLOUD_API_KEY,
  ATLASCLOUD_BASE_URL,
  assertAtlasCloudConfigured,
  atlasReasoningRequestFor,
  getAtlasCloudHeaders,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";

export interface AtlasChatImageInput {
  mimeType: string;
  base64: string;
}

export interface AtlasChatCompletionParams {
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  image?: AtlasChatImageInput;
  /** 다중 이미지(페이지 배치) — image 와 병용 시 image 가 먼저 첨부된다. 가산 확장(기존 호출 무영향). */
  images?: AtlasChatImageInput[];
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json";
  timeoutInMs?: number;
  enableWebSearch?: boolean;
  /**
   * system 블록에 anthropic prompt-cache breakpoint(cache_control: ephemeral)를 부착한다.
   * OpenRouter 가 anthropic 계열에만 전달하므로 호출자가 Claude 모델일 때만 켜는 것을 권장.
   * 옵트인 — 미지정 시 기존 직렬화(단일 문자열) 그대로.
   */
  systemCacheControl?: boolean;
  /**
   * 마지막 이미지 블록에 anthropic prompt-cache breakpoint(cache_control: ephemeral)를 부착한다.
   * 이미지 재전송(예: 문항 배치 분석)에서 배치 간 이미지 토큰 비용을 절감한다.
   * OpenRouter 가 anthropic 계열에만 전달하므로 호출자가 Claude 모델일 때만 켤 것.
   * 옵트인 — 미지정 시 이미지 블록에 cache_control 을 넣지 않는다(기존 직렬화 그대로).
   */
  imageCacheControl?: boolean;
  /**
   * OpenRouter reasoning 요청 오버라이드(예: { enabled: false } 로 사고 비활성).
   * 미지정 시 기존 동작(모델별 env 기본) 그대로 — 가산 확장(기존 호출 무영향).
   * 사고가 켜지면 출력 토큰 예산·응답시간을 사고가 잠식할 수 있다(시험 판독 실측).
   */
  reasoning?: Record<string, unknown>;
  fetcher?: (input: string, init: RequestInit & { timeoutInMs?: number }) => Promise<Response>;
}

export interface AtlasGeminiLikeResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      groundingSupports?: Array<{
        groundingChunkIndices?: number[];
        segment?: { text?: string };
      }>;
      searchEntryPoint?: unknown;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    /** OpenRouter 실측 청구액(USD) — recordAiCost 가 RECORDED 원가로 기록. */
    costUsd?: number;
    /** OpenRouter generation id — /api/v1/generation?id= 행 단위 감사용. */
    generationId?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

type AtlasGroundingMetadata = NonNullable<
  NonNullable<AtlasGeminiLikeResponse["candidates"]>[number]["groundingMetadata"]
>;

interface OpenRouterAnnotation {
  type?: string;
  url_citation?: {
    url?: string;
    title?: string;
    content?: string;
  };
}

interface OpenAIChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      annotations?: OpenRouterAnnotation[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    /** OpenRouter usage accounting — 실제 청구액(USD). */
    cost?: number;
    is_byok?: boolean;
    cost_details?: {
      upstream_inference_cost?: number | null;
    };
  };
  error?: {
    code?: number | string;
    message?: string;
    type?: string;
  };
}

export class AtlasCloudHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AtlasCloudHttpError";
  }
}

export async function postAtlasChatCompletionAsGeminiLike(
  params: AtlasChatCompletionParams,
): Promise<AtlasGeminiLikeResponse> {
  assertAtlasCloudConfigured();
  const fetcher = params.fetcher ?? fetch;
  const model = normalizeAtlasModelId(params.model);
  const reasoningRequest = atlasReasoningRequestFor(model, params.reasoning);
  const response = await fetcher(`${ATLASCLOUD_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
      ...getAtlasCloudHeaders(),
    },
    timeoutInMs: params.timeoutInMs,
    body: JSON.stringify({
      model,
      messages: buildMessages(params),
      temperature: params.temperature,
      top_p: params.topP,
      max_tokens: params.maxOutputTokens,
      ...reasoningRequest,
      ...(params.responseMimeType === "application/json"
        ? { response_format: { type: "json_object" } }
        : {}),
      ...(params.enableWebSearch
        ? { tools: [{ type: "openrouter:web_search" }] }
        : {}),
    }),
  });

  const rawText = await response.text();
  const parsed = parseJsonOrError(rawText);
  if (!response.ok) {
    throw new AtlasCloudHttpError(
      parsed.error?.message ?? `Atlas Cloud HTTP ${response.status}`,
      response.status,
      typeof parsed.error?.code === "string" ? parsed.error.code : parsed.error?.type,
    );
  }

  return toGeminiLike(parsed);
}

function buildMessages(params: AtlasChatCompletionParams) {
  const messages: Array<Record<string, unknown>> = [];
  if (params.systemPrompt) {
    messages.push({
      role: "system",
      content: params.systemCacheControl
        ? [
            {
              type: "text",
              text: params.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ]
        : params.systemPrompt,
    });
  }

  const content: Array<Record<string, unknown>> = [];
  const imageInputs = [
    ...(params.image ? [params.image] : []),
    ...(params.images ?? []),
  ];
  imageInputs.forEach((image, index) => {
    const block: Record<string, unknown> = {
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64}`,
      },
    };
    // 마지막 이미지 블록에만 캐시 브레이크포인트 부착(옵트인) — 앞선 이미지들도 함께 캐시된다.
    if (params.imageCacheControl && index === imageInputs.length - 1) {
      block.cache_control = { type: "ephemeral" };
    }
    content.push(block);
  });
  content.push({ type: "text", text: params.userPrompt });
  messages.push({ role: "user", content });
  return messages;
}

function parseJsonOrError(rawText: string): OpenAIChatCompletionResponse {
  try {
    return JSON.parse(rawText) as OpenAIChatCompletionResponse;
  } catch {
    return {
      error: {
        message: rawText.slice(0, 500) || "Atlas Cloud returned a non-JSON response",
      },
    };
  }
}

function toGeminiLike(body: OpenAIChatCompletionResponse): AtlasGeminiLikeResponse {
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => part.text ?? "").join("")
    : content ?? "";

  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        finishReason: normalizeFinishReason(choice?.finish_reason),
        groundingMetadata: groundingFromAnnotations(choice?.message?.annotations),
      },
    ],
    usageMetadata: {
      promptTokenCount: body.usage?.prompt_tokens ?? body.usage?.input_tokens,
      candidatesTokenCount: body.usage?.completion_tokens ?? body.usage?.output_tokens,
      costUsd: readActualCostUsd(body),
      generationId: body.id,
    },
  };
}

/** OpenRouter usage.cost(USD) — BYOK 요청은 upstream 실비까지 합산한 총지출. */
function readActualCostUsd(body: OpenAIChatCompletionResponse): number | undefined {
  const usage = body.usage;
  if (!usage || typeof usage.cost !== "number" || !Number.isFinite(usage.cost)) {
    return undefined;
  }
  let costUsd = usage.cost;
  if (usage.is_byok === true) {
    const upstream = usage.cost_details?.upstream_inference_cost;
    if (typeof upstream === "number" && Number.isFinite(upstream)) {
      costUsd += upstream;
    }
  }
  return costUsd > 0 ? costUsd : undefined;
}

function normalizeFinishReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  if (reason === "stop") return "STOP";
  if (reason === "length") return "MAX_TOKENS";
  return reason.toUpperCase();
}

function groundingFromAnnotations(
  annotations: OpenRouterAnnotation[] | undefined,
): AtlasGroundingMetadata | undefined {
  const citations =
    annotations?.filter((a) => a.type === "url_citation" && a.url_citation?.url) ?? [];
  if (citations.length === 0) return undefined;
  return {
    groundingChunks: citations.map((citation) => ({
      web: {
        uri: citation.url_citation?.url,
        title: citation.url_citation?.title,
      },
    })),
    groundingSupports: citations.map((citation, index) => ({
      groundingChunkIndices: [index],
      segment: { text: citation.url_citation?.content ?? "" },
    })),
  };
}
