// ============================================================================
// 슬롯 종류 → 배지/판정 헬퍼. 업로드 패널·미리보기·추출요약이 공유해 일관성 유지.
// 톤: slate(중립/제외) · blue(크롭 결과). 주황 없음.
// ============================================================================

import type { ClientPageSlot } from "@/lib/extraction/types";

export interface SlotKindLabel {
  text: string;
  /** Tailwind ring/bg/text 톤 */
  className: string;
}

export function slotKindLabel(slot: ClientPageSlot): SlotKindLabel {
  switch (slot.kind) {
    case "source":
      return {
        text: "잘라낸 원본 · 추출 제외",
        className: "bg-slate-100 text-slate-500 ring-slate-200",
      };
    case "crop":
      return {
        text: slot.regionIndex ? `영역 ${slot.regionIndex}` : "영역",
        className: "bg-blue-50 text-blue-700 ring-blue-100",
      };
    case "merged":
      return {
        text: slot.mergedFromSlotIds?.length
          ? `이어붙인 지문 · ${slot.mergedFromSlotIds.length}장` // 트레이 합치기(A)
          : slot.regionCount
            ? `이어붙인 지문 · ${slot.regionCount}영역` // 크롭 모달 합치기
            : "이어붙인 지문",
        className: "bg-blue-50 text-blue-700 ring-blue-100",
      };
    default:
      return { text: "원본", className: "bg-slate-50 text-slate-500 ring-slate-200" };
  }
}

/** 원본/소스만 크롭 가능 (크롭 결과물은 다시 크롭하지 않음). */
export function isCroppable(slot: ClientPageSlot): boolean {
  return slot.kind == null || slot.kind === "original" || slot.kind === "source";
}

/** 추출 대상 여부 (크롭 떠낸 원본은 제외). */
export function isExtractable(slot: ClientPageSlot): boolean {
  return !slot.excludedFromExtraction;
}

/** 크롭 결과물(영역/이어붙임)인지 — 그룹 들여쓰기 표시용. */
export function isCropChild(slot: ClientPageSlot): boolean {
  return slot.kind === "crop" || slot.kind === "merged";
}
