// 국어(한국어 과목) 문제 렌더링/검증에서 쓰는 마커 글리프 상수 모음.
// 영어 파이프라인의 getCircledNumbers/getCircledLetter(question-postprocess/types.ts)
// 컨벤션을 미러링하되, 국어 특유의 원문자 자모(㉠~㉭)·괄호 자모(㈀~㈜)를 추가한다.
// 이 모듈은 의존성 0 — 토크나이저/문장분리기/렌더러가 공통으로 소비한다.

/**
 * 원문자 한글 자모 ㉠~㉭ (U+3260~U+326D, 14자).
 * 국어 내신·수능에서 지문 속 표기 지점을 가리키는 표준 마커.
 * 코드포인트가 연속이므로 인덱스 산술로 안전하게 생성/판정할 수 있다.
 */
export const KO_CIRCLED_JAMO = "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭";

const KO_JAMO_PLAIN = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";

/** 0-기반 인덱스 → 원문자 자모. 범위(0~13) 밖이면 괄호 자모 폴백 `(ㄱ)` 형태. */
export function getCircledJamo(index: number): string {
  if (index >= 0 && index < KO_CIRCLED_JAMO.length) {
    return KO_CIRCLED_JAMO[index];
  }
  const safe = ((Math.floor(index) % KO_JAMO_PLAIN.length) + KO_JAMO_PLAIN.length) % KO_JAMO_PLAIN.length;
  return `(${KO_JAMO_PLAIN[safe]})`;
}

/**
 * 원문자 숫자 ①~⑮ (U+2460~U+246E, 15자).
 * 국어 선지 번호는 ①~⑤가 표준이지만, 지문 내 문장 번호 매김 용도까지 감안해 15까지 노출.
 * (마커 스트립 정규식은 ①~⑳ 전 범위 U+2460~U+2473 을 커버한다 — KO_MARKER_REGEX_SOURCE 참고.)
 */
export const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

/** 0-기반 인덱스 → 원문자 숫자. 범위 밖이면 `(16)` 형태 폴백. */
export function getCircledDigit(index: number): string {
  if (index >= 0 && index < CIRCLED_DIGITS.length) {
    return CIRCLED_DIGITS[index];
  }
  return `(${Math.floor(index) + 1})`;
}

/** 원문자 라틴 소문자 ⓐ~ⓩ (U+24D0~U+24E9, 26자). 어휘·문법 표기 지점 마커. */
export const CIRCLED_LATIN_LOWER = "ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ";

/** 0-기반 인덱스 → 원문자 라틴 소문자. 범위 밖이면 `(a)` 형태 폴백 (26 순환). */
export function getCircledLatin(index: number): string {
  if (index >= 0 && index < CIRCLED_LATIN_LOWER.length) {
    return CIRCLED_LATIN_LOWER[index];
  }
  const safe = ((Math.floor(index) % 26) + 26) % 26;
  return `(${String.fromCharCode(97 + safe)})`;
}

/**
 * 국어 마커 문자클래스 정규식 "소스" — `new RegExp(KO_MARKER_REGEX_SOURCE, "g")` 로 소비.
 * 커버 범위:
 *  - U+2460~U+2473 : 원문자 숫자 ①~⑳
 *  - U+24D0~U+24E9 : 원문자 라틴 소문자 ⓐ~ⓩ
 *  - U+3200~U+321E : 괄호 한글 ㈀~㈜류 (㈀=U+3200, ㈎(가)=U+320E …)
 *  - U+3260~U+327B : 원문자 한글 ㉠~㉭(자모) + ㉮~㉻(가~하 음절)
 * quantifier 없이 문자클래스만 제공 — 렌더러/토크나이저가 각자 g/앵커를 붙인다.
 */
export const KO_MARKER_REGEX_SOURCE =
  "[\\u2460-\\u2473\\u24D0-\\u24E9\\u3200-\\u321E\\u3260-\\u327B]";

/** 텍스트에서 국어 마커 글리프를 전부 제거한다 (마커에 붙은 조사/구두점은 건드리지 않음). */
export function stripKoMarkers(text: string): string {
  if (!text) return "";
  return text.replace(new RegExp(KO_MARKER_REGEX_SOURCE, "g"), "");
}

/** 단일 문자가 국어 마커 글리프인지 판정한다 (다문자 입력은 첫 코드포인트만 본다). */
export function isKoMarkerChar(ch: string): boolean {
  if (!ch) return false;
  return new RegExp(`^${KO_MARKER_REGEX_SOURCE}$`).test(ch.charAt(0));
}
