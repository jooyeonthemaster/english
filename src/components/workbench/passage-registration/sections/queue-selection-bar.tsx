"use client";

import { CheckSquare, MinusSquare } from "lucide-react";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import type { CollectionItem } from "@/components/workbench/shared/types";
import type { PassageCollection } from "../types";

interface QueueSelectionBarProps {
  selectedCount: number;
  filteredLength: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  collections: PassageCollection[];
  /** Filter currently applied (which folder is "active") — gates the
   *  "현재" badge inside the picker so we don't offer to move items into
   *  the folder they're already in. */
  activeCollectionId: string | null;
  onAddToFolder: (collectionId: string) => void;
  onMoveToFolder: (collectionId: string) => void;
}

// Bridge the slim PassageCollection (no parentId / no children count) into
// the shared picker's CollectionItem shape. Passage-create collections are
// flat, so parentId is always null.
function adaptCollections(list: PassageCollection[]): CollectionItem[] {
  return list.map((c) => ({
    id: c.id,
    parentId: null,
    name: c.name,
    description: c.description,
    color: c.color,
    _count: { items: c._count.items, children: 0 },
  }));
}

export function QueueSelectionBar({
  selectedCount,
  filteredLength,
  onSelectAll,
  onClearSelection,
  collections,
  activeCollectionId,
  onAddToFolder,
  onMoveToFolder,
}: QueueSelectionBarProps) {
  const adapted = adaptCollections(collections);
  const isAllSelected = selectedCount === filteredLength && filteredLength > 0;

  return (
    <div className="flex items-center gap-3 mb-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200">
      <button
        onClick={onSelectAll}
        className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700"
      >
        {isAllSelected ? (
          <CheckSquare className="w-4 h-4" />
        ) : (
          <MinusSquare className="w-4 h-4" />
        )}
        {selectedCount}개 선택
      </button>
      <span className="text-slate-300">|</span>
      <button
        onClick={onSelectAll}
        className="text-[11px] text-blue-600 font-medium hover:text-blue-700"
      >
        {isAllSelected ? "선택 해제" : "전체 선택"}
      </button>
      <span className="text-slate-300">|</span>

      <MoveOrCopyFolderPicker
        collections={adapted}
        activeFolder={activeCollectionId}
        selectedCount={selectedCount}
        onCopy={onAddToFolder}
        onMove={onMoveToFolder}
      />

      <div className="flex-1" />
      <button
        onClick={onClearSelection}
        className="text-[11px] text-slate-500 hover:text-slate-700"
      >
        선택 취소
      </button>
    </div>
  );
}
