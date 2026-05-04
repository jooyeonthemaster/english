"use client";

import {
  CheckSquare,
  MinusSquare,
  FolderPlus,
  FolderOpen,
} from "lucide-react";
import type { PassageCollection } from "../types";

interface QueueSelectionBarProps {
  selectedCount: number;
  filteredLength: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  showAddToFolder: boolean;
  setShowAddToFolder: (v: boolean | ((prev: boolean) => boolean)) => void;
  collections: PassageCollection[];
  addingToFolder: boolean;
  onAddToFolder: (collectionId: string) => void;
}

export function QueueSelectionBar({
  selectedCount,
  filteredLength,
  onSelectAll,
  onClearSelection,
  showAddToFolder,
  setShowAddToFolder,
  collections,
  addingToFolder,
  onAddToFolder,
}: QueueSelectionBarProps) {
  return (
    <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
      <button onClick={onSelectAll} className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700">
        {selectedCount === filteredLength ? (
          <CheckSquare className="w-4 h-4" />
        ) : (
          <MinusSquare className="w-4 h-4" />
        )}
        {selectedCount}개 선택
      </button>
      <span className="text-slate-300">|</span>
      <button onClick={onSelectAll} className="text-[11px] text-blue-600 font-medium hover:text-blue-700">
        {selectedCount === filteredLength ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

      {/* Add to folder */}
      <div className="relative">
        <button
          onClick={() => setShowAddToFolder(!showAddToFolder)}
          className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          폴더에 추가
        </button>
        {showAddToFolder && (
          <div className="absolute left-0 top-8 z-20 w-56 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
            {collections.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-slate-400">폴더가 없습니다. 먼저 폴더를 만들어주세요.</p>
            ) : (
              collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onAddToFolder(c.id)}
                  disabled={addingToFolder}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-slate-700 hover:bg-blue-50 transition-colors text-left"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                  {c.name}
                  <span className="ml-auto text-[10px] text-slate-400">{c._count.items}개</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />
      <button onClick={onClearSelection} className="text-[11px] text-slate-500 hover:text-slate-700">
        선택 취소
      </button>
    </div>
  );
}
