// ============================================================================
// 국어(한국어) 텍스트 유틸리티 — KO 버티컬 전용
// ============================================================================
// 영어 파이프라인의 question-quality/core.ts 텍스트 헬퍼(라틴 토크나이저·\b 경계·
// 영어 불용어)는 한글에서 거짓음성(무발화)을 내므로, KO 검증기·세트·렌더모델은
// 반드시 이 모듈만 사용한다. 외부 형태소 분석기 의존성 없이 순수 TS 로 구현한다.
// (KO-DESIGN-SPEC §7 — 대원칙 3)
//
// 역할 분담: 이 모듈은 정규화 기반(공백 유연) 검증·렌더 유틸이다. 세트 누수스캔
// 처럼 **원문 오프셋 보존** 스팬이 필요한 소비자는 ../text/ko-sentence-splitter.ts
// (text.slice(start,end)===sentence.text 계약)를 사용할 것.
// ============================================================================

/** NFC 정규화 + 제로폭 문자 제거. 개행은 보존한다(시·희곡 행 구분). */
export function normalizeKo(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ 	 　]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/** 산문용 공백 정규화 — 개행까지 공백 1개로 접는다(어절 카운트·발문/어미 검사용). */
function canonical(text: string): string {
  return normalizeKo(text).replace(/\s+/g, " ").trim();
}

/**
 * 스팬 포함 판정 전용 폼 — **공백을 전부 제거**한다(whitespace-agnostic).
 *
 * 공백 1칸 접기(canonical)로는 PDF 붙여넣기 지문을 못 다룬다: 인쇄물의 한글
 * 줄바꿈은 임의 글자 경계에서 일어나 원문에 공백이 없는 자리에 개행이 박힌다
 * (실측: 지문 "조정\n(朝廷)의" vs 모델 인용 "조정(朝廷)의" → 전 근거 verbatim
 * 실패로 생성 0건). 한글 verbatim 판정의 올바른 정의는 "공백을 무시한 문자
 * 시퀀스 일치"다 — 조사·어미 변형은 여전히 불허(문자가 달라지므로).
 * ⚠️ containsSpanKo/findSpanKo 외 용도로 쓰지 말 것(어절·발문 검사는 canonical).
 */
function squash(text: string): string {
  return normalizeKo(text).replace(/\s+/g, "");
}

export function isHangulChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0xac00 && code <= 0xd7a3) || // 완성형 음절
    (code >= 0x1100 && code <= 0x11ff) || // 자모
    (code >= 0x3130 && code <= 0x318f) // 호환 자모
  );
}

/** 어절 수 (공백 구분 단위 — 국어 분량 게이트의 기본 척도). */
export function eojeolCount(text: string): number {
  const t = canonical(text);
  if (!t) return 0;
  return t.split(" ").length;
}

/** 공백 제외 글자 수 (국어 지문 길이 관행은 '자' 단위). */
export function charCountKo(text: string): number {
  return canonical(text).replace(/ /g, "").length;
}

// ---------------------------------------------------------------------------
// 문장 분리
// ---------------------------------------------------------------------------
// 종결부호(. ! ? … ‥) 뒤 공백에서 자르되, 따옴표·괄호 내부에서는 자르지 않는다.
// 닫는 따옴표/괄호가 종결부호 직후에 오면 문장에 포함시킨다.
// 예) 그는 "안 돼."라고 말했다.  → 1문장
//     배는 갔다. "어디로?" 아무도 모른다. → 3문장

const OPENERS: Record<string, string> = {
  "“": "”", // “ ”
  "‘": "’", // ‘ ’
  '"': '"',
  "'": "'",
  "(": ")",
  "[": "]",
  "{": "}",
  "《": "》", // 《 》
  "〈": "〉", // 〈 〉
  "「": "」", // 「 」
  "『": "』", // 『 』
};
const CLOSERS = new Set(Object.values(OPENERS));
const TERMINALS = new Set([".", "!", "?", "…", "‥"]);

/**
 * 산문 문장 분리. 시·시가처럼 종결부호 없는 행 중심 텍스트는
 * splitLinesKo 를 사용할 것 (호출자가 갈래로 판단).
 */
export function splitSentencesKo(text: string): string[] {
  const src = normalizeKo(text).replace(/\n/g, " ");
  const sentences: string[] = [];
  const stack: string[] = [];
  let start = 0;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (stack.length > 0 && ch === stack[stack.length - 1]) {
      stack.pop();
      i += 1;
      continue;
    }
    if (OPENERS[ch] !== undefined) {
      // 곧은 따옴표는 여닫이가 같은 글자 — 스택 최상단과 다를 때만 연다.
      stack.push(OPENERS[ch]);
      i += 1;
      continue;
    }
    if (stack.length === 0 && TERMINALS.has(ch)) {
      // 연속 종결부호(?!, …. 등)와 바로 뒤따르는 닫는 부호를 문장에 흡수
      let end = i + 1;
      while (end < src.length && (TERMINALS.has(src[end]) || CLOSERS.has(src[end]))) end += 1;
      const isBoundary = end >= src.length || src[end] === " ";
      if (isBoundary) {
        const sentence = src.slice(start, end).trim();
        if (sentence) sentences.push(sentence);
        start = end;
        i = end;
        continue;
      }
    }
    i += 1;
  }
  const tail = src.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** 운문(시·시가·시조)용 행 분리 — 빈 행은 연 구분으로 버린다. */
export function splitLinesKo(text: string): string[] {
  return normalizeKo(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 스팬 포함·위치 판정 (근거앵커·마커·인용 verbatim 게이트의 심장)
// ---------------------------------------------------------------------------

/**
 * 공백 유연 verbatim 포함 판정. 지문·스팬 모두 캐노니컬 폼으로 접은 뒤 부분 문자열
 * 검사한다. 조사·어미 변형은 허용하지 않는다(verbatim 게이트의 목적상 의도적 엄격).
 */
export function containsSpanKo(passage: string, span: string): boolean {
  const p = squash(passage);
  const s = squash(span);
  if (!s) return false;
  return p.includes(s);
}

export interface KoSpanMatch {
  /** 캐노니컬 폼 기준 시작 인덱스 */
  index: number;
  /** 원문(normalizeKo 폼) 기준 시작·끝 인덱스 */
  sourceStart: number;
  sourceEnd: number;
  /** 원문에서 실제로 매칭된 슬라이스 (개행 포함 가능) */
  sourceText: string;
  /** 전체 등장 횟수 */
  occurrenceTotal: number;
}

/**
 * 스팬의 n번째 등장 위치를 원문 좌표로 해소한다. 마킹지문 빌더·마커 검증이 사용.
 * 공백/개행 차이를 허용하기 위해 원문→캐노니컬 좌표 매핑을 유지한다.
 * 실패 시 null (검증 게이트가 KOQ_MARKER_UNRESOLVED 로 차단).
 */
export function findSpanKo(
  passage: string,
  span: string,
  occurrenceIndex = 0,
): KoSpanMatch | null {
  const source = normalizeKo(passage);
  const target = squash(span);
  if (!target) return null;

  // 원문 인덱스 → 캐노니컬 인덱스 매핑을 만들며 캐노니컬 문자열 구성.
  // squash() 와 동일하게 공백을 전부 건너뛴다(whitespace-agnostic) — PDF
  // 붙여넣기 지문의 단어-중간 개행("조정\n(朝廷)")에서도 스팬이 해소된다.
  const canonChars: string[] = [];
  const sourceIndexOfCanon: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === " " || ch === "\n") continue;
    canonChars.push(ch);
    sourceIndexOfCanon.push(i);
  }
  const canon = canonChars.join("");

  const occurrences: number[] = [];
  let from = 0;
  for (;;) {
    const idx = canon.indexOf(target, from);
    if (idx === -1) break;
    occurrences.push(idx);
    from = idx + 1;
  }
  if (occurrences.length === 0) return null;
  const picked = occurrences[Math.min(occurrenceIndex, occurrences.length - 1)];
  const sourceStart = sourceIndexOfCanon[picked];
  const lastCanonIdx = picked + target.length - 1;
  const sourceEndIdx = sourceIndexOfCanon[lastCanonIdx];
  const sourceEnd = sourceEndIdx + 1;
  return {
    index: picked,
    sourceStart,
    sourceEnd,
    sourceText: source.slice(sourceStart, sourceEnd),
    occurrenceTotal: occurrences.length,
  };
}

/** 스팬이 지문에서 유일하게 등장하는지 (KO_NS_EXTRACT 유일성 게이트). */
export function isUniqueSpanKo(passage: string, span: string): boolean {
  const match = findSpanKo(passage, span, 0);
  return match !== null && match.occurrenceTotal === 1;
}

/** 두 스팬 매치의 원문 구간이 겹치는지 (마커 중첩 금지 게이트). */
export function spansOverlap(a: KoSpanMatch, b: KoSpanMatch): boolean {
  return a.sourceStart < b.sourceEnd && b.sourceStart < a.sourceEnd;
}

// ---------------------------------------------------------------------------
// 발문·선지 문법 판정 헬퍼 (KOQ_DIRECTION_GRAMMAR / KOQ_OPTION_ENDING)
// ---------------------------------------------------------------------------

// '반영되지 않은' — KO_SP_PLAN(발표 계획 반영) 정격 발문. 미등록 시 공통 게이트가
// 해당 유형의 정격 발문을 ko-direction-grammar(error) 로 오차단한다(A4-조립 해소).
const NEGATIVE_STEM_RE =
  /(적절하지\s*않은|일치하지\s*않는|알맞지\s*않은|옳지\s*않은|반영되지\s*않은|없는)\s*것은\?/;
const POSITIVE_STEM_RE = /가장\s*적절한\s*것은\?/;

/** 발문이 부정발문인가 (렌더의 자동 밑줄 + 검증 게이트 공용). */
export function isNegativeStemKo(direction: string): boolean {
  return NEGATIVE_STEM_RE.test(canonical(direction));
}

/** 발문이 규약("~것은?" 종결, 긍정은 '가장 적절한' 헤지)을 지키는가. */
export function stemGrammarIssueKo(direction: string): string | null {
  const d = canonical(direction);
  if (!/(것은\?|시오\.|쓰시오\.|서술하시오\.|완성하시오\.)$/.test(d)) {
    return "발문은 '~것은?' 또는 '~하시오.' 로 종결해야 합니다";
  }
  if (d.endsWith("것은?") && !NEGATIVE_STEM_RE.test(d) && !POSITIVE_STEM_RE.test(d)) {
    return "긍정발문은 '가장 적절한 것은?' 형태(정답 유일성 헤지)여야 합니다";
  }
  return null;
}

/** 부정어('않은/않는/없는')에 밑줄 마크업(__ __)을 삽입한 발문을 돌려준다. */
export function underlineNegativeStemKo(direction: string): string {
  return direction.replace(
    /(적절하지 않은|일치하지 않는|알맞지 않은|옳지 않은|않은|않는|없는)/,
    "__$1__",
  );
}

/** 선지 어미가 허용 집합과 호응하는지. kind 는 유형 모듈이 선언. */
export type KoOptionEnding = "plain" | "appreciation" | "strategy" | "any";
export function optionEndingIssueKo(text: string, kind: KoOptionEnding): string | null {
  if (kind === "any") return null;
  const t = canonical(text).replace(/['"’”」』)\]]+$/, "");
  if (kind === "appreciation") {
    return /(겠군|군)\.?$/.test(t) ? null : "감상·적용형 선지는 '~군/~겠군' 으로 끝나야 합니다";
  }
  if (kind === "strategy") {
    return /(고 있다|고 있음)\.?$/.test(t) ? null : "전략·특징형 선지는 '~하고 있다' 로 끝나야 합니다";
  }
  return /(다|음|것)\.?$/.test(t) ? null : "사실형 선지는 평서형('~다')으로 끝나야 합니다";
}

/** 선지에서 작은따옴표 인용(‘…’/'…')을 추출한다 (verbatim 게이트 대상). */
export function extractQuotedSpansKo(text: string): string[] {
  // 내용 {2,80} 정규식은 1자 인용('이', 'ㅣ' 등 문법·국어사 선지 관행)을 짝으로
  // 소비하지 못해, 닫는따옴표가 다음 인용의 여는따옴표와 오짝지어지고 그 사이
  // 평문이 인용으로 오검출됐다(26-07-03 KO_GR_HIST 실측: '에 주격 조사').
  // 따옴표를 등장 순서대로 짝지어 소비하고, 반환만 기존과 동일하게 2~80자로
  // 제한한다 — 소비자별 길이 필터 semantics 불변.
  const positions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === "‘" || ch === "’") positions.push(i);
  }
  const spans: string[] = [];
  for (let k = 0; k + 1 < positions.length; k += 2) {
    const inner = text.slice(positions[k] + 1, positions[k + 1]);
    if (inner.length >= 2 && inner.length <= 80) spans.push(inner.trim());
  }
  return spans;
}
