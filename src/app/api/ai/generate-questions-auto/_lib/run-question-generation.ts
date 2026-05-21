import { z } from "zod";

import {
  AI_QUESTION_SCHEMAS,
  getAiResponseSchema,
} from "@/lib/question-ai-schemas-mc";
import { GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS } from "@/lib/concurrency-config";
import { postProcessQuestion } from "@/lib/question-postprocess";
import {
  QUESTION_SCHEMAS,
  STRUCTURED_TYPE_PROMPTS,
} from "@/lib/question-schemas";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  validateQuestionQuality,
} from "@/lib/question-quality";

import { TYPE_LABELS } from "./constants";
import { generateWithRetry } from "./generate-with-retry";
import { fallbackResponseSchema, type PlanResult } from "./schemas";
import {
  STRUCTURED_OUTPUT_INSTRUCTIONS,
  UNSTRUCTURED_OUTPUT_INSTRUCTIONS,
  buildGenerationPrompt,
} from "./prompts";

export interface RunGenerationInput {
  plan: PlanResult["plan"];
  schoolType: string;
  gradeInfo: string;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  diffLabel: string;
  diffInstruction: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function runQuestionGeneration({
  plan,
  schoolType,
  gradeInfo,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  diffLabel,
  diffInstruction,
  generationPlan,
  customPrompt,
}: RunGenerationInput): Promise<Record<string, unknown>[]> {
  const generatedGroups = await Promise.all(
    plan.map(async (item) => {
      const { subType, count: typeCount, targetPoints } = item;
      if (typeCount <= 0) return [];
      const expectedTypeCount = Math.max(1, Math.floor(Number(typeCount) || 1));

      console.log(
        `[AUTO-GEN] Step 2: Generating ${subType} x${typeCount} via ${generationPlan} plan...`,
      );

      const typePrompt =
        STRUCTURED_TYPE_PROMPTS[subType] ||
        `${subType} 유형의 문제를 만드세요.`;
      const typeQualityRubric = getTypeQualityRubric(subType, diffLabel);
      const targetCandidateBlock = buildQuestionTargetCandidateBlock(
        subType,
        passageContent,
      );
      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];
      const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[subType];
      const responseSchema = hasAiSchema
        ? getAiResponseSchema(subType)
        : isStructured
          ? z.object({ questions: z.array(QUESTION_SCHEMAS[subType]) })
          : fallbackResponseSchema;

      const structuredInstructions = isStructured
        ? STRUCTURED_OUTPUT_INSTRUCTIONS
        : UNSTRUCTURED_OUTPUT_INSTRUCTIONS;

      try {
        const object = await generateWithRetry(
          responseSchema,
          buildGenerationPrompt({
            schoolType,
            gradeInfo,
            passageContent,
            teacherIntentBlock,
            analysisContext,
            targetPoints,
            typePrompt,
            structuredInstructions,
            targetCandidateBlock,
            typeQualityRubric,
            typeCount,
            diffLabel,
            diffInstruction,
            generationPlan,
            customPrompt,
          }),
          generationPlan,
          Math.min(20_000, Math.max(4_096, (Number(typeCount) || 1) * 4_096)),
        );

        const generatedQuestionsAll =
          isRecord(object) && Array.isArray(object.questions)
            ? object.questions.filter(isRecord)
            : [];
        if (generatedQuestionsAll.length !== expectedTypeCount) {
          console.warn(
            `[AUTO-GEN] ${subType} returned ${generatedQuestionsAll.length}/${expectedTypeCount} questions; trimming to requested count.`,
          );
        }
        const generatedQuestions = generatedQuestionsAll.slice(0, expectedTypeCount);
        const qs: Record<string, unknown>[] = [];

        for (const q of generatedQuestions) {
          const ppResult = postProcessQuestion(subType, passageContent, q);
          if (!ppResult.success) {
            console.warn(
              `[AUTO-GEN] Post-process failed for ${subType}: ${ppResult.error}`,
            );
            continue;
          }
          if (ppResult.warnings.length > 0) {
            console.warn(
              `[AUTO-GEN] Post-process warnings for ${subType}:`,
              ppResult.warnings,
            );
          }

          const mapped: Record<string, unknown> = {
            ...(ppResult.data as Record<string, unknown>),
            _typeId: subType,
            _typeLabel: TYPE_LABELS[subType] || subType,
          };

          if (
            subType === "WORD_ORDER" &&
            Array.isArray(mapped.scrambledWords) &&
            mapped.scrambledWords.length > 1
          ) {
            const arr = [...mapped.scrambledWords];
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            if (arr.join("|") === mapped.scrambledWords.join("|")) {
              [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
            }
            mapped.scrambledWords = arr;
          }

          const qualityIssues = validateQuestionQuality({
            typeId: subType,
            question: mapped,
            passage: passageContent,
            requestedDifficulty: diffLabel,
          });
          const qualityErrors = qualityIssues.filter(
            (issue) => issue.severity === "error",
          );
          const qualityWarnings = qualityIssues.filter(
            (issue) => issue.severity === "warning",
          );
          if (qualityErrors.length > 0) {
            console.warn(`[AUTO-GEN] Quality errors for ${subType}:`, qualityErrors);
            continue;
          }
          if (qualityWarnings.length > 0) {
            console.warn(
              `[AUTO-GEN] Quality warnings for ${subType}:`,
              qualityWarnings,
            );
          }

          qs.push(mapped);
        }

        console.log(`[AUTO-GEN] ${subType} done: ${qs.length} questions`);
        return qs;
      } catch (err) {
        console.error(
          `[AUTO-GEN] Failed ${subType}:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      }
    }),
  );

  return generatedGroups.flat();
}

export async function runQuestionGenerationWithEmptyRetry(
  input: RunGenerationInput,
  {
    maxAttempts = GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
    logPrefix = "AUTO-GEN",
  }: {
    maxAttempts?: number;
    logPrefix?: string;
  } = {},
): Promise<{ questions: Record<string, unknown>[]; attempts: number }> {
  const attempts = Math.max(1, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const questions = await runQuestionGeneration(input);
    if (questions.length > 0 || attempt === attempts) {
      return { questions, attempts: attempt };
    }
    console.warn(
      `[${logPrefix}] Empty generation result; retrying (${attempt + 1}/${attempts})`,
    );
  }

  return { questions: [], attempts };
}
