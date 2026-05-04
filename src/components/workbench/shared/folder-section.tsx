// @ts-nocheck
"use client";

import { FolderPlus, Check, X } from "lucide-react";
import type { CollectionItem } from "./types";
import { FolderChip } from "./folder-chip";
import { FolderCard } from "./folder-card";

interface FolderSectionProps {
  childFolders: CollectionItem[];
  activeFolder: string | null;
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  itemCountLabel: string;
  showNewFolder: boolean;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onShowNewFolder: (show: boolean) => void;
  onCreateFolder: () => void;
  onNavigateToFolder: (id: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onDragToFolder: (itemId: string, folderId: string, copy: boolean) => void;
  /** If true, use full FolderCard inside folders, FolderChip at root */
  useCardInsideFolder?: boolean;
}

export function FolderSection({
  childFolders,
  activeFolder,
  dragItemType,
  dragItemIdKey,
  itemCountLabel,
  showNewFolder,
  newFolderName,
  onNewFolderNameChange,
  onShowNewFolder,
  onCreateFolder,
  onNavigateToFolder,
  onRenameFolder,
  onDeleteFolder,
  onDragToFolder,
  useCardInsideFolder = false,
}: FolderSectionProps) {
  const useCards = useCardInsideFolder && activeFolder;

  return (
    <div
      className="sticky -top-4 z-10 -mx-6 px-6 pt-4 pb-2.5"
      style={{ background: "rgba(244, 246, 249, 0.92)", backdropFilter: "blur(16px) saturate(180%)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-center gap-2.5 flex-wrap">
        {useCards
          ? childFolders.map((c) => (
              <FolderCard
                key={c.id}
                collection={c}
                dragItemType={dragItemType}
                dragItemIdKey={dragItemIdKey}
                itemCountLabel={itemCountLabel}
                selected={false}
                onClick={() => onNavigateToFolder(c.id)}
                onRename={onRenameFolder}
                onDelete={onDeleteFolder}
                onFileDrop={onDragToFolder}
              />
            ))
          : childFolders.map((c) => (
              <FolderChip
                key={c.id}
                collection={c}
                dragItemType={dragItemType}
                dragItemIdKey={dragItemIdKey}
                itemCountLabel={itemCountLabel}
                onClick={() => onNavigateToFolder(c.id)}
                onRename={onRenameFolder}
                onDelete={onDeleteFolder}
                onFileDrop={onDragToFolder}
              />
            ))}
        {showNewFolder ? (
          <div className="flex flex-col items-center justify-center w-[100px] h-[72px] rounded-xl border border-blue-300 bg-blue-50 gap-1">
            <FolderPlus className="w-5 h-5 text-blue-500" />
            <input
              autoFocus
              placeholder="이름 입력"
              value={newFolderName}
              onChange={(e) => onNewFolderNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateFolder();
                if (e.key === "Escape") { onShowNewFolder(false); onNewFolderNameChange(""); }
              }}
              className="text-[10px] font-medium w-[80px] outline-none bg-white/70 rounded px-1.5 py-0.5 text-center placeholder:text-blue-300 border border-blue-200"
            />
            <div className="flex gap-1">
              <button onClick={onCreateFolder} className="w-5 h-5 rounded bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">
                <Check className="w-3 h-3" />
              </button>
              <button onClick={() => { onShowNewFolder(false); onNewFolderNameChange(""); }} className="w-5 h-5 rounded border border-slate-300 bg-white flex items-center justify-center hover:bg-slate-50">
                <X className="w-3 h-3 text-slate-400" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => onShowNewFolder(true)}
            className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl border border-dashed border-slate-300 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all"
          >
            <FolderPlus className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-medium">추가</span>
          </button>
        )}
      </div>
    </div>
  );
}
