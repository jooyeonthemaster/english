// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  Calendar,
  Clock,
  Users,
  ClipboardList,
  FileSearch,
  Pencil,
  Printer,
  Save,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { DragHandle, makeCardDragPreview } from "@/components/ui/drag-handle";
import { CardHoverActionLabel } from "@/components/ui/card-hover-action-label";

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
  updatedAt: string | Date;
  saveCount: number;
  editCount: number;
  printCount: number;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  _count: { questions: number; submissions: number };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExamFileCard({
  exam,
  selected,
  onToggleSelect,
  onClick,
  onEdit,
  onShowAnalysis,
}: {
  exam: ExamItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onClick: (id: string) => void;
  onEdit?: (id: string) => void;
  /** 동형 생성 시험지에만 전달 — 누르면 분석 정보 모달을 연다. */
  onShowAnalysis?: (id: string) => void;
}) {
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;

  useEffect(() => {
    // 네이티브 드래그(폴더 이동)는 손잡이에만 등록 → 카드 본문은 영역 선택용.
    const el = dragHandleRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ examId: exam.id, title: exam.title, type: "exam" }),
      onGenerateDragPreview: makeCardDragPreview(dragRef),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [exam.id, exam.title]);

  return (
    <div
      ref={dragRef}
      data-drag-item-id={exam.id}
      onClick={() => onClick(exam.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onClick(exam.id);
      }}
      className={cn(
        "group relative rounded-xl border bg-white p-4 transition-all duration-200 hover:shadow-md cursor-pointer",
        selected ? "ring-2 ring-blue-400 border-blue-300" : "border-slate-200 hover:border-slate-300",
        isDragging && "opacity-40 scale-95",
      )}
    >
      {/* Top row: handle + checkbox + title */}
      <div className="flex items-start gap-2.5 min-w-0">
        <DragHandle ref={dragHandleRef} className="mt-0.5 shrink-0" />
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
          {/* Info row */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <ClipboardList className="w-3 h-3 text-slate-400" />
              {exam._count.questions}문항
            </span>
            {showResults && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Users className="w-3 h-3 text-slate-400" />
                {exam._count.submissions}명 응시
              </span>
            )}
            {exam.examDate && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Calendar className="w-3 h-3 text-slate-400" />
                {formatDate(exam.examDate)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Class / school tags */}
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

      {/* Activity counters as actions — 수정(편집 이동) / 인쇄(바로 인쇄) /
          저장(횟수 표시 전용). 각 칩에 'N회'를 붙여 '횟수'임을 분명히 한다. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {/* 수정: 누르면 편집 화면으로 이동 */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit?.(exam.id);
          }}
          disabled={!onEdit}
          title="시험지 수정 (지금까지 수정한 횟수)"
          aria-label="시험지 수정"
          className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-blue-100 bg-blue-50/60 px-2 text-[11px] font-semibold tabular-nums text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100/70 hover:text-blue-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:opacity-70 disabled:hover:border-slate-200 disabled:hover:bg-slate-50 disabled:hover:text-slate-400"
        >
          <Pencil className="h-3 w-3 shrink-0" />
          <span className="truncate">수정 {exam.editCount}회</span>
        </button>

        {/* 인쇄: 미리보기를 새 탭으로 열어 바로 인쇄 대화상자를 띄운다 */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            window.open(
              `/director/exams/${exam.id}?print=1`,
              "_blank",
              "noopener,noreferrer",
            );
          }}
          title="바로 인쇄 (지금까지 인쇄한 횟수)"
          aria-label="시험지 인쇄"
          className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-blue-100 bg-blue-50/60 px-2 text-[11px] font-semibold tabular-nums text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100/70 hover:text-blue-800"
        >
          <Printer className="h-3 w-3 shrink-0" />
          <span className="truncate">인쇄 {exam.printCount}회</span>
        </button>

        {/* 저장: 횟수 표시 전용 (버튼 동작 없음) */}
        <span
          title="저장한 횟수"
          className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold tabular-nums text-slate-500"
        >
          <Save className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="truncate">저장 {exam.saveCount}회</span>
        </span>
      </div>

      {/* 카드 클릭 = 상세 열기. 호버 시 '상세보기' 라벨을 좌하단에 노출한다. */}
      <CardHoverActionLabel className="bottom-4 left-4 right-auto" />

      {/* Bottom row: 분석 정보(동형 생성 시험지 한정, 좌) · 마지막 수정일 (최우측) */}
      <div className="flex items-center justify-between gap-2 mt-3">
        {/* 동형 생성 시험지: 분석 정보 — 카드 클릭(상세 열기)과 구분되는 별도 액션 */}
        {onShowAnalysis && (
          <button
            type="button"
            title="분석 정보"
            aria-label="분석 정보"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowAnalysis(exam.id);
            }}
            className="relative z-20 flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <FileSearch className="h-3 w-3 shrink-0" />
            분석 정보
          </button>
        )}

        <span
          title="마지막 수정일"
          className="ml-auto inline-flex items-center gap-1 truncate text-[10px] text-slate-400"
        >
          <Clock className="w-3 h-3 shrink-0 text-slate-300" />
          {formatDate(exam.updatedAt)}
        </span>
      </div>
    </div>
  );
}
