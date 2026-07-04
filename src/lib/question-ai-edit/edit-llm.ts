import { generateObject } from "ai";
import { z } from "zod";

import {
  ATLAS_CLOUD_PROVIDER,
  atlasChatModel,
  normalizeAtlasModelId,
} from "@/lib/atlas-ai";
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";

import { editModelTimeoutMs } from "./model-config";
import type { EditModelId } from "./types";

export interface RunEditModelArgs<T> {
  schema: z.ZodType<T>;
  prompt: string;
  modelId: EditModelId;
  system?: string;
  maxTokens?: number;
  maxRetries?: number;
  deadlineAt?: number;
  logPrefix?: string;
}

export interface RunEditModelResult<T> {
  object: T;
  provider: typeof ATLAS_CLOUD_PROVIDER;
  modelId: EditModelId;
  attempts: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function runEditModel<T>({
  schema,
  prompt,
  modelId,
  system,
  maxTokens = 8192,
  maxRetries = 1,
  deadlineAt,
  logPrefix = "QUESTION-EDIT",
}: RunEditModelArgs<T>): Promise<RunEditModelResult<T>> {
  const resolvedModelId = normalizeAtlasModelId(modelId) as EditModelId;
  const provider = ATLAS_CLOUD_PROVIDER;
  const hardCapMs = editModelTimeoutMs(resolvedModelId);
  const operationStartedAt = Date.now();
  let lastError: unknown;

  const computeAbortMs = () => {
    if (!deadlineAt) return hardCapMs;
    const remaining = deadlineAt - Date.now();
    return Math.min(hardCapMs, Math.max(1_000, remaining));
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStartedAt = Date.now();
    try {
      if (attempt > 0 && deadlineAt && Date.now() >= deadlineAt) {
        console.warn(
          `[${logPrefix}] Deadline reached before retry ${attempt}; stopping (caller refunds).`,
        );
        break;
      }

      const result = await generateObject({
        model: atlasChatModel(resolvedModelId),
        schema,
        maxOutputTokens: maxTokens,
        abortSignal: AbortSignal.timeout(computeAbortMs()),
        ...(system
          ? {
              messages: [
                { role: "system" as const, content: system },
                { role: "user" as const, content: prompt },
              ],
            }
          : { prompt }),
      });

      console.log(
        `[${logPrefix}] ${resolvedModelId} attempt ${attempt} ok in ${Date.now() - attemptStartedAt}ms`,
      );
      return {
        object: result.object as T,
        provider,
        modelId: resolvedModelId,
        attempts: attempt + 1,
        durationMs: Date.now() - operationStartedAt,
        inputTokens: usageInput(result),
        outputTokens: usageOutput(result),
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${logPrefix}] ${resolvedModelId} attempt ${attempt} failed: ${message}`);
      if (isNonRetryableQuestionGenerationProviderError(error)) {
        console.warn(`[${logPrefix}] Non-retryable provider error; stopping retries.`);
        throw error;
      }
    }
  }

  throw lastError;
}

function usageInput(result: unknown): number | undefined {
  if (!isRecord(result) || !isRecord(result.usage)) return undefined;
  const u = result.usage;
  const v = u.inputTokens ?? u.promptTokens;
  return typeof v === "number" ? v : undefined;
}

function usageOutput(result: unknown): number | undefined {
  if (!isRecord(result) || !isRecord(result.usage)) return undefined;
  const u = result.usage;
  const v = u.outputTokens ?? u.completionTokens;
  return typeof v === "number" ? v : undefined;
}
