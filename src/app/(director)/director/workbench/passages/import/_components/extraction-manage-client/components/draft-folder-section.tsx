"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Database,
  FolderPlus,
  X,
} from "lucide-react";

import type { CollectionItem } from "@/components/workbench/shared/types";

import { DraftFolderCard } from "./draft-folder-card";
import { DraftFolderChip } from "./draft-folder-chip";

interface DraftFolderSectionProps {
  childFolders: CollectionItem[];
  activeFolder: string | null;
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
  onDragToFolder: (itemId: string | string[], folderId: string, copy: boolean) => void;
  breadcrumbPath?: CollectionItem[];
  onNavigateToRoot?: () => void;
  onNavigateUp?: () => void;
  /** If true, use full FolderCard inside folders, FolderChip at root */
  useCardInsideFolder?: boolean;

  /** Total draft count (across current scope) shown next to the title. */
  totalCount: number;
  /** When 'job', shows a "전체 결과로" button to clear the job scope. */
  resultScope: "all" | "job";
  onBackToAllResults: () => void;
  /** Filter / refresh / queue / upload row rendered on the right of the title. */
  rightArea?: ReactNode;
  /** Compact selection / bulk-action bar rendered at the bottom of the section. */
  selectionToolbar?: ReactNode;
}

export function DraftFolderSection({
  childFolders,
  activeFolder,
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
  onNavigateUp,
  useCardInsideFolder = false,
  totalCount,
  resultScope,
  onBackToAllResults,
  rightArea,
  selectionToolbar,
}: DraftFolderSectionProps) {
  const useCards = useCardInsideFolder && activeFolder;
  const inFolder = Boolean(activeFolder);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100/50">
      {/* Top: page header — title, count, breadcrumb, right action area */}
      <div className="flex flex-col gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {inFolder ? (
            <button
              type="button"
              onClick={onNavigateUp}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-100"
              aria-label="상위 폴더로"
            >
              <ArrowLeft className="size-3.5" />
            </button>
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Database className="size-3.5" aria-hidden="true" />
            </span>
          )}

          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-[13px] font-bold text-slate-900">자료 관리</h3>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
              · {totalCount}개 · 하위 폴더 {childFolders.length}개
            </span>

            {breadcrumbPath.length > 0 ? (
              <div className="ml-1 flex min-w-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={onNavigateToRoot}
                  className="shrink-0 cursor-pointer rounded px-1 text-[11px] font-medium text-slate-400 hover:text-blue-700"
                >
                  전체 자료
                </button>
                {breadcrumbPath.map((folder, index) => {
                  const isLast = index === breadcrumbPath.length - 1;
                  return (
                    <span key={folder.id} className="flex min-w-0 items-center gap-0.5">
                      <ChevronRight className="size-3 shrink-0 text-slate-300" />
                      {isLast ? (
                        <span className="truncate rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-700">
                          {folder.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onNavigateToFolder(folder.id)}
                          className="shrink-0 cursor-pointer rounded px-1 text-[11px] font-medium text-slate-500 hover:text-blue-700"
                        >
                          {folder.name}
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {resultScope === "job" ? (
              <button
                type="button"
                onClick={onBackToAllResults}
                className="ml-1 shrink-0 cursor-pointer rounded-md border border-slate-200 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                전체 결과로
              </button>
            ) : null}
          </div>

          {rightArea ? (
            <div className="ml-auto flex shrink-0 items-center">{rightArea}</div>
          ) : null}
        </div>
      </div>

      {/* Middle: folder strip */}
      <div className="bg-gradient-to-b from-slate-50/80 to-slate-50/40 px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          {useCards
            ? childFolders.map((c) => (
                <DraftFolderCard
                  key={c.id}
                  collection={c}
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
                <DraftFolderChip
                  key={c.id}
                  collection={c}
                  dragItemIdKey={dragItemIdKey}
                  itemCountLabel={itemCountLabel}
                  onClick={() => onNavigateToFolder(c.id)}
                  onRename={onRenameFolder}
                  onDelete={onDeleteFolder}
                  onFileDrop={onDragToFolder}
                />
              ))}
          {showNewFolder ? (
            <div className="flex w-full min-w-[160px] max-w-[200px] items-center gap-2.5 rounded-xl border border-blue-200 bg-white px-2.5 py-2 shadow-sm ring-2 ring-blue-100/70 sm:w-[176px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <FolderPlus className="size-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <input
                  autoFocus
                  placeholder="폴더 이름"
                  value={newFolderName}
                  onChange={(e) => onNewFolderNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    const nativeEvent = e.nativeEvent as KeyboardEvent;
                    if (e.key === "Enter") {
                      if (nativeEvent.isComposing || nativeEvent.keyCode === 229 || e.repeat) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onCreateFolder();
                    }
                    if (e.key === "Escape") {
                      onShowNewFolder(false);
                      onNewFolderNameChange("");
                    }
                  }}
                  className="h-7 w-full rounded-md border border-blue-200 bg-blue-50/40 px-2 text-[11px] font-semibold text-slate-700 outline-none transition-all placeholder:text-blue-300 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onCreateFolder}
                    className="inline-flex h-6 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white transition-colors hover:bg-blue-700"
                  >
                    <Check className="size-3" />
                    생성
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onShowNewFolder(false);
                      onNewFolderNameChange("");
                    }}
                    className="inline-flex h-6 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
                    aria-label="취소"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onShowNewFolder(true)}
              className="flex size-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white text-blue-500 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50/70"
            >
              <FolderPlus className="mb-0.5 size-5" />
              <span className="text-[10.5px] font-semibold">추가</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom: selection / bulk action toolbar */}
      {selectionToolbar ? (
        <div className="border-t border-slate-100 bg-white px-2 py-1.5">
          {selectionToolbar}
        </div>
      ) : null}
    </section>
  );
}
