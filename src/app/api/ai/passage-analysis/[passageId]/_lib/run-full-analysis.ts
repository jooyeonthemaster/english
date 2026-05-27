import { passageAnalysisSchema } from "@/lib/passage-analysis-schema";
import { generateQuestionText } from "@/lib/question-generation-llm";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

import { buildFullAnalysisPrompt } from "./analysis-prompt";
import { AnalysisJsonParseError } from "./error-classification";
import { extractJsonFromModelResponse } from "./json-extraction";

/**
 * Run the full 5-layer analysis on a passage and return the validated /
 * raw analysis data. Throws `AnalysisJsonParseError` when the Gemini
 * response cannot be parsed as JSON — the route handler catches this and
 * refunds the deducted credits.
 */
export async function runFullAnalysis(
  passage: {
    content: string;
    grade: number | null;
    school: { type: string } | null;
  },
  customPrompt?: string,
  generationPlan: QuestionGenerationPlan = "STANDARD",
) {
  const prompt = buildFullAnalysisPrompt({
    passageContent: passage.content,
    schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
    grade: passage.grade,
    customPrompt,
  });

  const startTime = Date.now();
  console.log(
    `[ANALYSIS] Starting generateText (JSON mode) via ${generationPlan} plan...`,
  );

  const analysisResult = await generateQuestionText({
    generationPlan,
    logPrefix: "ANALYSIS",
    maxRetries: 1,
    maxTokens: 20000,
    omitMaxTokens: generationPlan === "STANDARD",
    responseFormat: generationPlan === "STANDARD" ? "json_object" : undefined,
    isRecoverableJsonText:
      generationPlan === "STANDARD" ? canRecoverAnalysisJsonText : undefined,
    thinkingBudget: generationPlan === "STANDARD" ? 500 : undefined,
    timeoutMs: 110_000,
    temperature: 0.1,
    prompt,
  });

  const { text: rawJson, finishReason, rawFinishReason, usage } = analysisResult;
  console.log("[ANALYSIS] generateText completed", {
    seconds: ((Date.now() - startTime) / 1000).toFixed(1),
    finishReason,
    rawFinishReason,
    usage,
    rawLength: rawJson.length,
  });

  let parsed: unknown;
  try {
    const jsonStr = extractJsonFromModelResponse(rawJson);
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    throw new AnalysisJsonParseError(error, rawJson, {
      finishReason,
      rawFinishReason,
    });
  }

  // Validate with Zod — use safeParse so we can fall back to raw data when
  // the model's structured output drifts from the schema.
  const validation = passageAnalysisSchema.safeParse(parsed);
  const analysisData = validation.success ? validation.data : parsed;

  console.log(
    "[ANALYSIS] Keys:",
    analysisData && typeof analysisData === "object"
      ? Object.keys(analysisData)
      : [],
  );
  return analysisData;
}

function canRecoverAnalysisJsonText(raw: string): boolean {
  try {
    JSON.parse(extractJsonFromModelResponse(raw));
    return true;
  } catch {
    return false;
  }
}
