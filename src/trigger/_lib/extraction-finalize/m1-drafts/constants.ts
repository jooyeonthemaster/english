/**
 * Question types that require grounded AI restoration because the body
 * itself is modified (blanks to fill, sentences to reorder/insert/remove,
 * grammar/vocab to correct). For every other type the body is the
 * untouched source passage — we only need to strip problem-sheet markers.
 *
 * `UNKNOWN` is intentionally NOT in this set but is handled separately in
 * the dispatch logic: we treat unclassified questions as restoration-
 * required to avoid false negatives when the classifier failed.
 */
export const RESTORATION_REQUIRED_TYPES = new Set([
  "BLANK_INFERENCE",
  "BLANK_WORD",
  "BLANK_SENTENCE",
  "CONNECTOR",
  "SENTENCE_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
  "SUMMARY_COMPLETE",
  "DIALOGUE_ORDER",
]);

/**
 * Feature flag — flip to `EXTRACTION_TYPE_FILTERED_RESTORATION=false` in
 * trigger.dev env to instantly disable the type-based skip and fall back
 * to the previous "restore everything with a passage" behaviour. Defaults
 * to ON so a no-op redeploy is enough to roll forward.
 */
export const TYPE_FILTERED_RESTORATION_ENABLED =
  process.env.EXTRACTION_TYPE_FILTERED_RESTORATION !== "false";

export const PASSAGE_QUESTION_TYPE_VALUES = new Set([
  "BLANK_INFERENCE",
  "BLANK_WORD",
  "BLANK_SENTENCE",
  "CONNECTOR",
  "SENTENCE_ORDER",
  "PARAGRAPH_ORDER",
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "GRAMMAR_ERROR",
  "GRAMMAR_CORRECTION",
  "VOCAB_CHOICE",
  "CONTEXT_MEANING",
  "IMPLIED_MEANING",
  "REFERENCE",
  "CONTENT_MATCH",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "PURPOSE",
  "MOOD_TONE",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "SENTENCE_TRANSFORM",
  "CONDITIONAL_WRITING",
  "TEXTBOOK_DETAIL",
  "DIALOGUE_ORDER",
  "DIALOGUE_RESPONSE",
  "KOREAN_TRANSLATION",
  "ENGLISH_DEFINITION",
  "UNKNOWN",
]);

export function normalizeAnalysisQuestionType(value: unknown): string {
  if (typeof value !== "string") return "UNKNOWN";
  const upper = value.toUpperCase().replace(/[\s-]+/g, "_");
  return PASSAGE_QUESTION_TYPE_VALUES.has(upper) ? upper : "UNKNOWN";
}

/**
 * Minimum raw-text length below which a group without an explicit
 * PASSAGE_BODY block skips restoration. Picked empirically — listening
 * problems (which never carry a passage) cluster well below this.
 */
export const SHORT_CONTENT_THRESHOLD = 400;
