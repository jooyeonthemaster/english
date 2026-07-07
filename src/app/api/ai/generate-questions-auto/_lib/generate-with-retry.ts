import { z } from "zod";

import { GEMINI_QUESTION_MAX_RETRIES } from "@/lib/concurrency-config";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { GenerateQuestionObjectResult } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

export async function generateWithRetry(
  schema: z.ZodType,
  prompt: string,
  generationPlan: QuestionGenerationPlan,
  maxTokens: number,
  maxRetries = GEMINI_QUESTION_MAX_RETRIES,
  onUsage?: (result: GenerateQuestionObjectResult<unknown>) => void,
  opts?: {
    /** PREMIUM 캐시용 정적 system 프리앰블 */
    system?: string;
    /** 호출별 abort 상한(ms) */
    timeoutMs?: number;
    /** 시간예산 데드라인(epoch ms) — abort 를 남은예산으로 좁힘 */
    deadlineAt?: number;
    /** strict 구조화 출력을 생략하고 프롬프트 인라인 JSON 모드로 생성 (Wave-3 SW/TSW PREMIUM) */
    forceJsonFallback?: boolean;
  },
) {
  const result = await generateQuestionObject({
    schema,
    prompt,
    generationPlan,
    logPrefix: "AUTO-GEN",
    maxRetries,
    maxTokens,
    system: opts?.system,
    timeoutMs: opts?.timeoutMs,
    deadlineAt: opts?.deadlineAt,
    forceJsonFallback: opts?.forceJsonFallback,
  });
  onUsage?.(result);
  return result.object;
}
