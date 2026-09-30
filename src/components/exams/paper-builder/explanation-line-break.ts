// ============================================================================
// 해설 줄 나눔 — Blink(Chromium) 줄 끊김 재현(explanation-layout.ts 의 짝, 26-09-30 PRINT-R3).
//
// 해설은 렌더 줄 단위로 칸을 가르므로 줄 머리가 브라우저와 한 글자도 어긋나면 안 된다. 규칙:
//   · 공백 뒤는 항상 끊김 자리(Blink). 인쇄 가능 ASCII 끼리는 Blink 자체 표(실측), 그 밖(한글 음절 등)은 ICU
//     줄 끊김(UAX #14) 규칙.
//   · 들어가는지는 「글자 폭 합(실수) ≤ 줄 폭(LayoutUnit) + 1/64」. 스타일 조각(굵게 · 오답 라벨)마다 인라인
//     항목이 따로 잡혀 줄 안에서 끝난 항목 폭은 LayoutUnit 으로 올려 더한다.
//   · 글자 폭은 explanation-glyphs.ts(시험지 임베드 글꼴의 정확한 글꼴 단위).
// 교정 계기: .tmp-crm/lee89/expl-calib.mts(헤드리스 Chromium 실측 대조) · expl-ascii-table.mts(ASCII 쌍 표).
// 회귀 방지: tests/unit/exam-paper-explanation-split.test.mjs(Chromium 실측 골든).
// ============================================================================

import { explanationGlyphEm } from "./explanation-glyphs";
import type { ExplanationSegment } from "./explanation-layout";

type BreakClass =
  | "SP" | "ID" | "AL" | "NU" | "OP" | "OPA" | "CL" | "CP" | "IS" | "EX" | "SY"
  | "QU" | "QPi" | "QPf" | "HY" | "BA" | "B2" | "IN" | "PO" | "PR" | "GL";

const CLASS_BY_CHAR: Record<string, BreakClass> = {
  " ": "SP",
  "(": "OPA", "[": "OPA", "{": "OPA",
  ")": "CP", "]": "CP", "}": "CL",
  ",": "IS", ".": "IS", ":": "IS", ";": "IS",
  "!": "EX", "?": "EX", "/": "SY",
  "'": "QU", '"': "QU", "‘": "QPi", "“": "QPi", "’": "QPf", "”": "QPf",
  "-": "HY", "–": "BA", "‐": "BA", "\u00ad": "BA", "|": "BA", "—": "B2",
  "…": "IN", "‥": "IN",
  "%": "PO", "°": "PO", "‰": "PO", "′": "PO", "″": "PO", "℃": "PO", "¢": "PO",
  "$": "PR", "+": "PR", "\\": "PR", "£": "PR", "€": "PR", "₩": "PR", "±": "PR", "¥": "PR",
  "\u00a0": "GL", "‑": "GL",
  "「": "OP", "『": "OP", "【": "OP", "《": "OP", "〈": "OP", "（": "OP", "［": "OP", "〔": "OP",
  "」": "CL", "』": "CL", "】": "CL", "》": "CL", "〉": "CL", "）": "CL", "］": "CL", "〕": "CL",
  "、": "CL", "。": "CL", "，": "CL", "．": "CL",
};

/** East Asian Width F/W/H(UAX #14 LB19a 의 $EastAsian) — 한글 · 한자 · 가나 · 전각. */
function isEastAsian(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

function breakClassOf(ch: string): BreakClass {
  const mapped = CLASS_BY_CHAR[ch];
  if (mapped) return mapped;
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x30 && code <= 0x39) return "NU";
  // 한글 음절 · 자모 · 한자 · 가나 · 전각 → ID(음절 사이에서 끊긴다). 원문자 ① 등 모호 폭(AI)은 AL 로 푼다.
  if (isEastAsian(ch) && !(code >= 0x3000 && code <= 0x303f)) return "ID";
  return "AL";
}

// Blink 의 ASCII 쌍 끊김 표(실측 — .tmp-crm/lee89/expl-ascii-table.mts, 94×94 쌍 전수, 26-09-30):
//  · 「-」 뒤: 영문자와 아래 기호 앞에서 끊는다. 숫자 앞은 「-」 앞 글자가 영숫자일 때만(「10-7」·「ABCD-1234」).
//  · 「?」 뒤: 영숫자와 아래 기호 앞에서 끊는다.
//  · 닫는 부호 · 문장부호 등 뒤: 여는 괄호 「( < [ {」 앞에서만 끊는다(「..."(학생」).
//  · 그 밖의 쌍(영문 · 숫자 연속, 「/」 뒤, 「'」 뒤 등)은 안 끊는다.
const ASCII_OPENERS = new Set([..."(<[{"]);
const ASCII_BREAK_BEFORE_OPENER = new Set(["!", '"', "#", "%", "&", ")", "*", "+", ",", ".", ":", ";", "=", ">", "\\", "]", "|", "}", "~"]);
const ASCII_AFTER_HYPHEN = new Set(['"', "#", "%", "&", "'", "(", "*", "+", "-", "<", "=", ">", "@", "[", "\\", "^", "_", "`", "{", "|", "~"]);
const ASCII_AFTER_QUESTION = new Set(["#", "$", "%", "&", "(", "*", "+", "-", "<", "=", ">", "@", "[", "\\", "^", "_", "`", "{", "|", "~"]);

function isAsciiGraphic(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return ch.length === 1 && code >= 0x21 && code <= 0x7e;
}

function asciiPairBreak(prev: string, cur: string, before: string | undefined): boolean {
  if (prev === "-") {
    if (/[0-9]/.test(cur)) return /^[A-Za-z0-9]$/.test(before ?? "");
    return /[A-Za-z]/.test(cur) || ASCII_AFTER_HYPHEN.has(cur);
  }
  if (prev === "?") return /[A-Za-z0-9]/.test(cur) || ASCII_AFTER_QUESTION.has(cur);
  if (ASCII_BREAK_BEFORE_OPENER.has(prev)) return ASCII_OPENERS.has(cur);
  return false;
}

/**
 * prev(공백이 아닌 앞 글자)와 cur 사이에서 끊을 수 있는가. spaced = 둘 사이에 공백이 있었다.
 * before = prev 의 앞 글자, after = cur 의 뒤 글자(LB19a 따옴표 판정용).
 */
function canBreakBetween(
  prev: string,
  cur: string,
  spaced: boolean,
  before: string | undefined,
  after: string | undefined,
): boolean {
  const a = breakClassOf(prev);
  const b = breakClassOf(cur);
  // Blink 는 공백 뒤를 무조건 끊김 자리로 본다(UAX #14 LB13 「공백 뒤라도 ) / … 앞은 안 끊음」과 다름 —
  // 실측: 「[틀림] / [II]」 가 「/」 앞에서 끊긴다).
  if (spaced) return true;
  // 인쇄 가능 ASCII 끼리는 ICU 가 아니라 Blink 자체 표로 끊는다.
  if (isAsciiGraphic(prev) && isAsciiGraphic(cur)) return asciiPairBreak(prev, cur, before);
  // LB13: 닫는 부호 · 느낌표 · 쉼표류 · 빗금 앞, LB14: 여는 부호 뒤는 안 끊는다.
  if (b === "CL" || b === "CP" || b === "EX" || b === "IS" || b === "SY") return false;
  if (a === "OP" || a === "OPA") return false;
  // LB12/12a: 줄바꿈 없는 공백 · 하이픈
  if (a === "GL" || b === "GL") return false;
  // LB19/19a: 따옴표
  if (b === "QU" || b === "QPf") return false;
  if (a === "QU" || a === "QPi") return false;
  if (b === "QPi" && (!isEastAsian(prev) || !isEastAsian(after))) return false;
  if (a === "QPf" && (!isEastAsian(cur) || !isEastAsian(before))) return false;
  // LB21/22: 하이픈 · 줄표 앞, 말줄임표 앞
  if (b === "HY" || b === "BA" || b === "IN") return false;
  // LB23~25: 숫자 · 영문 · 접두/접미 부호 연속
  if (b === "NU" && (a === "AL" || a === "NU" || a === "PR" || a === "PO" || a === "IS" || a === "SY")) return false;
  if (a === "NU" && (b === "AL" || b === "PO" || b === "PR")) return false;
  if (b === "PO" && (a === "ID" || a === "AL" || a === "CP" || a === "CL")) return false;
  if (a === "PR" && (b === "ID" || b === "AL")) return false;
  if (a === "AL" && (b === "PR" || b === "PO")) return false;
  // LB28/29/30: 영문 연속, 쉼표 뒤 영문, 영문 · 숫자에 붙은 ASCII 괄호
  if (a === "AL" && b === "AL") return false;
  if (a === "IS" && b === "AL") return false;
  if ((a === "AL" || a === "NU") && b === "OPA") return false;
  if (a === "CP" && (b === "AL" || b === "NU")) return false;
  return true; // LB31
}

/**
 * 조각 목록을 줄로 나눈다(Chromium 의 탐욕 줄 채움). 각 줄은 원문 범위 [start, end) 이고, 줄 사이 공백은
 * 앞 줄 끝에 매달린다(렌더에서 줄 끝 공백은 폭을 먹지 않는다). 끊을 자리가 없는 긴 낱말은 넘친 채 둔다.
 */
export function wrapExplanationGlyphs(
  segments: readonly ExplanationSegment[],
  widthPx: number,
  fontPx: number,
): { start: number; end: number }[] {
  const chars: string[] = [];
  const segOf: number[] = [];
  const prefix: number[] = [0];
  segments.forEach((segment, seg) => {
    for (const ch of segment.text) {
      chars.push(ch);
      segOf.push(seg);
      prefix.push(prefix[prefix.length - 1] + explanationGlyphEm(ch, segment.bold) * fontPx);
    }
  });
  const count = chars.length;
  if (count === 0) return [];
  const segEnd: number[] = [];
  segOf.forEach((seg, index) => {
    segEnd[seg] = index + 1;
  });
  // 끊김 자리(그 글자 앞) — 줄 위치와 무관하므로 한 번만 판정한다.
  const opportunity = new Uint8Array(count);
  let prevNonSpace = -1;
  for (let i = 0; i < count; i += 1) {
    if (chars[i] === " ") continue;
    if (
      prevNonSpace >= 0 &&
      canBreakBetween(chars[prevNonSpace], chars[i], prevNonSpace < i - 1, chars[prevNonSpace - 1], chars[i + 1])
    ) {
      opportunity[i] = 1;
    }
    prevNonSpace = i;
  }
  // 줄 [from, to] 의 폭 — 스타일 조각(굵게 · 오답 라벨)마다 Blink 인라인 항목이 따로 잡힌다: 줄 안에서 끝난
  // 항목은 폭을 LayoutUnit 으로 올려 더하고, 끊김이 걸린 마지막 항목만 실수 폭으로 더한다.
  const lineWidth = (from: number, to: number): number => {
    if (segOf[from] === segOf[to]) return prefix[to + 1] - prefix[from];
    let total = 0;
    let cursor = from;
    while (cursor <= to) {
      const runEnd = Math.min(segEnd[segOf[cursor]], to + 1);
      const width = prefix[runEnd] - prefix[cursor];
      total += runEnd <= to ? toLayoutUnitCeil(width) : width;
      cursor = runEnd;
    }
    return total;
  };

  const limit = toLayoutUnitFloor(widthPx) + LAYOUT_UNIT + 1e-9;
  const lines: { start: number; end: number }[] = [];
  let lineStart = 0;
  let lastOpportunity = -1; // 현재 줄 안의 가장 뒤 끊김 자리
  for (let i = 0; i < count; i += 1) {
    if (chars[i] === " ") continue;
    if (opportunity[i] && i > lineStart) lastOpportunity = i;
    // 가장 뒤 끊김 자리에서 끊는다. 그 뒤(~ i)에는 끊김 자리가 없으므로 새 줄이 여전히 넘치면(끊을 자리 없는
    // 긴 낱말) 브라우저처럼 넘친 채 다음 끊김 자리까지 간다.
    if (lastOpportunity > lineStart && lineWidth(lineStart, i) > limit) {
      lines.push({ start: lineStart, end: lastOpportunity });
      lineStart = lastOpportunity;
      lastOpportunity = -1;
    }
  }
  lines.push({ start: lineStart, end: count });
  return lines;
}

/**
 * Blink 의 LayoutUnit(1/64px). 줄에 들어가는지는 「글자 폭 합(실수) ≤ 줄 폭(LayoutUnit) + 1/64」 로 본다
 * (실측 교정 9,262행 × 3폭: 폭 합이 줄 폭을 1/64 이하로 넘는 줄은 브라우저가 넣었고, 그보다 넘으면 끊었다).
 */
const LAYOUT_UNIT = 1 / 64;

function toLayoutUnitFloor(px: number): number {
  return Math.floor(px * 64 + 1e-6) / 64;
}

export function toLayoutUnitCeil(px: number): number {
  return Math.ceil(px * 64 - 1e-6) / 64;
}
