import {
  applyReplacementsRTL,
  findExpressionInPassage,
  findExpressionInPassageFuzzy,
  replaceAtPosition,
} from "../text-utils";
import { BLANK, type PostProcessResult, type QuestionPostProcessData, type Replacement } from "../types";

export function processBlankInference(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  // Multi-blank combination variant ((A)/(B)/(C) blanks). The single-blank
  // path below stays byte-for-byte identical for the default item.
  if (Array.isArray(ai.blanks) && ai.blanks.length >= 2) {
    return processMultiBlankInference(passage, ai);
  }

  const warnings: string[] = [];

  const originalExpression = ai.originalExpression as string;
  const surroundingText = ai.surroundingText as string | undefined;
  const options = ai.options as Array<{ label: string; text: string }>;
  const correctAnswer = ai.correctAnswer as string;
  // DOUBLE_NEGATIVE(부정 패러프레이즈)·PARAPHRASE(변형 빈칸) 모두 정답 보기가
  // 원문과 의도적으로 다르다 — verbatim 자동 고정을 건너뛴다.
  const isDoubleNegativeMode = ai.blankAnswerMode === "DOUBLE_NEGATIVE";
  const isParaphraseMode = ai.blankAnswerMode === "PARAPHRASE";
  const isTransformedAnswerMode = isDoubleNegativeMode || isParaphraseMode;

  if (!originalExpression) {
    return { success: false, data: ai, warnings, error: "Missing originalExpression field" };
  }

  // Find the expression in the passage. verbatim/정규화로 못 찾으면 near-verbatim
  // 폴백(앞뒤 말줄임표 트림 + 토큰 사이 구두점/공백 관용 매칭, surroundingText 윈도우
  // 우선)으로 구제한다.
  const found =
    findExpressionInPassage(passage, originalExpression, surroundingText) ??
    findExpressionInPassageFuzzy(passage, originalExpression, surroundingText);
  if (!found) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Expression not found in passage: "${originalExpression.slice(0, 80)}..."`,
    };
  }

  // 폴백(fuzzy)이 구두점/공백이 다른 실제 지문 구간을 잡았을 수 있다. 기본
  // (SOURCE_EXACT) 모드에서는 빈칸으로 제거되는 "실제 지문 텍스트"를 정답 표현의
  // 기준으로 삼아, 정답 선지와 빈칸 처리된 구간이 글자 단위로 일치하게 한다
  // (멀티 빈칸 경로가 passage.slice 로 정합하는 것과 동일). 변형 모드(PARAPHRASE/
  // DOUBLE_NEGATIVE)는 정답 선지가 의도적으로 다르므로 건드리지 않는다.
  const locatedText = passage.slice(found.index, found.index + found.length);
  const canonicalExpression =
    !isTransformedAnswerMode && locatedText && locatedText !== originalExpression
      ? locatedText
      : originalExpression;

  // Validate: in default mode the correct answer option's text should equal the
  // canonical (actually-blanked) expression. In transformed modes, the source span
  // is still blanked but the visible correct option is intentionally transformed.
  if (options && Array.isArray(options)) {
    const correctOption = options.find((o) => o.label === correctAnswer);
    if (!isTransformedAnswerMode && correctOption && correctOption.text !== canonicalExpression) {
      // Auto-fix: check if any other option matches
      const matchingOption = options.find((o) => o.text === canonicalExpression);
      if (matchingOption) {
        warnings.push(
          `correctAnswer "${correctAnswer}" option text doesn't match originalExpression. ` +
            `Found match at option "${matchingOption.label}" instead. Consider updating correctAnswer.`,
        );
      } else {
        // Fix the correct option's text to match
        warnings.push(
          `correctAnswer option "${correctAnswer}" text "${correctOption.text}" ` +
            `doesn't match originalExpression "${canonicalExpression}". Auto-fixed option text.`,
        );
        correctOption.text = canonicalExpression;
      }
    } else if (isTransformedAnswerMode && correctOption?.text === originalExpression) {
      warnings.push(
        `${ai.blankAnswerMode} mode expected a transformed correct option, but correct option matches originalExpression.`,
      );
    }
  }

  // Replace expression with blank
  const passageWithBlank = replaceAtPosition(passage, found.index, found.length, BLANK);

  return {
    success: true,
    data: {
      ...ai,
      originalExpression: canonicalExpression,
      passageWithBlank,
    },
    warnings,
  };
}

const MULTI_BLANK_LABELS = ["(A)", "(B)", "(C)"] as const;
const MULTI_BLANK_MIN = 2;
const MULTI_BLANK_MAX = 3;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function comparableText(value: string): string {
  return value.toLowerCase();
}

function processMultiBlankInference(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];
  const isParaphraseMode = ai.blankAnswerMode === "PARAPHRASE";

  const rawBlanks = (ai.blanks as Array<{
    label?: string;
    originalExpression?: string;
    surroundingText?: string;
  }>).filter((blank) => blank && typeof blank === "object");

  if (rawBlanks.length < MULTI_BLANK_MIN || rawBlanks.length > MULTI_BLANK_MAX) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Multi-blank BLANK_INFERENCE must contain ${MULTI_BLANK_MIN}~${MULTI_BLANK_MAX} blanks, got ${rawBlanks.length}`,
    };
  }

  // Locate every blank span; positions must not overlap.
  const located: Array<{ index: number; length: number; expression: string }> = [];
  for (const [blankIndex, blank] of rawBlanks.entries()) {
    const expression = cleanText(blank.originalExpression);
    if (!expression) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `Multi-blank BLANK_INFERENCE blank ${blankIndex + 1} is missing originalExpression`,
      };
    }
    const found =
      findExpressionInPassage(passage, expression, cleanText(blank.surroundingText)) ??
      findExpressionInPassageFuzzy(passage, expression, cleanText(blank.surroundingText));
    if (!found) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `Multi-blank expression not found in passage: "${expression.slice(0, 80)}"`,
      };
    }
    located.push({ index: found.index, length: found.length, expression: passage.slice(found.index, found.index + found.length) });
  }

  const overlapping = located.some((a, i) =>
    located.some(
      (b, j) => i !== j && a.index < b.index + b.length && b.index < a.index + a.length,
    ),
  );
  if (overlapping) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Multi-blank BLANK_INFERENCE blanks overlap in the passage; choose separated expressions.",
    };
  }

  // Canonical labels follow passage order, regardless of the AI-provided labels.
  const passageOrder = located
    .map((entry, originalIndex) => ({ ...entry, originalIndex }))
    .sort((a, b) => a.index - b.index);
  const normalizedBlanks = passageOrder.map((entry, index) => ({
    label: MULTI_BLANK_LABELS[index],
    originalExpression: entry.expression,
  }));
  if (passageOrder.some((entry, index) => entry.originalIndex !== index)) {
    warnings.push("Reordered multi-blank labels to follow passage order.");
  }

  const replacements: Replacement[] = passageOrder.map((entry, index) => ({
    position: entry.index,
    originalLength: entry.length,
    newText: `${MULTI_BLANK_LABELS[index]} ${BLANK}`,
  }));
  const passageWithBlank = applyReplacementsRTL(passage, replacements);

  // Options: 5 combinations; each blankValues must cover every blank. Reorder
  // values when the blank labels were reordered above.
  const rawOptions = Array.isArray(ai.options) ? ai.options : [];
  const blankCount = normalizedBlanks.length;
  const normalizedOptions: Array<{ label: string; text: string; blankValues: string[] }> = [];
  for (const [optionIndex, option] of rawOptions.entries()) {
    if (!option || typeof option !== "object") {
      return {
        success: false,
        data: ai,
        warnings,
        error: `Multi-blank option ${optionIndex + 1} is not an object`,
      };
    }
    const record = option as Record<string, unknown>;
    const values = Array.isArray(record.blankValues)
      ? record.blankValues.map(cleanText)
      : [];
    if (values.length !== blankCount || values.some((value) => !value)) {
      return {
        success: false,
        data: ai,
        warnings,
        error: `Multi-blank option ${optionIndex + 1} must provide ${blankCount} non-empty blankValues`,
      };
    }
    const reordered = passageOrder.map((entry) => values[entry.originalIndex]);
    normalizedOptions.push({
      label: cleanText(record.label) || String(optionIndex + 1),
      text: reordered.join(" …… "),
      blankValues: reordered,
    });
  }
  if (normalizedOptions.length !== 5) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Multi-blank BLANK_INFERENCE must have exactly 5 options, got ${normalizedOptions.length}`,
    };
  }

  // The correct option must restore the original passage expressions unless
  // the teacher requested paraphrased blank values.
  const correctLabel = cleanText(ai.correctAnswer);
  const correctOption = normalizedOptions.find((option) => option.label === correctLabel);
  if (!correctOption) {
    return {
      success: false,
      data: ai,
      warnings,
      error: `Multi-blank correctAnswer "${correctLabel}" does not match any option label`,
    };
  }
  const matchesSource = correctOption.blankValues.every(
    (value, index) =>
      comparableText(value) === comparableText(normalizedBlanks[index].originalExpression),
  );
  if (!matchesSource && !isParaphraseMode) {
    warnings.push(
      "Multi-blank correct option did not match the source expressions; auto-fixed to the verbatim passage expressions.",
    );
    correctOption.blankValues = normalizedBlanks.map((blank) => blank.originalExpression);
    correctOption.text = correctOption.blankValues.join(" …… ");
  } else if (matchesSource && isParaphraseMode) {
    warnings.push(
      "PARAPHRASE mode expected transformed correct blankValues, but the correct option matches the source expressions.",
    );
  }

  return {
    success: true,
    data: {
      ...ai,
      blankAnswerMode: isParaphraseMode ? "PARAPHRASE" : ai.blankAnswerMode,
      blanks: normalizedBlanks,
      passageWithBlank,
      options: normalizedOptions,
    },
    warnings,
  };
}
