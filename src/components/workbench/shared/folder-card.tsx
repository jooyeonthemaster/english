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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CollectionItem } from "./types";

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
  // Radix DropdownMenu(=포털 렌더)로 메뉴를 띄운다. 직접 absolute div를 쓰면
  // FolderSection의 overflow-hidden/overflow-auto 컨테이너에 잘려서 "이름 변경/
  // 삭제"가 짤린다. FolderChip·FolderListRow와 동일한 포털 방식으로 통일.
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

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
        const isCopy = (window.event as DragEvent | null)?.shiftKey ?? false;
        onFileDrop(itemId, collection.id, isCopy);
      },
    });
  }, [collection.id, onFileDrop, dragItemType, dragItemIdKey]);

  return (
    <div
      ref={dropRef}
      onClick={editing ? undefined : onClick}
      onContextMenu={(e) => {
        // 우클릭 = 폴더 메뉴(이름 변경/삭제). 좌클릭(진입)과 분리돼 실수 삭제 방지.
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(true);
      }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all hover:shadow-sm group ${
        isDragOver
          ? "bg-white border-blue-400 border-2 scale-[1.02] shadow-md ring-2 ring-blue-200/50"
          : selected
            ? "bg-white border-blue-400 ring-2 ring-blue-300/30"
            : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-slate-200 bg-slate-50 transition-colors">
        {isDragOver ? (
          <FolderOpen className="w-5 h-5 text-blue-600" />
        ) : (
          <Folder className="w-5 h-5 text-slate-500" />
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

      {/* Context menu — 포털 렌더라 부모 overflow에 잘리지 않고 항상 위에 뜬다 */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-100 transition-all"
            aria-label="폴더 메뉴 (우클릭으로도 열 수 있어요)"
            title="우클릭으로도 열 수 있어요"
          >
            <MoreHorizontal className="w-4 h-4 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
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
