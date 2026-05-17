"use client";

import type { ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";

interface DraftSelectionToolbarProps {
  selectedCount: number;
  isAllSelected: boolean;
  onSelectAll: () => void;
  activeFolder: string | null;
  onRemoveFromFolder?: () => void;
  extraActions?: ReactNode;
}

export function DraftSelectionToolbar({
  selectedCount,
  isAllSelected,
  onSelectAll,
  activeFolder,
  onRemoveFromFolder,
  extraActions,
}: DraftSelectionToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex h-9 min-w-0 items-center gap-2.5 px-3">
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-slate-500">
        <Check className="size-4" />
        {selectedCount}개 선택
      </span>
      <span className="shrink-0 text-slate-300">|</span>
      <button
        type="button"
        onClick={onSelectAll}
        className="shrink-0 cursor-pointer text-[11px] font-medium text-slate-600 transition-colors hover:text-slate-800"
      >
        {isAllSelected ? "선택 해제" : "전체 선택"}
      </button>
      <span className="shrink-0 text-slate-300">|</span>

      <div
        className={
          "flex min-w-0 flex-wrap items-center gap-1.5 transition-opacity " +
          (hasSelection ? "" : "pointer-events-none opacity-50")
        }
        aria-disabled={!hasSelection}
      >
        {extraActions}

        {activeFolder && onRemoveFromFolder ? (
          <button
            type="button"
            onClick={onRemoveFromFolder}
            disabled={!hasSelection}
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="size-3.5" />
            폴더에서 제거
          </button>
        ) : null}
      </div>

      <div className="flex-1" />

      {!hasSelection ? (
        <span className="shrink-0 text-[11px] text-slate-400">
          항목을 선택해 작업을 시작하세요
        </span>
      ) : null}
    </div>
  );
}
