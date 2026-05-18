import { z } from "zod";

import {
  AI_QUESTION_SCHEMAS,
  getAiResponseSchema,
} from "@/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "@/lib/question-postprocess";
import {
  QUESTION_SCHEMAS,
  STRUCTURED_TYPE_PROMPTS,
} from "@/lib/question-schemas";

import { TYPE_LABELS } from "./constants";
import { generateWithRetry } from "./generate-with-retry";
import { fallbackResponseSchema, type PlanResult } from "./schemas";
import {
  STRUCTURED_OUTPUT_INSTRUCTIONS,
  UNSTRUCTURED_OUTPUT_INSTRUCTIONS,
  buildGenerationPrompt,
} from "./prompts";

interface RunGenerationInput {
  plan: PlanResult["plan"];
  schoolType: string;
  gradeInfo: string;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  diffLabel: string;
  diffInstruction: string;
}

/**
 * Run STEP 2 — iterate over the AI-planned types, generate questions for
 * each, and post-process them. Errors per type are logged and skipped so a
 * single bad type doesn't kill the whole batch.
 *
 * Returns the flat array of generated questions across all types.
 */
export async function runQuestionGeneration({
  plan,
  schoolType,
  gradeInfo,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  diffLabel,
  diffInstruction,
}: RunGenerationInput): Promise<any[]> {
  const allQuestions: any[] = [];

  for (const item of plan) {
    const { subType, count: typeCount, targetPoints } = item;
    if (typeCount <= 0) continue;

    console.log(`[AUTO-GEN] Step 2: Generating ${subType} x${typeCount}...`);

    const typePrompt =
      STRUCTURED_TYPE_PROMPTS[subType] ||
      `${subType} 유형의 문제를 만드세요.`;
    // Use AI-minimal schema if available, otherwise fall back to full schema
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
          typeCount,
          diffLabel,
          diffInstruction,
        }),
      );

      const qs: any[] = [];
      for (const q of ((object as any).questions || [])) {
        // Post-process: reconstruct passage fields from AI minimal output
        const ppResult = postProcessQuestion(subType, passageContent, q);
        if (!ppResult.success) {
          console.warn(
            `[AUTO-GEN] Post-process failed for ${subType}: ${ppResult.error}`,
          );
          continue; // Skip this question
        }
        if (ppResult.warnings.length > 0) {
          console.warn(
            `[AUTO-GEN] Post-process warnings for ${subType}:`,
            ppResult.warnings,
          );
        }

        const mapped: any = {
          ...ppResult.data,
          _typeId: subType,
          _typeLabel: TYPE_LABELS[subType] || subType,
        };

        // WORD_ORDER: 강제 셔플 — AI가 정답 순서로 넣는 경우 방지
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
        qs.push(mapped);
      }
      allQuestions.push(...qs);
      console.log(`[AUTO-GEN] ${subType} done: ${qs.length} questions`);
    } catch (err) {
      console.error(
        `[AUTO-GEN] Failed ${subType}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return allQuestions;
}
