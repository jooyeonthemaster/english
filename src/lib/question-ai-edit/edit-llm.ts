// ============================================================================
// AI 문제 수정 — 모델 호출 레이어 (3-후보 pluggable)
// ============================================================================
// generateQuestionObject(생성기)와 동일한 견고성을 갖되, plan(STANDARD/PREMIUM) 2모델이
// 아니라 EditModelId 3후보를 직접 라우팅한다:
//   - google(flash/flash-lite): thinkingBudget 0(속도) + abort(남은예산)
//   - anthropic(sonnet 4.6): jsonTool 구조화 + system cache_control(ephemeral)
// 비재시도 provider 에러(billing/quota/permission/unrestricted-key)는 즉시 중단해
// 호출자가 깔끔히 환불하도록 한다(생성기와 동일 정책 재사용).
// ============================================================================

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import { googleGenerativeAI } from "@/lib/ai";
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";

import { EDIT_MODEL_TIMEOUTS_MS, editModelProvider } from "./model-config";
import type { EditModelId } from "./types";

const THINKING_BUDGET = (() => {
  const raw = Number(process.env.GEMINI_QUESTION_THINKING_BUDGET);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
})();

export interface RunEditModelArgs<T> {
  schema: z.ZodType<T>;
  prompt: string;
  modelId: EditModelId;
  /** Claude 전용 정적 system 프리앰블(유형 규칙·계약) — cache_control 부착. */
  system?: string;
  maxTokens?: number;
  maxRetries?: number;
  /** 절대 데드라인(epoch ms) — 호출별 abort 를 남은예산으로 좁힌다. */
  deadlineAt?: number;
  logPrefix?: string;
}

export interface RunEditModelResult<T> {
  object: T;
  provider: "google" | "anthropic";
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
  const provider = editModelProvider(modelId);
  const hardCapMs = EDIT_MODEL_TIMEOUTS_MS[modelId];
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
      // 재시도는 데드라인 안에서만 시작(함수 강제종료→고아 방지).
      if (attempt > 0 && deadlineAt && Date.now() >= deadlineAt) {
        console.warn(
          `[${logPrefix}] Deadline reached before retry ${attempt}; stopping (caller refunds).`,
        );
        break;
      }

      if (provider === "google") {
        const result = await generateObject({
          model: googleGenerativeAI(modelId),
          schema,
          prompt,
          maxOutputTokens: maxTokens,
          abortSignal: AbortSignal.timeout(computeAbortMs()),
          providerOptions: {
            google: { thinkingConfig: { thinkingBudget: THINKING_BUDGET } },
          },
        });
        console.log(
          `[${logPrefix}] ${modelId} attempt ${attempt} ok in ${Date.now() - attemptStartedAt}ms`,
        );
        return {
          object: result.object as T,
          provider,
          modelId,
          attempts: attempt + 1,
          durationMs: Date.now() - operationStartedAt,
          inputTokens: usageInput(result),
          outputTokens: usageOutput(result),
        };
      }

      const result = await generateObject({
        model: anthropic(modelId),
        schema,
        maxOutputTokens: maxTokens,
        abortSignal: AbortSignal.timeout(computeAbortMs()),
        ...(system
          ? {
              messages: [
                {
                  role: "system" as const,
                  content: system,
                  providerOptions: {
                    anthropic: { cacheControl: { type: "ephemeral" as const } },
                  },
                },
                { role: "user" as const, content: prompt },
              ],
            }
          : { prompt }),
        providerOptions: { anthropic: { structuredOutputMode: "jsonTool" } },
      });
      console.log(
        `[${logPrefix}] ${modelId} attempt ${attempt} ok in ${Date.now() - attemptStartedAt}ms`,
      );
      return {
        object: result.object as T,
        provider,
        modelId,
        attempts: attempt + 1,
        durationMs: Date.now() - operationStartedAt,
        inputTokens: usageInput(result),
        outputTokens: usageOutput(result),
      };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[${logPrefix}] ${modelId} attempt ${attempt} failed: ${message}`);
      // 영구·결정적 provider 실패는 provider 무관 즉시 중단(생성기와 동일).
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
