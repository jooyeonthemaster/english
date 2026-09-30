import {
  Table,
  TableLayoutType,
  WidthType,
  type ITableOptions,
  type ITableWidthProperties,
} from "docx";

// ---------------------------------------------------------------------------
// DOCX 표 폭(열 그리드) 공용 헬퍼
//
// docx.js 는 Table 에 columnWidths 를 주지 않으면 `<w:tblGrid><w:gridCol w:w="100"/>…`
// (100 twip ≈ 1.8mm) 를 박는다. Word 는 tblW/tcW(백분율)로 다시 계산해 멀쩡해 보이지만,
// 한컴·LibreOffice·Google Docs 는 tblGrid 를 믿어서 FIXED 표가 한 글자 폭 기둥으로
// 무너진다(선지 2열 표·다중 빈칸 표·정답표·1쪽 머리표, 26-09-29 RCA P5/P6).
//
// 규칙: 모든 표는 이 모듈로 만든다.
//   - 열 폭은 담기는 그릇(구역의 단 폭, 중첩 표는 부모 셀의 안쪽 폭)에서 DXA 로 계산한다.
//   - tblGrid·tcW 는 모드와 상관없이 **항상 같은 DXA 값**이다(셀 폭을 %로 내지 않는다 —
//     한컴은 dxa 셀 폭을 따르고 pct 셀 폭의 해석은 검증되지 않았다, 26-09-30 리뷰 DT-R1).
//   - "exact": tblW 도 같은 DXA.
//   - "fill": 그릇 폭을 호출부가 아직 넘기지 못하는 경우만 — tblW 만 100% 로 두어 Word 가
//     실제 폭에 맞춰 비례 확대하게 하고(HEAD 의 머리표 [6800,2900]+100% 와 같은 모양),
//     tblGrid·tcW 에는 추정 그릇 폭의 DXA 를 넣어 한컴 붕괴를 막는다.
//   - 레이아웃은 FIXED 유지.
// ---------------------------------------------------------------------------

export type DocxTableGridMode = "exact" | "fill";

export interface DocxTableGrid {
  /** 열마다의 DXA 폭(정수). 합 = totalDxa. */
  readonly columnWidthsDxa: readonly number[];
  readonly totalDxa: number;
  readonly mode: DocxTableGridMode;
}

export function dxa(size: number): ITableWidthProperties {
  return { size: Math.max(0, Math.round(size)), type: WidthType.DXA };
}

/**
 * total 을 weights 비율로 나눈 정수 DXA 폭. 합이 total 과 정확히 같다(최대 잉여 배분).
 * weights 가 모두 0 이하이면 균등 분할.
 */
export function splitDxa(total: number, weights: readonly number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = Math.max(0, Math.floor(total));
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  const ws = sum > 0 ? safe : safe.map(() => 1);
  const wsum = sum > 0 ? sum : n;
  const raw = ws.map((w) => (t * w) / wsum);
  const out = raw.map((r) => Math.floor(r));
  let rest = t - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ frac: r - out[i], i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % n, rest -= 1) out[order[k].i] += 1;
  return out;
}

/** 그릇 폭(containerDxa)을 weights 비율로 나눈 표 그리드. */
export function tableGrid(
  containerDxa: number,
  weights: readonly number[],
  mode: DocxTableGridMode = "exact",
): DocxTableGrid {
  const columnWidthsDxa = splitDxa(containerDxa, weights);
  return {
    columnWidthsDxa,
    totalDxa: columnWidthsDxa.reduce((a, b) => a + b, 0),
    mode,
  };
}

/** 고정 폭 열(fixedDxa) + 나머지를 채우는 열(null) 구성의 그리드. */
export function tableGridWithFixed(
  containerDxa: number,
  columns: ReadonlyArray<number | null>,
  mode: DocxTableGridMode = "exact",
): DocxTableGrid {
  const fixedSum = columns.reduce<number>((a, c) => a + (c ?? 0), 0);
  const flexCount = columns.filter((c) => c === null).length;
  const flex = splitDxa(Math.max(0, Math.floor(containerDxa) - fixedSum), Array(flexCount).fill(1));
  let fi = 0;
  const columnWidthsDxa = columns.map((c) => (c === null ? flex[fi++] : Math.round(c)));
  return {
    columnWidthsDxa,
    totalDxa: columnWidthsDxa.reduce((a, b) => a + b, 0),
    mode,
  };
}

/** index 열부터 span 칸의 셀 폭 — 그리드와 같은 DXA(모드 무관, tcW = gridCol 합). */
export function gridCellWidth(grid: DocxTableGrid, index: number, span = 1): ITableWidthProperties {
  return dxa(grid.columnWidthsDxa.slice(index, index + span).reduce((a, b) => a + b, 0));
}

/** 셀 안쪽 폭(셀 폭 - 좌우 셀 여백) — 중첩 표의 그릇 폭. */
export function gridCellInnerDxa(
  grid: DocxTableGrid,
  index: number,
  margins: { left?: number; right?: number } = {},
  span = 1,
): number {
  const w = grid.columnWidthsDxa.slice(index, index + span).reduce((a, b) => a + b, 0);
  return Math.max(0, w - (margins.left ?? 0) - (margins.right ?? 0));
}

/**
 * FIXED 레이아웃 표 — tblW·tblGrid 를 그리드에서 채운다(셀 폭은 gridCellWidth 로 맞출 것).
 * tblW: exact = 그리드 합 DXA, fill = 100%(Word 비례 확대). tblGrid 는 항상 DXA.
 */
export function gridTable(
  grid: DocxTableGrid,
  opts: Omit<ITableOptions, "width" | "columnWidths" | "layout">,
): Table {
  return new Table({
    ...opts,
    width:
      grid.mode === "exact"
        ? dxa(grid.totalDxa)
        : { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [...grid.columnWidthsDxa],
    layout: TableLayoutType.FIXED,
  });
}

/** 구역의 한 단 폭(DXA). 균등 단 기준 — Word 와 같은 내림. */
export function sectionColumnWidthDxa(g: {
  pageWidthDxa: number;
  marginLeftDxa: number;
  marginRightDxa: number;
  columns: number;
  columnSpaceDxa: number;
}): number {
  const cols = Math.max(1, Math.floor(g.columns));
  const content = g.pageWidthDxa - g.marginLeftDxa - g.marginRightDxa;
  return Math.floor((content - g.columnSpaceDxa * (cols - 1)) / cols);
}

// ---------------------------------------------------------------------------
// 레거시 렌더러(build-document.ts — settings 없는 시험지) 쪽 설정의 단일 원천.
// ---------------------------------------------------------------------------

export const LEGACY_PAGE_SIZE = { width: 11906, height: 16838 } as const; // A4

export interface LegacyDocGeometry {
  margin: { top: number; bottom: number; left: number; right: number };
  columnCount: 1 | 2;
  columnSpaceDxa: number;
  /** 본문 한 단 폭 — 본문 표의 그릇 폭. */
  columnWidthDxa: number;
}

export function legacyDocGeometry(options?: {
  columns?: 1 | 2;
  density?: "comfortable" | "compact";
}): LegacyDocGeometry {
  const compact = options?.density === "compact";
  const m = compact ? 560 : 720;
  const margin = { top: m, bottom: m, left: m, right: m };
  const columnCount: 1 | 2 = options?.columns ?? 2;
  const columnSpaceDxa = columnCount === 2 ? 480 : 0;
  return {
    margin,
    columnCount,
    columnSpaceDxa,
    columnWidthDxa: sectionColumnWidthDxa({
      pageWidthDxa: LEGACY_PAGE_SIZE.width,
      marginLeftDxa: margin.left,
      marginRightDxa: margin.right,
      columns: columnCount,
      columnSpaceDxa,
    }),
  };
}

/** 레거시 기본(A4·2단·여백 720) 본문 단 폭 = 4993 DXA. 폭 인자를 생략한 레거시 호출의 기본값. */
export const LEGACY_DEFAULT_COLUMN_WIDTH_DXA = legacyDocGeometry().columnWidthDxa;
