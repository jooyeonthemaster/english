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
  readContentMatchAnswerCountSetting,
  readContentMatchOptionCountSetting,
  readGrammarAnswerCountSetting,
  readGrammarCorrectionErrorCountSetting,
  readGrammarMarkerCountSetting,
  readIrrelevantSlotCountSetting,
  readSummaryCompleteBlankCountSetting,
  readSummaryCompleteMcBlankCountSetting,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  type QuestionQualityIssue,
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
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";

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
  onModelUsage?: (event: QuestionGenerationUsageEvent) => void;
}

type QualityMode = "strict" | "relaxed";

type RejectionPhase = "model" | "postprocess" | "quality";

export interface QuestionGenerationUsageEvent {
  phase: "question_generation";
  subType: string;
  qualityMode: QualityMode;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface QuestionGenerationRejectionIssue {
  phase: RejectionPhase;
  qualityMode: QualityMode;
  subType: string;
  message: string;
  codes?: string[];
  sample?: Record<string, unknown>;
}

export interface QuestionGenerationRejectionSummary {
  total: number;
  phaseCounts: Record<RejectionPhase, number>;
  topCodes: Array<{ code: string; count: number }>;
  lastIssue?: QuestionGenerationRejectionIssue;
  message: string;
}

interface RejectionRecorder {
  issues: QuestionGenerationRejectionIssue[];
}

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
  "grammar-correction-underline-count",
  "grammar-correction-missing-underlined-segments",
  "grammar-correction-missing-passage-underline",
  "grammar-correction-underline-count-mismatch",
  "grammar-correction-error-count",
  "grammar-correction-missing-corrected-part",
  "grammar-correction-missing-source-text",
  "grammar-correction-missing-displayed-text",
  "grammar-correction-missing-error-part",
  "grammar-correction-not-mutated",
  "grammar-correction-correction-mismatch",
  "grammar-correction-answer-mismatch",
  "grammar-correction-corrected-part-not-in-source-text",
  "grammar-correction-error-part-not-in-displayed-text",
  "grammar-correction-displayed-not-mutated",
  "grammar-correction-underline-too-narrow",
  "grammar-correction-underlined-segment-short",
  "grammar-correction-displayed-text-not-rendered",
  "grammar-correction-source-text-not-source-backed",
  "grammar-correction-sentence-not-source-backed",
  "grammar-correction-debatable-infinitive",
  "topic-option-language",
  "summary-mc-direction-frame",
  "summary-mc-missing-summary",
  "summary-mc-blank-marker-count",
  "summary-mc-summary-language",
  "summary-mc-missing-blank-answer",
  "summary-mc-answer-language",
  "summary-mc-awkward-collocation",
  "summary-mc-correct-answer-mismatch",
  "summary-mc-correct-pair-mismatch",
  "summary-mc-option-pair-shape",
  "summary-mc-option-language",
  "summary-mc-missing-half-correct-traps",
  "implied-meaning-missing-expression",
  "implied-meaning-missing-underline",
  "implied-meaning-underline-count",
  "implied-meaning-option-language",
  "implied-meaning-option-not-english",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-target-not-in-passage",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-thin-reasoning-gap",
  "implied-meaning-direct-answer-leak",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-absolute-giveaway-option",
  "irrelevant-sentence-count",
  "empty-irrelevant-sentence",
  "irrelevant-index-range",
  "irrelevant-index-edge",
  "irrelevant-answer-index-mismatch",
  "irrelevant-source-not-verbatim",
  "irrelevant-source-first-sentence",
  "irrelevant-source-order",
  "irrelevant-answer-from-source",
  "irrelevant-too-unrelated",
  "irrelevant-inserted-ungrammatical",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "sentence-insert-missing-passage",
  "sentence-insert-gap-marker-count",
  "sentence-insert-omitted-source-not-backed",
  "sentence-insert-omitted-source-visible",
  "sentence-insert-given-leaks-in-passage",
  // The softer giveaway gates below stay STRICT-only: strict retries away from
  // them, but the last-resort relaxed fallback may still ship one (flagged) so a
  // hard passage returns a usable item instead of failing with 0 questions.
  "blank-missing-answer",
  "negative-paraphrase-copula-slot-mismatch",
  "negative-paraphrase-stacked-prepositions",
  "negative-paraphrase-verb-slot-mismatch",
  "negative-paraphrase-modal-be-negated-complement",
  "negative-paraphrase-no-subject-double-negation",
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
    onModelUsage,
  }: RunGenerationInput,
  {
    qualityMode = "strict",
    rejectionRecorder,
  }: {
    qualityMode?: QualityMode;
    rejectionRecorder?: RejectionRecorder;
  } = {},
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
      let grammarMarkerCount: number | undefined;
      let grammarAnswerCount: number | undefined;
      let grammarCorrectionErrorCount: number | undefined;
      let summaryCompleteMcBlankCount: number | undefined;
      let summaryCompleteBlankCount: number | undefined;
      let contentMatchOptionCount: number | undefined;
      let contentMatchAnswerCount: number | undefined;
      let effectiveTypeSettings: unknown = typeSettings?.[subType];
      if (subType === "GRAMMAR_ERROR" && isRecord(typeSettings?.[subType])) {
        grammarMarkerCount = readGrammarMarkerCountSetting(typeSettings?.[subType]);
        grammarAnswerCount = readGrammarAnswerCountSetting(
          typeSettings?.[subType],
          grammarMarkerCount,
        );
        effectiveTypeSettings = {
          ...(typeSettings?.[subType] as Record<string, unknown>),
          markerCount: grammarMarkerCount,
          answerCount: grammarAnswerCount,
        };
      }
      if (subType === "GRAMMAR_CORRECTION" && isRecord(typeSettings?.[subType])) {
        grammarCorrectionErrorCount = readGrammarCorrectionErrorCountSetting(
          typeSettings?.[subType],
        );
        effectiveTypeSettings = {
          ...(typeSettings?.[subType] as Record<string, unknown>),
          errorCount: grammarCorrectionErrorCount,
        };
      }
      if (subType === "IRRELEVANT") {
        irrelevantSlotCount = readIrrelevantSlotCountSetting(
          typeSettings?.[subType],
        );
        effectiveTypeSettings = {
          ...(isRecord(typeSettings?.[subType])
            ? (typeSettings?.[subType] as Record<string, unknown>)
            : {}),
          slotCount: irrelevantSlotCount,
        };
      }
      if (subType === "CONTENT_MATCH") {
        contentMatchOptionCount = readContentMatchOptionCountSetting(
          typeSettings?.[subType],
        );
        contentMatchAnswerCount = readContentMatchAnswerCountSetting(
          typeSettings?.[subType],
          contentMatchOptionCount,
        );
        effectiveTypeSettings = {
          ...(isRecord(typeSettings?.[subType])
            ? (typeSettings?.[subType] as Record<string, unknown>)
            : {}),
          optionCount: contentMatchOptionCount,
          answerCount: contentMatchAnswerCount,
        };
      }
      if (subType === "SUMMARY_COMPLETE") {
        summaryCompleteBlankCount = readSummaryCompleteBlankCountSetting(
          typeSettings?.[subType],
        );
        effectiveTypeSettings = {
          ...(isRecord(typeSettings?.[subType])
            ? (typeSettings?.[subType] as Record<string, unknown>)
            : {}),
          blankCount: summaryCompleteBlankCount,
        };
      }
      if (subType === "SUMMARY_COMPLETE_MC" && isRecord(typeSettings?.[subType])) {
        summaryCompleteMcBlankCount = readSummaryCompleteMcBlankCountSetting(
          typeSettings?.[subType],
        );
        effectiveTypeSettings = {
          ...(typeSettings?.[subType] as Record<string, unknown>),
          blankCount: summaryCompleteMcBlankCount,
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
        {
          irrelevantSlotCount,
          grammarMarkerCount,
          grammarAnswerCount,
          grammarCorrectionErrorCount,
          requestedDifficulty: diffLabel,
        },
      );
      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];
      const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[subType];
      const responseSchema = hasAiSchema
        ? getAiResponseSchema(subType, {
            irrelevantSlotCount,
            grammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
            summaryCompleteMcBlankCount,
            summaryCompleteBlankCount,
            contentMatchOptionCount,
            contentMatchAnswerCount,
          })
        : isStructured
          ? z.object({ questions: z.array(QUESTION_SCHEMAS[subType]) })
          : fallbackResponseSchema;

      const structuredInstructions = isStructured
        ? STRUCTURED_OUTPUT_INSTRUCTIONS
        : UNSTRUCTURED_OUTPUT_INSTRUCTIONS;
      const perQuestionTokenFloor =
        subType === "GRAMMAR_ERROR" && ((grammarMarkerCount ?? 5) > 5 || (grammarAnswerCount ?? 1) > 1)
          ? 8_192
          : subType === "CONTENT_MATCH" && ((contentMatchOptionCount ?? 5) > 5 || (contentMatchAnswerCount ?? 1) > 1)
          ? 8_192
          : subType === "SUMMARY_COMPLETE" && (summaryCompleteBlankCount ?? 2) > 2
          ? 8_192
          : subType === "IRRELEVANT" && (irrelevantSlotCount ?? 5) > 5
          ? 8_192
          : subType === "SUMMARY_COMPLETE_MC" && (summaryCompleteMcBlankCount ?? 2) > 2
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
          undefined,
          (result) => {
            onModelUsage?.({
              phase: "question_generation",
              subType,
              qualityMode,
              usage: result.usage,
              provider: result.provider,
              modelId: result.modelId,
              attempts: result.attempts,
              durationMs: result.durationMs,
            });
          },
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
            recordRejection(rejectionRecorder, {
              phase: "postprocess",
              qualityMode,
              subType,
              message: ppResult.error || "Post-process failed",
              sample: buildRejectionSample(subType, normalizedAiQuestion),
            });
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
            grammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
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
            recordRejection(rejectionRecorder, {
              phase: "quality",
              qualityMode,
              subType,
              message: summarizeQualityIssues(blockingQualityErrors),
              codes: blockingQualityErrors.map((issue) => issue.code),
              sample: buildRejectionSample(subType, mapped),
            });
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
        if (isNonRetryableQuestionGenerationProviderError(err)) {
          throw err;
        }
        recordRejection(rejectionRecorder, {
          phase: "model",
          qualityMode,
          subType,
          message: err instanceof Error ? err.message : String(err),
        });
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

function recordRejection(
  recorder: RejectionRecorder | undefined,
  issue: QuestionGenerationRejectionIssue,
) {
  if (!recorder) return;
  recorder.issues.push({
    ...issue,
    message: issue.message.slice(0, 800),
  });
}

function summarizeQualityIssues(issues: QuestionQualityIssue[]): string {
  return issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join(" | ")
    .slice(0, 800);
}

function buildRejectionSample(
  subType: string,
  question: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (subType === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            expression: item.expression,
            isError: item.isError,
            errorExpression: item.errorExpression,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      markedCount: markedExpressions.length,
      renderedMarkerCount: (passageWithMarkers.match(/__[^_]+__/g) ?? []).length,
      markedExpressions,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType !== "IRRELEVANT") return undefined;
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.filter((sentence): sentence is string => typeof sentence === "string")
    : [];
  const irrelevantIndex = Number(question.irrelevantIndex);
  const insertedSentence =
    Number.isInteger(irrelevantIndex) && irrelevantIndex >= 0
      ? sentences[irrelevantIndex]
      : undefined;

  return {
    sentenceCount: sentences.length,
    irrelevantIndex: Number.isInteger(irrelevantIndex) ? irrelevantIndex : null,
    correctAnswer: question.correctAnswer,
    insertedSentence: insertedSentence?.slice(0, 180),
    firstSentence: sentences[0]?.slice(0, 180),
    lastSentence: sentences[sentences.length - 1]?.slice(0, 180),
  };
}

function buildRejectionSummary(
  recorder: RejectionRecorder,
): QuestionGenerationRejectionSummary {
  const phaseCounts: Record<RejectionPhase, number> = {
    model: 0,
    postprocess: 0,
    quality: 0,
  };
  const codeCounts = new Map<string, number>();

  for (const issue of recorder.issues) {
    phaseCounts[issue.phase] += 1;
    for (const code of issue.codes ?? []) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
  const lastIssue = recorder.issues.at(-1);
  const topCodeText = topCodes
    .map(({ code, count }) => `${code} x${count}`)
    .join(", ");
  const message = [
    `Rejected candidates: ${recorder.issues.length}`,
    topCodeText ? `Top codes: ${topCodeText}` : "",
    lastIssue ? `Last: ${lastIssue.phase}/${lastIssue.subType} - ${lastIssue.message}` : "",
  ].filter(Boolean).join(" | ");

  return {
    total: recorder.issues.length,
    phaseCounts,
    topCodes,
    lastIssue,
    message,
  };
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
  rejectionSummary: QuestionGenerationRejectionSummary;
  usageEvents: QuestionGenerationUsageEvent[];
}> {
  const usageEvents: QuestionGenerationUsageEvent[] = [];
  const inputWithUsage: RunGenerationInput = {
    ...input,
    onModelUsage: (event) => {
      usageEvents.push(event);
      input.onModelUsage?.(event);
    },
  };
  const rejectionRecorder: RejectionRecorder = { issues: [] };
  const hasNegativeParaphraseBlank = hasDoubleNegativeBlankSetting(inputWithUsage);
  const hasSummaryCompleteMc = inputWithUsage.plan.some(
    (item) => item.subType === "SUMMARY_COMPLETE_MC" && item.count > 0,
  );
  const requestedCount = inputWithUsage.plan.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)),
    0,
  );
  const largestIrrelevantSlotCount = getLargestIrrelevantSlotCount(inputWithUsage);
  const largestGrammarMarkerCount = getLargestGrammarMarkerCount(inputWithUsage);
  const largestGrammarAnswerCount = getLargestGrammarAnswerCount(inputWithUsage);
  const attempts = hasNegativeParaphraseBlank
    ? Math.max(6, Math.floor(maxAttempts))
    : hasSummaryCompleteMc || largestIrrelevantSlotCount > 5 || largestGrammarMarkerCount > 5 || largestGrammarAnswerCount > 1
      ? Math.max(6, Math.floor(maxAttempts))
      : Math.max(4, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const questions = await runQuestionGeneration(inputWithUsage, { rejectionRecorder });
    const hasEnoughQuestions = hasNegativeParaphraseBlank
      ? questions.length >= requestedCount
      : questions.length > 0;
    if (hasEnoughQuestions) {
      return {
        questions,
        attempts: attempt,
        relaxedFallback: false,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
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
  const relaxedQuestions = await runQuestionGeneration(inputWithUsage, {
    qualityMode: "relaxed",
    rejectionRecorder,
  });
  return {
    questions: relaxedQuestions,
    attempts: attempts + 1,
    relaxedFallback: true,
    rejectionSummary: buildRejectionSummary(rejectionRecorder),
    usageEvents,
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

function getLargestGrammarMarkerCount(input: RunGenerationInput): number {
  let maxMarkerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    maxMarkerCount = Math.max(
      maxMarkerCount,
      readGrammarMarkerCountSetting(input.typeSettings?.GRAMMAR_ERROR),
    );
  }
  return maxMarkerCount;
}

function getLargestGrammarAnswerCount(input: RunGenerationInput): number {
  let maxAnswerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const markerCount = readGrammarMarkerCountSetting(input.typeSettings?.GRAMMAR_ERROR);
    maxAnswerCount = Math.max(
      maxAnswerCount,
      readGrammarAnswerCountSetting(input.typeSettings?.GRAMMAR_ERROR, markerCount),
    );
  }
  return maxAnswerCount;
}
