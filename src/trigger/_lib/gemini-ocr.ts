import { retry } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  sanitizeOcrOutput,
  sanitizeStructuredJson,
  structuredOcrResponseSchema,
  type StructuredOcrResponse,
} from "@/lib/extraction/ocr";
import {
  getExtractionAiConfig,
  type ExtractionAiStage,
} from "@/lib/extraction/model-config";
import { postAtlasChatCompletionAsGeminiLike } from "@/lib/atlas-chat-rest";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: GeminiGroundingMetadata;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    /** OpenRouter 실측 청구액(USD) — atlas-chat-rest 가 usage.cost 에서 병합. */
    costUsd?: number;
    generationId?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GeminiGroundingSupport {
  groundingChunkIndices?: number[];
  segment?: {
    text?: string;
  };
}

export interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: GeminiGroundingSupport[];
  searchEntryPoint?: unknown;
}

interface GeminiUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** OpenRouter 실측 청구액(USD). ExtractionPage.aiCostUsd 로 영속. */
  costUsd?: number;
}

interface GeminiOcrParams {
  systemPrompt: string;
  userPrompt: string;
  mimeType: string;
  base64: string;
  timeoutInMs: number;
}

interface GeminiTextParams {
  stage: ExtractionAiStage;
  systemPrompt: string;
  userPrompt: string;
  timeoutInMs: number;
  image?: { mimeType: string; base64: string };
}

type FetchWithTimeoutInit = RequestInit & { timeoutInMs?: number };

async function fetchWithTriggerFallback(
  input: string,
  init: FetchWithTimeoutInit,
): Promise<Response> {
  try {
    return await retry.fetch(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/wait\.forToken can only be used from inside a task\.run\(\)/i.test(message)) {
      throw error;
    }
  }

  const controller = new AbortController();
  const timeout = Math.max(1000, init.timeoutInMs ?? 30_000);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const { timeoutInMs: _timeoutInMs, signal, ...fetchInit } = init;
    return await fetch(input, {
      ...fetchInit,
      signal: signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export class StructuredParseError extends Error {
  code: "PARSE_ERROR" = "PARSE_ERROR" as const;

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "StructuredParseError";
  }
}

export class GeminiHttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "GeminiHttpError";
  }
}

function readCandidateText(body: GeminiGenerateContentResponse): string {
  return (
    body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function usageOf(body: GeminiGenerateContentResponse): GeminiUsage {
  return {
    inputTokens: body.usageMetadata?.promptTokenCount,
    outputTokens: body.usageMetadata?.candidatesTokenCount,
    costUsd: body.usageMetadata?.costUsd,
  };
}

function groundingOf(body: GeminiGenerateContentResponse): GeminiGroundingMetadata | undefined {
  return body.candidates?.[0]?.groundingMetadata;
}

async function postGemini(
  params: GeminiOcrParams & { responseMimeType?: "application/json" },
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig("ocr");
  return postAtlasChatCompletionAsGeminiLike({
    model: cfg.model,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    image: { mimeType: params.mimeType, base64: params.base64 },
    temperature: cfg.temperature,
    topP: cfg.topP,
    maxOutputTokens: cfg.maxOutputTokens,
    responseMimeType: params.responseMimeType,
    timeoutInMs: params.timeoutInMs,
    fetcher: fetchWithTriggerFallback,
  });
}

async function postGeminiText(
  params: GeminiTextParams & { responseMimeType?: "application/json" },
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig(params.stage);
  return postAtlasChatCompletionAsGeminiLike({
    model: cfg.model,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    image: params.image,
    temperature: cfg.temperature,
    topP: cfg.topP,
    maxOutputTokens: cfg.maxOutputTokens,
    responseMimeType: params.responseMimeType,
    timeoutInMs: params.timeoutInMs,
    fetcher: fetchWithTriggerFallback,
  });
}

async function postGeminiGroundedText(
  params: GeminiTextParams,
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig(params.stage);
  return postAtlasChatCompletionAsGeminiLike({
    model: cfg.model,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    temperature: cfg.temperature,
    topP: cfg.topP,
    maxOutputTokens: cfg.maxOutputTokens,
    timeoutInMs: params.timeoutInMs,
    enableWebSearch: true,
    fetcher: fetchWithTriggerFallback,
  });
}

export async function generatePlainOcrWithTriggerFetch(
  params: GeminiOcrParams,
): Promise<{ text: string; usage?: GeminiUsage }> {
  const body = await postGemini(params);
  const text = sanitizeOcrOutput(readCandidateText(body));
  if (!text) {
    const err = new Error(
      `Gemini returned empty text; finishReason=${body.candidates?.[0]?.finishReason ?? "unknown"}`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }
  return { text, usage: usageOf(body) };
}

export async function generateStructuredOcrWithTriggerFetch(
  params: GeminiOcrParams,
): Promise<{ object: StructuredOcrResponse; usage?: GeminiUsage }> {
  const body = await postGemini({
    ...params,
    responseMimeType: "application/json",
  });
  const rawText = readCandidateText(body);
  if (!rawText) {
    const err = new Error(
      `Gemini returned empty structured text; finishReason=${body.candidates?.[0]?.finishReason ?? "unknown"}`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }

  try {
    const parsed = JSON.parse(sanitizeStructuredJson(rawText));
    return {
      object: structuredOcrResponseSchema.parse(parsed),
      usage: usageOf(body),
    };
  } catch (err) {
    throw new StructuredParseError(
      `Gemini REST structured parse failure: ${
        err instanceof Error ? err.message : String(err)
      }. Raw: ${rawText.slice(0, 300)}`,
      err,
    );
  }
}

export async function generateStructuredTextWithTriggerFetch<T>(
  params: GeminiTextParams & { schema: z.ZodType<T> },
): Promise<{ object: T; usage?: GeminiUsage; rawText: string }> {
  const body = await postGeminiText({
    ...params,
    responseMimeType: "application/json",
  });
  const rawText = readCandidateText(body);
  if (!rawText) {
    const err = new Error(
      `Gemini returned empty text; finishReason=${body.candidates?.[0]?.finishReason ?? "unknown"}`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }

  try {
    const parsed = JSON.parse(sanitizeStructuredJson(rawText));
    return {
      object: params.schema.parse(parsed),
      usage: usageOf(body),
      rawText,
    };
  } catch (err) {
    throw new StructuredParseError(
      `Gemini REST structured text parse failure: ${
        err instanceof Error ? err.message : String(err)
      }. Raw: ${rawText.slice(0, 300)}`,
      err,
    );
  }
}

export async function generateGroundedTextWithTriggerFetch(
  params: GeminiTextParams,
): Promise<{
  text: string;
  usage?: GeminiUsage;
  groundingMetadata?: GeminiGroundingMetadata;
}> {
  const body = await postGeminiGroundedText(params);
  const text = readCandidateText(body);
  if (!text) {
    const err = new Error(
      `Gemini returned empty grounded text; finishReason=${body.candidates?.[0]?.finishReason ?? "unknown"}`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }
  return {
    text,
    usage: usageOf(body),
    groundingMetadata: groundingOf(body),
  };
}

/**
 * Single-call grounded + structured. Attaches the `google_search` tool AND
 * forces a JSON response so the model performs source-search and structured
 * output in one round-trip. The Zod schema validates the parsed JSON.
 *
 * Note: Gemini supports `tools: [google_search]` together with
 * `responseMimeType: "application/json"` on Gemini 3 series. We do NOT pass
 * `responseSchema` here because Gemini's responseSchema validator is stricter
 * than what we need (e.g. doesn't tolerate Zod's `default` semantics) — we
 * rely on the JSON-only response + Zod parse on our side instead.
 */
async function postGeminiGroundedStructuredText(
  params: GeminiTextParams,
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig(params.stage);
  return postAtlasChatCompletionAsGeminiLike({
    model: cfg.model,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    temperature: cfg.temperature,
    topP: cfg.topP,
    maxOutputTokens: cfg.maxOutputTokens,
    responseMimeType: "application/json",
    timeoutInMs: params.timeoutInMs,
    enableWebSearch: true,
    fetcher: fetchWithTriggerFallback,
  });
}

export async function generateGroundedStructuredTextWithTriggerFetch<T>(
  params: GeminiTextParams & { schema: z.ZodType<T> },
): Promise<{
  object: T;
  usage?: GeminiUsage;
  rawText: string;
  groundingMetadata?: GeminiGroundingMetadata;
}> {
  const body = await postGeminiGroundedStructuredText(params);
  const rawText = readCandidateText(body);
  if (!rawText) {
    const err = new Error(
      `Gemini returned empty grounded structured text; finishReason=${body.candidates?.[0]?.finishReason ?? "unknown"}`,
    );
    (err as Error & { code?: string }).code = "EMPTY_OUTPUT";
    throw err;
  }
  try {
    const parsed = JSON.parse(sanitizeStructuredJson(rawText));
    return {
      object: params.schema.parse(parsed),
      usage: usageOf(body),
      rawText,
      groundingMetadata: groundingOf(body),
    };
  } catch (err) {
    throw new StructuredParseError(
      `Gemini grounded structured text parse failure: ${
        err instanceof Error ? err.message : String(err)
      }. Raw: ${rawText.slice(0, 300)}`,
      err,
    );
  }
}

export async function runGeminiTextHealthCheck(timeoutInMs: number): Promise<{
  text: string;
  usage?: GeminiUsage;
}> {
  const cfg = getExtractionAiConfig("ocr");
  const body = await postAtlasChatCompletionAsGeminiLike({
    model: cfg.model,
    userPrompt: "Reply with exactly: ok",
    temperature: 0,
    maxOutputTokens: 8,
    timeoutInMs,
    fetcher: fetchWithTriggerFallback,
  });
  return { text: readCandidateText(body), usage: usageOf(body) };
}
