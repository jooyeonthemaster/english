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
) {
  const result = await generateQuestionObject({
    schema,
    prompt,
    generationPlan,
    logPrefix: "AUTO-GEN",
    maxRetries,
    maxTokens,
  });
  onUsage?.(result);
  return result.object;
}
