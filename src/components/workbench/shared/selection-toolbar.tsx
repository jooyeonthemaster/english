// @ts-nocheck
"use client";

import React from "react";
import { Check, Trash2 } from "lucide-react";

interface SelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  activeFolder: string | null;
  onRemoveFromFolder?: () => void;
  extraActions?: React.ReactNode;
  /** Optional content rendered on the right side of the toolbar, before the
   *  selection hint / cancel button. Always enabled regardless of selection. */
  rightSlot?: React.ReactNode;
  /** When true, drops the card chrome (border, shadow, rounded, background)
   *  so the toolbar can be embedded inside another card without competing
   *  for visual weight. Used by FolderSection.selectionBar. */
  embedded?: boolean;
}

export function SelectionToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  onSelectAll,
  onClearSelection,
  activeFolder,
  onRemoveFromFolder,
  extraActions,
  rightSlot,
  embedded = false,
}: SelectionToolbarProps) {
  const hasSelection = selectedCount > 0;

  const chrome = embedded
    ? "transition-colors"
    : "rounded-lg border shadow-sm transition-colors " +
      (hasSelection
        ? "border-blue-200/70 bg-gradient-to-r from-blue-50 via-blue-50/90 to-blue-50/70"
        : "border-slate-200 bg-slate-50/80");

  return (
    <div
      className={`px-3 h-9 flex items-center gap-2.5 shrink-0 ${chrome}`}
    >
      <span
        className={
          "text-[12px] font-medium flex items-center gap-1.5 " +
          (hasSelection ? "text-blue-700" : "text-slate-500")
        }
      >
        <Check className="w-4 h-4" />
        {selectedCount}개 선택
      </span>
      <span className="text-slate-300">|</span>
      <button
        onClick={onSelectAll}
        disabled={totalCount === 0}
        className={
          "text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (hasSelection ? "text-blue-600 hover:text-blue-700" : "text-slate-600 hover:text-slate-800")
        }
      >
        {isAllSelected && hasSelection ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

      <div
        className={
          "flex items-center gap-3 " +
          (hasSelection ? "" : "opacity-50 pointer-events-none")
        }
        aria-disabled={!hasSelection}
      >
        {extraActions}

        {activeFolder && onRemoveFromFolder && (
          <button
            onClick={onRemoveFromFolder}
            className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            폴더에서 제거
          </button>
        )}
      </div>

      <div className="flex-1" />
      {rightSlot && (
        <>
          {rightSlot}
          <span className="text-slate-300">|</span>
        </>
      )}
      {hasSelection ? (
        <button onClick={onClearSelection} className="text-[11px] text-slate-500 hover:text-slate-700">
          선택 취소
        </button>
      ) : (
        <span className="text-[11px] text-slate-400">항목을 선택해 작업을 시작하세요</span>
      )}
    </div>
  );
}
