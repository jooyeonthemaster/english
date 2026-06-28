import type * as React from "react";
import {
  BookOpen,
  Columns2,
  FileText,
  Group,
  GripVertical,
  Trash2,
  Ungroup,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { KeepTogetherIcon } from "../keep-together-icon";
import type { BreakBefore, PaperItem } from "../../types";
import {
  isSourcePassageForcedForItem,
  shouldRenderSourcePassageForItem,
} from "../../paper-item-utils";

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
  const passageForced = isSourcePassageForcedForItem(item);
  const passageActive = passageForced || shouldRenderSourcePassageForItem(item);

  return (
    <div
      className={cn(
        // 블록 왼쪽 여백에 세로(위→아래)로 띄워 블록 내용을 가리지 않게 한다.
        "no-print pointer-events-none absolute left-0 top-0 -translate-x-full -ml-0.5 z-20 flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-1 opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/paper-item:pointer-events-auto group-hover/paper-item:opacity-100 group-focus-within/paper-item:pointer-events-auto group-focus-within/paper-item:opacity-100",
        isActive && "pointer-events-auto opacity-100",
      )}
    >
      <button
        type="button"
        onPointerDown={(event) => onStartDrag(event, item.localId)}
        className="flex h-5 w-5 touch-none cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing"
        title="문항 드래그"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          if (passageForced) return;
          onUpdateItem(item.localId, { includePassage: !item.includePassage });
        }}
        disabled={passageForced}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md hover:bg-slate-50",
          passageActive
            ? "text-blue-600"
            : "text-slate-400 hover:text-slate-700",
          passageForced && "cursor-not-allowed opacity-75",
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
          "flex h-5 w-5 items-center justify-center rounded-md hover:bg-blue-50",
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
        <KeepTogetherIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          const next: BreakBefore =
            item.breakBefore === "column" ? "auto" : "column";
          onUpdateItem(item.localId, { breakBefore: next });
        }}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-md hover:bg-emerald-50",
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
          "flex h-5 w-5 items-center justify-center rounded-md hover:bg-blue-50",
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
        className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-slate-700"
        title="현재 문항 묶음 해제"
      >
        <Ungroup className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRegroupByPassage();
        }}
        className="flex h-5 w-5 items-center justify-center rounded-md text-blue-500 hover:bg-blue-50"
        title="지문별 다시 묶기"
      >
        <Group className="h-3 w-3" />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemoveItem(item.localId);
        }}
        className="flex h-5 w-5 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50"
        title="문항 삭제"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
