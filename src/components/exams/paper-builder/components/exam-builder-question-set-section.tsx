"use client";

import { useEffect, useMemo, useState } from "react";

import { getExamPaperBuilderQuestionSetsBySetIds } from "@/actions/exam-paper-builder";
import type { QuestionSetForRender } from "@/actions/question-sets";
import { isStructuralType } from "@/lib/question-sets/types";
import { cn } from "@/lib/utils";
import {
  buildSetMergedPassage,
  memberToBankItem,
} from "@/components/workbench/question-set-card";
import { QuestionBankCard } from "@/components/workbench/question-bank-card";

type ExamBuilderQuestionSetSectionProps = {
  academyId: string;
  setIds: string[];
  selectedQuestionIds: ReadonlySet<string>;
  onToggleSetSelection: (memberQuestionIds: string[], select: boolean) => void;
  viewSize: "lg" | "md";
  gridClassName?: string;
  activeQuestionId?: string | null;
};

export function ExamBuilderQuestionSetSection({
  academyId,
  setIds,
  selectedQuestionIds,
  onToggleSetSelection,
  viewSize,
  gridClassName,
  activeQuestionId,
}: ExamBuilderQuestionSetSectionProps) {
  const requestedSetIds = useMemo(
    () => Array.from(new Set(setIds.filter(Boolean))),
    [setIds],
  );
  const [sets, setSets] = useState<QuestionSetForRender[]>([]);

  useEffect(() => {
    if (requestedSetIds.length === 0) return;
    let cancelled = false;
    void getExamPaperBuilderQuestionSetsBySetIds(academyId, requestedSetIds)
      .then((data) => {
        if (!cancelled) setSets(data);
      })
      .catch(() => {
        if (!cancelled) setSets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId, requestedSetIds]);

  const visibleSets = useMemo(() => {
    const allowed = new Set(requestedSetIds);
    return sets.filter((set) => allowed.has(set.id));
  }, [requestedSetIds, sets]);

  if (requestedSetIds.length === 0 || visibleSets.length === 0) return null;

  return (
    <div className={cn("pb-2.5", gridClassName)}>
      {visibleSets.map((set) => (
        <ExamBuilderQuestionSetCard
          key={set.id}
          set={set}
          selectedQuestionIds={selectedQuestionIds}
          onToggleSetSelection={onToggleSetSelection}
          viewSize={viewSize}
          activeQuestionId={activeQuestionId}
        />
      ))}
    </div>
  );
}

export function ExamBuilderQuestionSetCard({
  set,
  selectedQuestionIds,
  onToggleSetSelection,
  viewSize,
  activeQuestionId,
}: {
  set: QuestionSetForRender;
  selectedQuestionIds: ReadonlySet<string>;
  onToggleSetSelection: (memberQuestionIds: string[], select: boolean) => void;
  viewSize: "lg" | "md";
  activeQuestionId?: string | null;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const memberIds = useMemo(
    () => set.members.map((member) => member.questionId),
    [set.members],
  );
  const allSelected =
    memberIds.length > 0 && memberIds.every((id) => selectedQuestionIds.has(id));

  const activeQuestionIndex = activeQuestionId
    ? set.members.findIndex((member) => member.questionId === activeQuestionId)
    : -1;
  const safeTab = Math.min(
    Math.max(activeQuestionIndex >= 0 ? activeQuestionIndex : activeTab, 0),
    Math.max(set.members.length - 1, 0),
  );
  const activeMember = set.members[safeTab];
  if (!activeMember) return null;

  const memberItem = memberToBankItem(activeMember, set);
  const mergedPassage = buildSetMergedPassage(set);
  const structural =
    activeMember.isStructural || isStructuralType(activeMember.typeId || "");
  const activeMergedPassage = structural ? undefined : mergedPassage;

  const headerExtra = (
    <>
      <span className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-blue-600">
        Set - {set.members.length}
      </span>
      {set.members.length > 1 ? (
        <span className="flex flex-wrap items-center gap-1">
          {set.members.map((member, index) => (
            <button
              key={member.itemId}
              type="button"
              data-drag-select-ignore
              onClick={(event) => {
                event.stopPropagation();
                setActiveTab(index);
              }}
              className={cn(
                "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors",
                safeTab === index
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              )}
            >
              {index + 1}
            </button>
          ))}
        </span>
      ) : null}
    </>
  );

  return (
    <QuestionBankCard
      q={memberItem}
      num={safeTab + 1}
      selected={allSelected}
      onToggle={() => onToggleSetSelection(memberIds, !allSelected)}
      viewSize={viewSize}
      showManagementActions={false}
      showStar={false}
      enableDrag
      compactUsageLabel
      cardClickSelects
      dragRequiresSelection
      getDragQuestionIds={() => memberIds}
      active={Boolean(activeQuestionId && memberIds.includes(activeQuestionId))}
      selectedCardHighlight={false}
      collapsible
      compact
      suppressDragItem
      mergedPassage={activeMergedPassage}
      headerExtra={headerExtra}
    />
  );
}
