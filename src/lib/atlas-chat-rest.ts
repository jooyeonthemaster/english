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
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  responseMimeType?: "application/json";
  timeoutInMs?: number;
  enableWebSearch?: boolean;
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
  const reasoningRequest = atlasReasoningRequestFor(model);
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
    messages.push({ role: "system", content: params.systemPrompt });
  }

  const content: Array<Record<string, unknown>> = [];
  if (params.image) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${params.image.mimeType};base64,${params.image.base64}`,
      },
    });
  }
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
    },
  };
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
