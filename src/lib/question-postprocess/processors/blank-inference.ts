import { findExpressionInPassage, replaceAtPosition } from "../text-utils";
import { BLANK, type PostProcessResult, type QuestionPostProcessData } from "../types";

export function processBlankInference(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const originalExpression = ai.originalExpression as string;
  const surroundingText = ai.surroundingText as string | undefined;
  const options = ai.options as Array<{ label: string; text: string }>;
  const correctAnswer = ai.correctAnswer as string;
  const isDoubleNegativeMode = ai.blankAnswerMode === "DOUBLE_NEGATIVE";

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

  // Validate: in default mode the correct answer option's text should equal originalExpression.
  // In double-negative mode, originalExpression is still the source span to blank,
  // but the visible correct option is intentionally transformed.
  if (options && Array.isArray(options)) {
    const correctOption = options.find((o) => o.label === correctAnswer);
    if (!isDoubleNegativeMode && correctOption && correctOption.text !== originalExpression) {
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
    } else if (isDoubleNegativeMode && correctOption?.text === originalExpression) {
      warnings.push(
        "DOUBLE_NEGATIVE mode expected a transformed correct option, but correct option matches originalExpression.",
      );
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
