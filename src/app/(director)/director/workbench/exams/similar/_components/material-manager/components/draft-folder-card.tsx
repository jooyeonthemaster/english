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

import { FOLDER_COLORS } from "@/components/workbench/shared/constants";
import type { CollectionItem } from "@/components/workbench/shared/types";

import { formatFolderDate } from "./folder-date";

interface DraftFolderCardProps {
  collection: CollectionItem;
  dragItemIdKey: string;
  itemCountLabel: string;
  selected?: boolean;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (itemId: string | string[], folderId: string, copy: boolean) => void;
}

const DRAG_TYPE = "draft" as const;
const BULK_DRAG_TYPE = "draft-bulk" as const;

export function DraftFolderCard({
  collection,
  dragItemIdKey,
  itemCountLabel,
  selected = false,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
}: DraftFolderCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const color =
    collection.color ||
    FOLDER_COLORS[collection.name.charCodeAt(0) % FOLDER_COLORS.length];

  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMenu]);

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
        const isCopy =
          (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, collection.id, isCopy);
      },
    });
  }, [collection.id, onFileDrop, dragItemIdKey]);

  return (
    <div
      ref={dropRef}
      onClick={editing ? undefined : onClick}
      className={
        "group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 shadow-sm motion-safe:transition-all motion-safe:duration-200 " +
        (isDragOver
          ? "scale-[1.02] border-2 border-blue-400 bg-blue-50 shadow-md ring-2 ring-blue-200/60"
          : selected
            ? "border-blue-300 bg-blue-50 shadow-md"
            : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md")
      }
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
        style={{ backgroundColor: isDragOver ? `${color}30` : `${color}15` }}
      >
        {isDragOver ? (
          <FolderOpen className="w-5 h-5" style={{ color }} />
        ) : (
          <Folder className="w-5 h-5" style={{ color }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              onRename(collection.id, name);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(collection.id, name);
                setEditing(false);
              }
              if (e.key === "Escape") {
                setName(collection.name);
                setEditing(false);
              }
            }}
            className="w-full border-b border-blue-400 bg-transparent text-sm font-semibold outline-none"
          />
        ) : (
          <p className="truncate text-sm font-semibold text-slate-800">
            {collection.name}
          </p>
        )}
        <p className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-slate-400">
          <span>{collection._count.items}개 {itemCountLabel}</span>
          {formatFolderDate(collection.createdAt) ? (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-[11px]">
                {formatFolderDate(collection.createdAt)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div
        ref={menuRef}
        className="relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg opacity-0 transition-all hover:bg-slate-100 group-hover:opacity-100"
          aria-label="폴더 메뉴"
        >
          <MoreHorizontal className="size-4 text-slate-400" />
        </button>
        {showMenu ? (
          <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setShowMenu(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="size-3.5" />
              이름 변경
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(collection.id);
                setShowMenu(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-3.5" />
              삭제
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
