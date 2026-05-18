import { findWordInPassage, replaceAtPosition } from "../text-utils";
import type { PostProcessResult } from "../types";

export function processReference(
  passage: string,
  ai: Record<string, any>,
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
    `__${underlinedPronoun}__`,
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
