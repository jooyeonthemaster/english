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
  fontKr?: string;       // 한글 폰트명 (기본: 맑은 고딕)
  fontLatin?: string;    // 영문 폰트명 (기본: 맑은 고딕)
  size?: number;         // pt
  bold?: boolean;
  italic?: boolean;
  underline?: UnderlineType;
  underlineColor?: string; // 밑줄 색 (기본 본문색). __밑줄__ 은 파랑(#3B82F6).
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
  mime: "png" | "jpg" | "gif" | "bmp";
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

// 떠 있는(floating) 표 배치. 한컴 실제 시험지의 전체폭 머리말이 쓰는 방식:
// treatAsChar="0" + textWrap="IN_FRONT_OF_TEXT" 로 본문 흐름에서 빠져(=secPr 를
// 오염시키지 않음) 지정 좌표에 떠 있는다. 본문은 marginTop 아래에서 정상 시작한다.
//   offset 은 부호 있는 HPU(음수 가능) — 직렬화 시 unsigned 32bit 로 인코딩한다.
export interface TableFloat {
  widthHpu: number; // 표 폭(콘텐츠/전체폭). sz width 로 그대로 쓴다.
  vertRelTo?: "PARA" | "PAGE" | "PAPER" | "COLUMN"; // 기본 PARA
  horzRelTo?: "PARA" | "PAGE" | "PAPER" | "COLUMN"; // 기본 COLUMN
  vertOffsetHpu: number; // 세로 오프셋(음수=위로)
  horzOffsetHpu: number; // 가로 오프셋(음수=왼쪽으로)
  zOrder?: number;
  // 본문과의 어울림. IN_FRONT_OF_TEXT=본문 위에 떠 자리 안 차지(머리말용),
  // TOP_AND_BOTTOM=세로 자리 차지(본문이 아래로 밀림 — 1쪽 전용 본문 헤더용).
  wrap?: "IN_FRONT_OF_TEXT" | "TOP_AND_BOTTOM";
}

export interface TableNode {
  kind: "tbl";
  rows: TableRowNode[];
  colWidthsHpu: number[];
  borders?: CellBorders; // 표 외곽
  cellMargins?: { left: number; right: number; top: number; bottom: number };
  // 표를 감싸는 문단에 적용할 강제 쪽/단 나눔 (미리보기 분할을 HWPX 에 반영할 때 사용).
  pageBreak?: boolean;
  columnBreak?: boolean;
  // 지정 시 본문 흐름에서 빠진 "떠 있는" 표로 직렬화(전체폭 머리말용).
  float?: TableFloat;
}

export interface ColumnControlNode {
  kind: "columnPr";
  columns: 1 | 2;
  columnGapHpu: number;
}

// =============================================================================
// Block 단위
// =============================================================================

export type BlockNode = ParagraphNode | TableNode | ColumnControlNode;

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
  header?: BlockNode[]; // 페이지 머리말 (옵션) — 전체폭 헤더 밴드
  headerApplyFirstOnly?: boolean; // 머리말을 1쪽에만 (기본: 모든 쪽)
  footer?: BlockNode[]; // 페이지 꼬리말 (옵션)
  blocks: BlockNode[];
}

export interface HwpxDocument {
  title: string;
  sections: SectionSpec[];
  // 템플릿(세리프/산세리프)에 따른 본문 기본 글꼴. 미설정 시 ShapeRegistry 기본값 사용.
  defaultFontKr?: string;
  defaultFontLatin?: string;
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

// 문항/블록 단위 서식(글자 크기 배율·굵게·기울임·정렬)을 이미 생성된 BlockNode 트리에
// 후처리로 입힌다. 문항 렌더러(renderQuestionBlock/renderQuestionPart)의 결과 전체를
// 한 번에 조정해, 발문·본문·선지·박스의 모든 텍스트 런 크기를 미리보기(컨테이너 글꼴
// 상속)와 동일하게 비례 확대/축소한다. scale=1 이고 bold/italic/align 이 없으면 무변경.
export function restyleBlockTree(
  blocks: BlockNode[],
  opts: { scale?: number; bold?: boolean; italic?: boolean; align?: HAlign },
): BlockNode[] {
  const scale = opts.scale ?? 1;
  const { bold, italic, align } = opts;
  if (scale === 1 && !bold && !italic && !align) return blocks;
  const fixRun = (run: RunNode) => {
    if (run.kind !== "text" && run.kind !== "pageNum" && run.kind !== "totalPages") {
      return;
    }
    const st = (run.style ??= {});
    if (scale !== 1 && typeof st.size === "number") {
      st.size = Math.round(st.size * scale * 10) / 10;
    }
    if (bold) st.bold = true;
    if (italic) st.italic = true;
  };
  const walk = (bs: BlockNode[]) => {
    for (const b of bs) {
      if (b.kind === "p") {
        b.runs.forEach(fixRun);
        if (align) b.style = { ...(b.style ?? {}), align };
      } else if (b.kind === "tbl") {
        for (const row of b.rows) {
          for (const cell of row.cells) walk(cell.blocks);
        }
      }
    }
  };
  walk(blocks);
  return blocks;
}
