"use client";

import { useEffect, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { CollectionItem, DragItemType } from "./types";
import { FOLDER_COLORS } from "./constants";
import { formatFolderDate } from "./folder-date";
import { resolveFolderCount } from "./folder-count";
import {
  folderDropCanDrop,
  folderDropItemId,
  isCopyDragModifier,
} from "./folder-drag";

interface FolderListRowProps {
  collection: CollectionItem;
  dragItemType: DragItemType;
  dragItemIdKey: string;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (
    itemId: string | string[],
    folderId: string,
    folderName: string,
    anchor: { x: number; y: number },
    copyShortcut: boolean,
  ) => void;
  selected?: boolean;
  showChevron?: boolean;
  dateWidth?: number;
  countWidth?: number;
}

export function FolderListRow({
  collection,
  dragItemType,
  dragItemIdKey,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
  selected = false,
  showChevron = false,
  dateWidth = 58,
  countWidth = 40,
}: FolderListRowProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
      canDrop: ({ source }) => folderDropCanDrop(dragItemType, source.data.type),
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source, location }) => {
        setIsDragOver(false);
        const itemId = folderDropItemId(source.data, dragItemIdKey);
        const input = location?.current?.input;
        const anchor = {
          x: input?.clientX ?? window.innerWidth / 2,
          y: input?.clientY ?? window.innerHeight / 2,
        };
        // 평소엔 복사/이동 팝오버로 묻고, Alt/Ctrl을 누른 채 드롭하면 팝오버
        // 없이 바로 복사한다(OS 복사-드래그 관례).
        onFileDrop(
          itemId,
          collection.id,
          collection.name,
          anchor,
          isCopyDragModifier(input),
        );
      },
    });
  }, [collection.id, collection.name, onFileDrop, dragItemType, dragItemIdKey]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  function startEditing(e?: React.MouseEvent) {
    e?.stopPropagation();
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

  function cancelRename() {
    setEditName(collection.name);
    setIsEditing(false);
  }

  const dateLabel = formatFolderDate(collection.createdAt);

  return (
    <div
      ref={dropRef}
      onClick={isEditing ? undefined : onClick}
      onDoubleClick={startEditing}
      onContextMenu={(e) => {
        // 우클릭 = 폴더 메뉴(이름 변경/삭제). 좌클릭(진입)과 분리돼 실수 삭제 방지.
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(true);
      }}
      className={
        "group flex h-7 cursor-pointer items-center gap-2 rounded-md border px-2 motion-safe:transition-colors " +
        (isDragOver
          ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200/60"
          : selected
            ? "border-transparent bg-blue-100/70 hover:bg-blue-100"
            : "border-transparent hover:border-slate-200 hover:bg-white")
      }
    >
      {isDragOver ? (
        <FolderOpen className="size-4 shrink-0" style={{ color }} />
      ) : (
        <Folder className="size-4 shrink-0" style={{ color }} />
      )}
      {isEditing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmRename();
            if (e.key === "Escape") cancelRename();
          }}
          onBlur={confirmRename}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[12px] font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
          maxLength={30}
        />
      ) : (
        <span
          className={
            "min-w-0 flex-1 truncate text-[12px] font-semibold " +
            (selected ? "text-blue-800" : "text-slate-800")
          }
        >
          {collection.name}
        </span>
      )}
      <span
        data-fs-col="date"
        style={{ width: dateWidth }}
        className="shrink-0 truncate text-left text-[10.5px] tabular-nums text-slate-400"
      >
        {dateLabel || "—"}
      </span>
      {(() => {
        const count = resolveFolderCount(collection);
        return (
          <span
            data-fs-col="count"
            style={{ width: countWidth }}
            title={count.tooltip}
            className={`shrink-0 truncate text-left text-[11px] tabular-nums ${
              count.includesSubfolders ? "text-blue-500" : "text-slate-400"
            }`}
          >
            {count.display}개
            {count.note ? (
              <span
                className={`ml-1 text-[10px] font-semibold ${
                  count.noteTone === "duplicate"
                    ? "text-amber-600"
                    : "text-blue-400"
                }`}
              >
                {count.note}
              </span>
            ) : null}
          </span>
        );
      })()}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-slate-300 opacity-0 transition-all hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
            aria-label="폴더 메뉴 (우클릭으로도 열 수 있어요)"
            title="우클릭으로도 열 수 있어요"
          >
            <MoreHorizontal className="size-3.5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            <Pencil className="mr-2 size-4" />
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
            <Trash2 className="mr-2 size-4" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChevronRight
        className={
          "size-3.5 shrink-0 " +
          (showChevron
            ? selected
              ? "text-blue-500"
              : "text-slate-300"
            : "invisible")
        }
        aria-hidden="true"
      />
    </div>
  );
}
