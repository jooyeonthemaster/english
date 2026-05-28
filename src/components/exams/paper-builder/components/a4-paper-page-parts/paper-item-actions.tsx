import type * as React from "react";
import {
  ArrowDownToLine,
  BookOpen,
  Columns2,
  FileText,
  Group,
  GripVertical,
  Trash2,
  Ungroup,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { BreakBefore, PaperItem } from "../../types";

interface PaperItemActionsProps {
  item: PaperItem;
  isActive: boolean;
  onStartDrag: (event: React.PointerEvent<HTMLButtonElement>, localId: string) => void;
  onUpdateItem: (localId: string, patch: Partial<PaperItem>) => void;
  onToggleKeepWithPrev: (localId: string) => void;
  onUngroupItem: (localId: string) => void;
  onRegroupByPassage: () => void;
  onRemoveItem: (localId: string) => void;
}

/**
 * Floating action toolbar that hovers above a paper item when active or
 * hovered. Encapsulates point-editing, layout-breaking, group, and delete
 * affordances so the A4 page body stays readable.
 */
export function PaperItemActions({
  item,
  isActive,
  onStartDrag,
  onUpdateItem,
  onToggleKeepWithPrev,
  onUngroupItem,
  onRegroupByPassage,
  onRemoveItem,
}: PaperItemActionsProps) {
  return (
    <div
      className={cn(
        "no-print pointer-events-none absolute -right-2 -top-3 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/paper-item:pointer-events-auto group-hover/paper-item:opacity-100 group-focus-within/paper-item:pointer-events-auto group-focus-within/paper-item:opacity-100",
        isActive && "pointer-events-auto opacity-100",
      )}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          onUpdateItem(item.localId, { includePassage: !item.includePassage });
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-50",
          item.includePassage
            ? "text-blue-600"
            : "text-slate-400 hover:text-slate-700",
        )}
        title="지문 표시 전환"
      >
        <BookOpen className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onToggleKeepWithPrev(item.localId);
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-50",
          item.keepWithPrev
            ? "text-blue-600"
            : "text-slate-400 hover:text-slate-700",
        )}
        title={
          item.keepWithPrev
            ? "한 덩어리로 유지 — 분할 안 함 (켜짐, 클릭 → 자연 흐름)"
            : "한 덩어리로 유지 — 다음 칸/페이지로 통째 이동 (클릭 → 켜짐)"
        }
      >
        <ArrowDownToLine className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          const next: BreakBefore =
            item.breakBefore === "column" ? "auto" : "column";
          onUpdateItem(item.localId, { breakBefore: next });
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md hover:bg-emerald-50",
          item.breakBefore === "column"
            ? "text-emerald-600"
            : "text-slate-400 hover:text-slate-700",
        )}
        title={
          item.breakBefore === "column"
            ? "다음 칸으로 강제 줄바꿈 (켜짐)"
            : "다음 칸으로 강제 줄바꿈"
        }
      >
        <Columns2 className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          const next: BreakBefore =
            item.breakBefore === "page" ? "auto" : "page";
          onUpdateItem(item.localId, { breakBefore: next });
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md hover:bg-blue-50",
          item.breakBefore === "page"
            ? "text-blue-700"
            : "text-slate-400 hover:text-slate-700",
        )}
        title={
          item.breakBefore === "page"
            ? "다음 페이지로 강제 줄바꿈 (켜짐)"
            : "다음 페이지로 강제 줄바꿈"
        }
      >
        <FileText className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onUngroupItem(item.localId);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
        title="현재 문항 묶음 해제"
      >
        <Ungroup className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRegroupByPassage();
        }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-blue-500 hover:bg-blue-50"
        title="지문별 다시 묶기"
      >
        <Group className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemoveItem(item.localId);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
        title="문항 삭제"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <button
        type="button"
        onPointerDown={(event) => onStartDrag(event, item.localId)}
        className="flex h-6 w-6 touch-none cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing"
        title="문항 드래그"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
