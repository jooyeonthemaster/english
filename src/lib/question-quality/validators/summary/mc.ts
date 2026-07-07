// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, containsHangul, containsLatinLetter, countLiteral, isRecord, normalizeComparableText, normalizeLabel, normalizeText } from "../../core";
import { validateKillerSummaryTrapStrength } from "./killer-trap";



export function validateSummaryCompleteMcQuestion(
  question: Record<string, unknown>,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const summary = normalizeText(question.summaryWithBlanks);
  const blanks = Array.isArray(question.blanks) ? question.blanks.filter(isRecord) : [];
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabel = normalizeLabel(question.correctAnswer);
  const labelsFromBlanks = blanks
    .map((blank) => normalizeText(blank.label))
    .filter((label) => /^\([A-Z]\)$/.test(label));
  const labelsFromSummary = Array.from(summary.matchAll(/\(([A-Z])\)/g))
    .map((match) => `(${match[1]})`);
  const blankLabels = [...new Set(
    (labelsFromBlanks.length > 0
      ? labelsFromBlanks
      : labelsFromSummary.length > 0
        ? labelsFromSummary
        : ["(A)", "(B)"]).slice(0, 4),
  )].sort();
  const blankAnswers = new Map(
    blankLabels.map((label) => [label, findSummaryBlankAnswer(blanks, label)]),
  );
  const blankA = blankAnswers.get("(A)") || "";
  const blankB = blankAnswers.get("(B)") || "";

  const directionNamesSummaryTask = /summary/i.test(direction) || blankLabels.length > 0;
  const directionNamesAllBlanks = blankLabels.every((label) => direction.includes(label));
  if (!directionNamesSummaryTask || !directionNamesAllBlanks) {
    add(
      "error",
      "summary-mc-direction-frame",
      `SUMMARY_COMPLETE_MC direction must ask for the best words for summary blanks ${blankLabels.join(", ")}.`,
    );
  }

  if (!summary) {
    add("error", "summary-mc-missing-summary", "SUMMARY_COMPLETE_MC is missing summaryWithBlanks.");
  }

  if (blankLabels.some((label) => countLiteral(summary, label) !== 1)) {
    add(
      "error",
      "summary-mc-blank-marker-count",
      `summaryWithBlanks must contain ${blankLabels.join(", ")} exactly once each.`,
    );
  }

  // 요약문 미종결 검출 (wave5): 문장 종결 부호 없이 끝나는 stem 은 생성이 중간에
  // 잘린 것 — 실측(26-07-05 final-prem INT 40점): "...the words for " 로 끊긴
  // 요약문이 마커 2개를 갖춰 마커 게이트는 통과하고 출하됐다. 끝의 닫는
  // 따옴표/괄호를 걷어낸 뒤 마지막 문자가 [.!?] 가 아니면 차단한다.
  if (summary) {
    const trimmedTail = summary.replace(/["'”’)\]\s]+$/g, "");
    if (trimmedTail && !/[.!?]$/.test(trimmedTail)) {
      add(
        "error",
        "summary-mc-stem-unterminated",
        `summaryWithBlanks가 문장 종결 부호 없이 끝납니다("...${trimmedTail.slice(-25)}") — 생성이 잘린 요약문입니다. 완결된 한 문장으로 다시 쓰세요.`,
      );
    }
  }

  if (summary && containsHangul(summary)) {
    add(
      "error",
      "summary-mc-summary-language",
      "SUMMARY_COMPLETE_MC summaryWithBlanks must be an English summary sentence.",
    );
  }

  const summaryForSentenceCount = summary.replace(
    /\([A-Z]\)\s*(?:_{3,}|(?:\.|\u2026|\?){2,}|[-\u2013\u2014]{2,})?/g,
    " ",
  );
  if (countSentenceEndings(summaryForSentenceCount) > 1) {
    add(
      "warning",
      "summary-mc-summary-too-many-sentences",
      "SUMMARY_COMPLETE_MC summary should be one sentence, not multiple sentences.",
    );
  }

  if (blankLabels.some((label) => !blankAnswers.get(label))) {
    add(
      "error",
      "summary-mc-missing-blank-answer",
      `SUMMARY_COMPLETE_MC blanks must include answers for ${blankLabels.join(", ")}.`,
    );
  }

  for (const label of blankLabels) {
    const answer = blankAnswers.get(label) || "";
    if (!answer) continue;
    if (containsHangul(answer) || !containsLatinLetter(answer)) {
      add(
        "error",
        "summary-mc-answer-language",
        `${label} answer must be an English word or phrase.`,
      );
      break;
    }
    const normalizedAnswer = normalizeComparableText(answer);
    if (
      normalizedAnswer.length >= 4 &&
      normalizeComparableText(summary).includes(normalizedAnswer)
    ) {
      add(
        "error",
        "summary-mc-answer-leaks-in-summary",
        `${label} answer appears in summaryWithBlanks; the student-facing summary must hide the answer behind the blank marker.`,
      );
      break;
    }
  }

  if (summary && blankLabels.every((label) => blankAnswers.get(label))) {
    const filledSummary = blankLabels.reduce(
      (next, label) => next.replace(label, blankAnswers.get(label) || ""),
      summary,
    );
    const awkwardCollocation = findAwkwardSummaryMcCollocation(filledSummary);
    if (awkwardCollocation) {
      add(
        "error",
        "summary-mc-awkward-collocation",
        `SUMMARY_COMPLETE_MC filled summary has an awkward English collocation: ${awkwardCollocation}.`,
      );
    }
  }

  if (!correctLabel) {
    add("error", "summary-mc-correct-answer-mismatch", "SUMMARY_COMPLETE_MC correctAnswer must be an option label.");
  }

  const optionPairs = options.map((option) => ({
    label: normalizeLabel(option.label),
    ...readSummaryPairOption(option),
  }));
  const correctPair = optionPairs.find((option) => option.label === correctLabel);

  if (!correctPair) {
    add(
      "error",
      "summary-mc-correct-answer-mismatch",
      "SUMMARY_COMPLETE_MC correctAnswer does not point to an existing option pair.",
    );
  } else if (
    blankLabels.some((label) => {
      const key = summaryBlankKey(label);
      return normalizeComparableText(correctPair.values[key] || "") !==
        normalizeComparableText(blankAnswers.get(label) || "");
    })
  ) {
    add(
      "error",
      "summary-mc-correct-pair-mismatch",
      "SUMMARY_COMPLETE_MC correct option pair must match the blanks answers exactly.",
    );
  }

  let hasAOnlyTrap = false;
  let hasBOnlyTrap = false;
  let hasAllButOneTrap = false;
  let malformedPairFound = false;
  let nonEnglishPairFound = false;
  let duplicateCorrectFound = false;

  for (const pair of optionPairs) {
    const missingBlankValue = blankLabels.some((label) => {
      const key = summaryBlankKey(label);
      return !pair.values[key];
    });
    if (missingBlankValue) {
      malformedPairFound = true;
      continue;
    }
    const pairText = blankLabels.map((label) => pair.values[summaryBlankKey(label)] || "").join(" ");
    if (containsHangul(pairText) || !containsLatinLetter(pairText)) {
      nonEnglishPairFound = true;
    }
    if (pair.label !== correctLabel) {
      const matchCount = blankLabels.filter((label) => {
        const key = summaryBlankKey(label);
        return normalizeComparableText(pair.values[key] || "") ===
          normalizeComparableText(blankAnswers.get(label) || "");
      }).length;
      if (matchCount === blankLabels.length) duplicateCorrectFound = true;
      if (matchCount === blankLabels.length - 1) hasAllButOneTrap = true;
    }
    if (pair.label !== correctLabel && blankA && blankB) {
      const aMatches = normalizeComparableText(pair.values.blankA || pair.blankA) === normalizeComparableText(blankA);
      const bMatches = normalizeComparableText(pair.values.blankB || pair.blankB) === normalizeComparableText(blankB);
      if (aMatches && !bMatches) hasAOnlyTrap = true;
      if (!aMatches && bMatches) hasBOnlyTrap = true;
    }
  }

  if (malformedPairFound) {
    add(
      "error",
      "summary-mc-option-pair-shape",
      `Every SUMMARY_COMPLETE_MC option must provide values for ${blankLabels.join(", ")}, or a clearly paired text value.`,
    );
  }

  if (nonEnglishPairFound) {
    add(
      "error",
      "summary-mc-option-language",
      "SUMMARY_COMPLETE_MC options must be English-only paired expressions.",
    );
  }

  if (duplicateCorrectFound) {
    add(
      "error",
      "summary-mc-duplicate-correct-option",
      "Only the correct SUMMARY_COMPLETE_MC option may match every blank answer.",
    );
  }

  if (blankLabels.length === 2 && (!hasAOnlyTrap || !hasBOnlyTrap)) {
    add(
      "error",
      "summary-mc-missing-half-correct-traps",
      "SUMMARY_COMPLETE_MC should include at least one A-only-correct trap and one B-only-correct trap.",
    );
  }

  if (blankLabels.length > 2 && !hasAllButOneTrap) {
    add(
      "warning",
      "summary-mc-missing-all-but-one-trap",
      "SUMMARY_COMPLETE_MC with three or more blanks should include at least one all-but-one-correct trap.",
    );
  }

  if (requestedDifficulty === "KILLER" && blankLabels.length === 2 && blankA && blankB && correctLabel) {
    validateKillerSummaryTrapStrength(optionPairs, correctLabel, blankA, blankB, add);
  }

  const wrongExplanations =
    question.wrongOptionExplanations &&
    typeof question.wrongOptionExplanations === "object" &&
    !Array.isArray(question.wrongOptionExplanations)
      ? (question.wrongOptionExplanations as Record<string, unknown>)
      : {};
  if (
    Object.values(wrongExplanations).some(
      (explanation) =>
        typeof explanation === "string" &&
        /대조군\s*설계|control\s+group|control\s+design/i.test(explanation),
    )
  ) {
    add(
      "warning",
      "summary-mc-explanation-experimental-jargon",
      "Wrong-option explanations should say 선지 배열상/지문 논리상, not 대조군 설계 or experimental control-group jargon.",
    );
  }
}



export function findSummaryBlankAnswer(
  blanks: Record<string, unknown>[],
  expectedLabel: string,
): string {
  const normalizedExpected = expectedLabel.replace(/[()]/g, "").toLowerCase();
  const blank = blanks.find((item) => {
    const label = normalizeText(item.label).replace(/[()]/g, "").toLowerCase();
    return label === normalizedExpected;
  });
  return normalizeText(blank?.answer);
}



export function summaryBlankKey(label: unknown): string {
  const normalized = normalizeText(label).replace(/[()]/g, "").toUpperCase();
  if (!/^[A-Z]$/.test(normalized)) return "";
  return `blank${normalized}`;
}



export function readSummaryPairOption(option: Record<string, unknown>): {
  blankA: string;
  blankB: string;
  text: string;
  values: Record<string, string>;
} {
  const text = normalizeText(option.text);
  const values: Record<string, string> = {};
  const textValues = readSummaryValuesFromOptionText(text);

  if (Array.isArray(option.blankValues)) {
    for (const item of option.blankValues) {
      if (!isRecord(item)) continue;
      const key = summaryBlankKey(item.label);
      const value = normalizeText(item.value ?? item.answer);
      if (key && value) values[key] = value;
    }
  }

  for (const [key, value] of Object.entries(option)) {
    if (!/^blank[A-Z]$/i.test(key)) continue;
    const normalizedKey = `blank${key.slice(5).toUpperCase()}`;
    const normalizedValue = normalizeText(value);
    if (normalizedValue) values[normalizedKey] = normalizedValue;
  }

  for (const [key, value] of Object.entries(textValues)) {
    if (value && !values[key]) values[key] = value;
  }

  const explicitA = values.blankA || normalizeText(option.blankA);
  const explicitB = values.blankB || normalizeText(option.blankB);
  if (Object.keys(values).length > 0 || explicitA || explicitB) {
    if (explicitA) values.blankA = explicitA;
    if (explicitB) values.blankB = explicitB;
    return { blankA: explicitA, blankB: explicitB, text, values };
  }

  const stripped = stripSummaryOptionPrefix(text);
  const parts = stripped
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|(?:\?\s*){2,}|\/|\||;|,|\s[-\u2013\u2014]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    parts.forEach((part, index) => {
      values[`blank${String.fromCharCode(65 + index)}`] = part;
    });
    return { blankA: parts[0], blankB: parts[1] || "", text, values };
  }

  return { blankA: "", blankB: "", text, values };
}



export function readSummaryValuesFromOptionText(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!text) return values;

  const stripped = stripSummaryOptionPrefix(text);
  stripped
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|(?:\?\s*){2,}|\/|\||;|,|\s[-\u2013\u2014]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, index) => {
      values[`blank${String.fromCharCode(65 + index)}`] = part;
    });
  return values;
}



export function stripSummaryOptionPrefix(text: string): string {
  return text
    .replace(
      /^\s*(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\((?:[A-Ja-j]|\d{1,3})\)|(?:[A-Ja-j]|\d{1,3})[.)])\s*/,
      "",
    )
    .trim();
}



export function countSentenceEndings(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches?.length ?? 0;
}



export function findAwkwardSummaryMcCollocation(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const patterns: RegExp[] = [
    /\b(?:question|matter|issue|problem)\s+of\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\s+to\s+[a-z]+ing\b/i,
    /\b(?:equity|equality|opportunity|responsibility)\s+to\s+[a-z]+ing\b/i,
    /\b(?:a|the)\s+(?:question|matter|issue|problem)\s+of\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}\s+for\s+[a-z]+ing\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}
