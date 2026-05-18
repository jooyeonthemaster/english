// ============================================================================
// 영신ai ERP — Question Post-Processing Engine
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
import { processGrammarError } from "./processors/grammar-error";
import { processIrrelevant } from "./processors/irrelevant";
import { processReference } from "./processors/reference";
import { processSentenceInsert } from "./processors/sentence-insert";
import { processVocabChoice } from "./processors/vocab-choice";
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
    return {
      success: true,
      data: { ...aiOutput },
      warnings: [],
    };
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
      return {
        success: true,
        data: { ...aiOutput },
        warnings: ["No passage content provided, using AI-generated passage fields directly"],
      };
    }

    return {
      success: false,
      data: aiOutput,
      warnings: [],
      error: `Passage content is required for type ${typeId} but was not provided`,
    };
  }

  try {
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

      default:
        // Unknown type — pass through with a warning
        return {
          success: true,
          data: { ...aiOutput },
          warnings: [`Unknown type "${typeId}": passed through without post-processing`],
        };
    }
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
