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
}: SelectionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="px-6 py-2 bg-blue-50 border-b border-blue-200 flex items-center gap-3 shrink-0">
      <button onClick={onSelectAll} className="text-[12px] font-medium text-blue-700 flex items-center gap-1.5">
        <Check className="w-4 h-4" />
        {selectedCount}개 선택
      </button>
      <span className="text-slate-300">|</span>
      <button onClick={onSelectAll} className="text-[11px] text-blue-600 font-medium">
        {isAllSelected ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

      {extraActions}

      {/* Remove from current folder */}
      {activeFolder && onRemoveFromFolder && (
        <button
          onClick={onRemoveFromFolder}
          className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          폴더에서 제거
        </button>
      )}

      <div className="flex-1" />
      <button onClick={onClearSelection} className="text-[11px] text-slate-500 hover:text-slate-700">
        선택 취소
      </button>
    </div>
  );
}
