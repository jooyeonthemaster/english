import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText, Output } from "ai";
import { z } from "zod";
import { GEMINI_MODEL_ID, model as geminiModel } from "@/lib/ai";
import { GEMINI_QUESTION_MAX_RETRIES } from "@/lib/concurrency-config";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

type QuestionGenerationProvider = "google" | "anthropic";

const GEMINI_QUESTION_THINKING_BUDGET = readNumberEnv(
  "GEMINI_QUESTION_THINKING_BUDGET",
  0,
);
const GEMINI_QUESTION_TIMEOUT_MS = readNumberEnv(
  "GEMINI_QUESTION_TIMEOUT_MS",
  60_000,
);

const QUESTION_GENERATION_MODEL_CONFIGS: Record<
  QuestionGenerationPlan,
  { provider: QuestionGenerationProvider; modelId: string }
> = {
  STANDARD: {
    provider: "google",
    modelId: GEMINI_MODEL_ID,
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
  omitMaxTokens?: boolean;
  responseFormat?: "json_object";
  isRecoverableJsonText?: (text: string) => boolean;
  thinkingBudget?: number;
  timeoutMs?: number;
  temperature?: number;
}

export interface GenerateQuestionObjectResult<T> {
  object: T;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface GenerateQuestionTextResult {
  text: string;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
  finishReason?: string;
  rawFinishReason?: string;
}

export async function generateQuestionObject<T>({
  schema,
  prompt,
  generationPlan,
  logPrefix = "QUESTION-GEN",
  maxRetries = GEMINI_QUESTION_MAX_RETRIES,
  maxTokens = 8192,
}: GenerateQuestionObjectArgs<T>): Promise<GenerateQuestionObjectResult<T>> {
  const config = getQuestionGenerationModelConfig(generationPlan);
  let lastError: unknown;
  const operationStartedAt = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStartedAt = Date.now();
    try {
      if (attempt > 0) {
        console.log(`[${logPrefix}] Retry attempt ${attempt} via ${generationPlan} plan...`);
      }

      if (config.provider === "google") {
        const result = await generateObject({
          model: geminiModel,
          schema,
          prompt,
          maxOutputTokens: maxTokens,
          abortSignal: AbortSignal.timeout(GEMINI_QUESTION_TIMEOUT_MS),
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingBudget: GEMINI_QUESTION_THINKING_BUDGET,
              },
            },
          },
        });

        console.log(
          `[${logPrefix}] ${generationPlan} ${config.modelId} attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
        );

        return {
          object: result.object as T,
          usage: "usage" in result ? result.usage : undefined,
          provider: config.provider,
          modelId: config.modelId,
          attempts: attempt + 1,
          durationMs: Date.now() - operationStartedAt,
        };
      }

      const result = await generateObject({
        model: anthropic(config.modelId),
        schema,
        prompt,
        maxOutputTokens: maxTokens,
        abortSignal: AbortSignal.timeout(180_000),
        providerOptions: {
          anthropic: { structuredOutputMode: "jsonTool" },
        },
      });

      console.log(
        `[${logPrefix}] ${generationPlan} ${config.modelId} attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
      );

      return {
        object: result.object as T,
        usage: "usage" in result ? result.usage : undefined,
        provider: config.provider,
        modelId: config.modelId,
        attempts: attempt + 1,
        durationMs: Date.now() - operationStartedAt,
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
  maxRetries = GEMINI_QUESTION_MAX_RETRIES,
  maxTokens = 8192,
  omitMaxTokens = false,
  responseFormat,
  isRecoverableJsonText,
  thinkingBudget,
  timeoutMs = 180_000,
  temperature = 0.35,
}: GenerateQuestionTextArgs): Promise<GenerateQuestionTextResult> {
  const config = getQuestionGenerationModelConfig(generationPlan);
  let lastError: unknown;
  const operationStartedAt = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStartedAt = Date.now();
    try {
      if (attempt > 0) {
        console.log(`[${logPrefix}] Retry attempt ${attempt} via ${generationPlan} plan...`);
      }

      if (config.provider === "google") {
        const result = await generateText({
          model: geminiModel,
          prompt,
          maxOutputTokens: omitMaxTokens ? undefined : maxTokens,
          temperature,
          abortSignal: AbortSignal.timeout(Math.min(timeoutMs, GEMINI_QUESTION_TIMEOUT_MS)),
          ...(responseFormat === "json_object"
            ? { output: Output.json() }
            : {}),
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingBudget: thinkingBudget ?? GEMINI_QUESTION_THINKING_BUDGET,
              },
            },
          },
        });

        console.log(
          `[${logPrefix}] ${generationPlan} ${config.modelId} text attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
        );

        const jsonOutput =
          responseFormat === "json_object" && "output" in result
            ? JSON.stringify(result.output)
            : undefined;

        return {
          text: jsonOutput ?? result.text,
          usage: "usage" in result ? result.usage : undefined,
          finishReason: "finishReason" in result && typeof result.finishReason === "string"
            ? result.finishReason
            : undefined,
          rawFinishReason: "rawFinishReason" in result && typeof result.rawFinishReason === "string"
            ? result.rawFinishReason
            : undefined,
          provider: config.provider,
          modelId: config.modelId,
          attempts: attempt + 1,
          durationMs: Date.now() - operationStartedAt,
        };
      }

      const result = await generateText({
        model: anthropic(config.modelId),
        prompt,
        maxOutputTokens: maxTokens,
        temperature,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });

      console.log(
        `[${logPrefix}] ${generationPlan} ${config.modelId} text attempt ${attempt} succeeded in ${Date.now() - attemptStartedAt}ms`,
      );

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
        attempts: attempt + 1,
        durationMs: Date.now() - operationStartedAt,
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

      const rawText = readErrorString(error, "text");
      if (config.provider === "google" && responseFormat === "json_object" && rawText) {
        if (isRecoverableJsonText?.(rawText)) {
          console.warn(
            `[${logPrefix}] Falling back to recoverable raw JSON text after SDK object parsing failed.`,
          );
          return {
            text: rawText,
            usage: isRecord(error) && "usage" in error ? error.usage : undefined,
            finishReason: readErrorString(error, "finishReason"),
            rawFinishReason: readErrorString(error, "rawFinishReason"),
            provider: config.provider,
            modelId: config.modelId,
            attempts: attempt + 1,
            durationMs: Date.now() - operationStartedAt,
          };
        }

        if (attempt < maxRetries) {
          console.warn(
            `[${logPrefix}] SDK object parsing failed with unrecoverable raw text; retrying before raw JSON fallback.`,
          );
          continue;
        }

        console.warn(
          `[${logPrefix}] Falling back to raw JSON text after SDK object parsing failed.`,
        );
        return {
          text: rawText,
          usage: isRecord(error) && "usage" in error ? error.usage : undefined,
          finishReason: readErrorString(error, "finishReason"),
          rawFinishReason: readErrorString(error, "rawFinishReason"),
          provider: config.provider,
          modelId: config.modelId,
          attempts: attempt + 1,
          durationMs: Date.now() - operationStartedAt,
        };
      }
    }
  }

  throw lastError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorString(error: unknown, key: string): string | undefined {
  if (!isRecord(error)) return undefined;
  const value = error[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
