import {
  QUESTION_ANALYSIS_MODEL_ID,
  questionAnalysisMaxTokens,
  questionAnalysisModel,
  questionAnalysisProviderOptions,
  questionAnalysisUseDocAi,
  SINGLE_QUESTION_ANALYSIS_MODEL_ID,
} from "./model";
import { ANALYSIS_MAX_RETRIES } from "./constants";
import { generateAnalysisWithRetries } from "./analysis-call";
import { analysisErrorDetail, isSingleQuestionFollowUpError } from "./errors";
import {
  buildDocAiHybridInput,
  extractOcrTextFromImages,
} from "./ocr";
import { reanalyzeAdditionalQuestions } from "./follow-up";
import { normalizeQuestionAnalysisImages } from "./image-normalization";
import { filterIncompleteAnalysisQuestions } from "./completeness";
import { flattenAnalysisQuestions } from "./analysis-shape";
import type {
  AnalyzeQuestionItemArgs,
  QuestionAnalysisResult,
} from "./types";

function countQuestions(analysis: { groups: Array<{ questions: unknown[] }> }): number {
  return analysis.groups.reduce((sum, group) => sum + group.questions.length, 0);
}

export type {
  AnalyzeQuestionItemArgs,
  QuestionAnalysisImage,
  QuestionAnalysisResult,
} from "./types";

/**
 * 단일 문항(또는 한 지문에 묶인 여러 문항)을 멀티모달로 분석한다.
 * 전체 페이지 1차 분석 뒤, 2번째 이후 문항은 crop follow-up 으로 보강한다.
 */
export async function analyzeQuestionItem(
  args: AnalyzeQuestionItemArgs,
): Promise<QuestionAnalysisResult> {
  let images = args.images ?? [];
  let inputText = args.inputText;
  let referenceText: string | undefined;

  if (images.length === 0 && !inputText?.trim()) {
    throw new Error("분석할 문항(이미지 또는 텍스트)이 필요합니다.");
  }

  if (images.length > 0) {
    images = await normalizeQuestionAnalysisImages(images);
  }

  if (questionAnalysisUseDocAi && images.length > 0) {
    const ocrText = await extractOcrTextFromImages(images);
    inputText = ocrText ? buildDocAiHybridInput(inputText, ocrText) : inputText;
    referenceText = ocrText;

    // 현행 hybrid 모드: OCR 텍스트는 독해 보조로, 원본 이미지는 레이아웃/필기/표시 판단용으로 함께 보낸다.
    if (!inputText?.trim() && images.length === 0) {
      throw new Error("Document AI OCR 결과가 비어 있습니다(텍스트를 추출하지 못했습니다).");
    }
  }

  let totalAttempts = 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= ANALYSIS_MAX_RETRIES; attempt += 1) {
    const primary = await generateAnalysisWithRetries({
      inputText,
      images,
      schoolType: args.schoolType,
      gradeInfo: args.gradeInfo,
      mode: `primary-${attempt + 1}`,
      model: questionAnalysisModel,
      modelId: QUESTION_ANALYSIS_MODEL_ID,
      maxOutputTokens: questionAnalysisMaxTokens,
      providerOptions: questionAnalysisProviderOptions,
      maxRetries: 0,
    });
    totalAttempts += primary.attempts;
    if (!primary.ok) {
      lastError = primary.lastError;
      continue;
    }

    try {
      const followUp = await reanalyzeAdditionalQuestions({
        primaryAnalysis: primary.analysis,
        inputText,
        images,
        schoolType: args.schoolType,
        gradeInfo: args.gradeInfo,
      });
      const complete = filterIncompleteAnalysisQuestions(followUp.analysis);
      if (complete.removedCount > 0) {
        console.info(
          `[SIMILAR-EXAM-QUESTION-ANALYSIS] filtered ${complete.removedCount} incomplete question(s): ${complete.removedSummaries.join(" | ")}`,
        );
      }

      return {
        analysis: complete.analysis,
        attempts: totalAttempts + followUp.attempts,
        model: followUp.usedSingleQuestionModel
          ? `${primary.model}; single-question-crop:${SINGLE_QUESTION_ANALYSIS_MODEL_ID}`
          : primary.model,
        referenceText,
        stats: {
          inventoryCount: primary.analysis.inventory?.length ?? 0,
          detailedCountBeforeFilter: countQuestions(followUp.analysis),
          detailedCountAfterFilter: flattenAnalysisQuestions(complete.analysis).length,
          incompleteRemovedCount: complete.removedCount,
          incompleteRemovedSummaries: complete.removedSummaries,
          missingInventoryCount: followUp.missingInventoryCount,
          recoveredMissingCount: followUp.recoveredMissingCount,
          cropMismatchCount: followUp.cropMismatchCount,
          followUpFallbackCount: followUp.followUpFallbackCount,
          warnings: followUp.warnings,
        },
      };
    } catch (error) {
      if (isSingleQuestionFollowUpError(error)) throw error;
      lastError = error;
      console.warn(
        `[SIMILAR-EXAM-QUESTION-ANALYSIS] primary follow-up attempt ${attempt} failed: ${analysisErrorDetail(
          error,
        )}`,
      );
    }
  }

  throw new Error(
    `문항 분석에 실패했습니다(AI 응답 형식 불일치). 다른 이미지로 다시 시도해 주세요. [${analysisErrorDetail(
      lastError,
    )}]`,
  );
}
