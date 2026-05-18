import {
  applyReplacementsRTL,
  findWordInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import type { PostProcessResult, QuestionPostProcessData, Replacement } from "../types";

export function processVocabChoice(
  passage: string,
  ai: QuestionPostProcessData,
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
    word: mw.isInappropriate && mw.substituteWord ? mw.substituteWord : mw.originalWord || mw.word || "",
    isInappropriate: mw.isInappropriate,
    betterWord: mw.isInappropriate ? mw.betterWord || mw.originalWord || mw.word : undefined,
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
