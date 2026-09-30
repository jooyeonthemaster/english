// ============================================================================
// 인라인 정답·해설(「PDF 해설」) 조판 모델 — 26-09-30 (PRINT-R3 · PRINT-R9).
//
// 종전에는 해설 블록 하나를 통째로(원자) 칸에 넣었다. 한 칸보다 긴 해설(실측: 순서 배열 1,085자)은
// 어디에도 안 들어가 넘침 가드가 포기(stuck)했고 종이 끝에서 잘렸다(1쪽 2칸 +166px). 또 해설 원문의
// 마크다운 굵게(**…**)를 그대로 찍었다.
//
// 이제 해설을 「행」(정답 배지 · 라벨 · 문단 · 글머리 · 오답 행)으로 나누고, 흐르는 행(문단 · 글머리 ·
// 오답)은 **렌더 줄 단위**로 쪼개 조판기(pagination.ts)에 넘긴다. 칸 경계에서는 줄 사이에서 갈라지고,
// 갈라진 뒷조각은 「(N번 계속)」 라벨 아래에서 이어진다. 추정 = 렌더가 되도록:
//   · 줄 나눔은 Blink(Chromium) 규칙을 재현한다 — 공백 뒤는 항상, 한글 음절 사이는 ICU(UAX #14) 규칙,
//     인쇄 가능 ASCII 끼리는 Blink 자체 표(실측), 들어가는지는 「폭 합 ≤ 줄 폭 LayoutUnit + 1/64」.
//     조각 경계가 줄 경계와 같으므로 뒷조각을 따로 그려도 같은 줄이 나온다.
//   · 글자 폭은 explanation-glyphs.ts(시험지 임베드 글꼴의 정확한 글꼴 단위). 해설은 renderFormattedInline 을
//     거치지 않는 평문이라 빈칸 `____`·원문자 ①도 글자 그대로 잰다.
//   · 교정(26-09-30, 헤드리스 Chromium · .tmp-crm/lee89/expl-calib.mts): 해설 1,306건 9,262행 × 3폭 줄 머리
//     100% 일치, 새 표본 1,421건 9,758행 × 6폭(A4/B4 · 1/2단 · 보통/좁게) 58,548 중 58,544 일치 — 남은 4 는
//     임베드 · 시스템 맑은 고딕 어디에도 없는 글자(⑯~⑳, 운영체제 대체 글꼴)가 든 한 해설뿐이다.
//   · 굵게(**…**)는 굵은꼴 면(700) 폭으로 잰다. 인라인 코드 `…` 는 백틱만 뗀다. 줄머리 「- 」 는
//     explanation-content.ts 가 글머리(•) 행으로 바꾼다. 짝 없는 ** 는 지운다(종이에 기호가 찍히지 않게).
// 렌더 짝: components/exam-explanation-block.tsx — 여기 상수(여백 · 들여쓰기 · 글꼴)를 바꾸면 그쪽도 바꾼다.
// ============================================================================

import { explanationGlyphEm, explanationTextWidthPx } from "./explanation-glyphs";
import { toLayoutUnitCeil, wrapExplanationGlyphs } from "./explanation-line-break";
import type { ExplanationRow } from "./explanation-content";
import {
  hasVisibleExplanationText,
  parseExplanationInline,
  pushExplanationSegment as pushSegment,
  type ExplanationSegment,
} from "./explanation-markdown";

// 인라인 마크다운 규칙(굵게 · 백틱 · 보이지 않는 끊김 문자)은 explanation-markdown.ts 한 곳 — DOCX · HWPX 도 쓴다.
export { parseExplanationInline, type ExplanationSegment };

/** 렌더 단위 — 흐르는 행은 한 조각에 놓인 줄들만 담는다(rowStart/rowEnd 로 머리 · 꼬리 여부). */
export type ExplanationPiece =
  | { kind: "answer"; prefix: string; text: string }
  | { kind: "label"; text: string }
  | {
      kind: "text" | "bullet" | "wrong";
      row: number;
      segments: ExplanationSegment[];
      rowStart: boolean;
      rowEnd: boolean;
    };

/** 문항 조각(RenderItemPart) 하나에 놓인 해설 부분. */
export type ExplanationSlice = {
  /** 해설 머리(정답 배지)가 이 조각에 있다 — 컨테이너 위 여백 mt-2 를 그린다. */
  containerStart: boolean;
  /** 이 조각이 문항 조각의 첫 내용이다(「(N번 계속)」 라벨 바로 뒤) — 첫 행의 위 여백을 그리지 않는다. */
  atPartStart: boolean;
  pieces: ExplanationPiece[];
  /** 이 조각에 놓인 단위들의 추정 높이 합(위 여백 포함 — 개발 진단 전용, 렌더 실측과 대조). */
  estHeight?: number;
};

/** 조판기에 넘기는 흐름 단위(쪼개지지 않는 최소 단위). */
export type ExplanationUnit = {
  pieces: ExplanationPiece[];
  /** 조각 중간에 놓일 때의 높이(위 여백 포함) */
  height: number;
  /** 조각 맨 처음에 놓이면 그리지 않는 위 여백 */
  topGap: number;
  containerStart: boolean;
};

// --- 렌더 치수(exam-explanation-block.tsx 와 1:1) -------------------------------------------
export const EXPLANATION_CONTAINER_TOP = 8; // 컨테이너 mt-2
export const EXPLANATION_LABEL_TOP = 6; // 라벨 mt-1.5
export const EXPLANATION_ROW_TOP = 2; // 문단 · 글머리 · 오답 행 mt-0.5
export const EXPLANATION_ROW_INSET = 8; // pl-2
const ANSWER_CHROME_V = 10; // 배지 border 1+1 + py-1 4+4
const ANSWER_INSET_H = 18; // 배지 border 1+1 + px-2 8+8
const BULLET_GAP = 4; // gap-1
export const EXPLANATION_BULLET = "•";

export function explanationTypography(compact: boolean): { fontPx: number; lineH: number } {
  const fontPx = compact ? 9.5 : 10;
  return { fontPx, lineH: fontPx * 1.5 };
}

// 글자 폭은 explanation-glyphs.ts(시험지 글꼴의 정확한 전진폭), 줄 나눔은 explanation-line-break.ts.
export { explanationGlyphEm, explanationTextWidthPx, wrapExplanationGlyphs };

// --- 인라인 마크다운 --------------------------------------------------------------------------
// parseExplanationInline · pushSegment 는 explanation-markdown.ts(웹 · DOCX · HWPX 공용)에서 온다.

/** 원문 범위 [start, end) 의 글자 조각(스타일 경계 유지). */
function sliceSegments(
  segments: readonly ExplanationSegment[],
  start: number,
  end: number,
): ExplanationSegment[] {
  const out: ExplanationSegment[] = [];
  let offset = 0;
  for (const segment of segments) {
    const chars = [...segment.text];
    const segStart = offset;
    const segEnd = offset + chars.length;
    offset = segEnd;
    const from = Math.max(start, segStart);
    const to = Math.min(end, segEnd);
    if (from < to) pushSegment(out, { ...segment, text: chars.slice(from - segStart, to - segStart).join("") });
  }
  return out;
}

// --- 행 → 흐름 단위 ------------------------------------------------------------------------------

export type ExplanationFlowRow = { kind: "text" | "bullet" | "wrong"; segments: ExplanationSegment[]; widthPx: number };

/** 흐르는 행(문단 · 글머리 · 오답)의 글자 조각과 줄 폭. 정답 배지 · 라벨 · 빈 행은 null. */
export function explanationFlowRow(row: ExplanationRow, columnWidth: number, fontPx: number): ExplanationFlowRow | null {
  if (row.type === "answer" || row.type === "label") return null;
  const segments =
    row.type === "wrong"
      ? [{ text: `${row.label} `, bold: true, tone: "label" as const }, ...parseExplanationInline(row.text)]
      : parseExplanationInline(row.text);
  if (!hasVisibleExplanationText(segments)) return null;
  // 글머리 점(flex 항목)의 폭은 내용 폭을 LayoutUnit 으로 올린 값이다(실측 교정).
  const bulletWidth = toLayoutUnitCeil(explanationTextWidthPx(EXPLANATION_BULLET, fontPx)) + BULLET_GAP;
  const widthPx =
    columnWidth - EXPLANATION_ROW_INSET - (row.type === "bullet" ? bulletWidth : 0);
  return { kind: row.type, segments, widthPx };
}

/** 정답 배지 글자(렌더: `<span>정답</span>` + 공백 + `<span>값</span>`, 둘 다 굵게). */
export function explanationAnswerPrefix(hasOptions: boolean): string {
  return hasOptions ? "정답" : "정답:";
}

/**
 * 해설 행 → 조판 흐름 단위. 첫 단위 = 컨테이너 위 여백 + 정답 배지(원자). 라벨은 다음 행의 첫 줄과
 * 한 단위(라벨만 칸 바닥에 남지 않게). 흐르는 행은 렌더 줄마다 한 단위.
 */
export function layoutExplanationUnits(
  rows: readonly ExplanationRow[],
  columnWidth: number,
  compact: boolean,
): ExplanationUnit[] {
  // 넘침 가드가 한 조판을 여러 번 다시 나눈다(용량 보정마다) — 같은 해설 · 같은 폭이면 결과를 재사용한다.
  // 단위는 읽기 전용이다(appendExplanationUnit 이 복사해 쓴다).
  const key = `${columnWidth}|${compact ? 1 : 0}|${JSON.stringify(rows)}`;
  const cached = unitCache.get(key);
  if (cached) return cached;
  const units = computeExplanationUnits(rows, columnWidth, compact);
  if (unitCache.size >= UNIT_CACHE_LIMIT) unitCache.delete(unitCache.keys().next().value as string);
  unitCache.set(key, units);
  return units;
}

const UNIT_CACHE_LIMIT = 600;
const unitCache = new Map<string, ExplanationUnit[]>();

function computeExplanationUnits(
  rows: readonly ExplanationRow[],
  columnWidth: number,
  compact: boolean,
): ExplanationUnit[] {
  const { fontPx, lineH } = explanationTypography(compact);
  const units: ExplanationUnit[] = [];
  let pendingLabel: { piece: ExplanationPiece; height: number } | null = null;

  const flushLabel = () => {
    if (!pendingLabel) return;
    units.push({ pieces: [pendingLabel.piece], height: pendingLabel.height, topGap: EXPLANATION_LABEL_TOP, containerStart: false });
    pendingLabel = null;
  };

  rows.forEach((row, rowIndex) => {
    if (row.type === "answer") {
      flushLabel();
      const prefix = explanationAnswerPrefix(row.hasOptions);
      // 렌더: <span>정답␠␠</span><span>값</span>(둘 다 굵게) — 공백은 하나로 접히고 두 인라인 항목이다.
      const value = row.text.replace(/\s+/g, " ").trim();
      const lines = Math.max(
        1,
        wrapExplanationGlyphs(
          value ? [{ text: `${prefix} `, bold: true }, { text: value, bold: true }] : [{ text: prefix, bold: true }],
          columnWidth - ANSWER_INSET_H,
          fontPx,
        ).length,
      );
      const isFirst = units.length === 0;
      const top = isFirst ? EXPLANATION_CONTAINER_TOP : 0;
      units.push({
        pieces: [{ kind: "answer", prefix, text: row.text }],
        height: top + lines * lineH + ANSWER_CHROME_V,
        topGap: top,
        containerStart: isFirst,
      });
      return;
    }
    if (row.type === "label") {
      flushLabel();
      pendingLabel = { piece: { kind: "label", text: row.text }, height: EXPLANATION_LABEL_TOP + lineH };
      return;
    }
    const flow = explanationFlowRow(row, columnWidth, fontPx);
    if (!flow) return;
    const lines = wrapExplanationGlyphs(flow.segments, flow.widthPx, fontPx);
    lines.forEach((line, lineIndex) => {
      const piece: ExplanationPiece = {
        kind: flow.kind,
        row: rowIndex,
        segments: sliceSegments(flow.segments, line.start, line.end),
        rowStart: lineIndex === 0,
        rowEnd: lineIndex === lines.length - 1,
      };
      const height = (lineIndex === 0 ? EXPLANATION_ROW_TOP : 0) + lineH;
      if (pendingLabel) {
        units.push({
          pieces: [pendingLabel.piece, piece],
          height: pendingLabel.height + height,
          topGap: EXPLANATION_LABEL_TOP,
          containerStart: false,
        });
        pendingLabel = null;
      } else {
        units.push({ pieces: [piece], height, topGap: lineIndex === 0 ? EXPLANATION_ROW_TOP : 0, containerStart: false });
      }
    });
  });
  flushLabel();
  return units;
}

/** 단위를 조각에 붙인다 — 앞 조각과 같은 행의 다음 줄이면 한 문단으로 잇는다. */
export function appendExplanationUnit(slice: ExplanationSlice, unit: ExplanationUnit): void {
  if (unit.containerStart) slice.containerStart = true;
  for (const piece of unit.pieces) {
    const last = slice.pieces[slice.pieces.length - 1];
    if (
      last &&
      piece.kind !== "answer" &&
      piece.kind !== "label" &&
      last.kind === piece.kind &&
      last.row === piece.row &&
      !piece.rowStart
    ) {
      const merged = [...last.segments];
      piece.segments.forEach((segment) => pushSegment(merged, segment));
      slice.pieces[slice.pieces.length - 1] = { ...last, segments: merged, rowEnd: piece.rowEnd };
    } else {
      slice.pieces.push(piece.kind === "answer" || piece.kind === "label" ? piece : { ...piece, segments: [...piece.segments] });
    }
  }
}

/** 조판기를 거치지 않은(쪼개지 않은) 해설 전체 — 렌더러의 폴백(legacy 조판 · 조각 정보 없음). */
export function wholeExplanationSlice(rows: readonly ExplanationRow[]): ExplanationSlice {
  const slice: ExplanationSlice = { containerStart: true, atPartStart: false, pieces: [] };
  // 폭은 줄 나눔에만 쓰이고 통짜 조각은 줄을 잇기만 하므로 아무 값이나 된다(행 단위 조각이 나온다).
  for (const unit of layoutExplanationUnits(rows, Number.POSITIVE_INFINITY, false)) {
    appendExplanationUnit(slice, unit);
  }
  return slice;
}
