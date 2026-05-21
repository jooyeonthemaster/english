// ============================================================================
// Shared types and constants for the question post-processing engine.
// ============================================================================

export type QuestionPostProcessData = Record<string, unknown>;

export interface PostProcessResult {
  success: boolean;
  data: QuestionPostProcessData;
  warnings: string[];
  error?: string;
}

export interface FoundPosition {
  index: number;
  length: number;
}

export interface Replacement {
  position: number;
  originalLength: number;
  newText: string;
}

export const BLANK = "_____";
export const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤"] as const;

/** Types that need NO post-processing — pass through unchanged */
export const PASSTHROUGH_TYPES = new Set([
  "SENTENCE_ORDER",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "GRAMMAR_CORRECTION",
]);
