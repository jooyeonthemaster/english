// 국어(한국어 과목) 문장 분리기 — 원문 오프셋 보존.
//
// 영어 파이프라인의 question-postprocess/sentence-splitter.ts(splitIntoSentences)를
// 미러링하되, 국어 특성(인용 연결 "라고/하고", 종결어미 힌트, 운문 행 단위)을 다룬다.
// 반환 스팬은 항상 text.slice(start, end) === sentence.text 를 만족한다 — 세트
// 누수스캔의 computeSentenceRanges("같은 문장 안에 두 마크" 판정)와 시험지 분량
// 게이트가 원문 좌표 그대로 소비하기 위함이다. 입력을 정규화하지 않는 이유이기도 하다.
//
// 설계 원칙: 과분리보다 미분리 선호 — 누수스캔은 문장을 덜 쪼갤수록(=한 문장으로
// 묶일수록) 보수적(안전) 판정이 된다. 애매하면 합친다.

/** 문장 스팬 — 원문 오프셋 보존 (start inclusive, end exclusive). */
export interface KoSentenceSpan {
  text: string;
  start: number;
  end: number;
}

export type KoSentenceSplitMode = "prose" | "verse";

export interface KoSentenceSplitOptions {
  /**
   * 'prose'(기본): 종결부호·종결어미 힌트 기반 분리.
   * 'verse': 시/희곡 — 행(줄바꿈)이 의미 단위. 비어있지 않은 각 행이 한 단위,
   *          종결부호 무관.
   */
  mode?: KoSentenceSplitMode;
}

export interface KoSentenceSplitResult {
  sentences: KoSentenceSpan[];
}

/** 종결부호. 전각(。！？)까지 포함. */
const TERMINATOR_CHARS = new Set([".", "!", "?", "…", "‥", "。", "！", "？"]);

/** 닫는 따옴표/괄호 — 앞 문장에 붙인다. */
const CLOSER_CHARS = new Set([
  '"', "'", "”", "’", "」", "』", "〉", "》", ")", "]", "}", "）", "］", "›", "»",
]);

/**
 * 닫는 따옴표 직후의 인용 연결 — 이어지는 서술이 같은 문장인 신호.
 * (`…했다."라고 말했다.` / `…했다."고 말했다.`)
 * 1글자 연결("고"/"라"/"란")은 오탐(고요한/란처럼 어두 일치) 방지를 위해
 * 바로 뒤가 공백일 때만 인정한다. 닫는 따옴표와 연결어 사이 공백은 허용하지 않는다
 * (전형 표기는 붙여 씀 — `." 고요한` 류의 새 문장을 오병합하지 않기 위해).
 */
const QUOTE_CONNECTIVES_MULTI = [
  "이라고", "이라며", "이라는", "이라면서",
  "라면서", "라고", "라며", "라는",
  "하면서", "하고", "하며", "하는",
];
const QUOTE_CONNECTIVES_SINGLE = ["고", "라", "란"];

/** 문장 경계가 아닌 영문 약어 (마침표 앞 토큰, 소문자 비교). */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "cf", "al",
  "e.g", "i.e", "vol", "no", "pp", "fig",
]);

/** 부호 없는 줄바꿈 경계의 종결어미 힌트 음절 (보수적 — 과분리보다 미분리 선호). */
const ENDING_HINT_SYLLABLES = new Set(["다", "까", "네", "자", "요", "죠"]);

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/**
 * 한국어 문장 분리. opts.mode = 'prose'(기본) | 'verse'.
 * 반환 스팬은 원문 오프셋 보존 — text.slice(start, end) === sentence.text.
 */
export function splitKoSentences(
  text: string,
  opts: KoSentenceSplitOptions = {},
): KoSentenceSplitResult {
  if (!text) return { sentences: [] };
  const mode = opts.mode ?? "prose";
  return {
    sentences: mode === "verse" ? splitVerse(text) : splitProse(text),
  };
}

// ---------------------------------------------------------------------------
// verse — 행 보존 모드
// ---------------------------------------------------------------------------

function splitVerse(text: string): KoSentenceSpan[] {
  const spans: KoSentenceSpan[] = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i !== text.length && text[i] !== "\n") continue;
    let start = lineStart;
    let end = i;
    while (start < end && isWhitespace(text[start])) start += 1;
    while (end > start && isWhitespace(text[end - 1])) end -= 1;
    if (end > start) {
      spans.push({ text: text.slice(start, end), start, end });
    }
    lineStart = i + 1;
  }
  return spans;
}

// ---------------------------------------------------------------------------
// prose — 종결부호 + 종결어미 힌트
// ---------------------------------------------------------------------------

function splitProse(text: string): KoSentenceSpan[] {
  const spans: KoSentenceSpan[] = [];
  let segStart = 0;

  const pushSpan = (endExclusive: number) => {
    let start = segStart;
    let end = endExclusive;
    while (start < end && isWhitespace(text[start])) start += 1;
    while (end > start && isWhitespace(text[end - 1])) end -= 1;
    if (end > start) {
      spans.push({ text: text.slice(start, end), start, end });
    }
    segStart = endExclusive;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (TERMINATOR_CHARS.has(ch)) {
      // 종결부호 연속(?! / ... / ……)을 한 덩어리로 소비
      const runStart = i;
      let runEnd = i;
      while (runEnd < text.length && TERMINATOR_CHARS.has(text[runEnd])) runEnd += 1;
      // 닫는 따옴표/괄호는 앞 문장에 붙인다
      let afterClosers = runEnd;
      while (afterClosers < text.length && CLOSER_CHARS.has(text[afterClosers])) {
        afterClosers += 1;
      }
      const run = text.slice(runStart, runEnd);
      const hadCloser = afterClosers > runEnd;

      // 1) 인용 연결 병합: …했다."라고 말했다 → 한 문장
      if (hadCloser && startsWithQuoteConnective(text, afterClosers)) {
        i = afterClosers;
        continue;
      }

      // 2) 말줄임표 연속(…/‥/.. 이상)은 종결어미 힌트가 앞설 때만 경계
      //    ("그건... 아니야" 는 휴지, "끝났다… 새벽이" 는 경계). ?/! 섞이면 경계 유지.
      if (isEllipsisRun(run) && !/[?？!！]/.test(run)) {
        const prevChar = runStart > 0 ? text[runStart - 1] : "";
        if (!ENDING_HINT_SYLLABLES.has(prevChar)) {
          i = afterClosers;
          continue;
        }
      }

      // 3) 단일 마침표 특례: 영문 약어(Dr./e.g.)·항목 번호(1. 2.)는 비분리.
      //    소수점(3.14)은 아래 4)의 "뒤 공백" 요건이 걸러낸다.
      if (run === "." && (isAbbreviationBefore(text, runStart) || isItemNumberBefore(text, runStart))) {
        i = runEnd;
        continue;
      }

      // 4) 경계 확정: 종결부호(+닫는 부호) 뒤가 공백/EOL/EOF 여야 한다
      if (afterClosers < text.length && !isWhitespace(text[afterClosers])) {
        i = afterClosers;
        continue;
      }

      pushSpan(afterClosers);
      i = afterClosers;
      continue;
    }

    if (ch === "\n") {
      // 빈 줄(문단 경계)은 무조건 경계
      let forward = i + 1;
      while (forward < text.length && (text[forward] === " " || text[forward] === "\t" || text[forward] === "\r")) {
        forward += 1;
      }
      const isParagraphBreak = forward < text.length && text[forward] === "\n";

      // 부호 없는 종결: 줄 끝이 종결어미 힌트 음절(…다/…까/…네/…자/…요/…죠)이면 경계.
      // 그 외 줄바꿈은 단순 개행(wrap)으로 보고 같은 문장에 잇는다 — 미분리 선호.
      let back = i - 1;
      while (back >= segStart && (text[back] === " " || text[back] === "\t" || text[back] === "\r")) {
        back -= 1;
      }
      while (back >= segStart && CLOSER_CHARS.has(text[back])) back -= 1;
      const endsWithHint = back >= segStart && ENDING_HINT_SYLLABLES.has(text[back]);

      if (isParagraphBreak || endsWithHint) {
        pushSpan(i);
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  // 종결부호 없는 마지막 조각도 문장으로 수용
  pushSpan(text.length);
  return spans;
}

function isEllipsisRun(run: string): boolean {
  if (/[…‥]/.test(run)) return true;
  return run.length >= 2 && /^[.]+$/.test(run);
}

function startsWithQuoteConnective(text: string, index: number): boolean {
  for (const connective of QUOTE_CONNECTIVES_MULTI) {
    if (text.startsWith(connective, index)) return true;
  }
  for (const connective of QUOTE_CONNECTIVES_SINGLE) {
    if (!text.startsWith(connective, index)) continue;
    const after = text[index + connective.length];
    if (after === undefined || isWhitespace(after)) return true;
  }
  return false;
}

/** 마침표 직전의 라틴 토큰이 약어(Dr./e.g./U.S. 류)인지 — 영어 splitter 미러. */
function isAbbreviationBefore(text: string, periodIndex: number): boolean {
  let start = periodIndex;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) start -= 1;
  const token = text.slice(start, periodIndex).replace(/\.+$/, "");
  if (!token || !/[A-Za-z]/.test(token)) return false;
  const lower = token.toLowerCase();
  if (ABBREVIATIONS.has(lower)) return true;
  if (/^[A-Za-z]$/.test(token)) return true; // 단일 문자 약어 (U. S. A.)
  if (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(token)) return true; // U.S / e.g / i.e
  return false;
}

/**
 * 항목 번호(1. 2. …) 판정: 마침표 앞이 1~2자리 순수 숫자이고 그 앞이
 * 텍스트 시작/공백일 때. 문장이 짧은 숫자로 끝나는 희귀 케이스는 미분리로
 * 떨어진다 — 보수적 방향(안전).
 */
function isItemNumberBefore(text: string, periodIndex: number): boolean {
  let start = periodIndex;
  while (start > 0 && /[0-9]/.test(text[start - 1])) start -= 1;
  const digits = periodIndex - start;
  if (digits < 1 || digits > 2) return false;
  return start === 0 || isWhitespace(text[start - 1]);
}
