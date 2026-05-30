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
export const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;

export function getCircledNumber(index: number): string {
  if (index >= 0 && index < CIRCLED_NUMBERS.length) {
    return CIRCLED_NUMBERS[index];
  }
  if (index >= 0 && index < 20) {
    return String.fromCodePoint(0x2460 + index);
  }
  if (index >= 20 && index < 35) {
    return String.fromCodePoint(0x3251 + (index - 20));
  }
  if (index >= 35 && index < 50) {
    return String.fromCodePoint(0x32b1 + (index - 35));
  }
  return `(${index + 1})`;
}

export function getCircledNumbers(count: number): string[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) =>
    getCircledNumber(index),
  );
}

/** Types that need NO post-processing — pass through unchanged */
export const PASSTHROUGH_TYPES = new Set([
  "SENTENCE_ORDER",
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "GRAMMAR_CORRECTION",
]);
