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
  buildQuestionTypeSettingsPrompt,
  readGrammarErrorCountSetting,
  readIrrelevantSlotCountSetting,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import { countPassageSentences } from "@/lib/passage-sentence-utils";
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
  typeSettings?: QuestionTypeGenerationSettings;
}

type QualityMode = "strict" | "relaxed";

const RELAXED_BLOCKING_QUALITY_CODES = new Set([
  "option-count",
  "duplicate-option-label",
  "duplicate-option-text",
  "empty-option-text",
  "correct-answer-mismatch",
  "wrong-option-explanation-count",
  "mid-word-marker",
  "target-not-standalone",
  "punctuation-only-chunk",
  "scrambled-already-solved",
  "grammar-marker-count",
  "grammar-render-marker-count",
  "grammar-error-count",
  "grammar-correct-answer-labels",
  "grammar-missing-error-expression",
  "grammar-error-not-mutated",
  "irrelevant-sentence-count",
  "empty-irrelevant-sentence",
  "irrelevant-index-range",
  "irrelevant-answer-index-mismatch",
  "irrelevant-source-not-verbatim",
  "irrelevant-answer-from-source",
  "irrelevant-too-unrelated",
  "irrelevant-inserted-ungrammatical",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "blank-missing-answer",
  "negative-paraphrase-copula-slot-mismatch",
  "negative-paraphrase-stacked-prepositions",
  "negative-paraphrase-verb-slot-mismatch",
  "negative-paraphrase-modal-be-negated-complement",
  "double-negative-clause-missing-subject",
  "double-negative-because-phrase-slot",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function runQuestionGeneration(
  {
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
    typeSettings,
  }: RunGenerationInput,
  { qualityMode = "strict" }: { qualityMode?: QualityMode } = {},
): Promise<Record<string, unknown>[]> {
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

      // Resolve IRRELEVANT slot count and cap it to the actual passage length
      // (safety net: route-level guardrail should already have rejected this
      // case, but AUTO planner / Trigger.dev queued jobs may not have).
      let irrelevantSlotCount: number | undefined;
      let grammarErrorCount: number | undefined;
      let effectiveTypeSettings: unknown = typeSettings?.[subType];
      if (subType === "GRAMMAR_ERROR" && isRecord(typeSettings?.[subType])) {
        grammarErrorCount = readGrammarErrorCountSetting(typeSettings?.[subType]);
        effectiveTypeSettings = {
          ...(typeSettings?.[subType] as Record<string, unknown>),
          markerCount: grammarErrorCount,
        };
      }
      if (subType === "IRRELEVANT" && isRecord(typeSettings?.[subType])) {
        const requested = readIrrelevantSlotCountSetting(typeSettings?.[subType]);
        const passageCount = countPassageSentences(passageContent);
        if (passageCount >= 5 && passageCount < requested) {
          console.warn(
            `[AUTO-GEN] IRRELEVANT slotCount=${requested} > passage sentences=${passageCount}; capping to ${passageCount}`,
          );
          irrelevantSlotCount = passageCount;
        } else {
          irrelevantSlotCount = requested;
        }
        // Keep prompt and schema in sync — both must reference the same N.
        effectiveTypeSettings = {
          ...(typeSettings?.[subType] as Record<string, unknown>),
          slotCount: irrelevantSlotCount,
        };
      }

      const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(
        subType,
        effectiveTypeSettings,
      );
      const mergedCustomPrompt = mergeCustomPromptWithTypeSettings(
        customPrompt,
        typeSettingsPrompt,
      );
      const targetCandidateBlock = buildQuestionTargetCandidateBlock(
        subType,
        passageContent,
        { irrelevantSlotCount, grammarErrorCount, requestedDifficulty: diffLabel },
      );
      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];
      const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[subType];
      const responseSchema = hasAiSchema
        ? getAiResponseSchema(subType, { irrelevantSlotCount, grammarErrorCount })
        : isStructured
          ? z.object({ questions: z.array(QUESTION_SCHEMAS[subType]) })
          : fallbackResponseSchema;

      const structuredInstructions = isStructured
        ? STRUCTURED_OUTPUT_INSTRUCTIONS
        : UNSTRUCTURED_OUTPUT_INSTRUCTIONS;
      const perQuestionTokenFloor =
        subType === "GRAMMAR_ERROR" && (grammarErrorCount ?? 1) > 5
          ? 8_192
          : 4_096;

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
            customPrompt: mergedCustomPrompt,
          }),
          generationPlan,
          Math.min(20_000, Math.max(perQuestionTokenFloor, (Number(typeCount) || 1) * perQuestionTokenFloor)),
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
          const normalizedAiQuestion =
            subType === "BLANK_INFERENCE" && typeSettingsPrompt
              ? {
                  ...q,
                  blankAnswerMode: "DOUBLE_NEGATIVE",
                }
              : q;
          const ppResult = postProcessQuestion(
            subType,
            passageContent,
            normalizedAiQuestion,
          );
          if (!ppResult.success) {
            console.warn(
              `[AUTO-GEN] Post-process failed for ${subType}: ${ppResult.error}`,
            );
            continue;
          }
          if (ppResult.warnings.length > 0) {
            console.warn(
              `[AUTO-GEN] Post-process warnings for ${subType}: ${formatIssuesForLog(
                ppResult.warnings,
              )}`,
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
            grammarErrorCount,
          });
          const qualityErrors = qualityIssues.filter(
            (issue) => issue.severity === "error",
          );
          const qualityWarnings = qualityIssues.filter(
            (issue) => issue.severity === "warning",
          );
          const blockingQualityErrors =
            qualityMode === "relaxed"
              ? qualityErrors.filter((issue) =>
                  RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
                )
              : qualityErrors;
          const relaxedQualityWarnings =
            qualityMode === "relaxed"
              ? qualityErrors
                  .filter((issue) => !RELAXED_BLOCKING_QUALITY_CODES.has(issue.code))
                  .map((issue) => ({ ...issue, severity: "warning" as const }))
              : [];
          if (blockingQualityErrors.length > 0) {
            console.warn(
              `[AUTO-GEN] Quality errors for ${subType}: ${formatIssuesForLog(
                blockingQualityErrors,
              )}`,
            );
            continue;
          }
          const allQualityWarnings = [
            ...qualityWarnings,
            ...relaxedQualityWarnings,
          ];
          if (relaxedQualityWarnings.length > 0) {
            mapped._qualityMode = "relaxed";
            mapped._qualityWarnings = allQualityWarnings;
          }
          if (allQualityWarnings.length > 0) {
            console.warn(
              `[AUTO-GEN] Quality warnings for ${subType}: ${formatIssuesForLog(
                allQualityWarnings,
              )}`,
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

function mergeCustomPromptWithTypeSettings(
  customPrompt: string | undefined,
  typeSettingsPrompt: string,
): string | undefined {
  const parts = [customPrompt?.trim(), typeSettingsPrompt.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

function formatIssuesForLog(issues: unknown): string {
  try {
    return JSON.stringify(issues);
  } catch {
    return String(issues);
  }
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
): Promise<{
  questions: Record<string, unknown>[];
  attempts: number;
  relaxedFallback: boolean;
}> {
  const hasNegativeParaphraseBlank = hasDoubleNegativeBlankSetting(input);
  const requestedCount = input.plan.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)),
    0,
  );
  const largestIrrelevantSlotCount = getLargestIrrelevantSlotCount(input);
  const largestGrammarErrorCount = getLargestGrammarErrorCount(input);
  const attempts = hasNegativeParaphraseBlank
    ? Math.max(6, Math.floor(maxAttempts))
    : largestIrrelevantSlotCount > 5 || largestGrammarErrorCount > 1
      ? Math.max(6, Math.floor(maxAttempts))
      : Math.max(4, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const questions = await runQuestionGeneration(input);
    const hasEnoughQuestions = hasNegativeParaphraseBlank
      ? questions.length >= requestedCount
      : questions.length > 0;
    if (hasEnoughQuestions) {
      return { questions, attempts: attempt, relaxedFallback: false };
    }
    if (attempt === attempts) {
      break;
    }
    console.warn(
      `[${logPrefix}] Generation result did not pass quality/count gate (${questions.length}/${requestedCount}); retrying (${attempt + 1}/${attempts})`,
    );
  }

  console.warn(
    `[${logPrefix}] Strict quality generation exhausted after ${attempts} attempts; running relaxed quality fallback.`,
  );
  const relaxedQuestions = await runQuestionGeneration(input, {
    qualityMode: "relaxed",
  });
  return {
    questions: relaxedQuestions,
    attempts: attempts + 1,
    relaxedFallback: true,
  };
}

function hasDoubleNegativeBlankSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const blankSettings = input.typeSettings?.BLANK_INFERENCE;
  return (
    typeof blankSettings === "object" &&
    blankSettings !== null &&
    "doubleNegative" in blankSettings &&
    (blankSettings as { doubleNegative?: unknown }).doubleNegative === true
  );
}

function getLargestIrrelevantSlotCount(input: RunGenerationInput): number {
  let maxSlotCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "IRRELEVANT" || item.count <= 0) continue;
    maxSlotCount = Math.max(
      maxSlotCount,
      readIrrelevantSlotCountSetting(input.typeSettings?.IRRELEVANT),
    );
  }
  return maxSlotCount;
}

function getLargestGrammarErrorCount(input: RunGenerationInput): number {
  let maxErrorCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    maxErrorCount = Math.max(
      maxErrorCount,
      readGrammarErrorCountSetting(input.typeSettings?.GRAMMAR_ERROR),
    );
  }
  return maxErrorCount;
}
