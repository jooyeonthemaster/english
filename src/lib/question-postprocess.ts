// ============================================================================
// NARA ERP — Question Post-Processing Engine
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostProcessResult {
  success: boolean;
  data: Record<string, any>;
  warnings: string[];
  error?: string;
}

interface FoundPosition {
  index: number;
  length: number;
}

interface Replacement {
  position: number;
  originalLength: number;
  newText: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLANK = "_____";
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤"] as const;

/** Types that need NO post-processing — pass through unchanged */
const PASSTHROUGH_TYPES = new Set([
  "SENTENCE_ORDER",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SYNONYM",
  "CONDITIONAL_WRITING",
  "SENTENCE_TRANSFORM",
  "FILL_BLANK_KEY",
  "SUMMARY_COMPLETE",
  "WORD_ORDER",
  "GRAMMAR_CORRECTION",
]);

// ---------------------------------------------------------------------------
// Shared Utilities (internal)
// ---------------------------------------------------------------------------

/**
 * Normalize text for comparison: collapse whitespace, normalize Unicode quotes
 * and dashes, trim.
 */
function normalizeForComparison(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // smart single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')    // smart double quotes
    .replace(/[\u2013\u2014]/g, "-")                 // en/em dashes
    .replace(/\u00A0/g, " ")                         // non-breaking space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find an expression within a passage, optionally using surrounding text
 * for disambiguation when there are multiple occurrences.
 *
 * Strategy order:
 *   1. If surroundingText given: locate surroundingText region, find expression within/near it
 *   2. Exact match of expression (first occurrence)
 *   3. Case-insensitive match
 *   4. Trimmed / normalized match
 */
function findExpressionInPassage(
  passage: string,
  expression: string,
  surroundingText?: string
): FoundPosition | null {
  if (!expression || !passage) return null;

  // --- Strategy 1: Use surroundingText for disambiguation ---
  if (surroundingText && surroundingText.trim().length > 0) {
    const result = findWithSurroundingContext(passage, expression, surroundingText);
    if (result) return result;
  }

  // --- Strategy 2: Exact match ---
  const exactIdx = passage.indexOf(expression);
  if (exactIdx !== -1) {
    return { index: exactIdx, length: expression.length };
  }

  // --- Strategy 3: Case-insensitive match ---
  const lowerPassage = passage.toLowerCase();
  const lowerExpr = expression.toLowerCase();
  const ciIdx = lowerPassage.indexOf(lowerExpr);
  if (ciIdx !== -1) {
    return { index: ciIdx, length: expression.length };
  }

  // --- Strategy 4: Normalized match ---
  const normPassage = normalizeForComparison(passage);
  const normExpr = normalizeForComparison(expression);
  if (normExpr.length === 0) return null;

  const normIdx = normPassage.indexOf(normExpr);
  if (normIdx !== -1) {
    // Map normalized index back to original. Walk through original passage
    // consuming characters and matching against normalized position.
    const mappedIdx = mapNormalizedIndexToOriginal(passage, normIdx);
    if (mappedIdx !== null) {
      // Find the actual length in original text that covers normExpr.length normalized chars
      const mappedEnd = mapNormalizedIndexToOriginal(passage, normIdx + normExpr.length);
      const origLen = mappedEnd !== null ? mappedEnd - mappedIdx : expression.length;
      return { index: mappedIdx, length: origLen };
    }
  }

  return null;
}

/**
 * Find expression near the surroundingText region.
 */
function findWithSurroundingContext(
  passage: string,
  expression: string,
  surroundingText: string
): FoundPosition | null {
  // Find the surrounding text in the passage
  let contextIdx = passage.indexOf(surroundingText);

  // Fallback: case-insensitive
  if (contextIdx === -1) {
    contextIdx = passage.toLowerCase().indexOf(surroundingText.toLowerCase());
  }

  // Fallback: normalized
  if (contextIdx === -1) {
    const normPassage = normalizeForComparison(passage);
    const normCtx = normalizeForComparison(surroundingText);
    const normIdx = normPassage.indexOf(normCtx);
    if (normIdx !== -1) {
      const mapped = mapNormalizedIndexToOriginal(passage, normIdx);
      if (mapped !== null) contextIdx = mapped;
    }
  }

  if (contextIdx === -1) return null;

  // Define a search window around the context: a generous margin
  const margin = 50;
  const windowStart = Math.max(0, contextIdx - margin);
  const windowEnd = Math.min(passage.length, contextIdx + surroundingText.length + margin);
  const window = passage.slice(windowStart, windowEnd);

  // Find expression within this window
  const exprIdx = window.indexOf(expression);
  if (exprIdx !== -1) {
    return { index: windowStart + exprIdx, length: expression.length };
  }

  // Case-insensitive within window
  const ciIdx = window.toLowerCase().indexOf(expression.toLowerCase());
  if (ciIdx !== -1) {
    return { index: windowStart + ciIdx, length: expression.length };
  }

  return null;
}

/**
 * Map an index in normalized text back to original text index.
 * Returns null if mapping fails.
 */
function mapNormalizedIndexToOriginal(
  original: string,
  normalizedIdx: number
): number | null {
  let normPos = 0;
  let origPos = 0;

  // Skip leading whitespace in the same way normalizeForComparison trims
  while (origPos < original.length && /\s/.test(original[origPos])) {
    origPos++;
  }

  let prevWasSpace = false;

  while (origPos < original.length && normPos < normalizedIdx) {
    const ch = original[origPos];
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        normPos++;
        prevWasSpace = true;
      }
      origPos++;
    } else {
      normPos++;
      origPos++;
      prevWasSpace = false;
    }
  }

  return normPos === normalizedIdx ? origPos : null;
}

/**
 * Find an expression using word-boundary awareness (for single words/pronouns).
 * Prefers exact word boundaries over substring matches.
 */
function findWordInPassage(
  passage: string,
  word: string,
  surroundingText?: string
): FoundPosition | null {
  if (!word || !passage) return null;

  // --- Strategy 1: Use surroundingText context ---
  if (surroundingText && surroundingText.trim().length > 0) {
    const result = findWithSurroundingContext(passage, word, surroundingText);
    if (result) return result;
  }

  // --- Strategy 2: Word-boundary regex ---
  try {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wbRegex = new RegExp(`\\b${escaped}\\b`);
    const match = wbRegex.exec(passage);
    if (match) {
      return { index: match.index, length: word.length };
    }
  } catch {
    // If regex fails, fall through
  }

  // --- Strategy 3: Plain indexOf ---
  return findExpressionInPassage(passage, word);
}

/**
 * Replace exactly `length` chars at `position` with `replacement`.
 */
function replaceAtPosition(
  text: string,
  position: number,
  length: number,
  replacement: string
): string {
  return text.slice(0, position) + replacement + text.slice(position + length);
}

/**
 * Apply multiple replacements to text, sorted RTL (right-to-left) to avoid
 * offset drift.
 */
function applyReplacementsRTL(
  text: string,
  replacements: Replacement[]
): string {
  // Sort by position descending
  const sorted = [...replacements].sort((a, b) => b.position - a.position);
  let result = text;
  for (const r of sorted) {
    result = replaceAtPosition(result, r.position, r.originalLength, r.newText);
  }
  return result;
}

/**
 * Split English text into sentences. Handles common abbreviations,
 * decimal numbers, and quoted speech.
 */
function splitIntoSentences(passage: string): string[] {
  // Common abbreviations that should NOT end a sentence
  const abbreviations = new Set([
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st",
    "vs", "etc", "inc", "ltd", "co", "corp",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    "vol", "dept", "est", "approx", "govt",
    "i.e", "e.g", "cf", "al",
  ]);

  const sentences: string[] = [];
  let current = "";
  let i = 0;

  while (i < passage.length) {
    const ch = passage[i];
    current += ch;

    if (ch === "." || ch === "!" || ch === "?") {
      // Check if this is a real sentence boundary

      // Look back: is this an abbreviation?
      const trimmedCurrent = current.trimEnd();
      const lastWord = trimmedCurrent
        .split(/\s+/)
        .pop()
        ?.replace(/[.!?]+$/, "")
        .toLowerCase() ?? "";

      const isAbbreviation = abbreviations.has(lastWord) ||
        // Single letter abbreviation like "U." "S." "A."
        /^[A-Z]$/.test(lastWord) ||
        // Pattern like "U.S." "U.N." "e.g." "i.e."
        /^([a-zA-Z]\.)+$/.test(trimmedCurrent.split(/\s+/).pop()?.replace(/[.!?]$/, "") ?? "");

      // Check if next char is a decimal digit (e.g., "3.14")
      const nextChar = i + 1 < passage.length ? passage[i + 1] : "";
      const isDecimal = /\d/.test(passage[i - 1] ?? "") && /\d/.test(nextChar);

      // Check if we're inside quotes
      // Simple heuristic: if the previous non-space char before the period is a quote,
      // that's fine — still a sentence boundary

      if (!isAbbreviation && !isDecimal) {
        // Look ahead: if followed by a space (or end) and then an uppercase letter, or end of text
        const rest = passage.slice(i + 1);
        const nextContentMatch = rest.match(/^\s*(["']?\s*[A-Z]|$)/);

        if (nextContentMatch || i === passage.length - 1) {
          // Consume trailing whitespace into the current sentence
          const trimmed = current.trim();
          if (trimmed.length > 0) {
            sentences.push(trimmed);
          }
          current = "";
          // Skip trailing whitespace
          i++;
          while (i < passage.length && /\s/.test(passage[i])) {
            i++;
          }
          continue;
        }
      }
    }

    i++;
  }

  // Push any remaining text
  const remaining = current.trim();
  if (remaining.length > 0) {
    sentences.push(remaining);
  }

  return sentences;
}

/**
 * Ensure an expression does NOT contain sequences of underscores that would
 * break the /__([^_]+)__/g regex. Replaces internal underscores with hyphens.
 */
function sanitizeExpressionForMarker(expr: string): string {
  // Replace runs of 2+ underscores inside expression with dashes
  return expr.replace(/_{2,}/g, "--");
}

// ---------------------------------------------------------------------------
// Per-Type Post-Processors
// ---------------------------------------------------------------------------

function processBlankInference(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const originalExpression = ai.originalExpression as string;
  const surroundingText = ai.surroundingText as string | undefined;
  const options = ai.options as Array<{ label: string; text: string }>;
  const correctAnswer = ai.correctAnswer as string;

  if (!originalExpression) {
    return { success: false, data: ai, warnings, error: "Missing originalExpression field" };
  }

  // Find the expression in the passage
  const found = findExpressionInPassage(passage, originalExpression, surroundingText);
  if (!found) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Expression not found in passage: "${originalExpression.slice(0, 80)}..."`,
    };
  }

  // Validate: the correct answer option's text should equal originalExpression
  if (options && Array.isArray(options)) {
    const correctOption = options.find((o) => o.label === correctAnswer);
    if (correctOption && correctOption.text !== originalExpression) {
      // Auto-fix: check if any other option matches
      const matchingOption = options.find((o) => o.text === originalExpression);
      if (matchingOption) {
        warnings.push(
          `correctAnswer "${correctAnswer}" option text doesn't match originalExpression. ` +
          `Found match at option "${matchingOption.label}" instead. Consider updating correctAnswer.`
        );
      } else {
        // Fix the correct option's text to match
        warnings.push(
          `correctAnswer option "${correctAnswer}" text "${correctOption.text}" ` +
          `doesn't match originalExpression "${originalExpression}". Auto-fixed option text.`
        );
        correctOption.text = originalExpression;
      }
    }
  }

  // Replace expression with blank
  const passageWithBlank = replaceAtPosition(passage, found.index, found.length, BLANK);

  return {
    success: true,
    data: {
      ...ai,
      passageWithBlank,
    },
    warnings,
  };
}

function processGrammarError(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const markedExpressions = ai.markedExpressions as Array<{
    label: string;
    expression: string;
    isError: boolean;
    correction?: string;
    errorExpression?: string;
    surroundingText?: string;
  }>;

  if (!markedExpressions || !Array.isArray(markedExpressions)) {
    return { success: false, data: ai, warnings, error: "Missing markedExpressions field" };
  }

  const replacements: Replacement[] = [];

  for (const me of markedExpressions) {
    const found = findExpressionInPassage(passage, me.expression, me.surroundingText);
    if (!found) {
      warnings.push(`Expression not found for label ${me.label}: "${me.expression}"`);
      continue;
    }

    let newText: string;
    if (me.isError && me.errorExpression) {
      // Replace with error expression wrapped in marker
      const sanitized = sanitizeExpressionForMarker(me.errorExpression);
      newText = `__${me.label} ${sanitized}__`;
    } else if (me.isError) {
      // isError but no separate errorExpression — use the expression itself
      const sanitized = sanitizeExpressionForMarker(me.expression);
      newText = `__${me.label} ${sanitized}__`;
    } else {
      // Correct expression — just wrap
      const sanitized = sanitizeExpressionForMarker(me.expression);
      newText = `__${me.label} ${sanitized}__`;
    }

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  if (replacements.length === 0 && markedExpressions.length > 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Could not locate any marked expressions in the passage",
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  return {
    success: true,
    data: {
      ...ai,
      passageWithMarkers,
    },
    warnings,
  };
}

function processVocabChoice(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const markedWords = ai.markedWords as Array<{
    label: string;
    originalWord: string;
    substituteWord?: string;
    isInappropriate: boolean;
    betterWord?: string;
    word?: string;
    surroundingText?: string;
  }>;

  if (!markedWords || !Array.isArray(markedWords)) {
    return { success: false, data: ai, warnings, error: "Missing markedWords field" };
  }

  const replacements: Replacement[] = [];

  for (const mw of markedWords) {
    // The AI may provide originalWord or word depending on schema version
    const wordToFind = mw.originalWord || mw.word || "";
    const found = findWordInPassage(passage, wordToFind, mw.surroundingText);
    if (!found) {
      warnings.push(`Word not found for label ${mw.label}: "${wordToFind}"`);
      continue;
    }

    let displayWord: string;
    if (mw.isInappropriate && mw.substituteWord) {
      // Show the substitute (incorrect) word that appears in text
      displayWord = sanitizeExpressionForMarker(mw.substituteWord);
    } else {
      // Show the original word
      displayWord = sanitizeExpressionForMarker(wordToFind);
    }

    const newText = `__${mw.label} ${displayWord}__`;

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  if (replacements.length === 0 && markedWords.length > 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Could not locate any marked words in the passage",
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  // Normalize markedWords to match frontend schema (word, not originalWord)
  const normalizedWords = markedWords.map((mw) => ({
    label: mw.label,
    word: mw.isInappropriate && mw.substituteWord ? mw.substituteWord : (mw.originalWord || mw.word || ""),
    isInappropriate: mw.isInappropriate,
    betterWord: mw.isInappropriate ? (mw.betterWord || mw.originalWord || mw.word) : undefined,
  }));

  return {
    success: true,
    data: {
      ...ai,
      passageWithMarkers,
      markedWords: normalizedWords,
    },
    warnings,
  };
}

function processSentenceInsert(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const markerAfterSentenceIndices = ai.markerAfterSentenceIndices as number[];
  const givenSentence = ai.givenSentence as string;

  if (!markerAfterSentenceIndices || !Array.isArray(markerAfterSentenceIndices)) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Missing markerAfterSentenceIndices field",
    };
  }

  if (markerAfterSentenceIndices.length !== 5) {
    warnings.push(
      `Expected 5 marker indices, got ${markerAfterSentenceIndices.length}. ` +
      `Proceeding with what was provided.`
    );
  }

  const sentences = splitIntoSentences(passage);

  if (sentences.length === 0) {
    return { success: false, data: ai, warnings, error: "Passage has no sentences" };
  }

  // Sort indices and pair with circled numbers
  const sortedIndices = [...markerAfterSentenceIndices].sort((a, b) => a - b);
  const markerMap = new Map<number, string>();

  for (let i = 0; i < sortedIndices.length && i < CIRCLED_NUMBERS.length; i++) {
    markerMap.set(sortedIndices[i], CIRCLED_NUMBERS[i]);
  }

  // Reconstruct passage with markers inserted after specified sentences
  const parts: string[] = [];
  for (let si = 0; si < sentences.length; si++) {
    parts.push(sentences[si]);
    const marker = markerMap.get(si);
    if (marker) {
      parts.push(` ${marker} `);
    } else {
      parts.push(" ");
    }
  }

  const passageWithMarkers = parts.join("").trim();

  // Build options from circled numbers (standard format: ①~⑤)
  const options = CIRCLED_NUMBERS.map((cn, i) => ({
    label: `${i + 1}`,
    text: cn,
  }));

  return {
    success: true,
    data: {
      ...ai,
      givenSentence: givenSentence || ai.givenSentence,
      passageWithMarkers,
      options: ai.options || options,
    },
    warnings,
  };
}

function processIrrelevant(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const sentences = ai.sentences as string[];

  if (!sentences || !Array.isArray(sentences)) {
    return { success: false, data: ai, warnings, error: "Missing sentences field" };
  }

  if (sentences.length !== 5) {
    warnings.push(`Expected 5 sentences, got ${sentences.length}`);
  }

  // Prefix each sentence with its circled number marker
  const numbered = sentences
    .map((sent, i) => {
      const marker = i < CIRCLED_NUMBERS.length ? CIRCLED_NUMBERS[i] : `(${i + 1})`;
      return `${marker} ${sent.trim()}`;
    })
    .join(" ");

  const passageWithNumbers = numbered;

  return {
    success: true,
    data: {
      ...ai,
      passageWithNumbers,
    },
    warnings,
  };
}

function processReference(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const underlinedPronoun = ai.underlinedPronoun as string;
  const surroundingText = ai.surroundingText as string | undefined;

  if (!underlinedPronoun) {
    return { success: false, data: ai, warnings, error: "Missing underlinedPronoun field" };
  }

  const found = findWordInPassage(passage, underlinedPronoun, surroundingText);
  if (!found) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Pronoun not found in passage: "${underlinedPronoun}"`,
    };
  }

  // Wrap with double underscores
  const passageWithUnderline = replaceAtPosition(
    passage,
    found.index,
    found.length,
    `__${underlinedPronoun}__`
  );

  return {
    success: true,
    data: {
      ...ai,
      passageWithUnderline,
    },
    warnings,
  };
}

function processContextMeaning(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const underlinedWord = ai.underlinedWord as string;
  const surroundingText = ai.surroundingText as string | undefined;

  if (!underlinedWord) {
    return { success: false, data: ai, warnings, error: "Missing underlinedWord field" };
  }

  const found = findWordInPassage(passage, underlinedWord, surroundingText);
  if (!found) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Word not found in passage: "${underlinedWord}"`,
    };
  }

  const passageWithUnderline = replaceAtPosition(
    passage,
    found.index,
    found.length,
    `__${underlinedWord}__`
  );

  return {
    success: true,
    data: {
      ...ai,
      passageWithUnderline,
    },
    warnings,
  };
}

function processAntonym(
  passage: string,
  ai: Record<string, any>
): PostProcessResult {
  const warnings: string[] = [];

  const markedWords = ai.markedWords as Array<{
    label: string;
    word: string;
    antonym: string;
    surroundingText?: string;
  }>;

  if (!markedWords || !Array.isArray(markedWords)) {
    return { success: false, data: ai, warnings, error: "Missing markedWords field" };
  }

  const replacements: Replacement[] = [];

  for (const mw of markedWords) {
    const found = findWordInPassage(passage, mw.word, mw.surroundingText);
    if (!found) {
      warnings.push(`Word not found for label ${mw.label}: "${mw.word}"`);
      continue;
    }

    const sanitized = sanitizeExpressionForMarker(mw.word);
    const newText = `__${mw.label} ${sanitized}__`;

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  if (replacements.length === 0 && markedWords.length > 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Could not locate any marked words in the passage",
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  return {
    success: true,
    data: {
      ...ai,
      passageWithMarkers,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

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
  aiOutput: Record<string, any>
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

// ---------------------------------------------------------------------------
// Batch helper
// ---------------------------------------------------------------------------

/**
 * Post-process an array of AI-generated questions.
 * Returns individual results for each question.
 */
export function postProcessQuestions(
  typeId: string,
  passageContent: string,
  aiQuestions: Record<string, any>[]
): PostProcessResult[] {
  return aiQuestions.map((q) => postProcessQuestion(typeId, passageContent, q));
}
