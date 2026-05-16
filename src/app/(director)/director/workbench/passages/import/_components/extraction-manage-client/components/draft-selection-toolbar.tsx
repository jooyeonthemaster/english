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
    <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <button
        type="button"
        onClick={onSelectAll}
        className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-blue-700"
      >
        <Check className="size-4" />
        {selectedCount}개 선택
      </button>
      <span className="hidden h-4 w-px bg-slate-200 sm:inline-block" />
      <button
        type="button"
        onClick={onSelectAll}
        className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        {isAllSelected ? "선택 해제" : "전체 선택"}
      </button>
      <span className="hidden h-4 w-px bg-slate-200 sm:inline-block" />

      {extraActions}

      {activeFolder && onRemoveFromFolder ? (
        <button
          type="button"
          onClick={onRemoveFromFolder}
          disabled={!hasSelection}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-sm font-bold text-red-600 hover:bg-red-50"
        >
          <Trash2 className="size-4" />
          폴더에서 제거
        </button>
      ) : null}
    </div>
  );
}
