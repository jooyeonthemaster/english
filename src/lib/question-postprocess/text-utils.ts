import type { FoundPosition, Replacement } from "./types";

/**
 * Normalize text for comparison: collapse whitespace, normalize Unicode quotes
 * and dashes, trim.
 */
export function normalizeForComparison(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'") // smart single quotes
    .replace(/[“”„‟]/g, '"') // smart double quotes
    .replace(/[–—]/g, "-") // en/em dashes
    .replace(/ /g, " ") // non-breaking space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map an index in normalized text back to original text index.
 * Returns null if mapping fails.
 */
export function mapNormalizedIndexToOriginal(
  original: string,
  normalizedIdx: number,
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
 * Find expression near the surroundingText region.
 */
export function findWithSurroundingContext(
  passage: string,
  expression: string,
  surroundingText: string,
): FoundPosition | null {
  // Find the surrounding text in the passage
  const contextIdx = findSurroundingContextIndex(passage, surroundingText);
  if (contextIdx === null) return null;

  const preferWordBoundary = isSingleTokenExpression(expression);

  // First search inside the matched surroundingText itself. This is the most
  // reliable signal the model gives us; widening the window too early lets
  // short targets such as "it" match inside words like "digital" or
  // "commitments" before the intended pronoun.
  const exactContext = passage.slice(
    contextIdx,
    contextIdx + surroundingText.length,
  );
  const inContext = findInSlice(
    exactContext,
    expression,
    preferWordBoundary,
  );
  if (inContext) {
    return { index: contextIdx + inContext.index, length: inContext.length };
  }

  // Define a search window around the context: a generous margin.
  const margin = 50;
  const windowStart = Math.max(0, contextIdx - margin);
  const windowEnd = Math.min(
    passage.length,
    contextIdx + surroundingText.length + margin,
  );
  const window = passage.slice(windowStart, windowEnd);

  // Find expression within this window, still respecting token boundaries for
  // single-word/pronoun targets.
  const inWindow = findInSlice(window, expression, preferWordBoundary);
  if (inWindow) {
    return { index: windowStart + inWindow.index, length: inWindow.length };
  }

  return null;
}

function findSurroundingContextIndex(
  passage: string,
  surroundingText: string,
): number | null {
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

  return contextIdx === -1 ? null : contextIdx;
}

function isSingleTokenExpression(expression: string): boolean {
  const trimmed = expression.trim();
  return /^[A-Za-z][A-Za-z'-]*$/.test(trimmed);
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function hasTokenBoundaries(text: string, index: number, length: number): boolean {
  return !isWordChar(text[index - 1]) && !isWordChar(text[index + length]);
}

function findInSlice(
  text: string,
  expression: string,
  requireTokenBoundaries: boolean,
): FoundPosition | null {
  const candidates = [expression, expression.trim()].filter(Boolean);

  for (const candidate of candidates) {
    let idx = text.indexOf(candidate);
    while (idx !== -1) {
      if (
        !requireTokenBoundaries ||
        hasTokenBoundaries(text, idx, candidate.length)
      ) {
        return { index: idx, length: candidate.length };
      }
      idx = text.indexOf(candidate, idx + 1);
    }
  }

  const lowerText = text.toLowerCase();
  for (const candidate of candidates) {
    const lowerCandidate = candidate.toLowerCase();
    let idx = lowerText.indexOf(lowerCandidate);
    while (idx !== -1) {
      if (
        !requireTokenBoundaries ||
        hasTokenBoundaries(text, idx, candidate.length)
      ) {
        return { index: idx, length: candidate.length };
      }
      idx = lowerText.indexOf(lowerCandidate, idx + 1);
    }
  }

  return null;
}

/**
 * Find an expression within a passage, optionally using surrounding text
 * for disambiguation when there are multiple occurrences.
 */
export function findExpressionInPassage(
  passage: string,
  expression: string,
  surroundingText?: string,
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
 * Find an expression using word-boundary awareness (for single words/pronouns).
 * Prefers exact word boundaries over substring matches.
 */
export function findWordInPassage(
  passage: string,
  word: string,
  surroundingText?: string,
  strictContext = false,
): FoundPosition | null {
  if (!word || !passage) return null;

  // --- Strategy 1: Use surroundingText context ---
  if (surroundingText && surroundingText.trim().length > 0) {
    const result = findWithSurroundingContext(passage, word, surroundingText);
    if (result) return result;

    // For REFERENCE, the context is the only safe disambiguator. When it is
    // stale, too broad, or does not contain the token as a standalone word,
    // failing is better than silently underlining a different pronoun elsewhere.
    if (strictContext) return null;
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

  // --- Strategy 3: Case-insensitive word-boundary regex ---
  try {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wbRegex = new RegExp(`\\b${escaped}\\b`, "i");
    const match = wbRegex.exec(passage);
    if (match) {
      return { index: match.index, length: match[0].length };
    }
  } catch {
    // If regex fails, fall through
  }

  // Do not fall back to plain substring matching for word/pronoun targets.
  // A failed lookup is safer than producing dig__it__al / comm__it__ments.
  return null;
}

/**
 * Replace exactly `length` chars at `position` with `replacement`.
 */
export function replaceAtPosition(
  text: string,
  position: number,
  length: number,
  replacement: string,
): string {
  return text.slice(0, position) + replacement + text.slice(position + length);
}

/**
 * Apply multiple replacements to text, sorted RTL (right-to-left) to avoid
 * offset drift.
 */
export function applyReplacementsRTL(text: string, replacements: Replacement[]): string {
  // Sort by position descending
  const sorted = [...replacements].sort((a, b) => b.position - a.position);
  let result = text;
  for (const r of sorted) {
    result = replaceAtPosition(result, r.position, r.originalLength, r.newText);
  }
  return result;
}

/**
 * Ensure an expression does NOT contain sequences of underscores that would
 * break the /__([^_]+)__/g regex. Replaces internal underscores with hyphens.
 */
export function sanitizeExpressionForMarker(expr: string): string {
  // Replace runs of 2+ underscores inside expression with dashes
  return expr.replace(/_{2,}/g, "--");
}

/**
 * Count occurrences of `expression` in `text`, honoring token boundaries for
 * single-word/pronoun targets so "it" does not match inside "digital".
 */
function countMatches(
  text: string,
  expression: string,
  requireWordBoundary: boolean,
): number {
  const needle = expression.trim();
  if (!needle) return 0;
  const hay = text.toLowerCase();
  const low = needle.toLowerCase();
  let count = 0;
  let idx = hay.indexOf(low);
  while (idx !== -1) {
    if (!requireWordBoundary || hasTokenBoundaries(text, idx, needle.length)) {
      count += 1;
    }
    idx = hay.indexOf(low, idx + 1);
  }
  return count;
}

export interface StrictFindResult {
  pos: FoundPosition | null;
  /** Occurrences within the resolution scope (surroundingText window, else whole passage). */
  count: number;
  /** True when the target is NOT uniquely located (count !== 1) — caller should reject. */
  ambiguous: boolean;
}

/**
 * 장문 세트 strict locator. Unlike findExpressionInPassage (which silently returns
 * the FIRST match), this reports the occurrence COUNT within the resolution scope
 * so the set orchestrator can mark an anchor DEGRADED instead of leaking by
 * pinning the wrong occurrence. Scope = a ±50-char window around surroundingText
 * when given, else the whole passage.
 */
export function findExpressionInPassageStrict(
  passage: string,
  expression: string,
  surroundingText?: string,
): StrictFindResult {
  const pos = findExpressionInPassage(passage, expression, surroundingText);
  if (!pos) return { pos: null, count: 0, ambiguous: true };

  let scopeText = passage;
  if (surroundingText && surroundingText.trim().length > 0) {
    const ctxIdx = findSurroundingContextIndex(passage, surroundingText);
    if (ctxIdx !== null) {
      const start = Math.max(0, ctxIdx - 50);
      const end = Math.min(passage.length, ctxIdx + surroundingText.length + 50);
      scopeText = passage.slice(start, end);
    }
  }

  const requireWordBoundary = isSingleTokenExpression(expression);
  const count = countMatches(scopeText, expression, requireWordBoundary);
  return { pos, count, ambiguous: count !== 1 };
}
