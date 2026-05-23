const MAX_CIRCLED_NUMBER = 20;
const FIRST_CIRCLED_NUMBER_CODEPOINT = 0x2460;
const POSITION_MARKER_PATTERN = /^(?:[\u2460-\u2473]|\((?:[1-9]|1\d|20)\)|(?:[1-9]|1\d|20)[.)]?)$/;
const CIRCLED_POSITION_MARKER_PATTERN = /[\u2460-\u2473]/g;
const GIVEN_MARKER_PATTERN = /(^|\n)([ \t]*\[given\][\s\S]*)$/i;

export function optionOrdinalLabel(index: number) {
  return index >= 0 && index < MAX_CIRCLED_NUMBER
    ? String.fromCodePoint(0x2460 + index)
    : `${index + 1}.`;
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

  const markerCodePoint = normalized.codePointAt(0);
  if (
    normalized.length === 1 &&
    markerCodePoint !== undefined &&
    markerCodePoint >= FIRST_CIRCLED_NUMBER_CODEPOINT &&
    markerCodePoint < FIRST_CIRCLED_NUMBER_CODEPOINT + MAX_CIRCLED_NUMBER
  ) {
    return markerCodePoint - FIRST_CIRCLED_NUMBER_CODEPOINT;
  }

  const numberMatch = normalized.match(/^(?:\((\d{1,2})\)|(\d{1,2})[.)]?)$/);
  const numberText = numberMatch?.[1] ?? numberMatch?.[2];
  if (!numberText) return null;

  const numberValue = Number(numberText);
  if (numberValue < 1 || numberValue > MAX_CIRCLED_NUMBER) return null;

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
    return optionReferenceLabel(index);
  }

  if (shouldUseSentenceInsertOptionReference(subType, optionText)) {
    return optionReferenceLabel(positionMarkerIndex(optionText) ?? index);
  }

  return optionText;
}
