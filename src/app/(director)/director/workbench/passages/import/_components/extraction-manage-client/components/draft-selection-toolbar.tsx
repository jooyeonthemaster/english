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
  void totalCount;
  if (selectedCount === 0) return null;

  return (
    <div className="flex h-9 w-full shrink-0 items-center gap-2.5 rounded-lg border border-blue-200/70 bg-gradient-to-r from-blue-50 via-blue-50/90 to-blue-50/70 px-3 shadow-sm">
      <button
        type="button"
        onClick={onSelectAll}
        className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-blue-700"
      >
        <Check className="size-4" />
        {selectedCount}개 선택
      </button>
      <span className="text-slate-300">|</span>
      <button
        type="button"
        onClick={onSelectAll}
        className="cursor-pointer text-xs font-medium text-blue-600"
      >
        {isAllSelected ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

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

      <button
        type="button"
        onClick={onClearSelection}
        className="ml-auto cursor-pointer text-xs text-slate-500 hover:text-slate-700"
      >
        선택 취소
      </button>
    </div>
  );
}
