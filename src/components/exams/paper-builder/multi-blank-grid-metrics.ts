// ============================================================================
// 다중 빈칸(BLANK_INFERENCE) 조합 선지 — 컬럼 헤더 그리드의 행 높이 추정.
//
// 렌더(multi-blank-option-grid.tsx)는 [번호][값1][……][값2][……][값3] 을 CSS grid 로 그린다.
// 값 컬럼은 `auto`, 번호·구분 컬럼은 `max-content`, 컨테이너는 `w-fit max-w-full` 이다.
// 칸이 좁으면(2단 330px 칸에 3빈칸) 값 컬럼이 각각 80px 안팎으로 눌려 셀마다 3~5줄로 접힌다
// — 선지 1행이 「한 줄짜리 인라인 텍스트」라고 보던 종전 추정은 이 접힘을 못 봐서 그리드를
// 250px 로 잡았는데 실측은 420px 였다(26-09-19 사용자 신고: 조판 페이지 아래로 170px 넘침).
//
// 여기서는 CSS Grid 트랙 크기 알고리즘(§12.5 auto 트랙)을 그대로 따라 한다:
//   1) 각 값 컬럼의 base = min-content(가장 긴 줄바꿈 불가 조각), limit = max-content(가장 긴 셀 전체 폭)
//   2) 남는 폭을 limit 에 닿지 않은 컬럼들에 **균등 분배**(닿으면 동결하고 나머지에 재분배)
//   3) 셀을 그 폭으로 줄바꿈 → 행 높이 = 셀 최대 줄 수 × 줄높이
// 글자 폭은 시험지 임베드 글꼴의 실측 전진폭(exam-font-metrics.ts)을 쓴다 — 열 폭은 「가장 긴
// 단어」 하나로 정해져 평균 폭 모델로는 수 px 씩 틀어진다(실측 열 폭과 0.3px 이내로 일치 확인).
// ============================================================================

import { examTextWidthPx } from "./exam-font-metrics";
import { multiBlankHeaderLabels, multiBlankOptionMatrix, optionDisplayLabel } from "./option-display";
import { OPTION_BLOCK_TOP_GAP, OPTION_ROW_GAP, pageMetrics } from "./pagination-metrics";
import type { PaginationSettings, PaperItem } from "./types";

/** 그리드 열 간격(`columnGap: 0.6em`) */
const GRID_COLUMN_GAP_EM = 0.6;
/** 번호 셀 최소 폭(`min-w-[18px]`) */
const NUMBER_CELL_MIN_PX = 18;
/** 구분 셀 문자열(MULTI_BLANK_DISPLAY_SEPARATOR) */
const SEPARATOR_TEXT = "……";
// 줄바꿈 판정 여유 — 브라우저 서브픽셀 배치와의 오차를 「줄이 하나 더 접히는」 보수 쪽으로 흡수한다.
const FIT_EPSILON_PX = 0.75;

type Piece = { text: string; spaceBefore: boolean };

// 셀 텍스트 → 줄바꿈 가능 조각. 공백 외에 하이픈 뒤(profit-|driven)·한글/전각 글자 사이도 끊긴다
// (브라우저 기본 줄바꿈 규칙 — word-break: normal).
function breakPieces(text: string): Piece[] {
  const pieces: Piece[] = [];
  const words = text.replace(/__/g, "").split(/\s+/).filter(Boolean);
  for (const word of words) {
    let first = true;
    let buf = "";
    const flush = () => {
      if (!buf) return;
      pieces.push({ text: buf, spaceBefore: first && pieces.length > 0 });
      first = false;
      buf = "";
    };
    for (const ch of word) {
      const code = ch.charCodeAt(0);
      const wide = (code >= 0xac00 && code <= 0xd7af) || (code >= 0x3000 && code <= 0x9fff);
      if (wide) {
        flush();
        buf = ch;
        flush();
        continue;
      }
      buf += ch;
      if (ch === "-" || ch === "/") flush();
    }
    flush();
  }
  return pieces;
}

function minContentPx(pieces: Piece[], fontPx: number): number {
  let max = 0;
  for (const p of pieces) max = Math.max(max, examTextWidthPx(p.text, fontPx));
  return max;
}

function maxContentPx(pieces: Piece[], fontPx: number): number {
  let width = 0;
  for (const p of pieces) {
    if (p.spaceBefore) width += examTextWidthPx(" ", fontPx);
    width += examTextWidthPx(p.text, fontPx);
  }
  return width;
}

/** 폭 widthPx 안에서 greedy 줄바꿈한 줄 수(빈 셀 = 1줄). */
export function wrappedLineCount(pieces: Piece[], widthPx: number, fontPx: number): number {
  if (pieces.length === 0) return 1;
  const space = examTextWidthPx(" ", fontPx);
  let lines = 1;
  let lineWidth = 0;
  let lineHasContent = false;
  for (const p of pieces) {
    const w = examTextWidthPx(p.text, fontPx);
    const add = (lineHasContent && p.spaceBefore ? space : 0) + w;
    if (lineHasContent && lineWidth + add > widthPx - FIT_EPSILON_PX) {
      lines += 1;
      lineWidth = w;
    } else {
      lineWidth += add;
    }
    lineHasContent = true;
  }
  return lines;
}

// CSS Grid auto 트랙: base(min) 에서 출발해 여유 폭을 limit(max) 미만 트랙에 균등 분배, 닿으면 동결.
function distributeAutoTracks(mins: number[], maxes: number[], free: number): number[] {
  const widths = [...mins];
  let remaining = free;
  let active = widths.map((w, i) => w < maxes[i]);
  for (let guard = 0; guard < 16 && remaining > 0.001 && active.some(Boolean); guard += 1) {
    const count = active.filter(Boolean).length;
    const share = remaining / count;
    let used = 0;
    widths.forEach((w, i) => {
      if (!active[i]) return;
      const grow = Math.min(share, maxes[i] - w);
      widths[i] = w + grow;
      used += grow;
    });
    remaining -= used;
    active = widths.map((w, i) => w < maxes[i] - 0.001);
  }
  return widths;
}

export interface MultiBlankGridEstimate {
  /** 헤더 행 높이(줄높이 1줄) — 행 간격 제외 */
  headerRowHeight: number;
  /** 선지 행별 높이(행 간격 제외) */
  rowHeights: number[];
  /** 추정 컬럼 폭(px) — 진단용 */
  columnWidths: number[];
}

/**
 * 컬럼 헤더 그리드의 헤더/행 높이를 추정한다.
 * @param rows 선지별 값 배열(multiBlankOptionMatrix(...).rows[i].values — blankCount 로 패딩됨)
 * @param numberLabels 선지 번호 셀 문자열(①~⑤)
 * @param headerLabels (A)/(B)/(C) 헤더 라벨
 * @param availableWidth 그리드가 놓이는 칸(열) 폭
 */
export function estimateMultiBlankGrid(opts: {
  rows: string[][];
  numberLabels: string[];
  headerLabels: string[];
  availableWidth: number;
  fontPx: number;
  lineHeight: number;
}): MultiBlankGridEstimate {
  const { rows, numberLabels, headerLabels, availableWidth, fontPx, lineHeight } = opts;
  const blankCount = Math.max(headerLabels.length, ...rows.map((r) => r.length));
  const cellPieces = rows.map((values) =>
    Array.from({ length: blankCount }, (_, c) => breakPieces(values[c] ?? "")),
  );
  const headerPieces = headerLabels.map((label) => breakPieces(label));

  const mins: number[] = [];
  const maxes: number[] = [];
  for (let c = 0; c < blankCount; c += 1) {
    let min = headerPieces[c] ? minContentPx(headerPieces[c], fontPx) : 0;
    let max = headerPieces[c] ? maxContentPx(headerPieces[c], fontPx) : 0;
    for (const row of cellPieces) {
      min = Math.max(min, minContentPx(row[c], fontPx));
      max = Math.max(max, maxContentPx(row[c], fontPx));
    }
    mins.push(min);
    maxes.push(Math.max(min, max));
  }

  const numberWidth = Math.max(
    NUMBER_CELL_MIN_PX,
    ...numberLabels.map((label) => examTextWidthPx(label, fontPx)),
  );
  const separatorWidth = examTextWidthPx(SEPARATOR_TEXT, fontPx);
  const trackCount = 1 + blankCount + Math.max(0, blankCount - 1);
  const fixed =
    numberWidth +
    separatorWidth * Math.max(0, blankCount - 1) +
    GRID_COLUMN_GAP_EM * fontPx * Math.max(0, trackCount - 1);

  const maxTotal = maxes.reduce((s, w) => s + w, 0);
  const minTotal = mins.reduce((s, w) => s + w, 0);
  const valueBudget = availableWidth - fixed;
  const columnWidths =
    maxTotal <= valueBudget
      ? maxes
      : minTotal >= valueBudget
        ? mins
        : distributeAutoTracks(mins, maxes, valueBudget - minTotal);

  const rowHeights = cellPieces.map((row) => {
    let lines = 1;
    row.forEach((pieces, c) => {
      lines = Math.max(lines, wrappedLineCount(pieces, columnWidths[c], fontPx));
    });
    return lines * lineHeight;
  });

  return { headerRowHeight: lineHeight, rowHeights, columnWidths };
}

/**
 * 문항의 선지 블록 높이(행 간격·헤더 포함) — pagination.ts 가 선지 블록 높이로 그대로 쓴다.
 *   ① 블록 = 목록 위 여백(mt-1.5) + 헤더 행 + 행 간격 + ① 행,  ②~ = 행 간격 + 그 행.
 * 다중 빈칸 조합 선지가 아니면 null(종전 추정 경로).
 * 선지 목록은 문항 pt 와 무관하게 text-[11px](compact 10px) 로 그려지고(a4-paper-page 선지 컨테이너),
 * 줄높이는 페이지(또는 pt 지정 문항)의 행간 배수 1.58(compact 1.46)을 상속한다.
 */
export function estimateMultiBlankOptionHeights(
  item: PaperItem,
  settings: PaginationSettings,
): number[] | null {
  const subType = item.sourceQuestion.subType;
  if (subType !== "BLANK_INFERENCE") return null;
  const matrix = multiBlankOptionMatrix(item.options);
  if (!matrix) return null;
  const compact = settings.density === "compact";
  const fontPx = compact ? 10 : 11;
  const lineHeight = fontPx * (compact ? 1.46 : 1.58);
  const grid = estimateMultiBlankGrid({
    rows: matrix.rows.map((row) => row.values),
    numberLabels: item.options.map((option, index) => optionDisplayLabel(subType, index, option.label)),
    headerLabels: multiBlankHeaderLabels(matrix.blankCount),
    availableWidth: pageMetrics(settings, 0).columnWidth,
    fontPx,
    lineHeight,
  });
  return grid.rowHeights.map((height, index) =>
    index === 0
      ? OPTION_BLOCK_TOP_GAP + grid.headerRowHeight + OPTION_ROW_GAP + height
      : OPTION_ROW_GAP + height,
  );
}
