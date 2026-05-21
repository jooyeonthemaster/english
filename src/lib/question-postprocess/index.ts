// ============================================================================
// SMOAT ERP — Question Post-Processing Engine
// ============================================================================
// Takes AI's minimal output (no full passage text) and reconstructs the
// passage fields that frontend renderers expect.
//
// Frontend format contracts (from question-renderer-primitives.tsx):
//   - Blanks:    _____ (5+ underscores) matched by /_{3,}/g
//   - Markers:   __(A) expression__ matched by /__([^_]+)__/g then /^\(([a-eA-E])\)\s*(.+)$/
//   - Underline: __word__ matched by /__([^_]+)__/g
//   - Circled:   ①②③④⑤ matched by /([①②③④⑤])/g
// ============================================================================

import { processAntonym } from "./processors/antonym";
import { processBlankInference } from "./processors/blank-inference";
import { processContextMeaning } from "./processors/context-meaning";
import { processFillBlankKey } from "./processors/fill-blank-key";
import { processGrammarError } from "./processors/grammar-error";
import { processIrrelevant } from "./processors/irrelevant";
import { processReference } from "./processors/reference";
import { processSentenceInsert } from "./processors/sentence-insert";
import { processVocabChoice } from "./processors/vocab-choice";
import { normalizeWrongOptionExplanations } from "@/lib/question-wrong-option-explanations";
import {
  PASSTHROUGH_TYPES,
  type PostProcessResult,
  type QuestionPostProcessData,
} from "./types";

export type { PostProcessResult } from "./types";

/**
 * Post-process an AI-generated question, reconstructing passage-derived fields
 * (passageWithBlank, passageWithMarkers, passageWithUnderline, passageWithNumbers)
 * that the frontend renderers expect.
 *
 * @param typeId      The question type identifier (e.g., "BLANK_INFERENCE")
 * @param passageContent  The original passage text (full, unmodified)
 * @param aiOutput    The raw AI output object
 * @returns           PostProcessResult with reconstructed data
 */
export function postProcessQuestion(
  typeId: string,
  passageContent: string,
  aiOutput: QuestionPostProcessData,
): PostProcessResult {
  // Pass-through types: no passage field reconstruction needed
  if (PASSTHROUGH_TYPES.has(typeId)) {
    return normalizePostProcessResult({
      success: true,
      data: { ...aiOutput },
      warnings: [],
    }, typeId);
  }

  // Validate passage is provided for types that need it
  if (!passageContent || passageContent.trim().length === 0) {
    // If the AI already produced the needed passage field, pass through
    const hasPassageField =
      aiOutput.passageWithBlank ||
      aiOutput.passageWithMarkers ||
      aiOutput.passageWithUnderline ||
      aiOutput.passageWithNumbers;

    if (hasPassageField) {
      return normalizePostProcessResult({
        success: true,
        data: { ...aiOutput },
        warnings: ["No passage content provided, using AI-generated passage fields directly"],
      }, typeId);
    }

    return {
      success: false,
      data: aiOutput,
      warnings: [],
      error: `Passage content is required for type ${typeId} but was not provided`,
    };
  }

  try {
    const result = (() => {
      switch (typeId) {
      case "BLANK_INFERENCE":
        return processBlankInference(passageContent, aiOutput);

      case "GRAMMAR_ERROR":
        return processGrammarError(passageContent, aiOutput);

      case "VOCAB_CHOICE":
        return processVocabChoice(passageContent, aiOutput);

      case "SENTENCE_INSERT":
        return processSentenceInsert(passageContent, aiOutput);

      case "IRRELEVANT":
        return processIrrelevant(passageContent, aiOutput);

      case "REFERENCE":
        return processReference(passageContent, aiOutput);

      case "CONTEXT_MEANING":
        return processContextMeaning(passageContent, aiOutput);

      case "ANTONYM":
        return processAntonym(passageContent, aiOutput);

      case "FILL_BLANK_KEY":
        return processFillBlankKey(passageContent, aiOutput);

      default:
        // Unknown type — pass through with a warning
        return {
          success: true,
          data: { ...aiOutput },
          warnings: [`Unknown type "${typeId}": passed through without post-processing`],
        };
      }
    })();
    return normalizePostProcessResult(result, typeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: aiOutput,
      warnings: [],
      error: `Post-processing failed for ${typeId}: ${message}`,
    };
  }
}

function normalizePostProcessResult(
  result: PostProcessResult,
  typeId?: string,
): PostProcessResult {
  const normalizedWrongOptionExplanations = normalizeWrongOptionExplanations(
    result.data?.wrongOptionExplanations,
  );
  const alignedWrongOptionExplanations =
    alignWrongOptionExplanationsWithVisibleOptions(
      typeId,
      normalizedWrongOptionExplanations,
      result.data?.options,
      result.data?.correctAnswer,
    );
  if (
    alignedWrongOptionExplanations === result.data?.wrongOptionExplanations
  ) {
    return result;
  }
  return {
    ...result,
    data: {
      ...result.data,
      wrongOptionExplanations: alignedWrongOptionExplanations,
    },
  };
}

const VISIBLE_KOREAN_OPTION_TYPES = new Set([
  "REFERENCE",
  "TOPIC_MAIN_IDEA",
  "CONTENT_MATCH",
]);

function alignWrongOptionExplanationsWithVisibleOptions(
  typeId: string | undefined,
  explanations: unknown,
  options: unknown,
  correctAnswer: unknown,
): unknown {
  if (!typeId || !VISIBLE_KOREAN_OPTION_TYPES.has(typeId)) return explanations;
  if (!explanations || typeof explanations !== "object" || Array.isArray(explanations)) {
    return explanations;
  }
  if (!Array.isArray(options)) return explanations;

  const optionByLabel = new Map<string, { label: string; text: string }>();
  for (const option of options) {
    if (!option || typeof option !== "object") continue;
    const record = option as Record<string, unknown>;
    const label = normalizeLabel(record.label);
    const text = normalizeText(record.text);
    if (label && text) optionByLabel.set(label, { label, text });
  }

  const correctLabel = normalizeLabel(correctAnswer);
  const current = explanations as Record<string, unknown>;
  const aligned: Record<string, string> = {};
  let changed = false;

  for (const [rawLabel, rawExplanation] of Object.entries(current)) {
    const explanation = normalizeText(rawExplanation);
    const option = optionByLabel.get(normalizeLabel(rawLabel));
    if (
      !option ||
      !explanation ||
      option.label === correctLabel ||
      explanation.includes(option.text)
    ) {
      aligned[rawLabel] = explanation;
      continue;
    }

    aligned[rawLabel] = `'${option.text}' 선택지는 ${explanation}`;
    changed = true;
  }

  return changed ? aligned : explanations;
}

function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  const circledMap: Record<string, string> = {
    "\u2460": "1",
    "\u2461": "2",
    "\u2462": "3",
    "\u2463": "4",
    "\u2464": "5",
  };
  return (circledMap[text] ?? text)
    .replace(/^[\(\[]?([A-Ea-e1-5])[\)\].]?\s*$/, "$1")
    .toLowerCase();
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/**
 * Post-process an array of AI-generated questions.
 * Returns individual results for each question.
 */
export function postProcessQuestions(
  typeId: string,
  passageContent: string,
  aiQuestions: QuestionPostProcessData[],
): PostProcessResult[] {
  return aiQuestions.map((q) => postProcessQuestion(typeId, passageContent, q));
}
