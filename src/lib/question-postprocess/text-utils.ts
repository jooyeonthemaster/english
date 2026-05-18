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
