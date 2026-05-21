import {
  findExpressionInPassage,
  findWordInPassage,
  replaceAtPosition,
} from "../text-utils";
import type { PostProcessResult, QuestionPostProcessData } from "../types";

export function processSynonym(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];
  const targetWord = ai.targetWord as string;
  const contextSentence = ai.contextSentence as string | undefined;

  if (!targetWord) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Missing targetWord field",
    };
  }

  const found =
    findWordInPassage(passage, targetWord, contextSentence) ||
    findExpressionInPassage(passage, targetWord, contextSentence);
  if (!found) {
    return {
      success: true,
      data: ai,
      warnings: [...warnings, `Word not found in passage: "${targetWord}"`],
    };
  }

  const passageWithUnderline = replaceAtPosition(
    passage,
    found.index,
    found.length,
    `__${passage.slice(found.index, found.index + found.length)}__`,
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
