"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderOpen,
  FolderPlus,
  Check,
  X,
  CornerUpLeft,
} from "lucide-react";

import type { CollectionItem } from "@/components/workbench/shared/types";

import { DraftFolderCard } from "./draft-folder-card";
import { DraftFolderChip } from "./draft-folder-chip";

const DRAG_TYPE = "draft" as const;
const BULK_DRAG_TYPE = "draft-bulk" as const;

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
  onDragToFolder: (
    itemId: string | string[],
    folderId: string,
    copy: boolean,
  ) => void;
  onDragToRoot?: (itemId: string | string[], copy: boolean) => void;
  breadcrumbPath?: CollectionItem[];
  onNavigateToRoot?: () => void;
  /** If true, use full FolderCard inside folders, FolderChip at root */
  useCardInsideFolder?: boolean;
  selectionBar?: ReactNode;
  toolbar?: ReactNode;
  pageHeader?: {
    icon: ReactNode;
    title: string;
    totalCount: number;
    itemLabel: string;
    description?: string;
  };
  resultScope?: "all" | "job";
  onBackToAllResults?: () => void;
}

interface ParentFolderButtonProps {
  dragItemIdKey: string;
  onClick: () => void;
  onFileDrop: (itemId: string | string[], copy: boolean) => void;
}

function ParentFolderButton({
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
      canDrop: ({ source }) =>
        source.data.type === DRAG_TYPE || source.data.type === BULK_DRAG_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId =
          source.data.type === BULK_DRAG_TYPE
            ? (source.data.draftIds as string[])
            : (source.data[dragItemIdKey] as string);
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, isCopy);
      },
    });
  }, [dragItemIdKey, onFileDrop]);

  return (
    <button
      ref={dropRef}
      type="button"
      onClick={onClick}
      className={
        "flex size-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-blue-600 hover:shadow-md " +
        (isDragOver
          ? "scale-105 border-blue-400 bg-blue-50 text-blue-700 shadow-md ring-2 ring-blue-200/60"
          : "border-slate-200")
      }
    >
      <CornerUpLeft className="mb-0.5 size-5" aria-hidden="true" />
      <span className="text-[10.5px] font-semibold">상위</span>
    </button>
  );
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
  onDragToRoot,
  breadcrumbPath = [],
  onNavigateToRoot,
  useCardInsideFolder = false,
  selectionBar,
  toolbar,
  pageHeader,
  resultScope = "all",
  onBackToAllResults,
}: DraftFolderSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const useCards = useCardInsideFolder && activeFolder;
  const currentFolder = activeFolder
    ? breadcrumbPath[breadcrumbPath.length - 1]
    : null;
  const title = currentFolder?.name ?? pageHeader?.title ?? "폴더 관리";
  const description = currentFolder
    ? "현재 폴더 안의 자료를 정리하고 검수합니다."
    : pageHeader?.description;
  const parentFolderId = currentFolder?.parentId ?? null;
  const navigateToParent = () => {
    if (parentFolderId) onNavigateToFolder(parentFolderId);
    else onNavigateToRoot?.();
  };
  const handleDropToParent = (itemId: string | string[], copy: boolean) => {
    if (parentFolderId) onDragToFolder(itemId, parentFolderId, copy);
    else onDragToRoot?.(itemId, copy);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            {pageHeader?.icon ?? <FolderOpen className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="truncate text-[13px] font-bold text-slate-900">
              {title}
            </h3>
            {pageHeader ? (
              <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums">
                · {pageHeader.itemLabel} {pageHeader.totalCount}개
                {childFolders.length > 0
                  ? ` · 폴더 ${childFolders.length}개`
                  : ""}
              </span>
            ) : (
              <span className="shrink-0 text-[10.5px] font-medium text-slate-400">
                · 하위 폴더 {childFolders.length}개
              </span>
            )}
            {currentFolder ? (
              <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                현재 폴더
              </span>
            ) : null}
            {resultScope === "job" && onBackToAllResults ? (
              <button
                type="button"
                onClick={onBackToAllResults}
                className="shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
              >
                전체 결과로
              </button>
            ) : null}
          </div>
          {description ? (
            <span className="hidden min-w-0 truncate text-[11px] text-slate-400 xl:block">
              {description}
            </span>
          ) : null}
          {toolbar ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {toolbar}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            title={collapsed ? "관리 바 펼치기" : "관리 바 접기"}
            className={`${toolbar ? "ml-1" : "ml-auto"} inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          >
            {collapsed ? (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            )}
            <span>{collapsed ? "펼치기" : "접기"}</span>
          </button>
        </div>

        {!collapsed ? <div className="flex min-h-7 min-w-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[11px]">
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
              전체 자료
            </button>
          ) : (
            <span className="shrink-0 font-bold text-blue-700">전체 자료</span>
          )}
          {breadcrumbPath.map((folder, index) => {
            const isLast = index === breadcrumbPath.length - 1;
            return (
              <span
                key={folder.id}
                className="flex min-w-0 items-center gap-1"
              >
                <ChevronRight className="size-3 shrink-0 text-blue-300" />
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
        </div> : null}
      </div>

      {!collapsed ? <div className="bg-slate-50/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {currentFolder ? (
            <ParentFolderButton
              dragItemIdKey={dragItemIdKey}
              onClick={navigateToParent}
              onFileDrop={handleDropToParent}
            />
          ) : null}
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
                    if (e.key === "Enter") {
                      if (e.nativeEvent.isComposing) return;
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
      </div> : null}

      {!collapsed && selectionBar ? (
        <div className="border-t border-slate-100 bg-white px-2 py-1.5">
          {selectionBar}
        </div>
      ) : null}
    </section>
  );
}
