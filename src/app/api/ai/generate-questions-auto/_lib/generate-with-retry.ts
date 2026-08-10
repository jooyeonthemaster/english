import { z } from "zod";

import { GEMINI_QUESTION_MAX_RETRIES } from "@/lib/concurrency-config";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { GenerateQuestionObjectResult } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { QuestionGenerationResearchStage } from "@/lib/question-generation-research-runtime";

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
    /** 플랜→모델 매핑 대신 이 모델로 호출 (KO 경로의 레거시 모델 보존용 — 이원 티어 개편에서 KO 는 flash3 통일 범위 밖). */
    modelId?: string;
    /** 콜 단위 사고 강도 — S3i 계약(flash3@high). gemini 는 applyReasoningEffortToGemini 와 함께 써야 실린다. */
    reasoningEffort?: string;
    applyReasoningEffortToGemini?: boolean;
    researchStage?: QuestionGenerationResearchStage;
  },
) {
  const result = await generateQuestionObject({
    schema,
    prompt,
    generationPlan,
    modelId: opts?.modelId,
    logPrefix: "AUTO-GEN",
    maxRetries,
    maxTokens,
    system: opts?.system,
    timeoutMs: opts?.timeoutMs,
    deadlineAt: opts?.deadlineAt,
    forceJsonFallback: opts?.forceJsonFallback,
    reasoningEffort: opts?.reasoningEffort,
    applyReasoningEffortToGemini: opts?.applyReasoningEffortToGemini,
    researchStage: opts?.researchStage,
  });
  onUsage?.(result);
  return result.object;
}
