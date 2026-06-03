"use client";

// ============================================================================
// SlotPreviewModal — 썸네일 클릭 시 큰 미리보기. 원본(source)이면 떠낸 크롭 영역을
// 오버레이로 보여주고, "영역 자르기 편집" 버튼으로 크롭 모달을 다시 연다.
// (adaptive-intake — 사용자 요구: 선택 영역을 크게 + 친절하게 안내)
// ============================================================================

import { useEffect } from "react";
import { Crop, X } from "lucide-react";

import type { ClientPageSlot } from "@/lib/extraction/types";
import { cropBoxToStyle } from "./crop-utils";
import { slotKindLabel } from "./slot-meta";

export function SlotPreviewModal({
  slot,
  onClose,
  onEdit,
}: {
  slot: ClientPageSlot;
  onClose: () => void;
  /** 제공되면 "영역 자르기 편집" 버튼 노출 (원본/소스만). */
  onEdit?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const regions = slot.cropRegions ?? [];
  const label = slotKindLabel(slot);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="자료 미리보기"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={
                "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 " +
                label.className
              }
            >
              {label.text}
            </span>
            <span className="truncate text-[13px] font-bold text-slate-900">
              {slot.sourceFileName ?? `${slot.pageIndex + 1}페이지`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Crop className="size-3.5" aria-hidden="true" />
                영역 자르기 편집
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기 (Esc)"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-900/5 p-3">
          <div className="relative inline-block leading-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slot.previewUrl}
              alt={slot.sourceFileName ?? "자료 미리보기"}
              className="block max-h-[72vh] max-w-full w-auto object-contain"
              draggable={false}
            />
            {/* 소스 원본이면 떠낸 크롭 영역을 오버레이 (읽기 전용) */}
            {regions.map((box, i) => (
              <div
                key={i}
                style={cropBoxToStyle(box)}
                className="pointer-events-none absolute border-2 border-blue-500/90 bg-blue-400/10"
              >
                <span className="absolute -left-px -top-px rounded-br bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {regions.length > 0 ? (
          <div className="border-t border-slate-100 px-4 py-2 text-[11.5px] text-slate-500">
            이 원본에서 떠낸 <b className="font-bold text-blue-700">{regions.length}개 영역</b>이 표시됩니다. 원본 자체는 추출에서 제외됩니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}
