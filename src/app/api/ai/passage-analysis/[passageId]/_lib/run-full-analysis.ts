import { generateText } from "ai";

import { model } from "@/lib/ai";
import { passageAnalysisSchema } from "@/lib/passage-analysis-schema";

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
) {
  const prompt = buildFullAnalysisPrompt({
    passageContent: passage.content,
    schoolType: (passage.school?.type as "MIDDLE" | "HIGH" | undefined) ?? null,
    grade: passage.grade,
    customPrompt,
  });

  const startTime = Date.now();
  console.log("[ANALYSIS] Starting generateText (JSON mode)...");

  const analysisResult = await generateText({
    model,
    maxOutputTokens: 20000,
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
