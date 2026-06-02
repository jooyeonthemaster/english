"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { FOLDER_COLORS } from "@/components/workbench/shared/constants";
import type { CollectionItem } from "@/components/workbench/shared/types";

interface ExamFolderBarProps {
  /** Folders whose parent is the currently active folder (root when null). */
  childFolders: CollectionItem[];
  activeFolder: string | null;
  /** Root → active folder path used for the breadcrumb row. */
  breadcrumbPath: CollectionItem[];
  showNewFolder: boolean;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onShowNewFolder: (show: boolean) => void;
  onCreateFolder: () => void;
  onNavigateToFolder: (id: string) => void;
  onNavigateToRoot: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  /** Add/move dragged question(s) into a folder. */
  onDragToFolder: (itemId: string, folderId: string, copy: boolean) => void;
  /** Remove dragged question(s) from the current folder (drop on 전체 문제). */
  onDragToRoot: (itemId: string, copy: boolean) => void;
}

const DRAG_ITEM_TYPE = "question";
const DRAG_ITEM_ID_KEY = "questionId";

/** Compact pill-style folder chip with a drop target + inline rename + menu. */
function FolderPill({
  collection,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
}: {
  collection: CollectionItem;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (itemId: string, folderId: string, copy: boolean) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(collection.name);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const color =
    collection.color ||
    FOLDER_COLORS[collection.name.charCodeAt(0) % FOLDER_COLORS.length];

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === DRAG_ITEM_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId = source.data[DRAG_ITEM_ID_KEY] as string;
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, collection.id, isCopy);
      },
    });
  }, [collection.id, onFileDrop]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function startEditing() {
    setEditName(collection.name);
    setIsEditing(true);
  }

  function confirmRename() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== collection.name) {
      onRename(collection.id, trimmed);
    }
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div
        ref={dropRef}
        onClick={(e) => e.stopPropagation()}
        className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-blue-400 bg-blue-50 px-2"
      >
        <Folder className="h-3 w-3 shrink-0" style={{ color }} />
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmRename();
            if (e.key === "Escape") setIsEditing(false);
          }}
          onBlur={confirmRename}
          maxLength={30}
          className="w-24 bg-transparent text-[11px] font-medium text-slate-800 outline-none"
        />
      </div>
    );
  }

  return (
    <div
      ref={dropRef}
      onClick={onClick}
      onDoubleClick={startEditing}
      className={cn(
        "group/folder flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-all",
        isDragOver
          ? "scale-105 border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-200/60"
          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      {isDragOver ? (
        <FolderOpen className="h-3 w-3" style={{ color }} />
      ) : (
        <Folder className="h-3 w-3" style={{ color }} />
      )}
      <span className="max-w-[120px] truncate">{collection.name}</span>
      <span className="text-[10px] tabular-nums text-slate-400">
        {collection._count.items}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="-mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded text-slate-300 opacity-0 transition-opacity hover:text-slate-600 group-hover/folder:opacity-100"
            aria-label="폴더 메뉴"
          >
            <MoreHorizontal className="size-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            이름 변경
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete(collection.id);
            }}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** "전체 문제" root chip — active highlight + drop target to pull items out. */
function RootChip({
  active,
  onClick,
  onFileDrop,
}: {
  active: boolean;
  onClick: () => void;
  onFileDrop: (itemId: string, copy: boolean) => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === DRAG_ITEM_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId = source.data[DRAG_ITEM_ID_KEY] as string;
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, isCopy);
      },
    });
  }, [onFileDrop]);

  return (
    <button
      ref={dropRef}
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-[11px] font-medium transition-all",
        active || isDragOver
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50",
        isDragOver && "ring-2 ring-blue-200/60",
      )}
    >
      전체 문제
    </button>
  );
}

export function ExamFolderBar({
  childFolders,
  activeFolder,
  breadcrumbPath,
  showNewFolder,
  newFolderName,
  onNewFolderNameChange,
  onShowNewFolder,
  onCreateFolder,
  onNavigateToFolder,
  onNavigateToRoot,
  onRenameFolder,
  onDeleteFolder,
  onDragToFolder,
  onDragToRoot,
}: ExamFolderBarProps) {
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewFolder) newFolderInputRef.current?.focus();
  }, [showNewFolder]);

  return (
    <div className="mt-2.5 border-t border-slate-100 pt-2.5">
      {/* Breadcrumb — only meaningful once we've navigated into a folder. */}
      {breadcrumbPath.length > 0 && (
        <div className="mb-2 flex items-center gap-0.5 overflow-x-auto text-[11px] text-slate-400">
          <button
            type="button"
            onClick={onNavigateToRoot}
            className="shrink-0 rounded px-1 py-0.5 font-medium hover:bg-slate-100 hover:text-slate-600"
          >
            전체 문제
          </button>
          {breadcrumbPath.map((folder, index) => {
            const isLast = index === breadcrumbPath.length - 1;
            return (
              <Fragment key={folder.id}>
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => onNavigateToFolder(folder.id)}
                  className={cn(
                    "shrink-0 max-w-[140px] truncate rounded px-1 py-0.5",
                    isLast
                      ? "font-semibold text-slate-700"
                      : "font-medium hover:bg-slate-100 hover:text-slate-600",
                  )}
                >
                  {folder.name}
                </button>
              </Fragment>
            );
          })}
        </div>
      )}

      {/* Folder chips for the current level + new-folder control. */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <RootChip
          active={!activeFolder}
          onClick={onNavigateToRoot}
          onFileDrop={onDragToRoot}
        />
        {childFolders.map((folder) => (
          <FolderPill
            key={folder.id}
            collection={folder}
            onClick={() => onNavigateToFolder(folder.id)}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
            onFileDrop={onDragToFolder}
          />
        ))}

        {showNewFolder ? (
          <div className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-blue-400 bg-blue-50 px-2">
            <FolderPlus className="h-3 w-3 shrink-0 text-blue-500" />
            <input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={(e) => onNewFolderNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreateFolder();
                if (e.key === "Escape") {
                  onNewFolderNameChange("");
                  onShowNewFolder(false);
                }
              }}
              placeholder="폴더 이름"
              maxLength={30}
              className="w-24 bg-transparent text-[11px] font-medium text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={onCreateFolder}
              aria-label="폴더 생성"
              className="inline-flex size-4 shrink-0 items-center justify-center rounded text-blue-600 hover:bg-blue-100"
            >
              <Check className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                onNewFolderNameChange("");
                onShowNewFolder(false);
              }}
              aria-label="취소"
              className="inline-flex size-4 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onShowNewFolder(true)}
            className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            <FolderPlus className="h-3 w-3" />
            새 폴더
          </button>
        )}
      </div>
    </div>
  );
}
