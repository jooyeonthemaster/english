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
}: DraftSelectionToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div
      className={
        "flex h-9 w-full shrink-0 items-center gap-2.5 rounded-lg border px-3 shadow-sm transition-colors " +
        (hasSelection
          ? "border-blue-200/70 bg-gradient-to-r from-blue-50 via-blue-50/90 to-blue-50/70"
          : "border-slate-200 bg-slate-50/80")
      }
    >
      <span
        className={
          "flex items-center gap-1.5 text-sm font-bold " +
          (hasSelection ? "text-blue-700" : "text-slate-500")
        }
      >
        <Check className="size-4" />
        {selectedCount}개 선택
      </span>
      <span className="text-slate-300">|</span>
      <button
        type="button"
        onClick={onSelectAll}
        disabled={totalCount === 0}
        className={
          "cursor-pointer text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (hasSelection ? "text-blue-600 hover:text-blue-700" : "text-slate-600 hover:text-slate-800")
        }
      >
        {isAllSelected && hasSelection ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

      <div
        className={
          "flex items-center gap-2.5 " +
          (hasSelection ? "" : "opacity-50 pointer-events-none")
        }
        aria-disabled={!hasSelection}
      >
        {extraActions}

        {activeFolder && onRemoveFromFolder ? (
          <button
            type="button"
            onClick={onRemoveFromFolder}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="size-3.5" />
            폴더에서 제거
          </button>
        ) : null}
      </div>

      {hasSelection ? (
        <button
          type="button"
          onClick={onClearSelection}
          className="ml-auto cursor-pointer text-xs text-slate-500 hover:text-slate-700"
        >
          선택 취소
        </button>
      ) : (
        <span className="ml-auto text-xs text-slate-400">자료를 선택해 작업을 시작하세요</span>
      )}
    </div>
  );
}
