// ============================================================================
// 통합 시험 채점 — 정규화 유틸(순수)
//
// 함정(정찰 확정): 정답 라벨 표기가 유형별로 3중 불일치 — 숫자("1".."12") /
// 원형숫자(①~⑫) / 괄호문자((a)~(e), (A)~(J)). 게다가 exam-report 의
// normalizeChoiceToken 은 1~5 전용이라 어법(5~10지)·내용일치(5~12지)를 못 다룬다.
// 여기의 확장 정규화기가 채점 축의 정본이다(1~5 범위에서는 기존과 동일 결과).
// ============================================================================

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

/**
 * 선지 토큰 → 정규화 숫자 문자열("1".."15") | undefined.
 * 허용 입력: "3" / "③" / "(3)" / "(C)" / "C" / "c." / "(c)" / " ③ " 등.
 * 문자 라벨은 알파벳 순서를 선지 인덱스로 매핑(A→1 … L→12) — 어법 (A)~(J)·
 * 어휘 (a)~(e) 라벨이 순서 부여형이라는 스키마 계약에 근거한다.
 */
export function normalizeChoiceTokenExtended(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (raw.length === 0) return undefined;

  // 원형 숫자 (문자열 어디에 있든 첫 발견 기준 — "정답 ③" 류 흡수)
  for (const ch of raw) {
    const idx = CIRCLED_DIGITS.indexOf(ch);
    if (idx >= 0) return String(idx + 1);
  }

  // 순수 숫자(1~15) — "3", "(3)", "12." 등
  const numMatch = raw.match(/^\(?\s*(1[0-5]|[1-9])\s*\)?\.?$/);
  if (numMatch) return numMatch[1];

  // 단일 알파벳 라벨 — "(A)", "a", "C." 등 → 인덱스 숫자
  const letterMatch = raw.match(/^\(?\s*([A-La-l])\s*\)?\.?$/);
  if (letterMatch) {
    return String(letterMatch[1].toUpperCase().charCodeAt(0) - 64);
  }

  // 문자열 중 첫 숫자 폴백(기존 normalizeChoiceToken 의 1~5 동작 상위호환)
  const digitAnywhere = raw.match(/1[0-5]|[1-9]/);
  return digitAnywhere ? digitAnywhere[0] : undefined;
}

/**
 * 표시용 라벨 통일(SF2) — 선지 라벨 원문("1" | "③" | "(A)" | "(c)" 등)을
 * 원형 숫자(①~⑮)로 정규화한다. 응시면(/t) 선지 버튼의 **표시 전용** 축 —
 * 값(저장 토큰)은 건드리지 않는다. 정규화 불가한 특수 라벨은 undefined 를
 * 반환하고 호출부가 원문을 유지한다(방어).
 */
export function circledChoiceLabel(value: unknown): string | undefined {
  const token = normalizeChoiceTokenExtended(value);
  if (token == null) return undefined;
  return CIRCLED_DIGITS[Number(token) - 1];
}

/** 복수 정답 소스("2, 4" | ["②","④"] | "(A), (C)") → 정규화 숫자 토큰 배열(중복 제거·정렬) */
export function normalizeChoiceList(value: unknown): string[] {
  const parts: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,、·/]+/)
      : value == null
        ? []
        : [value];
  const tokens = parts
    .map((p) => normalizeChoiceTokenExtended(p))
    .filter((t): t is string => t != null);
  return [...new Set(tokens)].sort((a, b) => Number(a) - Number(b));
}

/**
 * 서답형 텍스트 비교 정규화 — 트림·다중공백 축약·소문자·스마트따옴표 통일·
 * 말단 구두점(.,!?;:) 제거. 철자 자체는 보존(관대 비교는 LEMMA/variants 로).
 */
export function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,!?;:]+$/g, "")
    .trim()
    .toLowerCase();
}

/** LEMMA 판정용 소문자 단어 토큰화(아포스트로피 보존 — don't 등) */
export function tokenizeWords(value: unknown): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 0);
}

/** 부동소수 잔여 제거 2자리 반올림 — exam-report grading.round2 와 동일 규칙 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
