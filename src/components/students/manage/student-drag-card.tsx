"use client";

// ============================================================================
// 학생 드래그 카드 — 반 편성 뷰 그리드의 한 장 (v3 design §D4-3, C-3)
//
// draggable payload 는 question-bank-card 규약 동형: `{studentId, studentIds,
// type:"student"}` — 폴더 스택의 범용 추출기(folderDropItemIds `<type>Id/Ids`
// 관례)가 그대로 읽는다. 카드가 현재 선택에 포함돼 있으면 선택 전체가 한
// 덩어리로 끌려간다(getDragStudentIds). 드래그 미리보기는 카드 클론 + 다중
// 개수 배지(setCustomNativeDragPreview — question-bank-card 축약판).
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { cn, getGradeLabel } from "@/lib/utils";
import { METRIC_LABELS } from "@/lib/wording/director-glossary";
import type { ClassRosterStudent } from "@/actions/students/class-folders";

const CLASS_BADGE_MAX = 2;

interface StudentDragCardProps {
  student: ClassRosterStudent;
  /** 이 학생이 편성돼 있는 반 이름들(다대다) — 상위 2개 + "+N" 배지 */
  classNames?: string[];
  selected?: boolean;
  /** 클릭 = 선택 토글(다중 드래그 묶음 만들기) */
  onToggle?: () => void;
  /** 드래그 payload 의 studentIds — 선택 포함 시 선택 전체, 아니면 [자기 id] */
  getDragStudentIds?: (studentId: string) => string[];
  /** 보충 필요 개념 수(선택) — 데이터가 없으면 미표시(과설계 금지) */
  weakConceptCount?: number;
}

export function StudentDragCard({
  student,
  classNames = [],
  selected = false,
  onToggle,
  getDragStudentIds,
  weakConceptCount,
}: StudentDragCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // 최신 콜백 참조 — draggable 재등록 없이 선택 변화를 반영한다.
  const getDragStudentIdsRef = useRef(getDragStudentIds);
  useEffect(() => {
    getDragStudentIdsRef.current = getDragStudentIds;
  }, [getDragStudentIds]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        studentId: student.id,
        studentIds: getDragStudentIdsRef.current?.(student.id) ?? [student.id],
        type: "student",
      }),
      // 미리보기: 카드 클론이 커서를 따라온다. 여러 명이면 뒤에 겹친 카드 +
      // 개수 배지로 "한 덩어리" 느낌(question-bank-card 관용 축약).
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        const count =
          getDragStudentIdsRef.current?.(student.id)?.length ?? 1;
        const isMulti = count > 1;
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: ({ container }) => {
            const rect = container.getBoundingClientRect();
            return { x: Math.min(90, rect.width / 2), y: 20 };
          },
          render: ({ container }) => {
            const source = cardRef.current;
            if (!source) return;
            const rect = source.getBoundingClientRect();
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";
            wrapper.style.width = `${rect.width}px`;
            wrapper.style.height = `${rect.height}px`;
            if (isMulti) {
              const backCount = Math.min(2, count - 1);
              for (let i = backCount; i >= 1; i--) {
                const back = document.createElement("div");
                back.style.position = "absolute";
                back.style.inset = "0";
                back.style.transform = `translate(${i * 5}px, ${i * 5}px)`;
                back.style.borderRadius = "12px";
                back.style.background = "white";
                back.style.border = "1px solid rgb(226, 232, 240)";
                back.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
                wrapper.appendChild(back);
              }
            }
            const clone = source.cloneNode(true) as HTMLElement;
            clone.style.position = "relative";
            clone.style.width = `${rect.width}px`;
            clone.style.margin = "0";
            clone.style.opacity = "1";
            clone.style.transform = "none";
            wrapper.appendChild(clone);
            if (isMulti) {
              const badge = document.createElement("div");
              badge.textContent = String(count);
              badge.style.position = "absolute";
              badge.style.top = "-9px";
              badge.style.right = "-9px";
              badge.style.minWidth = "24px";
              badge.style.height = "24px";
              badge.style.padding = "0 7px";
              badge.style.borderRadius = "12px";
              badge.style.background = "#2563eb";
              badge.style.color = "white";
              badge.style.fontSize = "12px";
              badge.style.fontWeight = "700";
              badge.style.display = "flex";
              badge.style.alignItems = "center";
              badge.style.justifyContent = "center";
              badge.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)";
              badge.style.fontVariantNumeric = "tabular-nums";
              wrapper.appendChild(badge);
            }
            container.appendChild(wrapper);
          },
        });
      },
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [student.id]);

  const visibleClasses = classNames.slice(0, CLASS_BADGE_MAX);
  const hiddenClassCount = classNames.length - visibleClasses.length;

  return (
    <div
      ref={cardRef}
      onClick={onToggle}
      role={onToggle ? "button" : undefined}
      aria-pressed={onToggle ? selected : undefined}
      className={cn(
        "group flex cursor-grab select-none items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-all",
        selected
          ? "border-blue-400 ring-2 ring-blue-200/60"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        isDragging && "opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold",
          selected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600",
        )}
      >
        {student.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-slate-800">
          {student.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
            {getGradeLabel(student.grade)}
          </span>
          {visibleClasses.map((name) => (
            <span
              key={name}
              className="max-w-[88px] truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600"
            >
              {name}
            </span>
          ))}
          {hiddenClassCount > 0 ? (
            <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-semibold text-blue-400 tabular-nums">
              +{hiddenClassCount}
            </span>
          ) : null}
          {typeof weakConceptCount === "number" && weakConceptCount > 0 ? (
            <span className="shrink-0 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 tabular-nums">
              {METRIC_LABELS.WEAK} {weakConceptCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
