// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionItem } from "./types";
import { FOLDER_COLORS } from "./constants";

interface FolderChipProps {
  collection: CollectionItem;
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  itemCountLabel: string;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (itemId: string, folderId: string, copy: boolean) => void;
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
      canDrop: ({ source }) => source.data.type === dragItemType,
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
  }, [collection.id, onFileDrop, dragItemType, dragItemIdKey]);

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
        className="flex flex-col items-center justify-center w-[120px] h-[80px] rounded-xl border-2 border-blue-400 bg-blue-50/60 backdrop-blur-sm shadow-lg transition-all animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Folder className="w-5 h-5 mb-1.5" style={{ color }} />
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

  // ─── Normal mode ───
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          ref={dropRef}
          onClick={onClick}
          onDoubleClick={startEditing}
          className={`group flex flex-col items-center justify-center w-[100px] h-[72px] rounded-xl border cursor-pointer transition-all ${
            isDragOver
              ? "bg-blue-50 border-blue-400 scale-105 shadow-md"
              : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          {isDragOver ? (
            <FolderOpen className="w-6 h-6 mb-1" style={{ color }} />
          ) : (
            <Folder className="w-6 h-6 mb-1" style={{ color }} />
          )}
          <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[80px] text-center leading-tight">
            {collection.name}
          </span>
          <span className="text-[9px] text-slate-400">
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
          <FolderOpen className="w-3.5 h-3.5 mr-2" />열기
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
        >
          <Pencil className="w-3.5 h-3.5 mr-2" />이름 변경
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete(collection.id);
          }}
          className="text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" />삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
