// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { ChevronRight, FileText, BadgeCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import { QuestionBankCard } from "./question-bank-card";
import { DragSelect } from "@/components/ui/drag-select";

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
  gridCols: 1 | 2 | 3 | 4 | "list";
  viewSize: "lg" | "md" | "sm";
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  /**
   * 마키(영역 드래그) 시작 영역을 그룹 그리드 바깥(콘텐츠 영역 전체)까지 넓히기 위한
   * boundary. 그룹마다 DragSelect 가 하나씩 렌더되지만 모두 같은 boundary·선택집합을
   * 공유하므로, 한 번의 드래그로 그룹을 가로질러 카드를 선택할 수 있다.
   */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onUnapprove?: (id: string) => void;
  onToggleStar: (id: string) => void;
  onDetail: (id: string) => void;
  onEdit: (id: string) => void;
  showManagementActions?: boolean;
  showStar?: boolean;
  enableDrag?: boolean;
  compactUsageLabel?: boolean;
  cardClickSelects?: boolean;
  showDetailButton?: boolean;
  selectedCardHighlight?: boolean;
  dragRequiresSelection?: boolean;
  getDragQuestionIds?: (draggedId: string) => string[];
  getDuplicateDragQuestionIds?: (draggedId: string) => string[];
  selectionOrder?: Map<string, number>;
  // 시험지 미리보기에서 현재 클릭한 문항 id — 해당 카드를 진한 파랑 테두리로 강조한다.
  activeQuestionId?: string | null;
  // 방금 상세를 열어본 문항 id(모달 닫혀도 유지) + 지금 열려 있는 상세 id.
  // 두 값으로 "상세를 닫는 순간 그 카드만 한 번 배경 반짝임"을 만든다.
  lastViewedQuestionId?: string | null;
  openDetailQuestionId?: string | null;
  disabledIds?: Set<string>;
  duplicateSelectedIds?: Set<string>;
  usageCounts?: Map<string, number>;
  onApproveDuplicateSelect?: (questionId: string) => void;
  renderQuestion?: (question: any, index: number) => ReactNode;
  /** 카드 접힘(콤팩트) 모드 — fallback QuestionBankCard 로 그대로 전달. */
  collapsible?: boolean;
  expandedPassageIds: Record<string, boolean>;
  setExpandedPassageIds: (
    next:
      | Record<string, boolean>
      | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void;
  onActivePassageChange?: (passage: {
    id: string;
    title: string;
    visibleCount: number;
    totalQuestionCount: number;
    hasAnalysis: boolean;
    isOpen: boolean;
  } | null) => void;
}

const SEMESTER_LABELS: Record<string, string> = {
  FIRST: "1학기",
  SECOND: "2학기",
};

function semesterLabel(value?: string | null) {
  if (!value) return null;
  return SEMESTER_LABELS[value] || value;
}

function findScrollParent(el: HTMLElement): HTMLElement | Window {
  let parent = el.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return parent;
    parent = parent.parentElement;
  }
  return window;
}

export function PassageGroupedView({
  passages,
  gridCols,
  viewSize,
  selectedIds,
  setSelectedIds,
  marqueeBoundaryRef,
  onToggleSelect,
  onDelete,
  onApprove,
  onUnapprove,
  onToggleStar,
  onDetail,
  onEdit,
  showManagementActions = true,
  showStar = true,
  enableDrag = true,
  compactUsageLabel = false,
  cardClickSelects = false,
  showDetailButton = false,
  selectedCardHighlight = true,
  dragRequiresSelection = false,
  getDragQuestionIds,
  getDuplicateDragQuestionIds,
  selectionOrder,
  activeQuestionId,
  lastViewedQuestionId,
  openDetailQuestionId,
  disabledIds,
  duplicateSelectedIds,
  usageCounts,
  onApproveDuplicateSelect,
  renderQuestion,
  collapsible,
  expandedPassageIds,
  setExpandedPassageIds,
  onActivePassageChange,
}: PassageGroupedViewProps) {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const activePassageIdRef = useRef<string | null>(null);

  const passageSummaries = useMemo(() => {
    return new Map(
      passages.map((passage) => [
        passage.id,
        {
          id: passage.id,
          title: sanitizeAiModelDisclosureText(passage.title) || "(제목 없음)",
          visibleCount: passage.questions.length,
          totalQuestionCount: passage.totalQuestionCount,
          hasAnalysis: Boolean(passage.analysis),
          isOpen: expandedPassageIds[passage.id] === true,
        },
      ]),
    );
  }, [expandedPassageIds, passages]);

  const reportActivePassage = useCallback(
    (passageId: string | null) => {
      if (!onActivePassageChange) return;
      activePassageIdRef.current = passageId;
      onActivePassageChange(passageId ? passageSummaries.get(passageId) ?? null : null);
    },
    [onActivePassageChange, passageSummaries],
  );

  useEffect(() => {
    if (!onActivePassageChange) return;
    const firstSection = passages
      .map((passage) => sectionRefs.current[passage.id])
      .find(Boolean);

    if (!firstSection) {
      reportActivePassage(null);
      return;
    }

    const scrollParent = findScrollParent(firstSection);
    const scrollTarget: HTMLElement | Window = scrollParent;

    const updateActivePassage = () => {
      const rootTop =
        scrollParent === window
          ? 0
          : (scrollParent as HTMLElement).getBoundingClientRect().top;
      const anchorTop = rootTop + 12;
      let nextActiveId: string | null = null;

      for (const passage of passages) {
        if (expandedPassageIds[passage.id] !== true) continue;
        const el = sectionRefs.current[passage.id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= anchorTop && rect.bottom > anchorTop) {
          nextActiveId = passage.id;
          break;
        }
        if (!nextActiveId && rect.top > anchorTop) {
          nextActiveId = passage.id;
        }
      }

      if (nextActiveId && activePassageIdRef.current !== nextActiveId) {
        reportActivePassage(nextActiveId);
      }
    };

    const frame = window.requestAnimationFrame(updateActivePassage);
    scrollTarget.addEventListener("scroll", updateActivePassage, { passive: true });
    window.addEventListener("resize", updateActivePassage);

    return () => {
      window.cancelAnimationFrame(frame);
      scrollTarget.removeEventListener("scroll", updateActivePassage);
      window.removeEventListener("resize", updateActivePassage);
    };
  }, [expandedPassageIds, onActivePassageChange, passages, reportActivePassage]);

  useEffect(() => {
    if (passages.length === 0) reportActivePassage(null);
  }, [passages.length, reportActivePassage]);

  if (passages.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-[13px] text-slate-400">
          조건에 맞는 분석된 지문이 없습니다.
        </p>
        <p className="text-[12px] text-slate-400 mt-1">
          학습지 생성 단계를 거친 지문에서 생성된 문제만 표시됩니다.
        </p>
      </div>
    );
  }

  const gridClass =
    gridCols === 1
      ? "grid-cols-1"
      : gridCols === 2
        ? "grid-cols-1 md:grid-cols-2"
        : gridCols === 3
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          : gridCols === 4
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "grid-cols-1";
  const expandedPassageSpanClass =
    gridCols === 2
      ? "md:col-span-2"
      : gridCols === 3
        ? "md:col-span-2 lg:col-span-3"
        : gridCols === 4
          ? "md:col-span-2 lg:col-span-3 xl:col-span-4"
          : "";

  function toggleGroupSelection(ids: string[]) {
    const selectableIds = ids.filter(
      (id) => !disabledIds?.has(id) || duplicateSelectedIds?.has(id),
    );
    if (selectableIds.length === 0) return;
    const next = new Set(selectedIds);
    const allSelected =
      selectableIds.length > 0 && selectableIds.every((id) => next.has(id));
    if (allSelected) {
      selectableIds.forEach((id) => next.delete(id));
    } else {
      selectableIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  }

  return (
    <div className={`grid items-start gap-3 ${gridClass}`}>
      {passages.map((passage) => {
        const isOpen = expandedPassageIds[passage.id] === true;
        const visibleCount = passage.questions.length;
        const hidden =
          passage.totalQuestionCount > visibleCount
            ? passage.totalQuestionCount - visibleCount
            : 0;

        const groupIds = passage.questions.map((q) => q.id);
        const selectableGroupIds = groupIds.filter(
          (id) => !disabledIds?.has(id) || duplicateSelectedIds?.has(id),
        );
        const selectedInGroup = selectableGroupIds.filter((id) => selectedIds.has(id)).length;
        const groupCheckState: boolean | "indeterminate" =
          selectableGroupIds.length > 0 && selectedInGroup === selectableGroupIds.length
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
            ref={(el) => {
              sectionRefs.current[passage.id] = el;
            }}
            className={`min-w-0 overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
              isOpen
                ? "border-blue-200 ring-1 ring-blue-100"
                : "border-slate-200 hover:border-slate-300 hover:shadow-md"
            } ${isOpen ? expandedPassageSpanClass : ""}`}
          >
            <header
              className={`flex w-full items-center gap-2.5 border-b px-4 transition-colors ${
                isOpen
                  ? "border-blue-100 bg-blue-50/60"
                  : "border-slate-100/70 bg-white hover:bg-slate-50/70"
              }`}
            >
              <div
                className="-m-1 flex shrink-0 cursor-pointer items-center p-1"
                title={`${sanitizeAiModelDisclosureText(passage.title) || "(제목 없음)"} 전체 선택`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleGroupSelection(groupIds);
                }}
              >
                <Checkbox
                  checked={groupCheckState}
                  aria-label={`${sanitizeAiModelDisclosureText(passage.title) || "(제목 없음)"} 전체 선택`}
                  className="size-4 cursor-pointer"
                  disabled={selectableGroupIds.length === 0}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggleGroupSelection(groupIds)}
                />
              </div>

              <div className="flex flex-1 items-center gap-2.5 py-3">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? "그룹 접기" : "그룹 펼치기"}
                  onClick={() => {
                    const willOpen = !isOpen;
                    setExpandedPassageIds((prev) => ({
                      ...prev,
                      [passage.id]: willOpen,
                    }));
                    if (willOpen) {
                      activePassageIdRef.current = passage.id;
                      onActivePassageChange?.({
                        id: passage.id,
                        title: sanitizeAiModelDisclosureText(passage.title) || "(제목 없음)",
                        visibleCount,
                        totalQuestionCount: passage.totalQuestionCount,
                        hasAnalysis: Boolean(passage.analysis),
                        isOpen: true,
                      });
                    } else if (activePassageIdRef.current === passage.id) {
                      activePassageIdRef.current = null;
                      onActivePassageChange?.(null);
                    }
                  }}
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
                  onClick={() => {
                    const willOpen = !isOpen;
                    setExpandedPassageIds((prev) => ({
                      ...prev,
                      [passage.id]: willOpen,
                    }));
                    if (willOpen) {
                      activePassageIdRef.current = passage.id;
                      onActivePassageChange?.({
                        id: passage.id,
                        title: sanitizeAiModelDisclosureText(passage.title) || "(제목 없음)",
                        visibleCount,
                        totalQuestionCount: passage.totalQuestionCount,
                        hasAnalysis: Boolean(passage.analysis),
                        isOpen: true,
                      });
                    } else if (activePassageIdRef.current === passage.id) {
                      activePassageIdRef.current = null;
                      onActivePassageChange?.(null);
                    }
                  }}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition-colors hover:opacity-90"
                >
                  <h4 className="truncate text-sm font-bold tracking-tight text-slate-900">
                    {sanitizeAiModelDisclosureText(passage.title) || "(제목 없음)"}
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
                  <DragSelect
                    className={`grid gap-3 ${gridClass}`}
                    value={selectedIds}
                    onChange={setSelectedIds}
                    boundaryRef={marqueeBoundaryRef}
                  >
                    {passage.questions.map((q, idx) =>
                      renderQuestion ? (
                        renderQuestion(q, idx)
                      ) : (
                        (() => {
                          const usageCount = usageCounts?.get(q.id) || 0;
                          const duplicateSelected = Boolean(duplicateSelectedIds?.has(q.id));
                          const disabled = Boolean(disabledIds?.has(q.id)) && !duplicateSelected;
                          return (
                        <QuestionBankCard
                          key={q.id}
                          q={q}
                          num={idx + 1}
                          selected={selectedIds.has(q.id)}
                          onToggle={() => {
                            if (!disabled) onToggleSelect(q.id);
                          }}
                          onDelete={() => onDelete(q.id)}
                          onApprove={() => onApprove(q.id)}
                          onUnapprove={onUnapprove ? () => onUnapprove(q.id) : undefined}
                          onToggleStar={() => onToggleStar(q.id)}
                          onDetail={() => onDetail(q.id)}
                          onEdit={() => onEdit(q.id)}
                          viewSize={viewSize}
                          showManagementActions={showManagementActions}
                          showStar={showStar}
                          enableDrag={enableDrag && !disabled}
                          compactUsageLabel={compactUsageLabel}
                          cardClickSelects={cardClickSelects}
                          showDetailButton={showDetailButton}
                          selectedCardHighlight={selectedCardHighlight}
                          dragRequiresSelection={dragRequiresSelection}
                          getDragQuestionIds={getDragQuestionIds}
                          getDuplicateDragQuestionIds={getDuplicateDragQuestionIds}
                          selectionIndex={selectionOrder?.get(q.id)}
                          active={activeQuestionId === q.id}
                          recentlyViewed={
                            lastViewedQuestionId != null &&
                            lastViewedQuestionId === q.id &&
                            openDetailQuestionId !== q.id
                          }
                          selectionDisabled={disabled}
                          collapsible={collapsible}
                          duplicateCount={usageCount > 1 ? usageCount : undefined}
                          onDuplicateSelectConfirm={
                            disabled && onApproveDuplicateSelect
                              ? () => onApproveDuplicateSelect(q.id)
                              : undefined
                          }
                        />
                          );
                        })()
                      ),
                    )}
                  </DragSelect>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
