import { findWordInPassage, replaceAtPosition } from "../text-utils";
import type { PostProcessResult, QuestionPostProcessData } from "../types";

export function processContextMeaning(
  passage: string,
  ai: QuestionPostProcessData,
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
    `__${underlinedWord}__`,
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
