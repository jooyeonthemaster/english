import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";

export type SentenceInsertOption = {
  label: string;
  text: string;
};

const CIRCLED_LABELS = getCircledNumbers(50);

export function buildCanonicalSentenceInsertOptions(count = 5): SentenceInsertOption[] {
  return Array.from({ length: count }, (_, index) => ({
    label: `${index + 1}`,
    text: getCircledNumber(index),
  }));
}

export function sentenceInsertOptionMarkerIndex(value: unknown): number | null {
  const text = normalizeMarkerText(value);
  if (!text) return null;

  const circledIndex = CIRCLED_LABELS.indexOf(text);
  if (circledIndex >= 0) return circledIndex;

  const match = text.match(/^(?:\((\d{1,3})\)|(\d{1,3})[.)]?)$/);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;

  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > CIRCLED_LABELS.length) {
    return null;
  }

  return numeric - 1;
}

export function sentenceInsertAnswerMarkerIndex(value: unknown): number | null {
  const optionIndex = sentenceInsertOptionMarkerIndex(value);
  if (optionIndex !== null) return optionIndex;

  const text = normalizeMarkerText(value);
  const letterMatch = text.match(/^(?:\(([A-Ea-e])\)|([A-Ea-e])[.)]?)$/);
  const letter = letterMatch?.[1] ?? letterMatch?.[2];
  if (!letter) return null;

  return letter.toUpperCase().charCodeAt(0) - 65;
}

export function normalizeSentenceInsertAnswer(value: unknown): string {
  const markerIndex = sentenceInsertAnswerMarkerIndex(value);
  if (markerIndex !== null && markerIndex >= 0 && markerIndex < 5) {
    return String(markerIndex + 1);
  }
  return normalizeMarkerText(value).toLowerCase();
}

export function isSameObjectiveAnswerForSubtype(
  subType: string | null | undefined,
  studentAnswer: unknown,
  correctAnswer: unknown,
): boolean {
  if (subType === "SENTENCE_INSERT") {
    return normalizeSentenceInsertAnswer(studentAnswer) === normalizeSentenceInsertAnswer(correctAnswer);
  }

  return normalizeMarkerText(studentAnswer).toLowerCase() === normalizeMarkerText(correctAnswer).toLowerCase();
}

function normalizeMarkerText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
