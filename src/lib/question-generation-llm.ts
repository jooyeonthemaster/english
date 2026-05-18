import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

type QuestionGenerationProvider = "atlas" | "anthropic";

const QUESTION_GENERATION_MODEL_CONFIGS: Record<
  QuestionGenerationPlan,
  { provider: QuestionGenerationProvider; modelId: string }
> = {
  STANDARD: {
    provider: "atlas",
    modelId: "qwen/qwen3.6-plus",
  },
  PREMIUM: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
  },
};

function getQuestionGenerationModelConfig(plan: QuestionGenerationPlan) {
  return QUESTION_GENERATION_MODEL_CONFIGS[plan];
}

interface GenerateQuestionObjectArgs<T> {
  schema: z.ZodType<T>;
  prompt: string;
  generationPlan: QuestionGenerationPlan;
  logPrefix?: string;
  maxRetries?: number;
  maxTokens?: number;
}

interface GenerateQuestionTextArgs {
  prompt: string;
  generationPlan: QuestionGenerationPlan;
  logPrefix?: string;
  maxRetries?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateQuestionObjectResult<T> {
  object: T;
  usage?: unknown;
  provider: string;
  modelId: string;
}

export interface GenerateQuestionTextResult {
  text: string;
  usage?: unknown;
  provider: string;
  modelId: string;
  finishReason?: string;
  rawFinishReason?: string;
}

export async function generateQuestionObject<T>({
  schema,
  prompt,
  generationPlan,
  logPrefix = "QUESTION-GEN",
  maxRetries = 2,
  maxTokens = 8192,
}: GenerateQuestionObjectArgs<T>): Promise<GenerateQuestionObjectResult<T>> {
  const config = getQuestionGenerationModelConfig(generationPlan);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[${logPrefix}] Retry attempt ${attempt} via ${generationPlan} plan...`);
      }

      if (config.provider === "atlas") {
        const result = await generateWithAtlas({
          schema,
          prompt,
          modelId: config.modelId,
          maxTokens,
        });
        return { ...result, provider: config.provider, modelId: config.modelId };
      }

      const result = await generateObject({
        model: anthropic(config.modelId),
        schema,
        prompt,
        abortSignal: AbortSignal.timeout(180_000),
        providerOptions: {
          anthropic: { structuredOutputMode: "jsonTool" },
        },
      });

      return {
        object: result.object as T,
        usage: "usage" in result ? result.usage : undefined,
        provider: config.provider,
        modelId: config.modelId,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${logPrefix}] Attempt ${attempt} failed via ${generationPlan} plan: ${message}`);
      if (isRecord(error) && error.finishReason) {
        console.warn(`[${logPrefix}]   finishReason: ${String(error.finishReason)}`);
      }
      if (isRecord(error) && error.usage) {
        console.warn(`[${logPrefix}]   usage: ${JSON.stringify(error.usage).slice(0, 300)}`);
      }
      if (isRecord(error) && typeof error.text === "string") {
        console.warn(`[${logPrefix}]   rawText: ${error.text.slice(0, 300)}`);
      }
    }
  }

  throw lastError;
}

export async function generateQuestionText({
  prompt,
  generationPlan,
  logPrefix = "TEXT-GEN",
  maxRetries = 2,
  maxTokens = 8192,
  temperature = 0.35,
}: GenerateQuestionTextArgs): Promise<GenerateQuestionTextResult> {
  const config = getQuestionGenerationModelConfig(generationPlan);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[${logPrefix}] Retry attempt ${attempt} via ${generationPlan} plan...`);
      }

      if (config.provider === "atlas") {
        const result = await generateTextWithAtlas({
          prompt,
          modelId: config.modelId,
          maxTokens,
          temperature,
        });
        return { ...result, provider: config.provider, modelId: config.modelId };
      }

      const result = await generateText({
        model: anthropic(config.modelId),
        prompt,
        maxOutputTokens: maxTokens,
        temperature,
        abortSignal: AbortSignal.timeout(180_000),
      });

      return {
        text: result.text,
        usage: "usage" in result ? result.usage : undefined,
        finishReason: "finishReason" in result && typeof result.finishReason === "string"
          ? result.finishReason
          : undefined,
        rawFinishReason: "rawFinishReason" in result && typeof result.rawFinishReason === "string"
          ? result.rawFinishReason
          : undefined,
        provider: config.provider,
        modelId: config.modelId,
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${logPrefix}] Attempt ${attempt} failed via ${generationPlan} plan: ${message}`);
      if (isRecord(error) && error.finishReason) {
        console.warn(`[${logPrefix}]   finishReason: ${String(error.finishReason)}`);
      }
      if (isRecord(error) && error.usage) {
        console.warn(`[${logPrefix}]   usage: ${JSON.stringify(error.usage).slice(0, 300)}`);
      }
      if (isRecord(error) && typeof error.text === "string") {
        console.warn(`[${logPrefix}]   rawText: ${error.text.slice(0, 300)}`);
      }
    }
  }

  throw lastError;
}

async function generateWithAtlas<T>({
  schema,
  prompt,
  modelId,
  maxTokens,
}: {
  schema: z.ZodType<T>;
  prompt: string;
  modelId: string;
  maxTokens: number;
}): Promise<{ object: T; usage?: unknown }> {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("ATLASCLOUD_API_KEY is not set");
  }

  const response = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "user",
          content: `${prompt}

Return only one valid JSON object matching the requested schema.
Do not wrap the JSON in Markdown.
Do not include commentary before or after the JSON.`,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.35,
      stream: false,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Atlas HTTP ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const content = extractAtlasContent(payload);
  const parsedJson = parseJsonObject(content);
  const parsedSchema = schema.safeParse(parsedJson);
  if (!parsedSchema.success) {
    const issues = parsedSchema.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Atlas JSON failed schema validation: ${issues}`);
  }

  return {
    object: parsedSchema.data,
    usage: isRecord(payload) ? payload.usage : undefined,
  };
}

async function generateTextWithAtlas({
  prompt,
  modelId,
  maxTokens,
  temperature,
}: {
  prompt: string;
  modelId: string;
  maxTokens: number;
  temperature: number;
}): Promise<{
  text: string;
  usage?: unknown;
  finishReason?: string;
  rawFinishReason?: string;
}> {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  if (!apiKey) {
    throw new Error("ATLASCLOUD_API_KEY is not set");
  }

  const response = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Atlas HTTP ${response.status}: ${extractErrorMessage(payload)}`);
  }

  const firstChoice = isRecord(payload) && Array.isArray(payload.choices)
    ? payload.choices.find(isRecord)
    : null;

  return {
    text: extractAtlasContent(payload),
    usage: isRecord(payload) ? payload.usage : undefined,
    finishReason: typeof firstChoice?.finish_reason === "string"
      ? firstChoice.finish_reason
      : undefined,
    rawFinishReason: typeof firstChoice?.finish_reason === "string"
      ? firstChoice.finish_reason
      : undefined,
  };
}

function extractAtlasContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error("Atlas response missing choices array");
  }

  const firstChoice = payload.choices.find(isRecord);
  const message = isRecord(firstChoice?.message) ? firstChoice.message : null;
  const content = message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Atlas response missing message.content");
  }
  return content;
}

function extractErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) return "unknown error";
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof payload.message === "string") return payload.message;
  return JSON.stringify(payload).slice(0, 300);
}

function parseJsonObject(content: string): unknown {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`No JSON object found in response: ${stripped.slice(0, 300)}`);
    }
    return JSON.parse(stripped.slice(start, end + 1));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
