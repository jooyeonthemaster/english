import { normalizeComparableText } from "../../core";
import { splitBlankSurface } from "./seam";

export interface BlankSourceReconstructionMismatch {
  restoredPassage: string;
  sourcePassage: string;
}

/**
 * Rebuild a single-blank carrier with its exact source span and compare it
 * against the authoritative source passage. This catches quote/punctuation
 * seams and accidental edits elsewhere in passageWithBlank that a local blank
 * check cannot see.
 */
export function findBlankSourceReconstructionMismatch(
  passageWithBlank: string,
  originalExpression: string,
  sourcePassage: string | undefined,
): BlankSourceReconstructionMismatch | null {
  if (!passageWithBlank || !originalExpression || !sourcePassage) return null;

  const { left, right, blankCount } = splitBlankSurface(passageWithBlank);
  if (blankCount !== 1) return null;

  const restoredPassage = `${left}${originalExpression}${right}`;
  if (
    normalizeComparableText(restoredPassage) ===
    normalizeComparableText(sourcePassage)
  ) {
    return null;
  }

  return {
    restoredPassage,
    sourcePassage,
  };
}
