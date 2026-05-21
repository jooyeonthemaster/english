// @ts-nocheck
"use client";

import { useState } from "react";
import { ChevronRight, FileText, BadgeCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { QuestionBankCard } from "./question-bank-card";

interface GroupedPassage {
  id: string;
  title: string;
  grade?: number | null;
  semester?: string | null;
  unit?: string | null;
  publisher?: string | null;
  school?: { id: string; name: string } | null;
  analysis: { id: string; updatedAt: Date } | null;
  totalQuestionCount: number;
  questions: any[];
}

interface PassageGroupedViewProps {
  passages: GroupedPassage[];
  gridCols: 2 | 3 | 4;
  viewSize: "lg" | "md" | "sm";
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onToggleStar: (id: string) => void;
  onEdit: (id: string) => void;
}

const SEMESTER_LABELS: Record<string, string> = {
  FIRST: "1학기",
  SECOND: "2학기",
};

function semesterLabel(value?: string | null) {
  if (!value) return null;
  return SEMESTER_LABELS[value] || value;
}

export function PassageGroupedView({
  passages,
  gridCols,
  viewSize,
  selectedIds,
  setSelectedIds,
  onToggleSelect,
  onDelete,
  onApprove,
  onToggleStar,
  onEdit,
}: PassageGroupedViewProps) {
  // Default collapsed — `expanded[id] === true` means open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (passages.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-[13px] text-slate-400">
          조건에 맞는 분석된 지문이 없습니다.
        </p>
        <p className="text-[12px] text-slate-400 mt-1">
          지문 분석 단계를 거친 지문에서 생성된 문제만 표시됩니다.
        </p>
      </div>
    );
  }

  const gridClass =
    gridCols === 2
      ? "grid-cols-1 md:grid-cols-2"
      : gridCols === 3
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  function toggleGroupSelection(ids: string[]) {
    const next = new Set(selectedIds);
    const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
    if (allSelected) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  }

  return (
    <div className="space-y-3">
      {passages.map((passage) => {
        const isOpen = expanded[passage.id] === true;
        const visibleCount = passage.questions.length;
        const hidden =
          passage.totalQuestionCount > visibleCount
            ? passage.totalQuestionCount - visibleCount
            : 0;

        const groupIds = passage.questions.map((q) => q.id);
        const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
        const groupCheckState: boolean | "indeterminate" =
          groupIds.length > 0 && selectedInGroup === groupIds.length
            ? true
            : selectedInGroup > 0
              ? "indeterminate"
              : false;

        const metaChips = [
          passage.school?.name,
          passage.grade ? `${passage.grade}학년` : null,
          semesterLabel(passage.semester),
          passage.unit,
          passage.publisher,
        ].filter(Boolean) as string[];

        return (
          <section
            key={passage.id}
            className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
              isOpen
                ? "border-blue-200 ring-1 ring-blue-100"
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            }`}
          >
            <header
              className={`sticky z-20 flex w-full items-center gap-2.5 border-b px-4 transition-colors ${
                isOpen
                  ? "border-blue-100 bg-blue-50/60"
                  : "border-slate-100/70 bg-white hover:bg-slate-50/70"
              }`}
              style={{ top: "var(--workbench-management-sticky-offset, 0px)" }}
            >
              <div
                className="-m-1 flex shrink-0 cursor-pointer items-center p-1"
                title={`${passage.title} 전체 선택`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroupSelection(groupIds);
                }}
              >
                <Checkbox
                  checked={groupCheckState}
                  aria-label={`${passage.title} 전체 선택`}
                  className="size-4 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggleGroupSelection(groupIds)}
                />
              </div>

              <div className="flex flex-1 items-center gap-2.5 py-3">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "그룹 접기" : "그룹 펼치기"}
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [passage.id]: !isOpen }))
                  }
                  className="flex shrink-0 cursor-pointer items-center"
                >
                  <ChevronRight
                    className={`size-4 text-slate-400 motion-safe:transition-transform motion-safe:duration-150 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                    isOpen
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <FileText className="size-4" aria-hidden="true" />
                </span>

                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [passage.id]: !isOpen }))
                  }
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition-colors hover:opacity-90"
                >
                  <h4 className="truncate text-sm font-bold tracking-tight text-slate-900">
                    {passage.title || "(제목 없음)"}
                  </h4>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ring-1 ${
                      isOpen
                        ? "bg-white text-blue-700 ring-blue-200"
                        : "bg-slate-50 text-slate-600 ring-slate-200"
                    }`}
                  >
                    {visibleCount}개
                  </span>
                  {hidden > 0 && (
                    <span className="shrink-0 text-[10.5px] text-slate-400">
                      (전체 {passage.totalQuestionCount})
                    </span>
                  )}
                  {passage.analysis && (
                    <span className="inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded">
                      <BadgeCheck className="w-2.5 h-2.5" />
                      분석 완료
                    </span>
                  )}
                  <span className="ml-auto text-[11px] font-medium text-slate-400">
                    {isOpen ? "클릭해서 접기" : "클릭해서 펼치기"}
                  </span>
                </button>
              </div>
            </header>

            {isOpen && (
              <div className="p-3">
                {metaChips.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1 pb-3 text-[11px] text-slate-400">
                    {metaChips.map((chip, i) => (
                      <span key={i}>
                        {i > 0 && <span className="mr-1.5">·</span>}
                        {chip}
                      </span>
                    ))}
                  </div>
                )}

                {passage.questions.length === 0 ? (
                  <p className="text-[12px] text-slate-400 text-center py-6">
                    조건에 맞는 문제가 없습니다.
                  </p>
                ) : (
                  <div className={`grid gap-3 ${gridClass}`}>
                    {passage.questions.map((q, idx) => (
                      <QuestionBankCard
                        key={q.id}
                        q={q}
                        num={idx + 1}
                        selected={selectedIds.has(q.id)}
                        onToggle={() => onToggleSelect(q.id)}
                        onDelete={() => onDelete(q.id)}
                        onApprove={() => onApprove(q.id)}
                        onToggleStar={() => onToggleStar(q.id)}
                        onEdit={() => onEdit(q.id)}
                        viewSize={viewSize}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
