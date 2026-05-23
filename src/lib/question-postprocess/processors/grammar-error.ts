import {
  applyReplacementsRTL,
  findExpressionInPassage,
  sanitizeExpressionForMarker,
} from "../text-utils";
import type { PostProcessResult, QuestionPostProcessData, Replacement } from "../types";

type GrammarMarkedExpression = {
  label: string;
  expression: string;
  isError: boolean;
  correction?: string;
  errorExpression?: string;
  surroundingText?: string;
};

type GrammarOption = {
  label: string;
  text: string;
};

const GRAMMAR_KEYS = ["A", "B", "C", "D", "E"] as const;
const GRAMMAR_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)"] as const;

export function processGrammarError(
  passage: string,
  ai: QuestionPostProcessData,
): PostProcessResult {
  const warnings: string[] = [];

  const markedExpressions = ai.markedExpressions as GrammarMarkedExpression[];

  if (!markedExpressions || !Array.isArray(markedExpressions)) {
    return { success: false, data: ai, warnings, error: "Missing markedExpressions field" };
  }

  const canonicalMarkedExpressions = markedExpressions.map((me, index) => {
    const expression = normalizeString(me.expression);
    const errorExpression = normalizeString(me.errorExpression);
    const correction =
      normalizeString(me.correction) ||
      (me.isError && errorExpression && expression && errorExpression !== expression
        ? expression
        : "");

    return {
      ...me,
      label: canonicalGrammarLabel(me.label, index),
      expression,
      errorExpression: errorExpression || undefined,
      correction: correction || undefined,
    };
  });
  const labelByKey = buildLabelMap(canonicalMarkedExpressions);
  const rawCorrectLabel = canonicalGrammarLabel(ai.correctAnswer);
  const errorLabels = canonicalMarkedExpressions
    .filter((me) => me.isError === true)
    .map((me) => me.label);
  const correctAnswer =
    errorLabels.length === 1
      ? errorLabels[0]
      : rawCorrectLabel || normalizeString(ai.correctAnswer);

  if (errorLabels.length === 1 && rawCorrectLabel && rawCorrectLabel !== errorLabels[0]) {
    warnings.push(
      `correctAnswer normalized from ${normalizeString(ai.correctAnswer)} to the marked error label ${errorLabels[0]}`,
    );
  }

  const options = canonicalizeOptions(ai.options, canonicalMarkedExpressions);
  const wrongOptionExplanations = canonicalizeWrongOptionExplanations(
    ai.wrongOptionExplanations,
    labelByKey,
  );

  const replacements: Replacement[] = [];

  for (const me of canonicalMarkedExpressions) {
    const sourceExpression = getSourceExpression(me);
    let found = findExpressionInPassage(passage, sourceExpression, me.surroundingText);

    if (!found && me.isError && me.correction && me.correction !== sourceExpression) {
      found = findExpressionInPassage(passage, me.correction, me.surroundingText);
    }

    if (!found) {
      warnings.push(`Expression not found for label ${me.label}: "${sourceExpression}"`);
      continue;
    }

    const displayedExpression = getMarkedSurfaceExpression(me) || sourceExpression;
    const sanitized = sanitizeExpressionForMarker(displayedExpression);
    const newText = `__${me.label} ${sanitized}__`;

    replacements.push({
      position: found.index,
      originalLength: found.length,
      newText,
    });
  }

  if (replacements.length === 0 && markedExpressions.length > 0) {
    return {
      success: false,
      data: ai,
      warnings,
      error: "Could not locate any marked expressions in the passage",
    };
  }

  const passageWithMarkers = applyReplacementsRTL(passage, replacements);

  return {
    success: true,
    data: {
      ...ai,
      correctAnswer,
      markedExpressions: canonicalMarkedExpressions,
      options,
      wrongOptionExplanations,
      passageWithMarkers,
    },
    warnings,
  };
}

function canonicalizeOptions(
  value: unknown,
  markedExpressions: GrammarMarkedExpression[],
): GrammarOption[] {
  const options = Array.isArray(value) ? value.filter(isGrammarOptionLike) : [];

  return markedExpressions.map((markedExpression, index) => {
    const label = canonicalGrammarLabel(markedExpression.label, index);
    const matchingOption =
      options.find((option) => normalizeGrammarKey(option.label) === normalizeGrammarKey(label)) ??
      options[index];
    const displayedExpression = getMarkedSurfaceExpression(markedExpression);

    return {
      ...matchingOption,
      label,
      text: displayedExpression || normalizeString(matchingOption?.text) || label,
    };
  });
}

function getMarkedSurfaceExpression(markedExpression: GrammarMarkedExpression): string {
  if (markedExpression.isError) {
    return normalizeString(markedExpression.errorExpression) || normalizeString(markedExpression.expression);
  }
  return normalizeString(markedExpression.expression);
}

function getSourceExpression(markedExpression: GrammarMarkedExpression): string {
  return (
    normalizeString(markedExpression.expression) ||
    normalizeString(markedExpression.correction) ||
    normalizeString(markedExpression.errorExpression)
  );
}

function canonicalizeWrongOptionExplanations(
  value: unknown,
  labelByKey: Map<string, string>,
): unknown {
  if (!value || typeof value !== "object") return value;

  // 신규 array 형태 ([{label, expression, pointCode, explanation}, ...]) → Record<label, explanation>로 변환
  // (GRAMMAR_ERROR 한정 — 다른 유형은 기존 Record 형태 유지)
  if (Array.isArray(value)) {
    const remapped: Record<string, unknown> = {};
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const rawLabel = item.label;
      const explanation = item.explanation;
      if (typeof explanation !== "string") continue;
      const normalizedKey = normalizeGrammarKey(rawLabel);
      const canonicalKey = normalizedKey ? labelByKey.get(normalizedKey) : "";
      const finalKey = canonicalKey || normalizeString(rawLabel);
      if (!finalKey) continue;
      remapped[finalKey] = explanation;
    }
    return remapped;
  }

  // 기존 Record 형태 — 그대로 처리
  const remapped: Record<string, unknown> = {};
  for (const [key, explanation] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeGrammarKey(key);
    const canonicalKey = normalizedKey ? labelByKey.get(normalizedKey) : "";
    remapped[canonicalKey || key] = explanation;
  }
  return remapped;
}

function buildLabelMap(markedExpressions: GrammarMarkedExpression[]): Map<string, string> {
  const labelByKey = new Map<string, string>();
  markedExpressions.forEach((me, index) => {
    const key = normalizeGrammarKey(me.label) || GRAMMAR_KEYS[index] || "";
    if (key) labelByKey.set(key, me.label);
    const numericKey = GRAMMAR_KEYS[index];
    if (numericKey) labelByKey.set(numericKey, me.label);
  });
  return labelByKey;
}

function canonicalGrammarLabel(value: unknown, fallbackIndex?: number): string {
  const key = normalizeGrammarKey(value);
  if (key) return `(${key})`;
  if (typeof fallbackIndex === "number" && fallbackIndex >= 0 && fallbackIndex < GRAMMAR_LABELS.length) {
    return GRAMMAR_LABELS[fallbackIndex];
  }
  return normalizeString(value);
}

function normalizeGrammarKey(value: unknown): string {
  const text = normalizeString(value);
  if (!text) return "";

  const alpha = text.match(/^[([]?\s*([A-Ea-e])\s*[)\].:]?$/);
  if (alpha) return alpha[1].toUpperCase();

  const numeric = text.match(/^[([]?\s*([1-5])\s*[)\].:]?$/);
  if (numeric) return GRAMMAR_KEYS[Number(numeric[1]) - 1] ?? "";

  return "";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isGrammarOptionLike(value: unknown): value is GrammarOption {
  return typeof value === "object" && value !== null && "label" in value && "text" in value;
}
