// @ts-nocheck
"use client";

import { ChevronRight, FolderOpen, FolderPlus, Check, X } from "lucide-react";
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
  breadcrumbPath?: CollectionItem[];
  onNavigateToRoot?: () => void;
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
  breadcrumbPath = [],
  onNavigateToRoot,
  useCardInsideFolder = false,
}: FolderSectionProps) {
  const useCards = useCardInsideFolder && activeFolder;
  const currentFolder = activeFolder ? breadcrumbPath[breadcrumbPath.length - 1] : null;

  return (
    <div
      className="sticky -top-4 z-10 -mx-6 px-6 pt-4 pb-3"
      style={{ background: "rgba(244, 246, 249, 0.92)", backdropFilter: "blur(16px) saturate(180%)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
    >
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FolderOpen className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[13px] font-bold text-slate-800">
                  {currentFolder ? currentFolder.name : "폴더 관리"}
                </h3>
                {currentFolder && (
                  <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                    현재 폴더
                  </span>
                )}
              </div>
              <p className="text-[11px] font-medium text-slate-400">
                {currentFolder ? "이 폴더 안" : "루트"} · 하위 폴더 {childFolders.length}개
              </p>
            </div>
          </div>

          {currentFolder && (
            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11px]">
              <span className="shrink-0 font-semibold text-blue-500">현재 위치</span>
              <span className="h-3 w-px shrink-0 bg-blue-200" />
              <button
                type="button"
                onClick={onNavigateToRoot}
                className="shrink-0 font-medium text-slate-500 hover:text-blue-700"
              >
                전체 문제
              </button>
              {breadcrumbPath.map((folder, index) => {
                const isLast = index === breadcrumbPath.length - 1;
                return (
                  <span key={folder.id} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="h-3 w-3 shrink-0 text-blue-300" />
                    {isLast ? (
                      <span className="truncate font-bold text-blue-700">{folder.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigateToFolder(folder.id)}
                        className="truncate font-medium text-slate-500 hover:text-blue-700"
                      >
                        {folder.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-slate-50/70 px-4 py-3">
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
              <div className="flex w-[176px] min-h-[72px] items-center gap-3 rounded-xl border border-blue-200 bg-white px-3 py-2 shadow-sm ring-2 ring-blue-100/70">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FolderPlus className="w-4.5 h-4.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    autoFocus
                    placeholder="폴더 이름"
                    value={newFolderName}
                    onChange={(e) => onNewFolderNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCreateFolder();
                      if (e.key === "Escape") { onShowNewFolder(false); onNewFolderNameChange(""); }
                    }}
                    className="h-7 w-full rounded-md border border-blue-200 bg-blue-50/40 px-2 text-[12px] font-semibold text-slate-700 outline-none transition-all placeholder:text-blue-300 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={onCreateFolder}
                      className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white transition-colors hover:bg-blue-700"
                    >
                      <Check className="w-3 h-3" />
                      생성
                    </button>
                    <button
                      type="button"
                      onClick={() => { onShowNewFolder(false); onNewFolderNameChange(""); }}
                      className="inline-flex h-6 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                      aria-label="취소"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onShowNewFolder(true)}
                className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-xl border border-dashed border-blue-200 bg-white text-blue-500 shadow-sm hover:border-blue-300 hover:bg-blue-50/70 transition-all"
              >
                <FolderPlus className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-semibold">추가</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
