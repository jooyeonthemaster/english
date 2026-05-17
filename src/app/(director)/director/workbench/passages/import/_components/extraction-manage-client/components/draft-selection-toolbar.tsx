"use client";

import type { ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";

interface DraftSelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  activeFolder: string | null;
  onRemoveFromFolder?: () => void;
  extraActions?: ReactNode;
  embedded?: boolean;
}

export function DraftSelectionToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  onSelectAll,
  onClearSelection,
  activeFolder,
  onRemoveFromFolder,
  extraActions,
  embedded = false,
}: DraftSelectionToolbarProps) {
  const hasSelection = selectedCount > 0;
  const chrome = embedded
    ? "transition-colors"
    : "rounded-lg border shadow-sm transition-colors " +
      (hasSelection
        ? "border-blue-200/70 bg-gradient-to-r from-blue-50 via-blue-50/90 to-blue-50/70"
        : "border-slate-200 bg-slate-50/80");

  return (
    <div className={`flex h-9 shrink-0 items-center gap-2.5 px-3 ${chrome}`}>
      <span
        className={
          "flex w-[82px] shrink-0 items-center gap-1.5 text-[12px] font-medium tabular-nums " +
          (hasSelection ? "text-blue-700" : "text-slate-500")
        }
      >
        <Check className="h-4 w-4" />
        {selectedCount}개 선택
      </span>
      <span className="text-slate-300">|</span>
      <button
        type="button"
        onClick={onSelectAll}
        disabled={totalCount === 0}
        className={
          "cursor-pointer text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (hasSelection
            ? "text-blue-600 hover:text-blue-700"
            : "text-slate-600 hover:text-slate-800")
        }
      >
        {isAllSelected && hasSelection ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

      <div
        className={
          "flex items-center gap-3 " +
          (hasSelection ? "" : "pointer-events-none opacity-50")
        }
        aria-disabled={!hasSelection}
      >
        {extraActions}

        {activeFolder && onRemoveFromFolder ? (
          <button
            type="button"
            onClick={onRemoveFromFolder}
            className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            폴더에서 제거
          </button>
        ) : null}
      </div>

      <div className="flex-1" />
      {hasSelection ? (
        <button
          type="button"
          onClick={onClearSelection}
          className="cursor-pointer text-[11px] text-slate-500 transition-colors hover:text-slate-700"
        >
          선택 취소
        </button>
      ) : (
        <span className="text-[11px] text-slate-400">
          항목을 선택해 작업을 시작하세요
        </span>
      )}
    </div>
  );
}
