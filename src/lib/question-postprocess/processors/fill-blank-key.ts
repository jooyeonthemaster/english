import { findExpressionInPassage, replaceAtPosition } from "../text-utils";
import { BLANK, type PostProcessResult, type QuestionPostProcessData } from "../types";

export function processFillBlankKey(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];
  const answer =
    typeof ai.answer === "string"
      ? ai.answer
      : typeof ai.correctAnswer === "string"
        ? ai.correctAnswer
        : "";
  const sentenceWithBlank =
    typeof ai.sentenceWithBlank === "string" ? ai.sentenceWithBlank : "";
  const reconstructedContext = sentenceWithBlank
    ? sentenceWithBlank.replace(/_{3,}/g, answer)
    : undefined;

  if (!answer.trim()) {
    return {
      success: true,
      data: { ...ai },
      warnings: ["Missing answer field; could not reconstruct passageWithBlank."],
    };
  }

  const found = findExpressionInPassage(
    passage,
    answer,
    reconstructedContext,
  );

  if (!found) {
    return {
      success: true,
      data: { ...ai },
      warnings: [
        `Could not find FILL_BLANK_KEY answer in passage: "${answer.slice(0, 80)}"`,
      ],
    };
  }

  return {
    success: true,
    data: {
      ...ai,
      passageWithBlank: replaceAtPosition(passage, found.index, found.length, BLANK),
    },
    warnings,
  };
}
