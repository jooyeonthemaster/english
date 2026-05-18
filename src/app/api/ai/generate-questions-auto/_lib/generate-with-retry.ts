import { z } from "zod";

import { generateQuestionObject } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

export async function generateWithRetry(
  schema: z.ZodType,
  prompt: string,
  generationPlan: QuestionGenerationPlan,
  maxTokens: number,
  maxRetries = 2,
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
