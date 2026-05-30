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
  const correctAnswer = normalizeCorrectAnswerLabel(ai.correctAnswer, ai.options) ?? ai.correctAnswer;

  return {
    success: true,
    data: {
      ...ai,
      direction: "다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?",
      correctAnswer,
      options: normalizeEnglishOptions(ai.options),
      underlinedExpression: originalExpression,
      passageWithUnderline,
    },
    warnings,
  };
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
