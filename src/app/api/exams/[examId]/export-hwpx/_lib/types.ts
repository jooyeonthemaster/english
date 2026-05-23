/**
 * HWPX 문서 IR (중간 표현).
 * 도메인 렌더러는 이 IR 만 생성하고, section-xml 가 XML 로 직렬화한다.
 *
 * 단위는 별도 표기가 없으면 모두 HWPUNIT (1/7200 inch).
 * 폰트 size 만 pt 로 받는다.
 */

export type HAlign = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY" | "DISTRIBUTE";
export type VAlign = "TOP" | "CENTER" | "BOTTOM";
export type UnderlineType = "NONE" | "SOLID" | "DOTTED" | "DASHED";

// =============================================================================
// Run-level (인라인)
// =============================================================================

export interface RunStyle {
  fontKr?: string;       // 한글 폰트명 (기본: 한컴바탕)
  fontLatin?: string;    // 영문 폰트명 (기본: Times New Roman)
  size?: number;         // pt
  bold?: boolean;
  italic?: boolean;
  underline?: UnderlineType;
  color?: string;        // "#RRGGBB"
  shadeColor?: string;   // 형광펜
  letterSpacing?: number; // -50~50 (%)
}

export interface TextRunNode {
  kind: "text";
  text: string;
  style?: RunStyle;
}

export interface PageNumRunNode {
  kind: "pageNum";
  style?: RunStyle;
}

export interface TotalPagesRunNode {
  kind: "totalPages";
  style?: RunStyle;
}

export interface LineBreakRunNode {
  kind: "br";
}

export interface ImageRunNode {
  kind: "image";
  data: Buffer;
  mime: "png" | "jpg" | "gif";
  widthHpu: number;
  heightHpu: number;
}

export type RunNode =
  | TextRunNode
  | PageNumRunNode
  | TotalPagesRunNode
  | LineBreakRunNode
  | ImageRunNode;

// =============================================================================
// Paragraph
// =============================================================================

export interface ParaStyle {
  align?: HAlign;
  indentFirst?: number;     // first-line indent (음수=hanging)
  leftMargin?: number;
  rightMargin?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacingPct?: number;  // 100 = single, 160 = ~1.6
}

export interface ParagraphNode {
  kind: "p";
  style?: ParaStyle;
  runs: RunNode[];
  pageBreak?: boolean;
  columnBreak?: boolean;
}

// =============================================================================
// Table (인라인, 텍스트 흐름)
// =============================================================================

export interface BorderSpec {
  type?: "NONE" | "SOLID" | "DASH" | "DOT";
  widthMm?: number;   // 0.1 ~ 5.0
  color?: string;
}

export interface CellBorders {
  left?: BorderSpec;
  right?: BorderSpec;
  top?: BorderSpec;
  bottom?: BorderSpec;
  fillColor?: string; // 셀 배경
}

export interface TableCellNode {
  blocks: BlockNode[];
  colSpan?: number;
  rowSpan?: number;
  widthHpu: number;
  heightHpu: number;
  borders?: CellBorders;
  margins?: { left: number; right: number; top: number; bottom: number };
  vAlign?: VAlign;
}

export interface TableRowNode {
  heightHpu: number;
  cells: TableCellNode[];
}

export interface TableNode {
  kind: "tbl";
  rows: TableRowNode[];
  colWidthsHpu: number[];
  borders?: CellBorders; // 표 외곽
  cellMargins?: { left: number; right: number; top: number; bottom: number };
}

// =============================================================================
// Block 단위
// =============================================================================

export type BlockNode = ParagraphNode | TableNode;

// =============================================================================
// Section (페이지 단위)
// =============================================================================

export interface SectionSpec {
  pageWidthHpu: number;
  pageHeightHpu: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  marginBottom: number;
  marginHeader: number;
  marginFooter: number;
  columns: 1 | 2;
  columnGapHpu: number;
  header?: BlockNode[]; // 페이지 머리말 (옵션)
  footer?: BlockNode[]; // 페이지 꼬리말 (옵션)
  blocks: BlockNode[];
}

export interface HwpxDocument {
  title: string;
  sections: SectionSpec[];
}

// =============================================================================
// 도메인 헬퍼: 빠른 텍스트 런 생성
// =============================================================================

export function txt(text: string, style?: RunStyle): TextRunNode {
  return { kind: "text", text, style };
}

export function para(
  runs: RunNode[],
  style?: ParaStyle,
  extra?: { pageBreak?: boolean; columnBreak?: boolean },
): ParagraphNode {
  return {
    kind: "p",
    runs,
    style,
    pageBreak: extra?.pageBreak,
    columnBreak: extra?.columnBreak,
  };
}

export function emptyPara(spaceAfter?: number): ParagraphNode {
  return { kind: "p", runs: [], style: { spaceAfter } };
}
