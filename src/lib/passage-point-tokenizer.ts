// ============================================================================
// 포인트 짚어주기 — 지문 토큰화 (문장/단어 분해 + 원본 문자 오프셋 보존)
// ============================================================================
// 순수 모듈(React·DOM·서버 의존 0): 클라 렌더(PassagePointPicker)와 서버 축자
// 재앵커링(run-question-generation)이 공유한다. v1 영어 지문 한정.
//
// passage-sentence-utils 의 splitPassageSentences 는 공백을 정규화(\s+ → " ")해
// 원본 오프셋이 유실되므로 재사용하지 않는다. 종결부호·닫는 인용부호 규칙은
// 그쪽과 동일하게 유지하되, 여기에 약어(Dr./e.g./U.S.)·소수점·인용부호 가드를
// 추가한다.
//
// 계약(모든 소비자가 의존하는 불변식):
// - 모든 오프셋은 지문 전체 기준 [start, end) 이며 항상
//   passage.slice(start, end) === text 가 성립한다(축자).
// - TokenizedPassage.segments 의 text 를 순서대로 이어붙이면 원문과 100% 동일
//   하다(공백/구두점은 kind:"gap" 세그먼트로 보존 — 렌더 시 선택 불가 처리).
// ============================================================================

/** 선택 가능한 단어 토큰. */
export interface PointToken {
  kind: "word";
  /** passage.slice(start, end) 와 동일한 축자 텍스트 */
  text: string;
  /** 지문 전체 기준 시작 오프셋(포함) */
  start: number;
  /** 지문 전체 기준 끝 오프셋(불포함) */
  end: number;
  /** 소속 문장 인덱스(0-base) */
  sentenceIndex: number;
  /** 문장 내 단어 순번(0-base) */
  wordIndex: number;
}

/** 토큰 사이의 공백/구두점 — 선택 불가, 원문 재구성용으로만 렌더한다. */
export interface PointGap {
  kind: "gap";
  text: string;
  start: number;
  end: number;
  /** 소속 문장 인덱스. 문장 사이/지문 가장자리 공백은 -1 */
  sentenceIndex: number;
}

export type PointSegment = PointToken | PointGap;

export interface PointSentence {
  /** 문장 인덱스(0-base) — TeacherPoint.sentenceIndex 와 동일 좌표계 */
  index: number;
  /** passage.slice(start, end) 와 동일(앞뒤 공백 제외, 닫는 인용부호 포함) */
  text: string;
  start: number;
  end: number;
  /** 단어 토큰만(gap 제외) */
  tokens: PointToken[];
  /** 단어+gap 전체 — text 를 이어붙이면 문장 원문과 동일 */
  segments: PointSegment[];
}

export interface TokenizedPassage {
  /** 원문 그대로(무가공) */
  text: string;
  sentences: PointSentence[];
  /** 지문 전체 세그먼트(문장 사이 공백 포함) — 이어붙이면 원문과 동일 */
  segments: PointSegment[];
}

/** 단어 경계로 스냅된 선택 범위. text 는 지문 축자 슬라이스. */
export interface SnappedRange {
  sentenceIndex: number;
  start: number;
  end: number;
  text: string;
  /** 범위에 포함된 단어 토큰 수(1=word, 2+=phrase 판단에 사용) */
  wordCount: number;
}

// ---------------------------------------------------------------------------
// 문자 분류
// ---------------------------------------------------------------------------

const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
// 이니셜/약어 진행형: "U", "U.S", "e.g" 등 (글자.글자... 꼴)
const INITIALS_RE = /^(?:\p{L}\.)*\p{L}$/u;
// 다음 문장의 시작으로 인정하는 문자: 대문자/숫자/여는 인용부호·괄호
const OPENER_RE = /["'(\[“‘\p{Lu}\p{N}]/u;
// 종결부호 뒤에 문장 안쪽으로 붙는 닫는 인용부호/괄호 (splitPassageSentences 와 동일 집합)
const CLOSER_CHARS = "”’'\")]";
const TERMINATOR_CHARS = ".!?…";

// 마침표가 와도 문장을 끝내지 않는 약어(호칭·라틴 연결어 등)
const NEVER_END_ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rev", "hon", "st", "mt", "sr", "jr",
  "vs", "cf", "ca", "approx", "dept", "univ", "e.g", "i.e", "eg", "ie",
]);
// 뒤에 숫자가 올 때만 약어로 취급("No. 3", "Fig. 2", "Jan. 2020" — 그 외 일반 단어)
const NUMBER_REF_ABBREVIATIONS = new Set([
  "no", "fig", "figs", "vol", "vols", "pp", "ch", "sec",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);
// 문장 종결 여부는 뒤 어절로 판단하되, 마침표는 토큰에 흡수하는 약어
const MAYBE_END_ABBREVIATIONS = new Set([
  "etc", "al", "inc", "ltd", "co", "corp",
]);
const DOT_ABSORB_ABBREVIATIONS = new Set([
  ...NEVER_END_ABBREVIATIONS,
  ...MAYBE_END_ABBREVIATIONS,
]);

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && isWhitespace(text[i])) i++;
  return i;
}

// ---------------------------------------------------------------------------
// 문장 분해 (원본 오프셋 보존)
// ---------------------------------------------------------------------------

/** 마침표 직전의 어절을 뒤로 걸어가며 추출한다("U.S" 처럼 내부 점 포함). */
function wordBeforeDot(text: string, dotIdx: number): string {
  let s = dotIdx;
  while (s > 0) {
    const c = text[s - 1];
    if (WORD_CHAR_RE.test(c)) {
      s--;
      continue;
    }
    // 내부 점(글자.글자)은 어절의 일부로 계속 소급
    if (c === "." && s - 1 > 0 && WORD_CHAR_RE.test(text[s - 2])) {
      s--;
      continue;
    }
    break;
  }
  return s < dotIdx ? text.slice(s, dotIdx) : "";
}

/** 단독 마침표가 문장 종결일 수 있는지 — 소수점/이니셜/약어 가드. */
function canPeriodEndSentence(text: string, dotIdx: number): boolean {
  const prev = dotIdx > 0 ? text[dotIdx - 1] : "";
  const next = dotIdx + 1 < text.length ? text[dotIdx + 1] : "";
  // 소수점·자릿수 구분(3.14, 1.000)
  if (isDigit(prev) && isDigit(next)) return false;
  const word = wordBeforeDot(text, dotIdx);
  if (!word) return true;
  // 이니셜/축약("J.", "U.S.", "e.g.") — 문장 끝 위치의 오검출보다 병합이 안전
  if (INITIALS_RE.test(word)) return false;
  const lower = word.toLowerCase();
  if (NEVER_END_ABBREVIATIONS.has(lower)) return false;
  if (NUMBER_REF_ABBREVIATIONS.has(lower)) {
    const n = skipWhitespace(text, dotIdx + 1);
    if (n < text.length && isDigit(text[n])) return false;
  }
  return true;
}

interface SentenceRange {
  start: number;
  end: number;
}

/**
 * 지문을 문장 범위로 분해한다. 종결 확정 조건: 종결부호(연속 포함) + 닫는
 * 인용부호 소비 후, 지문 끝이거나 공백 뒤 다음 어절이 문장 시작형(대문자/
 * 숫자/여는 인용부호)일 때. 소문자가 이어지면 병합한다("Stop!" she said. 가드).
 */
function splitSentenceRanges(text: string): SentenceRange[] {
  const ranges: SentenceRange[] = [];
  const len = text.length;
  let sentStart = skipWhitespace(text, 0);
  let i = sentStart;
  while (i < len) {
    const ch = text[i];
    if (!TERMINATOR_CHARS.includes(ch)) {
      i++;
      continue;
    }
    // 연속 종결부호("...", "?!")를 한 덩어리로 소비
    let j = i + 1;
    while (j < len && TERMINATOR_CHARS.includes(text[j])) j++;
    // 단독 마침표만 소수점/약어 가드 대상(말줄임은 뒤 어절 조건으로만 판단)
    if (ch === "." && j === i + 1 && !canPeriodEndSentence(text, i)) {
      i = j;
      continue;
    }
    // 닫는 인용부호/괄호를 문장 안쪽에 포함
    let k = j;
    while (k < len && CLOSER_CHARS.includes(text[k])) k++;
    if (k >= len) {
      ranges.push({ start: sentStart, end: k });
      sentStart = k;
      i = k;
      continue;
    }
    // 종결부호 직후에 공백이 없으면 문장 경계가 아님("3.b" 등 방어)
    if (!isWhitespace(text[k])) {
      i = k;
      continue;
    }
    const n = skipWhitespace(text, k);
    if (n < len && !OPENER_RE.test(text[n])) {
      i = k;
      continue;
    }
    ranges.push({ start: sentStart, end: k });
    sentStart = n;
    i = n;
  }
  // 종결부호 없이 끝나는 잔여 텍스트도 문장으로 취급
  if (sentStart < len) {
    let e = len;
    while (e > sentStart && isWhitespace(text[e - 1])) e--;
    if (e > sentStart) ranges.push({ start: sentStart, end: e });
  }
  return ranges;
}

// ---------------------------------------------------------------------------
// 단어 토큰화 (문장 내부, gap 세그먼트 동시 산출)
// ---------------------------------------------------------------------------

/** 토큰 진행 중 만난 점이 단어 내부인지 — 소수점 또는 이니셜 연쇄(U.S). */
function isInternalDot(passage: string, tokenStart: number, dotIdx: number): boolean {
  if (isDigit(passage[dotIdx - 1]) && isDigit(passage[dotIdx + 1])) return true;
  return INITIALS_RE.test(passage.slice(tokenStart, dotIdx));
}

/** 토큰 종료 직후의 마침표를 토큰에 흡수할지("Dr." / "U.S." / "No. 3"). */
function shouldAbsorbDot(
  passage: string,
  tokenStart: number,
  dotIdx: number,
  sentenceEnd: number,
): boolean {
  const word = passage.slice(tokenStart, dotIdx);
  if (INITIALS_RE.test(word)) return true;
  const lower = word.toLowerCase();
  if (DOT_ABSORB_ABBREVIATIONS.has(lower)) return true;
  if (NUMBER_REF_ABBREVIATIONS.has(lower)) {
    const n = skipWhitespace(passage, dotIdx + 1);
    return n < sentenceEnd && isDigit(passage[n]);
  }
  return false;
}

function makeGap(passage: string, start: number, end: number, sentenceIndex: number): PointGap {
  return { kind: "gap", text: passage.slice(start, end), start, end, sentenceIndex };
}

function tokenizeSentence(
  passage: string,
  index: number,
  start: number,
  end: number,
): PointSentence {
  const tokens: PointToken[] = [];
  const segments: PointSegment[] = [];
  let gapStart = start;
  let i = start;
  while (i < end) {
    if (!WORD_CHAR_RE.test(passage[i])) {
      i++;
      continue;
    }
    if (i > gapStart) segments.push(makeGap(passage, gapStart, i, index));
    const tokenStart = i;
    i++;
    while (i < end) {
      const c = passage[i];
      if (WORD_CHAR_RE.test(c)) {
        i++;
        continue;
      }
      const nextIsWord = i + 1 < end && WORD_CHAR_RE.test(passage[i + 1]);
      // 아포스트로피/하이픈은 양쪽이 단어 문자일 때만 내부("don't", "well-known")
      if ((c === "'" || c === "’" || c === "-") && nextIsWord) {
        i++;
        continue;
      }
      if (c === "." && nextIsWord && isInternalDot(passage, tokenStart, i)) {
        i++;
        continue;
      }
      break;
    }
    if (i < end && passage[i] === "." && shouldAbsorbDot(passage, tokenStart, i, end)) i++;
    const token: PointToken = {
      kind: "word",
      text: passage.slice(tokenStart, i),
      start: tokenStart,
      end: i,
      sentenceIndex: index,
      wordIndex: tokens.length,
    };
    tokens.push(token);
    segments.push(token);
    gapStart = i;
  }
  if (gapStart < end) segments.push(makeGap(passage, gapStart, end, index));
  return { index, text: passage.slice(start, end), start, end, tokens, segments };
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 지문을 문장/단어 토큰으로 분해한다. 반환값의 segments 를 순서대로 렌더하면
 * 원문이 100% 재구성된다(문장 사이 공백은 sentenceIndex:-1 gap).
 */
export function tokenizePassage(passage: string): TokenizedPassage {
  const ranges = splitSentenceRanges(passage);
  const sentences: PointSentence[] = [];
  const segments: PointSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push(makeGap(passage, cursor, range.start, -1));
    const sentence = tokenizeSentence(passage, sentences.length, range.start, range.end);
    sentences.push(sentence);
    for (const segment of sentence.segments) segments.push(segment);
    cursor = range.end;
  }
  if (cursor < passage.length) segments.push(makeGap(passage, cursor, passage.length, -1));
  return { text: passage, sentences, segments };
}

/**
 * 임의 문자 범위 [start, end) 를 단어 경계로 스냅한다(드래그 구 선택용).
 * - start > end(역방향 드래그)는 자동 교환, 길이 0(클릭)은 해당 위치 1문자로 확장.
 * - 겹치는 단어 토큰이 없으면(공백/구두점만) null.
 * - 범위가 문장 경계를 넘으면 첫 번째로 겹친 문장으로 클램프한다.
 */
export function snapRangeToWords(
  tokenized: TokenizedPassage,
  rangeStart: number,
  rangeEnd: number,
): SnappedRange | null {
  const { text, sentences } = tokenized;
  const a = Math.max(0, Math.min(rangeStart, rangeEnd));
  let b = Math.min(text.length, Math.max(rangeStart, rangeEnd));
  if (a === b) b = Math.min(text.length, a + 1);
  if (a >= b) return null;
  for (const sentence of sentences) {
    if (sentence.end <= a) continue;
    if (sentence.start >= b) break;
    const hits = sentence.tokens.filter((t) => t.end > a && t.start < b);
    if (hits.length === 0) continue;
    const first = hits[0];
    const last = hits[hits.length - 1];
    return {
      sentenceIndex: sentence.index,
      start: first.start,
      end: last.end,
      text: text.slice(first.start, last.end),
      wordCount: hits.length,
    };
  }
  return null;
}

/**
 * 축자 텍스트를 지문에서 찾아 단어 경계 범위로 앵커링한다(서버 재앵커링·AI
 * 제안 quote 검증 공용). 지문에 없거나 단어와 겹치지 않으면 null.
 */
export function anchorVerbatimText(
  tokenized: TokenizedPassage,
  verbatim: string,
): SnappedRange | null {
  const needle = verbatim.trim();
  if (!needle) return null;
  const idx = tokenized.text.indexOf(needle);
  if (idx < 0) return null;
  return snapRangeToWords(tokenized, idx, idx + needle.length);
}
