// @ts-nocheck
"use client";

import React from "react";
import { Check, Loader2, FolderX } from "lucide-react";

interface SelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  selectAllLabel?: string;
  deselectAllLabel?: string;
  onSelectAllPages?: () => void;
  selectAllPagesLabel?: string;
  isSelectingAllPages?: boolean;
  isSelectAllPagesDisabled?: boolean;
  onClearSelection: () => void;
  activeFolder: string | null;
  onRemoveFromFolder?: () => void;
  extraActions?: React.ReactNode;
  /** Count unit shown next to selected count ("개"/"편"/"문항"/"부"). Default "개". */
  itemUnit?: string;
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
  selectAllLabel = "전체 선택",
  deselectAllLabel = "선택 해제",
  onSelectAllPages,
  selectAllPagesLabel = "전체 페이지 선택",
  isSelectingAllPages = false,
  isSelectAllPagesDisabled,
  onClearSelection,
  activeFolder,
  onRemoveFromFolder,
  extraActions,
  rightSlot,
  embedded = false,
  itemUnit = "개",
}: SelectionToolbarProps) {
  const hasSelection = selectedCount > 0;

  const chrome = embedded
    ? "transition-colors"
    : "rounded-lg border shadow-sm transition-colors " +
      (hasSelection
        ? "border-slate-200 bg-slate-50"
        : "border-slate-200 bg-slate-50/80");

  return (
    <div className={`px-3 h-9 flex items-center gap-2.5 shrink-0 ${chrome}`}>
      <span
        className={
          "text-[12px] font-medium flex items-center gap-1.5 " +
          (hasSelection ? "text-slate-700" : "text-slate-500")
        }
      >
        <Check className="w-4 h-4" />
        {selectedCount}
        {itemUnit} 선택
      </span>
      <span className="text-slate-300">|</span>
      <button
        onClick={onSelectAll}
        disabled={totalCount === 0}
        className={
          "text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (hasSelection
            ? "text-slate-600 hover:text-slate-800"
            : "text-slate-600 hover:text-slate-800")
        }
      >
        {isAllSelected && hasSelection ? deselectAllLabel : selectAllLabel}
      </button>
      {onSelectAllPages && (
        <>
          <span className="text-slate-300">|</span>
          <button
            onClick={onSelectAllPages}
            disabled={
              (isSelectAllPagesDisabled ?? totalCount === 0) ||
              isSelectingAllPages
            }
            className={
              "inline-flex items-center gap-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
              (hasSelection
                ? "text-slate-600 hover:text-slate-800"
                : "text-slate-600 hover:text-slate-800")
            }
          >
            {isSelectingAllPages && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {selectAllPagesLabel}
          </button>
        </>
      )}
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
            title="폴더에서 삭제"
            aria-label="폴더에서 삭제"
            className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
          >
            <FolderX className="w-3.5 h-3.5" />
            폴더에서 삭제
          </button>
        )}
      </div>

      <div className="flex-1" />
      {hasSelection ? (
        <button
          onClick={onClearSelection}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          선택 취소
        </button>
      ) : null}
      {rightSlot && (
        <>
          <span className="text-slate-300">|</span>
          {rightSlot}
        </>
      )}
    </div>
  );
}
