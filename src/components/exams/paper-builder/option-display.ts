import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";

const CIRCLED_LABELS = getCircledNumbers(50);
const POSITION_MARKER_PATTERN = /^(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\(\d{1,3}\)|\d{1,3}[.)]?)$/;
const CIRCLED_POSITION_MARKER_PATTERN = /[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g;
const GIVEN_MARKER_PATTERN = /(^|\n)([ \t]*\[given\][\s\S]*)$/i;

export function optionOrdinalLabel(index: number) {
  return getCircledNumber(index);
}

export function optionReferenceLabel(index: number) {
  return index >= 0 && index < 26
    ? `(${String.fromCharCode(65 + index)})`
    : `(${index + 1})`;
}

export function shouldUseGrammarOptionReference(subType: string | null | undefined) {
  return subType === "GRAMMAR_ERROR";
}

export function shouldUseSentenceInsertOptionReference(
  subType: string | null | undefined,
  optionText: string,
) {
  return subType === "SENTENCE_INSERT" && POSITION_MARKER_PATTERN.test(optionText.trim());
}

function positionMarkerIndex(optionText: string) {
  const normalized = optionText.trim();
  if (!normalized) return null;

  const circledIndex = CIRCLED_LABELS.indexOf(normalized);
  if (circledIndex >= 0) return circledIndex;

  const numberMatch = normalized.match(/^(?:\((\d{1,3})\)|(\d{1,3})[.)]?)$/);
  const numberText = numberMatch?.[1] ?? numberMatch?.[2];
  if (!numberText) return null;

  const numberValue = Number(numberText);
  if (numberValue < 1 || numberValue > CIRCLED_LABELS.length) return null;

  return numberValue - 1;
}

export function formatSentenceInsertPassageMarkers(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "SENTENCE_INSERT") return text;

  return text.replace(CIRCLED_POSITION_MARKER_PATTERN, (marker) => {
    const markerIndex = positionMarkerIndex(marker);
    return markerIndex === null ? marker : optionReferenceLabel(markerIndex);
  });
}

export function splitSentenceInsertGivenBlock(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "SENTENCE_INSERT") {
    return { beforeText: text, givenText: "" };
  }

  const match = GIVEN_MARKER_PATTERN.exec(text);
  if (!match || match.index === undefined) {
    return { beforeText: text, givenText: "" };
  }

  const markerStartsWithNewline = match[1].length > 0;
  const givenStartIndex = match.index + (markerStartsWithNewline ? match[1].length : 0);

  return {
    beforeText: text.slice(0, givenStartIndex).replace(/\n+$/g, ""),
    givenText: text.slice(givenStartIndex).trim(),
  };
}

export function optionDisplayTextForSubtype(
  subType: string | null | undefined,
  index: number,
  optionText: string,
) {
  if (shouldUseGrammarOptionReference(subType)) {
    return "";
  }

  if (shouldUseSentenceInsertOptionReference(subType, optionText)) {
    return optionReferenceLabel(positionMarkerIndex(optionText) ?? index);
  }

  return optionText;
}
