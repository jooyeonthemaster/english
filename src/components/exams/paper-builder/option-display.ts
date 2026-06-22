import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";
import { sentenceInsertOptionMarkerIndex } from "@/lib/sentence-insert-options";

const POSITION_MARKER_PATTERN = /^(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\(\d{1,3}\)|\d{1,3}[.)]?)$/;
const CIRCLED_POSITION_MARKER_PATTERN = /[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/g;
const CIRCLED_LETTER_MARKER_PATTERN = /[\u24D0-\u24E9]/g;
const PAREN_LETTER_MARKER_PATTERN = /\(([A-Ea-e])\)/g;
const CIRCLED_LABELS = getCircledNumbers(50);
const GRAMMAR_LABEL_KEYS = "ABCDEFGHIJ";
const PASSAGE_MARKER_ONLY_SUBTYPES = new Set([
  "GRAMMAR_ERROR",
  "IRRELEVANT",
  "SENTENCE_INSERT",
  "VOCAB_CHOICE",
]);
// '[주어진 문장]'(표준) 또는 '[given]'(레거시) 라벨을 양쪽 모두 인식한다.
// 라벨이 지문 '앞'(신규 직렬화)이든 '뒤'(레거시)이든 한 블록(다음 빈 줄 또는 문자열
// 끝까지)만 잡아내고, 라벨 접두사는 제거한 채 순수 문장만 돌려준다.
const GIVEN_MARKER_PATTERN =
  /(?:^|\n)[ \t]*\[(?:주어진\s*문장|given)\][ \t]*([\s\S]*?)(?=\n\n|$)/i;

export function optionOrdinalLabel(index: number) {
  return getCircledNumber(index);
}

const CUSTOM_LABEL_SUBTYPES = new Set(["CUSTOM", "CUSTOM_LAYOUT"]);

/** 커스텀 유형은 저장된 선지 라벨(마커 스킴)을 그대로 존중, 그 외엔 인덱스 원형 숫자. */
export function optionDisplayLabel(
  subType: string | null | undefined,
  index: number,
  storedLabel?: string | null,
): string {
  if (subType && CUSTOM_LABEL_SUBTYPES.has(subType)) {
    const t = (storedLabel ?? "").trim();
    if (t) return t;
  }
  return optionOrdinalLabel(index);
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
  return !PASSAGE_MARKER_ONLY_SUBTYPES.has(subType || "");
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

function letterMarkerIndex(letter: string) {
  const index = letter.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < 26 ? index : null;
}

function circledLetterMarkerIndex(marker: string) {
  const codePoint = marker.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x24D0 || codePoint > 0x24E9) {
    return null;
  }
  return codePoint - 0x24D0;
}

export function formatSentenceInsertPassageMarkers(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "SENTENCE_INSERT") return text;

  return text
    .replace(CIRCLED_POSITION_MARKER_PATTERN, (marker) => {
      const markerIndex = positionMarkerIndex(marker);
      return markerIndex === null ? marker : getCircledNumber(markerIndex);
    })
    .replace(PAREN_LETTER_MARKER_PATTERN, (_full, letter: string) => {
      const markerIndex = letterMarkerIndex(letter);
      return markerIndex === null ? _full : getCircledNumber(markerIndex);
    });
}

export function formatIrrelevantPassageMarkers(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "IRRELEVANT") return text;

  return text
    .replace(CIRCLED_LETTER_MARKER_PATTERN, (marker) => {
      const markerIndex = circledLetterMarkerIndex(marker);
      return markerIndex === null ? marker : getCircledNumber(markerIndex);
    })
    .replace(PAREN_LETTER_MARKER_PATTERN, (_full, letter: string) => {
      const markerIndex = letterMarkerIndex(letter);
      return markerIndex === null ? _full : getCircledNumber(markerIndex);
    });
}

function formatVocabChoiceUnderlineContent(content: string): string {
  const match = content.match(/^\s*\(([A-Ja-j])\)\s+(.+)$/);
  if (!match) return content;

  const markerIndex = letterMarkerIndex(match[1]);
  return markerIndex === null ? content : `${getCircledNumber(markerIndex)} ${match[2].trim()}`;
}

export function formatVocabChoicePassageMarkers(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "VOCAB_CHOICE") return text;
  return text.replace(/__([^_]+)__/g, (full, content: string) => {
    const formatted = formatVocabChoiceUnderlineContent(content);
    return formatted === content ? full : `__${formatted}__`;
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

// 어법 판단(GRAMMAR_ERROR) 전용 — 해설/정답/오답분석 프로즈 안의 알파벳 라벨 참조
// "(A)"~"(J)" 를 시험지 렌더와 동일한 원형숫자 "①②③" 로 변환한다.
// GRAMMAR_ERROR 표면(GrammarErrorRenderer 등)에서만 호출하므로 다른 유형은 무영향.
// 단일 대문자/소문자 알파벳 괄호 토큰만 매칭하므로 사실상 마커 참조에만 적용된다.
const GRAMMAR_LABEL_MENTION_PATTERN = /\(([A-Ja-j])\)/g;

export function circleGrammarLabelMentions(text: unknown): string {
  if (typeof text !== "string" || !text) return typeof text === "string" ? text : "";
  return text.replace(GRAMMAR_LABEL_MENTION_PATTERN, (full, letter: string) => {
    const display = grammarMarkerDisplayLabel(letter);
    return display && display !== letter ? display : full;
  });
}

/**
 * 어법 오답분석 Record 의 라벨 키(A→평문 숫자 "2")와 본문 프로즈(A→①)를 변환.
 * 키를 평문 숫자로 두는 이유: 오답분석 배지가 이미 원형(파란/앰버 원)이라 원형숫자(②)를
 * 넣으면 동그라미-안-동그라미가 된다(다른 유형 배지도 평문 숫자 규약). 배지 원 안의 "2"가
 * 곧 ②로 읽힌다. 프로즈는 ①②로 변환해 사용자 요구(해설에 ① 언급)를 충족한다.
 */
export function circleGrammarWrongOptionExplanations(
  value: Record<string, string> | undefined | null,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? undefined;
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(value)) {
    const index = grammarMarkerIndex(key);
    const newKey = index === null ? key : String(index + 1);
    out[newKey] = circleGrammarLabelMentions(text);
  }
  return out;
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
    formatVocabChoicePassageMarkers(
      formatIrrelevantPassageMarkers(
        formatSentenceInsertPassageMarkers(text, subType),
        subType,
      ),
      subType,
    ),
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
    // 어법 판단(GRAMMAR_ERROR): 지문에는 (A)~(E) 밑줄 마커가 인라인으로 들어가고,
    // 선택지 ①~⑤ 는 그 마커를 참조한다. 빈 문자열을 돌려주면 선택지가 번호만
    // 남고 텍스트가 비어 미리보기에 공란으로 보이는 버그가 생긴다.
    return optionReferenceLabel(index);
  }

  if (subType === "SENTENCE_INSERT") {
    return getCircledNumber(positionMarkerIndex(optionText) ?? index);
  }

  return optionText;
}
