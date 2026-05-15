// ============================================================================
// m1-restoration-quality — pure code post-restoration sanity checks.
//
// After grounded restoration emits the final text we run a battery of
// inexpensive regex checks to detect cases where the restored text still
// looks like raw OCR (problem markers, blanks, Korean stem fragments) or
// where the question type implies a body edit that didn't happen
// (IRRELEVANT must remove a sentence; SENTENCE_INSERT must lengthen the
// body). Any warning downgrades RESTORED → PARTIAL so the teacher's
// review UI surfaces the draft as needing manual attention.
//
// This module is intentionally LLM-free: no extra calls, no cost.
// ============================================================================

export const QUALITY_WARNING_CODES = [
  "KOREAN_LEFTOVER",
  "BLANK_LEFTOVER",
  "CIRCLED_MARKER_LEFTOVER",
  "ABCD_LABEL_LEFTOVER",
  "LOWERCASE_MARKER_LEFTOVER",
  "EQ_MARKER_LEFTOVER",
  "IRRELEVANT_NOT_REMOVED",
  "INSERT_NOT_APPLIED",
  "WORD_ORDER_PATTERN_LEFTOVER",
  "BOXED_GIVEN_LEFTOVER",
] as const;

export type QualityWarningCode = (typeof QUALITY_WARNING_CODES)[number];

export interface RestorationQualityInput {
  rawText: string;
  restoredText: string;
  /** Question types observed in this draft's bucket. Used to enable
   *  type-specific checks (e.g. IRRELEVANT must shrink the sentence
   *  count, SENTENCE_INSERT must grow the body). */
  questionTypes: string[];
}

export interface RestorationQualityResult {
  warnings: QualityWarningCode[];
  shouldDowngradeStatus: boolean;
}

// ─── Common markers ────────────────────────────────────────────────────────

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/;
const BLANK_RE = /_{3,}/;
const CIRCLED_RE = /[①-⑩]/; // ①~⑩
const ABCD_LABEL_RE = /(^|\n)\s*\([A-Z]\)(\s|$)/;
const LOWERCASE_MARKER_RE = /\([a-i]\)(?=\s|[,.!?:;])/;
const EQ_MARKER_RE = /\[[a-zA-Z]+\s*\(=/;
const WORD_ORDER_SEQ_RE = /\b\d{1,2}(?:[-\s]\d{1,2}){2,}\b/;
/** "보기" 박스의 주어진 문장 라벨이 그대로 남은 경우. */
const BOXED_GIVEN_RE = /\b<\s*보\s*기\s*>|\b<given>/i;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Count "real" English sentences: starts with a capital letter, ends with
 *  a sentence terminator, length > 20 chars. Filters out short fragments
 *  and number-only lines so the IRRELEVANT diff is on actual sentences. */
function countEnglishSentences(text: string): number {
  let count = 0;
  const matches = text.match(/[A-Z][^.!?\n]{20,}?[.!?](?=\s|$)/g);
  if (matches) count += matches.length;
  return count;
}

/** Strip Korean stems, page-level metadata, and numbered question
 *  prefixes so subsequent length comparisons only see the English body. */
function englishBodyOnly(text: string): string {
  return text
    // Strip Korean (stem text)
    .replace(/[ㄱ-ㆎ가-힣]+/g, "")
    // Strip question-prefix tokens
    .replace(/^\s*\d{1,3}\.\s*/gm, "")
    .replace(/\[\d+\.?\d*점\]/g, "")
    .replace(/\[서답형\d+\]/g, "")
    .trim();
}

// ─── Type-specific checks ──────────────────────────────────────────────────

function hasType(types: Set<string>, ...names: string[]): boolean {
  return names.some((name) => types.has(name));
}

function checkIrrelevant(
  rawText: string,
  restoredText: string,
): boolean {
  const rawCount = countEnglishSentences(englishBodyOnly(rawText));
  const restoredCount = countEnglishSentences(restoredText);
  // IRRELEVANT must remove exactly one sentence from the body. If the
  // restored body has at least as many sentences as the raw body the
  // removal didn't happen.
  return rawCount > 1 && restoredCount >= rawCount;
}

function checkSentenceInsert(rawText: string, restoredText: string): boolean {
  // SENTENCE_INSERT places the boxed sentence inside the body. The
  // boxed sentence usually appears in the raw text BEFORE the body
  // (as a separate paragraph). So we expect restored length ≥ raw
  // English body length — actually approximately equal once markers
  // are stripped. We flag only if restored is much SHORTER than the
  // raw English body, which means the boxed sentence was dropped
  // entirely instead of inserted.
  const rawEnLen = englishBodyOnly(rawText).replace(/\s+/g, " ").length;
  const restoredLen = restoredText.replace(/\s+/g, " ").length;
  // 30% drop is the threshold — boxed sentences are typically 50~150
  // chars so losing the boxed sentence drops body length by ≥10%, but
  // raw text also loses Korean stem and markers, so the safer bound
  // is "restored < 60% of raw English". Adjust if false positives.
  return rawEnLen > 200 && restoredLen < rawEnLen * 0.6;
}

function checkWordOrderSequence(text: string): boolean {
  // 서답형 word-order questions ("9-2-3-7" style answer) should not
  // leave the numeric sequence inside the restored body — that
  // sequence belongs in the answer, not the passage.
  return WORD_ORDER_SEQ_RE.test(text);
}

// ─── Public API ────────────────────────────────────────────────────────────

export function checkRestorationQuality(
  input: RestorationQualityInput,
): RestorationQualityResult {
  const warnings: QualityWarningCode[] = [];
  const restored = input.restoredText;
  const types = new Set(input.questionTypes);

  if (HANGUL_RE.test(restored)) warnings.push("KOREAN_LEFTOVER");
  if (BLANK_RE.test(restored)) warnings.push("BLANK_LEFTOVER");
  if (CIRCLED_RE.test(restored)) warnings.push("CIRCLED_MARKER_LEFTOVER");
  if (ABCD_LABEL_RE.test(restored)) warnings.push("ABCD_LABEL_LEFTOVER");
  if (LOWERCASE_MARKER_RE.test(restored))
    warnings.push("LOWERCASE_MARKER_LEFTOVER");
  if (EQ_MARKER_RE.test(restored)) warnings.push("EQ_MARKER_LEFTOVER");
  if (BOXED_GIVEN_RE.test(restored)) warnings.push("BOXED_GIVEN_LEFTOVER");

  if (hasType(types, "IRRELEVANT") && checkIrrelevant(input.rawText, restored)) {
    warnings.push("IRRELEVANT_NOT_REMOVED");
  }
  if (
    hasType(types, "SENTENCE_INSERT") &&
    checkSentenceInsert(input.rawText, restored)
  ) {
    warnings.push("INSERT_NOT_APPLIED");
  }
  if (hasType(types, "WORD_ORDER") && checkWordOrderSequence(restored)) {
    warnings.push("WORD_ORDER_PATTERN_LEFTOVER");
  }

  return {
    warnings,
    shouldDowngradeStatus: warnings.length > 0,
  };
}
