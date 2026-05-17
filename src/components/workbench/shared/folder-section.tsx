"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Check,
  X,
  CornerUpLeft,
} from "lucide-react";
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
  onDragToRoot?: (itemId: string, copy: boolean) => void;
  breadcrumbPath?: CollectionItem[];
  onNavigateToRoot?: () => void;
  /** If true, use full FolderCard inside folders, FolderChip at root */
  useCardInsideFolder?: boolean;
  /** Bulk-selection toolbar rendered as the last row of the section. Since
   *  FolderSection is `sticky -top-4`, anything rendered here gets pinned
   *  along with the breadcrumb + folder chips when the user scrolls. Pass
   *  `<SelectionToolbar embedded />` so it inherits the section's chrome. */
  selectionBar?: ReactNode;
  /** Page-specific filters/actions rendered to the right of the folder
   *  title in the header row. Pages should pass their search input + filter
   *  selects + view toggles here so the page-level chrome can stay minimal
   *  (just title + count + primary CTA). */
  toolbar?: ReactNode;
  /** Page-level identity rendered in the FolderSection header — replaces
   *  the default "폴더 관리" label. Pass `{ icon, title, totalCount }` so
   *  the page can drop its top header bar entirely and let this card serve
   *  as the single chrome surface. */
  pageHeader?: {
    icon: ReactNode;
    title: string;
    totalCount: number;
    itemLabel: string;
  };
  rootLabel?: string;
}

interface ParentFolderButtonProps {
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  onClick: () => void;
  onFileDrop: (itemId: string, copy: boolean) => void;
}

function ParentFolderButton({
  dragItemType,
  dragItemIdKey,
  onClick,
  onFileDrop,
}: ParentFolderButtonProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === dragItemType,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId = source.data[dragItemIdKey] as string;
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, isCopy);
      },
    });
  }, [dragItemIdKey, dragItemType, onFileDrop]);

  return (
    <button
      ref={dropRef}
      type="button"
      onClick={onClick}
      className={
        "flex h-[72px] w-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-blue-600 hover:shadow-md " +
        (isDragOver
          ? "scale-105 border-blue-400 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-200/60"
          : "border-slate-200")
      }
    >
      <CornerUpLeft className="mb-0.5 h-5 w-5" aria-hidden="true" />
      <span className="text-[10.5px] font-semibold">상위</span>
    </button>
  );
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
  onDragToRoot,
  breadcrumbPath = [],
  onNavigateToRoot,
  useCardInsideFolder = false,
  selectionBar,
  toolbar,
  pageHeader,
  rootLabel = "전체 문제",
}: FolderSectionProps) {
  const useCards = useCardInsideFolder && activeFolder;
  const currentFolder = activeFolder
    ? breadcrumbPath[breadcrumbPath.length - 1]
    : null;
  const parentFolderId = currentFolder?.parentId ?? null;
  const navigateToParent = () => {
    if (parentFolderId) onNavigateToFolder(parentFolderId);
    else onNavigateToRoot?.();
  };
  const handleDropToParent = (itemId: string, copy: boolean) => {
    if (parentFolderId) onDragToFolder(itemId, parentFolderId, copy);
    else onDragToRoot?.(itemId, copy);
  };

  return (
    <div
      className="sticky top-0 z-10 -mx-6 px-6 pt-2 pb-2.5"
      style={{
        background: "rgba(244, 246, 249, 0.92)",
        backdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-2.5">
          {/* Header row: page/folder identity (left) + page-specific filters/actions (right) */}
          <div className="flex items-center gap-3 min-w-0">
            {pageHeader ? (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  {pageHeader.icon}
                </span>
                <div className="min-w-0 flex items-center gap-2">
                  <h3 className="truncate text-[13px] font-bold text-slate-900">
                    {currentFolder ? currentFolder.name : pageHeader.title}
                  </h3>
                  {currentFolder ? (
                    <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                      현재 폴더
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums">
                    · {pageHeader.itemLabel} {pageHeader.totalCount}개
                    {childFolders.length > 0
                      ? ` · 폴더 ${childFolders.length}개`
                      : ""}
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <FolderOpen className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex items-center gap-2">
                  <h3 className="truncate text-[12px] font-bold text-slate-800">
                    {currentFolder ? currentFolder.name : "폴더 관리"}
                  </h3>
                  {currentFolder ? (
                    <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                      현재 폴더
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[10.5px] font-medium text-slate-400">
                    · 하위 폴더 {childFolders.length}개
                  </span>
                </div>
              </>
            )}

            {toolbar ? (
              <div className="ml-auto flex items-center gap-2 shrink-0">
                {toolbar}
              </div>
            ) : null}
          </div>

          <div className="flex min-h-7 min-w-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11px]">
            <span className="shrink-0 font-semibold text-blue-500">
              현재 위치
            </span>
            <span className="h-3 w-px shrink-0 bg-blue-200" />
            {currentFolder ? (
              <button
                type="button"
                onClick={onNavigateToRoot}
                className="shrink-0 cursor-pointer font-medium text-slate-500 hover:text-blue-700"
              >
                {rootLabel}
              </button>
            ) : (
              <span className="shrink-0 font-bold text-blue-700">
                전체 {itemCountLabel}
              </span>
            )}
            {breadcrumbPath.map((folder, index) => {
              const isLast = index === breadcrumbPath.length - 1;
              return (
                <span
                  key={folder.id}
                  className="flex min-w-0 items-center gap-1"
                >
                  <ChevronRight className="h-3 w-3 shrink-0 text-blue-300" />
                  {isLast ? (
                    <span className="truncate font-bold text-blue-700">
                      {folder.name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateToFolder(folder.id)}
                      className="truncate cursor-pointer font-medium text-slate-500 hover:text-blue-700"
                    >
                      {folder.name}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-50/70 px-4 py-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            {currentFolder ? (
              <ParentFolderButton
                dragItemType={dragItemType}
                dragItemIdKey={dragItemIdKey}
                onClick={navigateToParent}
                onFileDrop={handleDropToParent}
              />
            ) : null}
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
                      const nativeEvent = e.nativeEvent as KeyboardEvent;
                      if (e.key === "Enter") {
                        if (nativeEvent.isComposing || nativeEvent.keyCode === 229 || e.repeat) return;
                        e.preventDefault();
                        e.stopPropagation();
                        onCreateFolder();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        onShowNewFolder(false);
                        onNewFolderNameChange("");
                      }
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
                      onClick={() => {
                        onShowNewFolder(false);
                        onNewFolderNameChange("");
                      }}
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

        {selectionBar ? (
          <div className="border-t border-slate-100 bg-white px-2 py-1.5">
            {selectionBar}
          </div>
        ) : null}
      </section>
    </div>
  );
}
