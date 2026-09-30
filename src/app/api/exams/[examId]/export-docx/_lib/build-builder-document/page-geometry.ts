import { sectionColumnWidthDxa } from "../table-geometry";
import type { BuilderLayout } from "./model";
import { DOCX_PAPER_SIZES, mmToDxa } from "./sizes";

// =============================================================================
// 빌더 DOCX 쪽 기하(용지·여백·단) — 표 폭 계산의 그릇.
//
// assemble.ts(구역 속성)의 계산과 같은 값이어야 한다:
//   여백 = 미리보기 a4-paper-page px 패딩 × (210mm / 760px)
//          comfortable px-[34px] py-[28px], compact px-[28px] py-[24px]
//   2단 간격 = 501 DXA(미리보기 TWO_COLUMN_GAP 32px → 8.842mm)
// 표가 이 값으로 폭을 잡고 구역이 다른 값을 쓰면 한컴에서 표가 단을 넘거나 모자란다 —
// 검사: 생성 XML 의 sectPr 로 그릇 폭을 다시 계산해 tblGrid 합과 대조(DOCX-TABLES 검사기).
// =============================================================================

const MM_PER_PX = 210 / 760; // 0.276316 — assemble.ts MM_PER_PX
export const BUILDER_TWO_COLUMN_SPACE_DXA = 501;

export interface BuilderPageGeometry {
  pageSize: { width: number; height: number };
  margin: { top: number; bottom: number; left: number; right: number };
  columns: 1 | 2;
  columnSpaceDxa: number;
  /** 1쪽 머리표 구역(1단)의 본문 폭. */
  pageContentWidthDxa: number;
  /** 본문 구역의 한 단 폭 — 문항·선지·정답 표의 그릇 폭. */
  bodyColumnWidthDxa: number;
}

export function builderPageGeometry(layout: BuilderLayout | null | undefined): BuilderPageGeometry {
  const l = layout ?? {};
  const columns: 1 | 2 = l.columns === 1 ? 1 : 2;
  const compact = l.density === "compact";
  const pageSize = DOCX_PAPER_SIZES[l.paperSize === "B4" ? "B4" : "A4"];
  const lrDxa = mmToDxa((compact ? 28 : 34) * MM_PER_PX);
  const tbDxa = mmToDxa((compact ? 24 : 28) * MM_PER_PX);
  const margin = { top: tbDxa, bottom: tbDxa, left: lrDxa, right: lrDxa };
  const columnSpaceDxa = columns === 2 ? BUILDER_TWO_COLUMN_SPACE_DXA : 0;
  const pageContentWidthDxa = pageSize.width - margin.left - margin.right;
  return {
    pageSize: { width: pageSize.width, height: pageSize.height },
    margin,
    columns,
    columnSpaceDxa,
    pageContentWidthDxa,
    bodyColumnWidthDxa: sectionColumnWidthDxa({
      pageWidthDxa: pageSize.width,
      marginLeftDxa: margin.left,
      marginRightDxa: margin.right,
      columns,
      columnSpaceDxa,
    }),
  };
}

/**
 * 폭을 넘겨받지 못한 빌더 호출(assemble.ts 의 머리표·정답표 — Wave 2 배선 전)의 추정 그릇:
 * 운영 빌더 시험지 456개 중 451개가 A4·2단(26-09-29 SELECT). B4 는 "fill" 모드라
 * Word 는 종전처럼 100% 폭, 한컴은 A4 추정 그리드로 붕괴 없이 그린다.
 */
export const BUILDER_DEFAULT_BODY_COLUMN_WIDTH_DXA = builderPageGeometry(null).bodyColumnWidthDxa;
