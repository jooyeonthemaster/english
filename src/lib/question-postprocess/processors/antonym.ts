import {
  applyReplacementsRTL,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import type { PostProcessResult, Replacement } from "../types";

export function processAntonym(
  passage: string,
  ai: Record<string, any>,
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
