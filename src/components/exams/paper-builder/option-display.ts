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

// 오답 분석(선지별 해설) 렌더 여부 — 선지 목록이 있는 문항 + 마커 유형.
// 마커 유형(어법·무관문장·문장삽입·어휘선택)은 선지 목록을 억제하지만 라벨이
// 지문 속 마커(①~⑤ 등)로 실재하므로 오답 분석은 유효하다. 기존 hasOptions
// 단독 게이트가 이 4유형의 오답 분석을 웹/DOCX/HWPX 전 경로에서 통째로
// 누락시키던 실측 버그(26-07-06)의 공용 수정 지점.
export function shouldRenderWrongAnalysisForSubtype(
  subType: string | null | undefined,
  hasOptions: boolean,
) {
  return hasOptions || PASSAGE_MARKER_ONLY_SUBTYPES.has(subType || "");
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

// 밑줄 마커 라벨 정규화 — "__(A) word__" 의 (A) 를 수능 표준 ① 로 바꾼다.
// 어휘 적절성·반의어가 공유한다(후처리가 저장하는 내부 축은 (A)~(J) 이고,
// 학생 표면 축은 ①~⑩ 이라는 계약 — 어법 formatGrammarUnderlineContent 와 동형).
function formatLetterLabeledUnderlineContent(content: string): string {
  const match = content.match(/^\s*\(([A-Ja-j])\)\s+(.+)$/);
  if (!match) return content;

  const markerIndex = letterMarkerIndex(match[1]);
  return markerIndex === null ? content : `${getCircledNumber(markerIndex)} ${match[2].trim()}`;
}

function formatVocabChoiceUnderlineContent(content: string): string {
  return formatLetterLabeledUnderlineContent(content);
}

/**
 * 반의어(ANTONYM) 선지 텍스트에서 중복 라벨을 벗긴다.
 * 후처리(processAntonym)는 선지를 `{label:"1", text:"(A) word - antonym"}` 로 저장한다 —
 * 표면에서는 optionDisplayLabel 이 이미 ①~⑤ 를 붙이므로 "(A)" 가 남으면 라벨이 두 번
 * 보인다(사용자 실사용 신고 26-07-26). 저장 형상은 그대로 두고 표시에서만 벗긴다.
 */
export function stripAntonymOptionLabel(optionText: string): string {
  return optionText.replace(/^\s*\(([A-Ja-j])\)\s+/, "");
}

export function formatAntonymPassageMarkers(
  text: string,
  subType: string | null | undefined,
) {
  if (subType !== "ANTONYM") return text;
  return text.replace(/__([^_]+)__/g, (full, content: string) => {
    const formatted = formatLetterLabeledUnderlineContent(content);
    return formatted === content ? full : `__${formatted}__`;
  });
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
  return formatAntonymPassageMarkers(
    formatGrammarErrorPassageMarkers(
      formatVocabChoicePassageMarkers(
        formatIrrelevantPassageMarkers(
          formatSentenceInsertPassageMarkers(text, subType),
          subType,
        ),
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

// ── 다중 빈칸(BLANK_INFERENCE) 조합 선지 표시 변환 ──────────────────────────
// 저장 계약(question-postprocess/processors/blank-inference.ts): 다중 빈칸 선지는
// text = blankValues.join(" …… "), blankValues: string[2~3], 지문 마커는 "(A) _____".
// 표시 계약(실제 수능 조합 선지 형식): 선지 목록 "위 한 줄"에 (A)/(B)/(C) 컬럼
// 헤더를 얹고 각 선지는 값만 컬럼 정렬로 보여준다 — HTML 표면은 그리드
// (multi-blank-option-grid.tsx), 텍스트 표면(DOCX/HWPX/클립보드)은 헤더 라인 또는
// 인라인 라벨 근사. 저장 데이터는 불변, 표시 시점 변환만(어법 (A)→① 원칙과 동일).
// 단일 빈칸 선지(" …… " 미포함)는 어떤 표면에서도 그대로 통과한다.
export const MULTI_BLANK_VALUE_SEPARATOR = " …… ";
/** 표시용 컬럼 구분 기호(값 사이 "……" — 공백 없는 표시형) */
export const MULTI_BLANK_DISPLAY_SEPARATOR = "……";
const MULTI_BLANK_SPLIT_PATTERN = /\s*……\s*/;
const MULTI_BLANK_VALUE_LABELS = ["(A)", "(B)", "(C)", "(D)", "(E)"] as const;
// 이미 (A)~(E) 라벨이 붙은 값(레거시/이중 변환 방어)은 재라벨하지 않는다.
const MULTI_BLANK_ALREADY_LABELED_PATTERN = /^\([A-Ea-e]\)/;

/** 다중 빈칸 값 라벨 — 지문 마커("(A) _____")와 동일한 (A)(B)(C) 축 */
export function multiBlankValueLabel(index: number): string {
  return MULTI_BLANK_VALUE_LABELS[index] ?? `(${index + 1})`;
}

/**
 * 다중 빈칸 조합 선지의 값 배열 추출 — blankValues(저장 원본)가 있으면 우선,
 * 없으면 text 를 " …… " 로 split 하는 폴백(표시 표면 다수가 {label,text}만 들고
 * 다니므로 폴백이 실질 경로다). 값이 2개 미만이면 null(단일 빈칸 — 무변환 신호).
 */
export function multiBlankOptionValues(
  optionText: string,
  blankValues?: unknown,
): string[] | null {
  if (Array.isArray(blankValues)) {
    const values = blankValues
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim());
    if (values.length >= 2) return values;
  }
  const parts = optionText
    .split(MULTI_BLANK_SPLIT_PATTERN)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return parts.length >= 2 ? parts : null;
}

/**
 * 다중 빈칸 인라인 표시형(텍스트 표면 전용 — 클립보드 등 흐름 텍스트에서 컬럼
 * 정렬이 불가능할 때의 근사): "값1 …… 값2" → "(A) 값1 …… (B) 값2[ …… (C) 값3]".
 * HTML 표면은 이 함수를 쓰지 말 것 — 컬럼 헤더 그리드(multi-blank-option-grid)가 계약.
 */
export function formatMultiBlankOptionText(
  optionText: string,
  blankValues?: unknown,
): string {
  const values = multiBlankOptionValues(optionText, blankValues);
  if (!values) return optionText;
  if (values.some((v) => MULTI_BLANK_ALREADY_LABELED_PATTERN.test(v))) {
    return optionText;
  }
  return values
    .map((value, index) => `${multiBlankValueLabel(index)} ${value}`)
    .join(MULTI_BLANK_VALUE_SEPARATOR);
}

/** 다중 빈칸 컬럼 헤더 라벨 목록 — ["(A)", "(B)", ...] */
export function multiBlankHeaderLabels(blankCount: number): string[] {
  return Array.from({ length: blankCount }, (_, i) => multiBlankValueLabel(i));
}

export interface MultiBlankOptionMatrix<T> {
  /** 컬럼 수(선지들 값 개수의 최댓값, 2~) */
  blankCount: number;
  /** 선지 순서 그대로 — values 는 blankCount 로 패딩(부족분 "") */
  rows: Array<{ option: T; values: string[] }>;
}

/**
 * 선지 목록 전체가 다중 빈칸 조합 선지일 때만 컬럼 행렬을 돌려준다(아니면 null —
 * 단일 빈칸/타 유형은 무변환 신호). 컬럼 헤더 방식 렌더의 공용 게이트:
 * 모든 표면이 이 판정을 공유해 "일부 선지만 그리드"가 되는 표면 분기를 막는다.
 */
export function multiBlankOptionMatrix<
  T extends { text?: unknown; blankValues?: unknown },
>(options: readonly T[]): MultiBlankOptionMatrix<T> | null {
  if (options.length === 0) return null;
  const rows: Array<{ option: T; values: string[] }> = [];
  for (const option of options) {
    const text = typeof option.text === "string" ? option.text : "";
    const values = multiBlankOptionValues(text, option.blankValues);
    if (!values) return null;
    rows.push({ option, values });
  }
  const blankCount = Math.max(...rows.map((row) => row.values.length));
  for (const row of rows) {
    while (row.values.length < blankCount) row.values.push("");
  }
  return { blankCount, rows };
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

  if (subType === "ANTONYM") {
    // 지문 밑줄이 ①~⑤ 로 표시되므로 선지에 남은 "(A)" 접두는 중복 라벨이다.
    return stripAntonymOptionLabel(optionText);
  }

  // BLANK_INFERENCE 다중 빈칸은 여기서 변환하지 않는다 — HTML 표면은 컬럼 헤더
  // 그리드(multiBlankOptionMatrix + multi-blank-option-grid), 텍스트 표면은 각자
  // 명시적으로 헤더 라인/인라인 근사를 선택한다(숨은 일괄 변환 금지).
  return optionText;
}
