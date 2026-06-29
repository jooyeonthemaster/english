import type { PointerEvent as ReactPointerEvent } from "react";
import type { AnalysisSection, BlockMeta, CustomBlock } from "@/lib/passage-report/analysis-report/schema";
import type { CoverEdit } from "../cover-templates";
import type { ActivityAction } from "../custom-activity-renders";
import type { MetaEdit, SectionEdit, WrapKind } from "../report-sections";
export type DropPlacement = "before" | "after";

/** 표 열 너비 컨텍스트 — 저장값/드래그 미리보기 + 조절 콜백을 페이지 트리로 내려보낸다. */
export type ColCtx = {
  widths?: Record<string, Record<string, number>>;
  onDraft?: (group: string, w: Record<string, number>) => void;
  onCommit?: (group: string, w: Record<string, number>) => void;
};

export interface ReportEdit {
  med: MetaEdit;
  sectionEdit: (sectionIndex: number) => SectionEdit;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onReorder: (sourceId: string, targetId: string, placement: DropPlacement) => void;
  onBlockMeta: (id: string, patch: Partial<BlockMeta>) => void;
  /** 커스텀 블록(여백/텍스트) 속성 변경 */
  setCustom: (id: string, patch: Partial<CustomBlock>) => void;
  /** 텍스트 블록 끝에서 Enter → 해당 블록 뒤에 빈 텍스트 블록 삽입 */
  insertTextAfter: (anchorId: string) => void;
  /** 학습 활동 블록 컨트롤(다시 섞기/밀도/정답/삭제) */
  onActivity: (id: string, action: ActivityAction) => void;
  /** 표지 인라인 편집 */
  ced: CoverEdit;
  /** 블록 세로 리사이즈 종료 — 최종 높이(mm) commit */
  onResize: (id: string, heightMm: number) => void;
  /** 표 열 너비(세로 구분선) 조절 — group(grammar/exam/vocab) → 열키→퍼센트 commit */
  onColWidths: (group: string, widths: Record<string, number>) => void;
  /** 섹션 헤더(par-sec-head) 한글/영문 라벨 인라인 편집 — 슬롯키 → { ko?, en? } commit */
  onSectionHeading: (key: string, patch: { ko?: string; en?: string }) => void;
  onDeletePage?: (ids: string[]) => void;
  /** 블록 단위 삭제 — 블록 오른쪽 위 삭제 버튼. */
  onDelete?: (id: string) => void;
  /** 페이지를 한 칸 위(-1)/아래(+1)로 이동 */
  onMovePage?: (ids: string[], dir: -1 | 1) => void;
  drag: {
    startDrag: (e: ReactPointerEvent<HTMLButtonElement>, id: string) => void;
    draggingId: string | null;
    dragOverId: string | null;
    placement: DropPlacement;
  };
}

// ─── 디스크립터 (편집기 패널용) ───────────────────────────────────────────────
export interface ItemDescriptor {
  id: string;
  sectionIndex: number;
  kind: AnalysisSection["kind"] | "title" | "custom" | "cover";
  wrap: WrapKind;
  no: number;
  isSectionStart: boolean;
}
