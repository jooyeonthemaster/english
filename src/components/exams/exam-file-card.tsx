// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  Calendar,
  Users,
  ClipboardList,
  FileSearch,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { DragHandle, makeCardDragPreview } from "@/components/ui/drag-handle";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { ExamCardPaperPreview } from "./exam-paper-thumbnail";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "@/components/workbench/shared/card-click";

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
  onDelete,
  onShowAnalysis,
}: {
  exam: ExamItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onClick: (id: string) => void;
  onEdit?: (id: string) => void;
  /** 카드 우상단 휴지통 — 단건 삭제(확인 모달). 미지정 시 버튼을 숨긴다. */
  onDelete?: (id: string) => void;
  /** 동형 생성 시험지에만 전달 — 누르면 분석 정보 모달을 연다. */
  onShowAnalysis?: (id: string) => void;
}) {
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const showResults = FEATURE_FLAGS.SHOW_USER_RESULTS;
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();

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
        "group relative flex min-h-[232px] w-full min-w-0 max-w-full flex-row overflow-hidden rounded-xl border bg-white transition-all duration-200 hover:shadow-md cursor-pointer",
        selected ? "ring-2 ring-blue-400 border-blue-300" : "border-slate-200 hover:border-slate-300",
        isDragging && "opacity-40 scale-95",
      )}
    >
      {/* 좌측: 첫 장 실제 렌더 미리보기 — 카드 높이를 위→아래로 가득 채운다 */}
      <div className="relative w-[42%] min-w-[118px] max-w-[164px] shrink-0 self-stretch overflow-hidden border-r border-slate-100 bg-white md:w-[164px]">
        <ExamCardPaperPreview examId={exam.id} />
      </div>

      {/* 우측: 기존 카드 본문 */}
      <div className="flex min-w-0 flex-1 flex-col p-4">
      {/* Top row: handle + checkbox + title */}
      <div className="flex items-start gap-2.5 min-w-0">
        <DragHandle ref={dragHandleRef} className="mt-1 shrink-0" />
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(exam.id, e.shiftKey); }}
          className={cn(
            "w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-1 transition-all",
            selected
              ? "bg-blue-600 text-white border border-blue-600"
              : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400",
          )}
        >
          <Check className="w-3 h-3" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="min-w-0 flex-1 text-[13px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
              {exam.title}
            </h4>
            {/* 제목 줄 우측 끝: 단건 삭제(휴지통) — 제목과 세로 가운데정렬. */}
            {onDelete ? (
              <button
                type="button"
                aria-label="삭제"
                title="삭제"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(exam.id);
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          {/* Info row */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <ClipboardList className="w-3 h-3 text-slate-400" />
              {exam._count.questions}문항
            </span>
            <span
              title="마지막 수정일"
              className="inline-flex shrink-0 items-center text-[11px] tabular-nums text-slate-400"
            >
              {formatDateTime(exam.updatedAt)}
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

      {/* Bottom: 수정(편집 이동) / 인쇄(바로 인쇄) / 저장(횟수 표시 전용) —
          카드 하단 정렬, 무채색. 우측에 분석 정보(동형 한정)·상세 열기. */}
      <div className="mt-auto flex items-center gap-1.5 pt-3">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
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
            className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold tabular-nums text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:bg-white disabled:text-slate-400 disabled:opacity-70 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-400"
          >
            <Pencil className="h-3 w-3 shrink-0" />
            <span className="truncate">수정 {exam.editCount}회</span>
          </button>

          {/* 인쇄: 페이지를 벗어나지 않고 숨김 iframe 으로 인쇄 대화상자를 띄운다.
              ?print=1 라우트가 로드되면 스스로 window.print() 를 호출한다. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const frameId = `exam-print-frame-${exam.id}`;
              document.getElementById(frameId)?.remove();
              const iframe = document.createElement("iframe");
              iframe.id = frameId;
              iframe.setAttribute("aria-hidden", "true");
              iframe.style.position = "fixed";
              iframe.style.right = "0";
              iframe.style.bottom = "0";
              iframe.style.width = "0";
              iframe.style.height = "0";
              iframe.style.border = "0";
              iframe.style.visibility = "hidden";
              iframe.src = `/director/exams/${exam.id}?print=1`;
              iframe.onload = () => {
                const cleanup = () => iframe.remove();
                iframe.contentWindow?.addEventListener("afterprint", cleanup);
                // 대화상자를 닫지 않는 등 afterprint 가 안 와도 결국 정리되도록.
                window.setTimeout(cleanup, 120000);
              };
              document.body.appendChild(iframe);
            }}
            title="바로 인쇄 (지금까지 인쇄한 횟수)"
            aria-label="시험지 인쇄"
            className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold tabular-nums text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
          >
            <Printer className="h-3 w-3 shrink-0" />
            <span className="truncate">인쇄 {exam.printCount}회</span>
          </button>
        </div>

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

        <CardDetailIconButton
          className="size-7 shrink-0 rounded-md shadow-none"
          iconClassName="size-3.5"
          onClick={(e) => {
            e.stopPropagation();
            onClick(exam.id);
          }}
        />
      </div>
      </div>
    </div>
  );
}
