// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  FileText,
  Calendar,
  Users,
  ClipboardList,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExamItem {
  id: string;
  title: string;
  type: string;
  status: string;
  examDate: string | Date | null;
  totalPoints: number;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  _count: { questions: number; submissions: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인",
  ONLINE: "온라인",
  VOCAB: "단어",
  MOCK: "모의",
};

const TYPE_COLORS: Record<string, string> = {
  OFFLINE: "bg-slate-100 text-slate-600",
  ONLINE: "bg-blue-100 text-blue-600",
  VOCAB: "bg-violet-100 text-violet-600",
  MOCK: "bg-teal-100 text-teal-600",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  ARCHIVED: "보관",
};

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-slate-400",
  PUBLISHED: "bg-blue-500",
  IN_PROGRESS: "bg-emerald-500",
  COMPLETED: "bg-emerald-600",
  ARCHIVED: "bg-slate-300",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExamFileCard({
  exam,
  selected,
  onToggleSelect,
  onClick,
}: {
  exam: ExamItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onClick: (id: string) => void;
}) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ examId: exam.id, title: exam.title, type: "exam" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [exam.id, exam.title]);

  return (
    <div
      ref={dragRef}
      onClick={() => onClick(exam.id)}
      className={cn(
        "group relative rounded-xl border bg-white p-4 transition-all duration-200 hover:shadow-md cursor-pointer",
        selected ? "ring-2 ring-blue-400 border-blue-300" : "border-slate-200 hover:border-slate-300",
        isDragging && "opacity-40 scale-95",
      )}
    >
      {/* Top row: checkbox + title + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(exam.id, e.shiftKey); }}
            className={cn(
              "w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all",
              selected
                ? "bg-blue-600 text-white border border-blue-600"
                : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400",
            )}
          >
            <Check className="w-3 h-3" />
          </button>
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
              {exam.title}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[exam.status] || "bg-slate-400")} />
              <span className="text-[10px] font-medium text-slate-500">
                {STATUS_LABELS[exam.status] || exam.status}
              </span>
            </div>
          </div>
        </div>

        {/* Type badge */}
        <span className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
          TYPE_COLORS[exam.type] || "bg-slate-100 text-slate-600",
        )}>
          {TYPE_LABELS[exam.type] || exam.type}
        </span>
      </div>

      {/* Info row */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <ClipboardList className="w-3 h-3 text-slate-400" />
          {exam._count.questions}문제
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Users className="w-3 h-3 text-slate-400" />
          {exam._count.submissions}명 응시
        </span>
        {exam.examDate && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Calendar className="w-3 h-3 text-slate-400" />
            {formatDate(exam.examDate)}
          </span>
        )}
      </div>

      {/* Bottom: class/school tags */}
      {(exam.class || exam.school) && (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {exam.class && (
            <span className="inline-flex items-center text-[9px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
              {exam.class.name}
            </span>
          )}
          {exam.school && (
            <span className="inline-flex items-center text-[9px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
              {exam.school.name}
            </span>
          )}
        </div>
      )}

      <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[9px] text-blue-500 font-medium">클릭하여 상세 보기</span>
      </div>
    </div>
  );
}
