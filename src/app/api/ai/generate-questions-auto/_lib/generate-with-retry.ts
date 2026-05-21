import { z } from "zod";

import { GEMINI_QUESTION_MAX_RETRIES } from "@/lib/concurrency-config";
import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

export async function generateWithRetry(
  schema: z.ZodType,
  prompt: string,
  generationPlan: QuestionGenerationPlan,
  maxTokens: number,
  maxRetries = GEMINI_QUESTION_MAX_RETRIES,
) {
  const result = await generateQuestionObject({
    schema,
    prompt,
    generationPlan,
    logPrefix: "AUTO-GEN",
    maxRetries,
    maxTokens,
  });
  return result.object;
}
