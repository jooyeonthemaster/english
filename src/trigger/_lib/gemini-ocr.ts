import { retry } from "@trigger.dev/sdk/v3";
import {
  OCR_GENERATION_CONFIG,
  sanitizeOcrOutput,
  sanitizeStructuredJson,
  structuredOcrResponseSchema,
  type StructuredOcrResponse,
} from "@/lib/extraction/ocr-prompt";

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

function geminiUrl(): string {
  const key = getGoogleApiKey();
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(key)}`;
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
  const response = await retry.fetch(geminiUrl(), {
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
        temperature: OCR_GENERATION_CONFIG.temperature,
        topK: OCR_GENERATION_CONFIG.topK,
        topP: OCR_GENERATION_CONFIG.topP,
        maxOutputTokens: OCR_GENERATION_CONFIG.maxOutputTokens,
        ...(params.responseMimeType
          ? { responseMimeType: params.responseMimeType }
          : {}),
        thinkingConfig: { thinkingBudget: 0 },
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

export async function runGeminiTextHealthCheck(timeoutInMs: number): Promise<{
  text: string;
  usage?: GeminiUsage;
}> {
  const response = await retry.fetch(geminiUrl(), {
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
        thinkingConfig: { thinkingBudget: 0 },
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
