import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";
import { sentenceInsertOptionMarkerIndex } from "@/lib/sentence-insert-options";

const POSITION_MARKER_PATTERN = /^(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\(\d{1,3}\)|\d{1,3}[.)]?)$/;
const CIRCLED_POSITION_MARKER_PATTERN = /[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g;
const CIRCLED_LABELS = getCircledNumbers(50);
const GRAMMAR_LABEL_KEYS = "ABCDEFGHIJ";
// '[주어진 문장]'(표준) 또는 '[given]'(레거시) 라벨을 양쪽 모두 인식한다.
// 라벨이 지문 '앞'(신규 직렬화)이든 '뒤'(레거시)이든 한 블록(다음 빈 줄 또는 문자열
// 끝까지)만 잡아내고, 라벨 접두사는 제거한 채 순수 문장만 돌려준다.
const GIVEN_MARKER_PATTERN =
  /(?:^|\n)[ \t]*\[(?:주어진\s*문장|given)\][ \t]*([\s\S]*?)(?=\n\n|$)/i;

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

export function shouldRenderOptionListForSubtype(subType: string | null | undefined) {
  return subType !== "GRAMMAR_ERROR";
}

export function shouldUseSentenceInsertOptionReference(
  subType: string | null | undefined,
  optionText: string,
) {
  return subType === "SENTENCE_INSERT" && POSITION_MARKER_PATTERN.test(optionText.trim());
}

function positionMarkerIndex(optionText: string) {
  return sentenceInsertOptionMarkerIndex(optionText);
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

export function grammarMarkerIndex(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const circledIndex = CIRCLED_LABELS.indexOf(text);
  if (circledIndex >= 0) return circledIndex;

  const alpha = text.match(/^(?:\(([A-Ja-j])\)|([A-Ja-j])[.)]?)$/);
  const alphaKey = alpha?.[1] ?? alpha?.[2];
  if (alphaKey) {
    const index = GRAMMAR_LABEL_KEYS.indexOf(alphaKey.toUpperCase());
    return index >= 0 ? index : null;
  }

  const numeric = text.match(/^(?:\((10|[1-9])\)|(10|[1-9])[.)]?)$/);
  const rawNumber = numeric?.[1] ?? numeric?.[2];
  if (!rawNumber) return null;
  const index = Number(rawNumber) - 1;
  return index >= 0 && index < CIRCLED_LABELS.length ? index : null;
}

export function grammarMarkerDisplayLabel(value: unknown): string {
  const index = grammarMarkerIndex(value);
  return index === null ? String(value ?? "") : getCircledNumber(index);
}

function formatGrammarUnderlineContent(content: string): string {
  const match = content.match(
    /^\s*(\(([A-Ja-j])\)|([A-Ja-j])[.)]?|\((10|[1-9])\)|(10|[1-9])[.)]?|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]))\s+(.+)$/,
  );
  if (!match) return content;

  const rawLabel =
    match[1] ||
    match[2] ||
    match[3] ||
    match[4] ||
    match[5] ||
    match[6] ||
    "";
  const rest = (match[7] || "").trim();
  const marker = grammarMarkerDisplayLabel(rawLabel);
  return rest ? `${marker} ${rest}` : marker;
}

export function formatGrammarErrorPassageMarkers(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "GRAMMAR_ERROR") return text;
  return text.replace(/__([^_]+)__/g, (full, content: string) => {
    const formatted = formatGrammarUnderlineContent(content);
    return formatted === content ? full : `__${formatted}__`;
  });
}

export function formatInlineMarkersForSubtype(
  text: string,
  subType: string | null | undefined,
) {
  return formatGrammarErrorPassageMarkers(
    formatSentenceInsertPassageMarkers(text, subType),
    subType,
  );
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

  const givenText = (match[1] ?? "").trim();
  const matchEnd = match.index + match[0].length;
  // 주어진 문장 블록을 제거한 나머지(지문 등)를 beforeText 로 돌려준다.
  // 라벨이 앞/뒤 어디에 있었든 렌더러가 박스를 '지문 위'로 올려 그린다.
  const beforeText = `${text.slice(0, match.index)}\n${text.slice(matchEnd)}`
    .replace(/\n{2,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");

  return { beforeText, givenText };
}

export function optionDisplayTextForSubtype(
  subType: string | null | undefined,
  index: number,
  optionText: string,
) {
  if (shouldUseGrammarOptionReference(subType)) {
    return "";
  }

  if (subType === "SENTENCE_INSERT") {
    return optionReferenceLabel(positionMarkerIndex(optionText) ?? index);
  }

  return optionText;
}
