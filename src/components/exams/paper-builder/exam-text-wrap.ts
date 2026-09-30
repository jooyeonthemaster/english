// ============================================================================
// 시험지 미리보기 줄바꿈 정밀 모델(「exam-font」 모드) — 실제 글꼴 폭 + 브라우저 줄바꿈 규칙.
//
// 종전 모델(pagination-metrics.wrapParagraph)은 글자 부류별 평균 폭(소문자 0.53 …)에 보정계수 1.05 를
// 곱한 근사라, 문단마다 ±1~2 줄씩 틀렸다(26-09-19 실측: 본문 179개 중 70개 오차, 선지 355개 중 28개).
// 틀린 만큼 칸이 넘치거나(과소) 멀쩡히 들어갈 선지가 다음 쪽으로 밀렸다(과대).
// 이 모듈은 시험지 임베드 글꼴(exam-font-metrics)의 실제 전진폭으로 재고, 렌더러(renderFormattedInline)
// 가 그리는 모양을 따라 폭을 잡는다:
//   · `__밑줄__` 안쪽은 font-semibold → 600 은 임베드된 700 면으로 그려진다 → 굵은꼴 폭
//   · 빈칸 `_____` 은 inline-block min-w 4.5em + 좌우 mx-1(4px) — 쪼개지지 않는 원자
//   · 단독 원문자 ①·(A) 는 좌우 mx-0.5(2px), ① 은 다음 단어와 nbsp 로 묶임, (A)+빈칸은 nowrap
// 두 가지 모드:
//   · flow — 줄 문자열을 돌려준다(공백에서만 끊음). 칸 경계 분할용 줄은 단어가 온전해야 한다
//            (렌더가 줄을 공백으로 다시 잇는다 — 단어 중간을 끊으면 글자가 갈라진다).
//   · count — 줄 수만 센다. 브라우저처럼 한글 음절 사이·하이픈 뒤에서도 끊는다(원자 블록 높이용).
// 검증: 실측 선지 355/355 줄 수 일치(종전 327/355), 평문 지문 일치.
// ============================================================================

import { examTextWidthPx } from "./exam-font-metrics";

const BLANK_MIN_EM = 4.5;
const BLANK_MARGIN_PX = 8; // mx-1 × 2
const MARKER_MARGIN_PX = 4; // mx-0.5 × 2
// 줄 끝 판정 여유 — 서브픽셀 배치 오차는 「한 줄 더 접히는」 쪽으로 흡수한다(넘침 쪽 오차 방지).
const FIT_EPSILON_PX = 0.5;

const CIRCLED_CHAR_RE = /[①-⑳㉑-㉟㊱-㊿ⓐ-ⓩ㉠-㉭]/;
const HANGUL_OR_CJK_RE = /[ᄀ-ᇿ㄰-㆏가-힯㐀-鿿]/;
// 줄 머리에 올 수 없는 닫는 부호(앞 글자에 붙는다)·줄 끝에 올 수 없는 여는 부호(뒤 글자에 붙는다)
const CLOSING = new Set([...".,!?:;)]}'\"’”%…·」』>"]);
const OPENING = new Set([..."([{‘“「『<"]);

/** 토큰 1개(공백으로 나뉜 단어)를 폭 조각으로 잰 결과. */
type TokenMeasure = {
  /** 줄바꿈 가능 조각 폭(count 모드용 — flow 모드는 합계만 쓴다) */
  pieces: number[];
  width: number;
  /** 다음 토큰과 한 줄에 묶인다(① 마커 뒤 nbsp, (A) 뒤 빈칸 nowrap) */
  bindNext: boolean;
};

type MeasureState = { underline: boolean };

function measureToken(token: string, fontPx: number, state: MeasureState): TokenMeasure {
  const pieces: number[] = [];
  let buf = 0; // 현재 조각 폭
  let prevChar = "";
  const flush = () => {
    if (buf > 0) pieces.push(buf);
    buf = 0;
  };
  const chars = [...token];
  const bindNext = false;

  // 단독 원문자 마커(①) — 굵게 + mx-0.5, 다음 단어와 nbsp 로 묶인다.
  const bare = token.replace(/__/g, "");
  if (bare.length === 1 && CIRCLED_CHAR_RE.test(bare) && !token.includes("__")) {
    const w = examTextWidthPx(bare, fontPx, true) + MARKER_MARGIN_PX;
    return { pieces: [w], width: w, bindNext: true };
  }
  // 단독 대문자 괄호 라벨 (A) — mx-0.5. 뒤에 빈칸이 오면 렌더가 nowrap 으로 묶는다(호출부가 판정).
  if (/^\([A-J]\)$/.test(token) && !state.underline) {
    const w = examTextWidthPx(token, fontPx) + MARKER_MARGIN_PX;
    return { pieces: [w], width: w, bindNext: false };
  }

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ch === "_") {
      let run = 1;
      while (chars[i + run] === "_") run += 1;
      if (run >= 3 && !state.underline) {
        // 빈칸 — 쪼개지지 않는 원자(앞뒤 글자와는 끊길 수 있다)
        flush();
        pieces.push(BLANK_MIN_EM * fontPx + BLANK_MARGIN_PX);
        i += run - 1;
        prevChar = "";
        continue;
      }
      if (run === 2) {
        state.underline = !state.underline;
        i += 1;
        continue;
      }
      // 홀수 밑줄 문자 — 글자 그대로
    }
    // 밑줄 안 단어 머리 `(a)`/원문자 → 굵은 마커 + nbsp(렌더: markerMatch/circledMarkerMatch)
    const w = examTextWidthPx(ch, fontPx, state.underline);
    // count 모드 끊김 지점: 한글/한자 음절 사이(여닫는 부호 예외), 하이픈·슬래시·대시 뒤
    const breakBefore =
      prevChar !== "" &&
      ((HANGUL_OR_CJK_RE.test(ch) || HANGUL_OR_CJK_RE.test(prevChar)) &&
        !CLOSING.has(ch) &&
        !OPENING.has(prevChar)) ||
      (prevChar !== "" && (prevChar === "-" || prevChar === "/" || prevChar === "—") && /[A-Za-z0-9가-힣]/.test(ch));
    if (breakBefore) flush();
    buf += w;
    prevChar = ch;
  }
  flush();
  const width = pieces.reduce((sum, p) => sum + p, 0);
  return { pieces: pieces.length > 0 ? pieces : [0], width, bindNext };
}

function measureParagraph(paragraph: string, fontPx: number): { token: string; m: TokenMeasure }[] {
  const state: MeasureState = { underline: false };
  const tokens = paragraph.split(" ").filter((t) => t.length > 0);
  const measured = tokens.map((token) => ({ token, m: measureToken(token, fontPx, state) }));
  // (A)+빈칸 nowrap 묶음
  for (let i = 0; i < measured.length - 1; i += 1) {
    if (/^\([A-J]\)$/.test(measured[i].token) && /^_{3,}/.test(measured[i + 1].token)) {
      measured[i].m.bindNext = true;
    }
  }
  return measured;
}

/**
 * flow 모드 — 공백에서만 끊은 줄 문자열(단어 온전). 한 줄보다 긴 단어는 글자 단위로 자른다
 * (종전 wrapParagraph 와 같은 처리).
 */
export function wrapParagraphExact(paragraph: string, widthPx: number, fontPx: number): string[] {
  const measured = measureParagraph(paragraph, fontPx);
  if (measured.length === 0) return [""];
  const space = examTextWidthPx(" ", fontPx);
  const limit = widthPx - FIT_EPSILON_PX;
  const lines: string[] = [];
  let current: string[] = [];
  let currentWidth = 0;

  for (let i = 0; i < measured.length; i += 1) {
    const { token, m } = measured[i];
    // 묶인 다음 토큰까지 한 덩어리로 판정(① nbsp 다음 단어 / (A) nowrap 빈칸)
    let unitWidth = m.width;
    if (m.bindNext && i + 1 < measured.length) unitWidth += space + measured[i + 1].m.width;
    const add = (current.length > 0 ? space : 0) + unitWidth;
    if (current.length > 0 && currentWidth + add > limit) {
      lines.push(current.join(" "));
      current = [];
      currentWidth = 0;
    }
    if (current.length === 0 && m.width > limit) {
      // 칸보다 긴 한 단어 — 글자 단위 조각(렌더도 넘치거나 끊긴다; 극히 드묾)
      let chunk = "";
      let chunkWidth = 0;
      for (const ch of token) {
        const w = examTextWidthPx(ch, fontPx);
        if (chunk && chunkWidth + w > limit) {
          lines.push(chunk);
          chunk = "";
          chunkWidth = 0;
        }
        chunk += ch;
        chunkWidth += w;
      }
      current = [chunk];
      currentWidth = chunkWidth;
      continue;
    }
    currentWidth += (current.length > 0 ? space : 0) + m.width;
    current.push(token);
  }
  if (current.length > 0) lines.push(current.join(" "));
  return lines;
}

/**
 * count 모드 — 브라우저 줄 수(한글 음절 사이·하이픈 뒤 끊김 포함). firstLineIndentPx 는 첫 줄 앞에
 * 이미 놓인 폭(발문의 「N.」 번호 등).
 */
export function countParagraphLinesExact(
  paragraph: string,
  widthPx: number,
  fontPx: number,
  opts: { bold?: boolean; firstLineIndentPx?: number } = {},
): number {
  const measured = measureParagraph(paragraph, fontPx);
  if (opts.bold) {
    // 발문처럼 문단 전체가 굵은 경우 — 조각 폭을 굵은꼴로 다시 잰다(밑줄 상태 무시).
    for (const entry of measured) {
      const state: MeasureState = { underline: true };
      entry.m = { ...measureToken(entry.token.replace(/__/g, ""), fontPx, state), bindNext: entry.m.bindNext };
    }
  }
  if (measured.length === 0) return 1;
  const space = examTextWidthPx(" ", fontPx);
  const limit = widthPx - FIT_EPSILON_PX;
  let lines = 1;
  let lineWidth = opts.firstLineIndentPx ?? 0;
  let lineHasContent = lineWidth > 0;

  for (let i = 0; i < measured.length; i += 1) {
    const { m } = measured[i];
    const boundNext = m.bindNext && i + 1 < measured.length ? space + measured[i + 1].m.width : 0;
    m.pieces.forEach((piece, pieceIndex) => {
      const lead = pieceIndex === 0 && lineHasContent ? space : 0;
      const extra = pieceIndex === m.pieces.length - 1 ? boundNext : 0;
      if (lineHasContent && lineWidth + lead + piece + extra > limit) {
        lines += Math.max(1, Math.ceil(piece / limit));
        lineWidth = piece > limit ? piece % limit : piece;
      } else if (!lineHasContent && piece > limit) {
        lines += Math.ceil(piece / limit) - 1;
        lineWidth = piece % limit;
      } else {
        lineWidth += lead + piece;
      }
      lineHasContent = true;
    });
  }
  return lines;
}

/**
 * 발문(헤더) 줄 수 — a4-paper-page 헤더 `<p class="font-semibold">` 를 따른다:
 * 앞에 「N.」 번호(font-black, 13px/compact 12px, mr-1.5) · 문항 메타 배지(9px, mr-1.5) 가 첫 줄을 먹고,
 * 발문 본체는 semibold(→ 굵은꼴 면)로 그려진다.
 */
export function countStemLinesExact(opts: {
  stem: string;
  widthPx: number;
  fontPx: number;
  compact: boolean;
  orderNum: number;
  metaBadge?: string | null;
}): number {
  const numberPx = opts.compact ? 12 : 13;
  let indent = examTextWidthPx(`${opts.orderNum}.`, numberPx, true) + 6;
  if (opts.metaBadge) indent += examTextWidthPx(opts.metaBadge, 9, true) + 6;
  let total = 0;
  opts.stem
    .replace(/\r/g, "")
    .split("\n")
    .forEach((paragraph, index) => {
      total += paragraph.trim()
        ? countParagraphLinesExact(paragraph.trim(), opts.widthPx, opts.fontPx, {
            bold: true,
            firstLineIndentPx: index === 0 ? indent : 0,
          })
        : 1;
    });
  return Math.max(1, total);
}
