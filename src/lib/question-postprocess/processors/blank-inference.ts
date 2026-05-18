import { findExpressionInPassage, replaceAtPosition } from "../text-utils";
import { BLANK, type PostProcessResult } from "../types";

export function processBlankInference(
  passage: string,
  ai: Record<string, any>,
): PostProcessResult {
  const warnings: string[] = [];

  const originalExpression = ai.originalExpression as string;
  const surroundingText = ai.surroundingText as string | undefined;
  const options = ai.options as Array<{ label: string; text: string }>;
  const correctAnswer = ai.correctAnswer as string;

  if (!originalExpression) {
    return { success: false, data: ai, warnings, error: "Missing originalExpression field" };
  }

  // Find the expression in the passage
  const found = findExpressionInPassage(passage, originalExpression, surroundingText);
  if (!found) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Expression not found in passage: "${originalExpression.slice(0, 80)}..."`,
    };
  }

  // Validate: the correct answer option's text should equal originalExpression
  if (options && Array.isArray(options)) {
    const correctOption = options.find((o) => o.label === correctAnswer);
    if (correctOption && correctOption.text !== originalExpression) {
      // Auto-fix: check if any other option matches
      const matchingOption = options.find((o) => o.text === originalExpression);
      if (matchingOption) {
        warnings.push(
          `correctAnswer "${correctAnswer}" option text doesn't match originalExpression. ` +
            `Found match at option "${matchingOption.label}" instead. Consider updating correctAnswer.`,
        );
      } else {
        // Fix the correct option's text to match
        warnings.push(
          `correctAnswer option "${correctAnswer}" text "${correctOption.text}" ` +
            `doesn't match originalExpression "${originalExpression}". Auto-fixed option text.`,
        );
        correctOption.text = originalExpression;
      }
    }
  }

  // Replace expression with blank
  const passageWithBlank = replaceAtPosition(passage, found.index, found.length, BLANK);

  return {
    success: true,
    data: {
      ...ai,
      passageWithBlank,
    },
    warnings,
  };
}
