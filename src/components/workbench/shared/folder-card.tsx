// @ts-nocheck
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
import type { CollectionItem } from "./types";
import { FOLDER_COLORS } from "./constants";

interface FolderCardProps {
  collection: CollectionItem;
  dragItemType: "question" | "passage" | "exam";
  dragItemIdKey: string;
  itemCountLabel: string;
  selected?: boolean;
  onClick: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onFileDrop: (itemId: string, folderId: string, copy: boolean) => void;
}

export function FolderCard({
  collection,
  dragItemType,
  dragItemIdKey,
  itemCountLabel,
  selected = false,
  onClick,
  onRename,
  onDelete,
  onFileDrop,
}: FolderCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const color =
    collection.color ||
    FOLDER_COLORS[collection.name.charCodeAt(0) % FOLDER_COLORS.length];

  // Close menu on click outside
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

  // Drop target for drag-and-drop
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

  return (
    <div
      ref={dropRef}
      onClick={editing ? undefined : onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm group ${
        isDragOver
          ? "bg-blue-50 border-blue-400 border-2 scale-[1.02] shadow-md"
          : selected
          ? "bg-blue-50 border-blue-300"
          : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
        style={{
          backgroundColor: isDragOver ? `${color}30` : `${color}15`,
        }}
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
            className="text-[13px] font-semibold w-full outline-none border-b border-blue-400 bg-transparent"
          />
        ) : (
          <p className="text-[13px] font-semibold text-slate-800 truncate">
            {collection.name}
          </p>
        )}
        <p className="text-[11px] text-slate-400 mt-0.5">
          {collection._count.items}개 {itemCountLabel}
        </p>
      </div>

      {/* Context menu */}
      <div
        ref={menuRef}
        className="relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all"
        >
          <MoreHorizontal className="w-4 h-4 text-slate-400" />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-8 z-20 w-36 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
            <button
              onClick={() => {
                setEditing(true);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-3 h-3" />이름 변경
            </button>
            <button
              onClick={() => {
                onDelete(collection.id);
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" />삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
