import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";

const CIRCLED_LABELS = getCircledNumbers(50);
const POSITION_MARKER_PATTERN = /^(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\(\d{1,3}\)|\d{1,3}[.)]?)$/;
const CIRCLED_POSITION_MARKER_PATTERN = /[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g;
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
    // 어법 판단(GRAMMAR_ERROR): 지문에는 (A)~(E) 밑줄 마커가 인라인으로 들어가고,
    // 선택지 ①~⑤ 는 그 마커를 참조한다. 빈 문자열을 돌려주면 선택지가 번호만
    // 남고 텍스트가 비어 미리보기에 공란으로 보이는 버그가 생긴다.
    return optionReferenceLabel(index);
  }

  if (shouldUseSentenceInsertOptionReference(subType, optionText)) {
    return optionReferenceLabel(positionMarkerIndex(optionText) ?? index);
  }

  return optionText;
}
