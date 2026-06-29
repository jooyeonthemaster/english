"use client";

import { useState, useRef, useEffect } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
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
import type { CollectionItem } from "./types";
import { formatFolderDate } from "./folder-date";

interface FolderChipProps {
  collection: CollectionItem;
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  itemCountLabel: string;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (
    itemId: string,
    folderId: string,
    folderName: string,
    anchor: { x: number; y: number },
  ) => void;
}

export function FolderChip({
  collection,
  dragItemType,
  dragItemIdKey,
  itemCountLabel,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
}: FolderChipProps) {
  void itemCountLabel;
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editName, setEditName] = useState(collection.name);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => source.data.type === dragItemType,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source, location }) => {
        setIsDragOver(false);
        const itemId = source.data[dragItemIdKey] as string;
        const input = location?.current?.input;
        const anchor = {
          x: input?.clientX ?? window.innerWidth / 2,
          y: input?.clientY ?? window.innerHeight / 2,
        };
        // Defer the move/copy decision to the chooser popover owned by
        // FolderSection — every plain drop asks (tablet-friendly, explicit).
        onFileDrop(itemId, collection.id, collection.name, anchor);
      },
    });
  }, [collection.id, collection.name, onFileDrop, dragItemType, dragItemIdKey]);

  // Auto-focus input when entering edit mode
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

  // ─── Edit mode: inline input inside the chip ───
  if (isEditing) {
    return (
      <div
        ref={dropRef}
        className="flex flex-col items-center justify-center w-[120px] h-[80px] rounded-xl border-2 border-blue-400 bg-white backdrop-blur-sm shadow-lg ring-2 ring-blue-200/50 transition-all animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Folder className="w-5 h-5 mb-1.5 text-slate-500" />
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmRename();
            if (e.key === "Escape") cancelRename();
          }}
          onBlur={confirmRename}
          className="text-[11px] font-semibold w-[100px] text-center outline-none bg-white rounded-md px-2 py-1 border border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
          maxLength={30}
        />
      </div>
    );
  }

  const dateLabel = formatFolderDate(collection.createdAt);

  return (
    <div
      ref={dropRef}
      onClick={onClick}
      onDoubleClick={startEditing}
      onContextMenu={(e) => {
        // 우클릭 = 폴더 메뉴(이름 변경/삭제). 좌클릭(진입)과 분리돼 있어
        // 폴더로 들어가려다 실수로 삭제하는 일을 막는다.
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(true);
      }}
      className={`group relative flex w-[64px] cursor-pointer flex-col items-center justify-center rounded-lg border px-1 py-1 shadow-sm motion-safe:transition-all motion-safe:duration-200 ${
        isDragOver
          ? "scale-105 border-blue-400 bg-white shadow-md ring-2 ring-blue-200/60"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
      }`}
    >
      {isDragOver ? (
        <FolderOpen className="mb-0.5 size-3 text-blue-600" />
      ) : (
        <Folder className="mb-0.5 size-3 text-slate-500" />
      )}
      <span className="max-w-[56px] truncate text-center text-[9.5px] font-bold leading-tight text-slate-800">
        {collection.name}
      </span>
      <span className="text-[8.5px] tabular-nums text-slate-400">
        {collection._count.items}개
      </span>
      {dateLabel ? (
        <span className="text-[8px] tabular-nums text-slate-300">
          {dateLabel}
        </span>
      ) : null}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0.5 top-0.5 inline-flex size-4 cursor-pointer items-center justify-center rounded bg-white/90 text-slate-400 opacity-0 shadow-sm ring-1 ring-slate-200 transition-opacity hover:text-slate-700 group-hover:opacity-100"
            aria-label="폴더 메뉴 (우클릭으로도 열 수 있어요)"
            title="우클릭으로도 열 수 있어요"
          >
            <MoreHorizontal className="size-2.5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
          >
            <Pencil className="w-3.5 h-3.5 mr-2" />
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
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
