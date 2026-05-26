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
      correctAnswer,
      options: softenAbsoluteGiveawayDistractors(ai.options, correctAnswer),
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

function softenAbsoluteGiveawayDistractors(
  options: unknown,
  correctAnswer: unknown,
): unknown {
  const correctLabel = normalizeLabel(correctAnswer);
  if (!correctLabel || !Array.isArray(options)) return options;

  let changed = false;
  const softened = options.map((option) => {
    if (!isRecord(option)) return option;
    const optionLabel = normalizeLabel(option.label);
    if (!optionLabel || optionLabel === correctLabel || typeof option.text !== "string") {
      return option;
    }

    const text = softenAbsoluteCueText(option.text);
    if (text === option.text) return option;

    changed = true;
    return {
      ...option,
      text,
    };
  });

  return changed ? softened : options;
}

function softenAbsoluteCueText(text: string): string {
  return text
    .replace(/완전(?:히|하게)\s*(극복|해소|해결|제거|대체|사라지)/g, "$1")
    .replace(/절대적(?:인|으로)?\s*/g, "주요한 ")
    .replace(/완전한\s*/g, "")
    .replace(/완벽한\s*/g, "")
    .replace(/완벽(?:히|하게)?\s*(이해|파악|분석|설명|해결|예측|통제|보장|대체)/g, "$1")
    .replace(/완벽(?:히|하게)\s*/g, "")
    .replace(/(?:해야만|하여야만)/g, "해야")
    .replace(/일\s*때만/g, "일 때")
    .replace(/만을/g, "을")
    .replace(/만이/g, "이")
    .replace(/만으로(?:는|도)?/g, "으로")
    .replace(/배제하고/g, "분리하고")
    .replace(/배제해야/g, "분리해야")
    .replace(/배제/g, "분리")
    .replace(/순수한\s*/g, "")
    .replace(/(?:완전(?:히|하게)|전적(?:으로|인)|오직|항상|언제나|절대|무조건|반드시|예외\s*없이)\s*/g, "")
    .replace(/\s{2,}/g, " ")
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
