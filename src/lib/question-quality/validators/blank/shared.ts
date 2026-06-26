// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { contentTokens, countTokenOverlap, countWordsForQuality, normalizeComparableText } from "../../core";



export function isNearVerbatimBlankParaphrase(candidate: string, source: string): boolean {
  const candidateComparable = normalizeComparableText(candidate);
  const sourceComparable = normalizeComparableText(source);
  if (!candidateComparable || !sourceComparable) return false;
  if (candidateComparable === sourceComparable) return true;
  if (
    sourceComparable.length >= 16 &&
    (candidateComparable.includes(sourceComparable) ||
      sourceComparable.includes(candidateComparable))
  ) {
    return true;
  }

  const sourceTokens = contentTokens(source);
  const candidateTokens = contentTokens(candidate);
  const smallerTokenCount = Math.min(sourceTokens.size, candidateTokens.size);
  if (smallerTokenCount < 3) return false;
  const overlapRatio = countTokenOverlap(sourceTokens, candidateTokens) / smallerTokenCount;
  const sourceWords = countWordsForQuality(source);
  const candidateWords = countWordsForQuality(candidate);
  return overlapRatio >= 0.8 && Math.abs(sourceWords - candidateWords) <= 2;
}
