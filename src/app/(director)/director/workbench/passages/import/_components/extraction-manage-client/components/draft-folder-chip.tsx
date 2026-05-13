"use client";

import { useState, useRef, useEffect } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FOLDER_COLORS } from "@/components/workbench/shared/constants";
import type { CollectionItem } from "@/components/workbench/shared/types";

interface DraftFolderChipProps {
  collection: CollectionItem;
  dragItemIdKey: string;
  itemCountLabel: string;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (itemId: string, folderId: string, copy: boolean) => void;
}

const DRAG_TYPE = "draft" as const;

export function DraftFolderChip({
  collection,
  dragItemIdKey,
  itemCountLabel,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
}: DraftFolderChipProps) {
  void itemCountLabel;
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
      canDrop: ({ source }) => source.data.type === DRAG_TYPE,
      onDragEnter: () => setIsDragOver(true),
      onDragLeave: () => setIsDragOver(false),
      onDrop: ({ source }) => {
        setIsDragOver(false);
        const itemId = source.data[dragItemIdKey] as string;
        const isCopy =
          (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, collection.id, isCopy);
      },
    });
  }, [collection.id, onFileDrop, dragItemIdKey]);

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

  if (isEditing) {
    return (
      <div
        ref={dropRef}
        className="flex w-[120px] flex-col items-center justify-center rounded-xl border-2 border-blue-400 bg-blue-50/60 px-2 py-2 shadow-lg transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <Folder className="mb-1 size-5" style={{ color }} />
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmRename();
            if (e.key === "Escape") cancelRename();
          }}
          onBlur={confirmRename}
          className="w-[100px] rounded-md border border-blue-300 bg-white px-2 py-1 text-center text-[11px] font-semibold text-slate-700 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          maxLength={30}
        />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          ref={dropRef}
          onClick={onClick}
          onDoubleClick={startEditing}
          className={
            "group flex w-[96px] cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-2 shadow-sm motion-safe:transition-all motion-safe:duration-200 " +
            (isDragOver
              ? "scale-105 border-blue-400 bg-blue-50 shadow-md ring-2 ring-blue-200/60"
              : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md")
          }
        >
          {isDragOver ? (
            <FolderOpen className="mb-0.5 size-5" style={{ color }} />
          ) : (
            <Folder className="mb-0.5 size-5" style={{ color }} />
          )}
          <span className="max-w-[84px] truncate text-center text-[11px] font-bold leading-tight text-slate-800">
            {collection.name}
          </span>
          <span className="text-[10px] tabular-nums text-slate-400">
            {collection._count.items}개
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <FolderOpen className="mr-2 size-4" />
          열기
        </DropdownMenuItem>
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
  );
}
