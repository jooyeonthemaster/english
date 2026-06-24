import { findExpressionInPassage, replaceAtPosition } from "../text-utils";
import type { PostProcessResult, QuestionPostProcessData } from "../types";

export function processImpliedMeaning(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const underlinedExpression = ai.underlinedExpression as string;
  const surroundingText = ai.surroundingText as string | undefined;

  if (!underlinedExpression) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Missing underlinedExpression field",
    };
  }

  const found = findExpressionInPassage(
    passage,
    underlinedExpression,
    surroundingText,
  );
  if (!found) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Underlined expression not found in passage: "${underlinedExpression}"`,
    };
  }

  const originalExpression = passage.slice(found.index, found.index + found.length);
  const passageWithUnderline = replaceAtPosition(
    passage,
    found.index,
    found.length,
    `__${originalExpression}__`,
  );
  const correctAnswerLabels = normalizeCorrectAnswerLabels(
    ai.correctAnswers,
    ai.correctAnswer,
    ai.options,
  );
  const correctAnswer =
    correctAnswerLabels.length > 0
      ? correctAnswerLabels.join(", ")
      : normalizeCorrectAnswerLabel(ai.correctAnswer, ai.options) ?? ai.correctAnswer;
  const multiAnswer = correctAnswerLabels.length >= 2;
  const data: QuestionPostProcessData = {
    ...ai,
    direction: normalizeImpliedMeaningDirection(ai.direction, multiAnswer),
    correctAnswer,
    options: normalizeEnglishOptions(ai.options),
    underlinedExpression: originalExpression,
    passageWithUnderline,
  };
  if (multiAnswer || Array.isArray(ai.correctAnswers)) {
    data.correctAnswers = correctAnswerLabels;
  }

  return {
    success: true,
    data,
    warnings,
  };
}

function normalizeImpliedMeaningDirection(value: unknown, multiAnswer: boolean): string {
  const DEFAULT_MULTI_DIRECTION = "\uB2E4\uC74C \uAE00\uC5D0\uC11C \uBC11\uC904 \uCE5C \uBD80\uBD84\uC774 \uD568\uCD95\uD558\uB294 \uC758\uBBF8\uB85C \uC801\uC808\uD55C \uAC83\uC744 \uBAA8\uB450 \uACE0\uB974\uC2DC\uC624.";
  const DEFAULT_MULTI_EN_DIRECTION =
    "Choose all appropriate meanings of the underlined expression.";
  const DEFAULT_DIRECTION =
    "다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?";
  if (typeof value !== "string") return multiAnswer ? DEFAULT_MULTI_DIRECTION : DEFAULT_DIRECTION;
  const text = value.replace(/\s+/g, " ").trim();
  // Teacher-requested English stems must survive post-processing; Korean (or
  // empty/sloppy) stems are normalized to the standard exam wording as before.
  if (text && !/[\uAC00-\uD7A3]/.test(text) && /[A-Za-z]/.test(text)) {
    if (!multiAnswer) return text;
    return /\b(?:all|apply)\b/i.test(text) ? text : DEFAULT_MULTI_EN_DIRECTION;
  }
  return multiAnswer ? DEFAULT_MULTI_DIRECTION : DEFAULT_DIRECTION;
}

function normalizeCorrectAnswerLabels(
  correctAnswers: unknown,
  correctAnswer: unknown,
  options: unknown,
): string[] {
  const rawLabels: unknown[] = [];
  if (Array.isArray(correctAnswers)) rawLabels.push(...correctAnswers);
  if (rawLabels.length === 0 && typeof correctAnswer === "string") {
    rawLabels.push(...correctAnswer.split(",").map((part) => part.trim()).filter(Boolean));
  }

  const labels: string[] = [];
  for (const rawLabel of rawLabels) {
    const label = normalizeCorrectAnswerLabel(rawLabel, options) ?? normalizeLabel(rawLabel);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function normalizeCorrectAnswerLabel(
  correctAnswer: unknown,
  options: unknown,
): string | null {
  const answerLabel = normalizeLabel(correctAnswer);
  if (!answerLabel || !Array.isArray(options)) return answerLabel || null;

  for (const option of options) {
    if (!option || typeof option !== "object" || Array.isArray(option)) continue;
    const record = option as Record<string, unknown>;
    const optionLabel = normalizeLabel(record.label);
    if (optionLabel && optionLabel === answerLabel) {
      return typeof record.label === "string" ? record.label : answerLabel;
    }
  }

  return answerLabel;
}

function normalizeEnglishOptions(options: unknown): unknown {
  if (!Array.isArray(options)) return options;

  let changed = false;
  const normalized = options.map((option) => {
    if (!isRecord(option)) return option;
    if (typeof option.text !== "string") return option;
    const text = stripOptionPrefix(option.text).replace(/\s+/g, " ").trim();
    if (text === option.text) return option;

    changed = true;
    return {
      ...option,
      text,
    };
  });

  return changed ? normalized : options;
}

function stripOptionPrefix(text: string): string {
  return text
    .replace(/^\s*(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\((?:[A-Ja-j]|\d{1,3})\)|(?:[A-Ja-j]|\d{1,3})[.)])\s*/, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circledNumbers = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  for (let index = 0; index < circledNumbers.length; index += 1) {
    if (text.startsWith(circledNumbers[index])) return circledNumbers[index];
  }
  const match = text.match(/^\s*[\(\[]?([A-Ja-j]|\d{1,3})[\)\].:]?/);
  return match?.[1] ?? "";
}
