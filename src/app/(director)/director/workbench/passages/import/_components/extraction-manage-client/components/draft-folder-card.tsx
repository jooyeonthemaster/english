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
  // Radix DropdownMenu(=포털 렌더)로 메뉴를 띄운다. 직접 absolute div를 쓰면
  // 부모의 overflow-hidden/overflow-auto 컨테이너에 잘려서 "이름 변경/삭제"가
  // 짤린다. FolderCard·FolderChip·FolderListRow와 동일한 포털 방식으로 통일.
  const [showMenu, setShowMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const color =
    collection.color ||
    FOLDER_COLORS[collection.name.charCodeAt(0) % FOLDER_COLORS.length];

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
      onContextMenu={(e) => {
        // 우클릭 = 폴더 메뉴(이름 변경/삭제). 좌클릭(진입)과 분리돼 실수 삭제 방지.
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(true);
      }}
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

      {/* Context menu — 포털 렌더라 부모 overflow에 잘리지 않고 항상 위에 뜬다 */}
      <DropdownMenu open={showMenu} onOpenChange={setShowMenu}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg opacity-0 transition-all hover:bg-slate-100 group-hover:opacity-100"
            aria-label="폴더 메뉴 (우클릭으로도 열 수 있어요)"
            title="우클릭으로도 열 수 있어요"
          >
            <MoreHorizontal className="size-4 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            <Pencil className="mr-2 size-3.5" />
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
            <Trash2 className="mr-2 size-3.5" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
