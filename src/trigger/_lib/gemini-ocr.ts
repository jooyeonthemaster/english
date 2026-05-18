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

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    groundingMetadata?: GeminiGroundingMetadata;
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

function getGoogleApiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "Missing env var: GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY",
    );
  }
  return key;
}

function geminiUrl(modelName = getExtractionAiConfig("ocr").model): string {
  const key = getGoogleApiKey();
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
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
  };
}

function groundingOf(body: GeminiGenerateContentResponse): GeminiGroundingMetadata | undefined {
  return body.candidates?.[0]?.groundingMetadata;
}

async function postGemini(
  params: GeminiOcrParams & { responseMimeType?: "application/json" },
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig("ocr");
  const response = await retry.fetch(geminiUrl(cfg.model), {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutInMs: params.timeoutInMs,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: params.mimeType,
                data: params.base64,
              },
            },
            { text: params.userPrompt },
          ],
        },
      ],
      generationConfig: {
        temperature: cfg.temperature,
        topK: cfg.topK,
        topP: cfg.topP,
        maxOutputTokens: cfg.maxOutputTokens,
        ...(params.responseMimeType
          ? { responseMimeType: params.responseMimeType }
          : {}),
        thinkingConfig: { thinkingBudget: cfg.thinkingBudget },
      },
    }),
  });

  const body = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new GeminiHttpError(
      body.error?.message ?? `Gemini HTTP ${response.status}`,
      response.status,
      body.error?.status,
    );
  }
  return body;
}

async function postGeminiText(
  params: GeminiTextParams & { responseMimeType?: "application/json" },
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig(params.stage);
  const userParts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];
  if (params.image) {
    userParts.push({
      inlineData: {
        mimeType: params.image.mimeType,
        data: params.image.base64,
      },
    });
  }
  userParts.push({ text: params.userPrompt });
  const response = await retry.fetch(geminiUrl(cfg.model), {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutInMs: params.timeoutInMs,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: userParts,
        },
      ],
      generationConfig: {
        temperature: cfg.temperature,
        topK: cfg.topK,
        topP: cfg.topP,
        maxOutputTokens: cfg.maxOutputTokens,
        ...(params.responseMimeType
          ? { responseMimeType: params.responseMimeType }
          : {}),
        thinkingConfig: { thinkingBudget: cfg.thinkingBudget },
      },
    }),
  });

  const body = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new GeminiHttpError(
      body.error?.message ?? `Gemini HTTP ${response.status}`,
      response.status,
      body.error?.status,
    );
  }
  return body;
}

async function postGeminiGroundedText(
  params: GeminiTextParams,
): Promise<GeminiGenerateContentResponse> {
  const cfg = getExtractionAiConfig(params.stage);
  const response = await retry.fetch(geminiUrl(cfg.model), {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutInMs: params.timeoutInMs,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: params.userPrompt }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: cfg.temperature,
        topK: cfg.topK,
        topP: cfg.topP,
        maxOutputTokens: cfg.maxOutputTokens,
        thinkingConfig: { thinkingBudget: cfg.thinkingBudget },
      },
    }),
  });

  const body = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new GeminiHttpError(
      body.error?.message ?? `Gemini HTTP ${response.status}`,
      response.status,
      body.error?.status,
    );
  }
  return body;
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
  const response = await retry.fetch(geminiUrl(cfg.model), {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutInMs: params.timeoutInMs,
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: params.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: params.userPrompt }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: cfg.temperature,
        topK: cfg.topK,
        topP: cfg.topP,
        maxOutputTokens: cfg.maxOutputTokens,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: cfg.thinkingBudget },
      },
    }),
  });

  const body = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new GeminiHttpError(
      body.error?.message ?? `Gemini HTTP ${response.status}`,
      response.status,
      body.error?.status,
    );
  }
  return body;
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
  const response = await retry.fetch(geminiUrl(cfg.model), {
    method: "POST",
    headers: { "content-type": "application/json" },
    timeoutInMs,
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: "Reply with exactly: ok" }],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8,
        thinkingConfig: { thinkingBudget: cfg.thinkingBudget },
      },
    }),
  });
  const body = (await response.json()) as GeminiGenerateContentResponse;
  if (!response.ok) {
    throw new GeminiHttpError(
      body.error?.message ?? `Gemini HTTP ${response.status}`,
      response.status,
      body.error?.status,
    );
  }
  return { text: readCandidateText(body), usage: usageOf(body) };
}
