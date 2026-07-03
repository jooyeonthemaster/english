import { generateObject, type LanguageModel } from "ai";

import { recordAiCost } from "@/lib/platform-api-costs";
import { buildQuestionAnalysisPrompt } from "./prompt";
import {
  singleItemAnalysisSchema,
  singleItemAnalysisWithoutBoundingBoxSchema,
  type SingleItemAnalysis,
} from "./schema";
import { ANALYSIS_MAX_RETRIES, ANALYSIS_TIMEOUT_MS } from "./constants";
import { analysisErrorDetail, isSingleQuestionFollowUpError } from "./errors";
import type { QuestionAnalysisImage, TargetQuestionAnalysis } from "./types";

export interface GenerateAnalysisArgs {
  inputText?: string;
  images: QuestionAnalysisImage[];
  schoolType?: string;
  gradeInfo?: string;
  mode: string;
  model: LanguageModel;
  modelId: string;
  maxOutputTokens: number;
  targetQuestion?: TargetQuestionAnalysis;
  manualCropOnly?: boolean;
  includeBoundingBoxes?: boolean;
  maxRetries?: number;
  stopAfterError?: (error: unknown) => boolean;
  academyId?: string | null;
}

export type GenerateAnalysisResult =
  | {
      ok: true;
      analysis: SingleItemAnalysis;
      attempts: number;
      model: string;
    }
  | {
      ok: false;
      attempts: number;
      model: string;
      lastError: unknown;
    };

export async function generateAnalysisWithRetries(
  args: GenerateAnalysisArgs,
): Promise<GenerateAnalysisResult> {
  const prompt = buildQuestionAnalysisPrompt({
    inputText: args.inputText,
    hasImages: args.images.length > 0,
    schoolType: args.schoolType,
    gradeInfo: args.gradeInfo,
    targetQuestion: args.targetQuestion,
    manualCropOnly: args.manualCropOnly,
  });

  let lastError: unknown;
  let attempts = 0;
  const maxRetries = args.maxRetries ?? ANALYSIS_MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    attempts = attempt + 1;
    try {
      const result = await generateObject({
        model: args.model,
        schema:
          args.includeBoundingBoxes === false
            ? singleItemAnalysisWithoutBoundingBoxSchema
            : singleItemAnalysisSchema,
        maxOutputTokens: args.maxOutputTokens,
        abortSignal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...args.images.map((image) => ({
                type: "image" as const,
                image: image.data,
                mediaType: image.mediaType,
              })),
            ],
          },
        ],
      });
      await recordAiCost({
        sourceType: "SIMILAR_EXAM_AI",
        sourceDetail: "question-analysis",
        academyId: args.academyId,
        model: args.modelId,
        operationType: "SIMILAR_EXAM_GEN",
        usage: result.usage,
      });
      return {
        ok: true,
        analysis: result.object as SingleItemAnalysis,
        attempts,
        model: args.modelId,
      };
    } catch (error) {
      if (isSingleQuestionFollowUpError(error)) throw error;
      lastError = error;
      console.warn(
        `[SIMILAR-EXAM-QUESTION-ANALYSIS] ${args.mode} attempt ${attempt} failed: ${analysisErrorDetail(
          error,
        )}`,
      );
      if (args.stopAfterError?.(error)) break;
    }
  }

  return {
    ok: false,
    attempts,
    model: args.modelId,
    lastError,
  };
}
