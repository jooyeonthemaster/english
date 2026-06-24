// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { Check, FileSearch, PencilLine, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { STATUS_COLORS, STATUS_LABELS, TYPE_COLORS, TYPE_LABELS } from "./constants";
import type { ExamItem } from "./types";
import { DragHandle, makeCardDragPreview } from "@/components/ui/drag-handle";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "@/components/workbench/shared/card-click";

// ---------------------------------------------------------------------------
// 목록 보기 모드에서 사용하는 드래그 가능한 시험 행
// ---------------------------------------------------------------------------

interface ExamListRowProps {
  exam: ExamItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onClick: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onShowAnalysis?: (id: string) => void;
}

export function ExamListRow({
  exam,
  selected,
  onToggleSelect,
  onClick,
  onEdit,
  onDelete,
  onShowAnalysis,
}: ExamListRowProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();

  useEffect(() => {
    // 네이티브 드래그(폴더 이동)는 손잡이에만 등록 → 행 본문은 영역 선택용.
    const el = dragHandleRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        examId: exam.id,
        title: exam.title,
        type: "exam",
      }),
      onGenerateDragPreview: makeCardDragPreview(dragRef),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [exam.id, exam.title]);

  return (
    <div
      ref={dragRef}
      data-drag-item-id={exam.id}
      onMouseDown={preventCardDoubleClickTextSelection}
      onClick={(e) => {
        if (e.detail > 1 || shouldIgnoreCardSelectionClick(e)) return;
        const shiftKey = e.shiftKey;
        scheduleCardSelectionClick(() => onToggleSelect(exam.id, shiftKey));
      }}
      onDoubleClick={(e) => {
        cancelPendingCardSelectionClick();
        clearCardTextSelection();
        if (shouldIgnoreCardDoubleClick(e)) return;
        onClick(exam.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onToggleSelect(exam.id, e.shiftKey);
          return;
        }
        if (e.key !== "Enter") return;
        e.preventDefault();
        onClick(exam.id);
      }}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 rounded-lg bg-white border cursor-pointer transition-all hover:shadow-sm",
        selected
          ? "ring-2 ring-blue-400 border-blue-300"
          : "border-slate-200 hover:border-slate-300",
        isDragging && "opacity-40 scale-95",
      )}
    >
      {/* Drag handle */}
      <DragHandle ref={dragHandleRef} className="shrink-0" />
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(exam.id, e.shiftKey);
        }}
        className={cn(
          "w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 transition-all",
          selected
            ? "bg-blue-600 text-white border border-blue-600"
            : "bg-white border border-slate-300 text-transparent hover:border-blue-400",
        )}
      >
        <Check className="w-3 h-3" />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-[13px] font-medium text-slate-800 group-hover:text-blue-600 transition-colors truncate block">
          {exam.title}
        </span>
      </div>

      {/* Type */}
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
          TYPE_COLORS[exam.type] || "bg-slate-100 text-slate-600",
        )}
      >
        {TYPE_LABELS[exam.type] || exam.type}
      </span>

      {/* Class */}
      <span className="text-[11px] text-slate-500 w-16 truncate shrink-0">
        {exam.class?.name || "-"}
      </span>

      {/* Questions */}
      <span className="text-[11px] text-slate-500 w-14 text-center shrink-0">
        {exam._count.questions}문항
      </span>

      {/* Status */}
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
          STATUS_COLORS[exam.status] || "bg-gray-100 text-gray-600",
        )}
      >
        {STATUS_LABELS[exam.status] || exam.status}
      </span>

      {/* Submissions */}
      {showResults && (
        <span className="text-[11px] text-slate-500 w-12 text-center shrink-0">
          {exam._count.submissions}명
        </span>
      )}

      {/* Actions */}
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {onShowAnalysis && (
          <button
            onClick={() => onShowAnalysis(exam.id)}
            title="분석 정보"
            aria-label="분석 정보"
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-slate-100 transition-colors"
          >
            <FileSearch className="w-3.5 h-3.5 text-slate-400" />
          </button>
        )}
        <button
          onClick={() => onEdit(exam.id)}
          title="시험지 수정"
          aria-label="시험지 수정"
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-blue-50 transition-colors"
        >
          <PencilLine className="w-3.5 h-3.5 text-blue-500" />
        </button>
        <CardDetailIconButton
          className="size-7 rounded-md shadow-none"
          iconClassName="size-3.5"
          onClick={() => onClick(exam.id)}
        />
        {exam.status === "DRAFT" && (
          <button
            onClick={() => onDelete(exam.id)}
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        )}
      </div>
    </div>
  );
}
