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

/**
 * Marker count is configurable (5~8). Saved SENTENCE_INSERT options are
 * server-built canonical markers, so their length is the source of truth when
 * rebuilding canonical options; anything outside the range falls back to 5.
 */
export function sentenceInsertOptionCountFrom(options: unknown): number {
  let length = 0;
  if (Array.isArray(options)) {
    length = options.length;
  } else if (typeof options === "string") {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) length = parsed.length;
    } catch {
      length = 0;
    }
  }
  return length >= 5 && length <= 8 ? length : 5;
}

export function buildCanonicalSentenceInsertOptionsFrom(
  options: unknown,
): SentenceInsertOption[] {
  return buildCanonicalSentenceInsertOptions(sentenceInsertOptionCountFrom(options));
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
  // Marker count is configurable (5~8); accept any canonical marker index.
  const markerIndex = sentenceInsertAnswerMarkerIndex(value);
  if (markerIndex !== null && markerIndex >= 0 && markerIndex < 10) {
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
