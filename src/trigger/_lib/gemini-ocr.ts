import { retry } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import {
  sanitizeOcrOutput,
  sanitizeStructuredJson,
  structuredOcrResponseSchema,
  type StructuredOcrResponse,
} from "@/lib/extraction/ocr-prompt";
import {
  getExtractionAiConfig,
  type ExtractionAiStage,
} from "@/lib/extraction/model-config";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
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
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("Missing env var: GOOGLE_GENERATIVE_AI_API_KEY");
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
