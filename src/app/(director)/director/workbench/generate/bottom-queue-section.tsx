// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  Braces,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gem,
  Loader2,
  Rows3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { QuestionCard, type QuestionCardItem } from "@/components/workbench/question-card";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import { type QueueItem, buildQuestionText, countWords, typeLabel } from "./generate-page-types";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  getQuestionGenerationPlanFromTags,
  getQuestionGenerationPlanConfig,
  mergeQuestionGenerationPlanTag,
  QUESTION_GENERATION_PLAN_TAGS,
  sanitizeAiModelDisclosureText,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { getFriendlyQuestionGenerationError } from "@/lib/workbench-generation-errors";

interface BottomQueueSectionProps {
  sessionQueue: QueueItem[];
  filteredQueue: QueueItem[];
  queueFilter: "all" | "error";
  setQueueFilter: (v: "all" | "error") => void;
  queueCounts: { generating: number; done: number; error: number };
  autoCount: number;
  savedQuestions: QuestionCardItem[];
  loadingSavedQuestions: boolean;
  setDetailQuestion: (q: QuestionCardItem | null) => void;
  onApproveQuestion: (questionId: string) => void;
  onBatchApproveQuestions?: (questionIds: string[]) => void | Promise<void>;
  onEditQuestion: (questionId: string) => void;
}

type SavedQuestionPlanFilter = "ALL" | QuestionGenerationPlan;
type ReviewStatusFilter = "ALL" | "PENDING" | "APPROVED";
type QuestionViewMode = "flat" | "passage";

type SessionQuestionCard = {
  key: string;
  itemId: string;
  number: number;
  persistedQuestionId?: string;
  question: QuestionCardItem;
};

type GroupedQuestionCards<T> = {
  id: string;
  title: string;
  meta: string[];
  cards: T[];
};

type SessionFlatEntry =
  | { kind: "queue"; key: string; item: QueueItem }
  | { kind: "question"; key: string; card: SessionQuestionCard };

function parseQuestionTags(rawTags: unknown): string[] {
  if (Array.isArray(rawTags)) return rawTags.filter((tag): tag is string => typeof tag === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return rawTags.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean);
  }
}

function getQuestionPlan(q: QuestionCardItem): QuestionGenerationPlan | null {
  const tagPlan = getQuestionGenerationPlanFromTags(parseQuestionTags(q.tags));
  if (tagPlan) return tagPlan;

  if (q.structuredData && typeof q.structuredData === "object" && "_generationPlan" in q.structuredData) {
    const plan = (q.structuredData as { _generationPlan?: unknown })._generationPlan;
    if (plan === "STANDARD" || plan === "PREMIUM") return plan;
  }

  return null;
}

function matchesPlanFilter(q: QuestionCardItem, filter: SavedQuestionPlanFilter): boolean {
  if (filter === "ALL") return true;
  const plan = getQuestionPlan(q);
  if (filter === "PREMIUM") return plan === "PREMIUM";
  return plan !== "PREMIUM";
}

function matchesReviewFilter(q: QuestionCardItem, filter: ReviewStatusFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "APPROVED") return q.approved;
  return !q.approved;
}

function questionSignature(parts: {
  passageId?: string | null;
  subType?: string | null;
  questionText: string;
  correctAnswer: string;
  options: string | null;
}) {
  return [
    parts.passageId || "",
    parts.subType || "",
    parts.questionText,
    parts.correctAnswer,
    parts.options || "",
  ].join("\u001f");
}

function withVisiblePlanTag(q: QuestionCardItem): QuestionCardItem {
  const plan = getQuestionPlan(q) ?? "STANDARD";
  return {
    ...q,
    tags: JSON.stringify(mergeQuestionGenerationPlanTag(parseQuestionTags(q.tags), plan)),
  };
}

function withSessionPlanTag(
  q: QuestionCardItem,
  fallbackPlan?: QuestionGenerationPlan,
): QuestionCardItem {
  const plan = getQuestionPlan(q) ?? fallbackPlan ?? "STANDARD";
  const structuredData =
    q.structuredData && typeof q.structuredData === "object"
      ? { ...(q.structuredData as Record<string, unknown>), _generationPlan: plan }
      : q.structuredData;

  return {
    ...q,
    tags: JSON.stringify(mergeQuestionGenerationPlanTag(parseQuestionTags(q.tags), plan)),
    structuredData,
  };
}

function groupByPassage<T>(
  cards: T[],
  getQuestion: (card: T) => QuestionCardItem,
): GroupedQuestionCards<T>[] {
  const groups = new Map<string, GroupedQuestionCards<T>>();
  for (const card of cards) {
    const q = getQuestion(card);
    const passage = q.passage;
    const id = passage?.id || "no-passage";
    const title = sanitizeAiModelDisclosureText(passage?.title || "") || "지문 없음";
    const meta = [
      passage?.school?.name,
      passage?.grade ? `${passage.grade}학년` : null,
      passage?.semester,
      passage?.publisher,
    ].filter(Boolean) as string[];
    const existing = groups.get(id);
    if (existing) {
      existing.cards.push(card);
    } else {
      groups.set(id, { id, title, meta, cards: [card] });
    }
  }
  return [...groups.values()];
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 opacity-60">
      <Braces className="w-8 h-8 text-slate-300 mb-2" />
      <p className="text-[13px] text-slate-400">{message}</p>
    </div>
  );
}

export function BottomQueueSection({
  sessionQueue,
  filteredQueue,
  queueFilter,
  setQueueFilter,
  queueCounts,
  autoCount,
  savedQuestions,
  loadingSavedQuestions,
  setDetailQuestion,
  onApproveQuestion,
  onBatchApproveQuestions,
  onEditQuestion,
}: BottomQueueSectionProps) {
  const [savedPlanFilter, setSavedPlanFilter] = useState<SavedQuestionPlanFilter>("ALL");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>("ALL");
  const [questionViewMode, setQuestionViewMode] = useState<QuestionViewMode>("flat");
  const [selectedSessionQuestionIds, setSelectedSessionQuestionIds] = useState<Set<string>>(new Set());
  const [batchApproving, setBatchApproving] = useState(false);
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});

  const savedQuestionsById = useMemo(
    () => new Map(savedQuestions.map((q) => [q.id, q])),
    [savedQuestions],
  );

  const savedQuestionsBySignature = useMemo(() => {
    const map = new Map<string, QuestionCardItem>();
    for (const q of savedQuestions) {
      map.set(
        questionSignature({
          passageId: q.passage?.id,
          subType: q.subType,
          questionText: q.questionText,
          correctAnswer: q.correctAnswer,
          options: q.options,
        }),
        q,
      );
    }
    return map;
  }, [savedQuestions]);

  const sessionQuestionCards = useMemo<SessionQuestionCard[]>(() => {
    const cards: SessionQuestionCard[] = [];
    for (const item of filteredQueue) {
      if (item.status !== "done" && item.status !== "reviewed") continue;
      item.questions.forEach((q: any, qi: number) => {
        const subType = q._typeId || q.subType || null;
        const questionText = buildQuestionText(q);
        const optionsJson = q.options ? JSON.stringify(q.options) : null;
        const correctAnswer = q.correctAnswer || q.modelAnswer || "";
        const savedQuestionId = item.questionIds?.[qi];
        const savedQuestion = savedQuestionId
          ? savedQuestionsById.get(savedQuestionId)
          : savedQuestionsBySignature.get(
              questionSignature({
                passageId: item.passageId,
                subType,
                questionText,
                correctAnswer,
                options: optionsJson,
              }),
            );
        const persistedQuestionId = savedQuestionId ?? savedQuestion?.id;
        const createdAt = savedQuestion?.createdAt ?? (item.createdAt ? new Date(item.createdAt) : new Date());
        const cardItem: QuestionCardItem = withSessionPlanTag({
          id: persistedQuestionId || `${item.id}-${qi}`,
          type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
          subType,
          questionText,
          options: optionsJson,
          correctAnswer,
          difficulty: q.difficulty || "INTERMEDIATE",
          tags: Array.isArray(q.tags) ? JSON.stringify(q.tags) : q.tags ? String(q.tags) : null,
          aiGenerated: true,
          approved: savedQuestion?.approved ?? Boolean(q.approved),
          createdAt,
          passage: { id: item.passageId, title: item.passageTitle, content: item.passageContent },
          explanation: q.explanation ? {
            id: `${item.id}-${qi}-exp`,
            content: q.explanation,
            keyPoints: q.keyPoints ? JSON.stringify(q.keyPoints) : null,
            wrongOptionExplanations: q.wrongOptionExplanations ? JSON.stringify(q.wrongOptionExplanations) : null,
          } : null,
          structuredData: q,
        }, item.config.generationPlan);

        cards.push({
          key: `${item.id}-${qi}`,
          itemId: item.id,
          number: qi + 1,
          persistedQuestionId,
          question: cardItem,
        });
      });
    }
    return cards;
  }, [filteredQueue, savedQuestionsById, savedQuestionsBySignature]);

  const visibleSessionQuestionCards = useMemo(
    () => sessionQuestionCards.filter((card) => matchesReviewFilter(card.question, reviewStatusFilter)),
    [reviewStatusFilter, sessionQuestionCards],
  );

  const sessionApprovableIds = useMemo(
    () => [
      ...new Set(
        visibleSessionQuestionCards
        .filter((card) => card.persistedQuestionId && !card.question.approved)
        .map((card) => card.persistedQuestionId as string),
      ),
    ],
    [visibleSessionQuestionCards],
  );

  const reviewFilteredSavedQuestions = useMemo(
    () => savedQuestions.filter((q) => matchesReviewFilter(q, reviewStatusFilter)),
    [reviewStatusFilter, savedQuestions],
  );

  const savedPlanCounts = useMemo(() => {
    const premium = reviewFilteredSavedQuestions.filter((q) => getQuestionPlan(q) === "PREMIUM").length;
    return {
      ALL: reviewFilteredSavedQuestions.length,
      STANDARD: reviewFilteredSavedQuestions.length - premium,
      PREMIUM: premium,
    };
  }, [reviewFilteredSavedQuestions]);

  const visibleSavedQuestions = useMemo(
    () => reviewFilteredSavedQuestions.filter((q) => matchesPlanFilter(q, savedPlanFilter)),
    [reviewFilteredSavedQuestions, savedPlanFilter],
  );

  const reviewCounts = useMemo(() => {
    const questionsById = new Map<string, QuestionCardItem>();
    for (const q of savedQuestions) questionsById.set(q.id, q);
    for (const card of sessionQuestionCards) {
      const previous = questionsById.get(card.question.id);
      questionsById.set(card.question.id, {
        ...(previous ?? card.question),
        approved: Boolean(previous?.approved || card.question.approved),
      });
    }
    const allQuestions = [...questionsById.values()];
    return {
      ALL: allQuestions.length,
      PENDING: allQuestions.filter((q) => !q.approved).length,
      APPROVED: allQuestions.filter((q) => q.approved).length,
    };
  }, [savedQuestions, sessionQuestionCards]);

  const sessionGroups = useMemo(
    () => groupByPassage(visibleSessionQuestionCards, (card) => card.question),
    [visibleSessionQuestionCards],
  );

  const savedGroups = useMemo(
    () => groupByPassage(visibleSavedQuestions.slice(0, 30).map(withVisiblePlanTag), (q) => q),
    [visibleSavedQuestions],
  );

  const visibleQueueCards = useMemo(
    () => (reviewStatusFilter === "ALL" ? filteredQueue.filter((item) => item.status === "generating" || item.status === "error") : []),
    [filteredQueue, reviewStatusFilter],
  );

  const visibleSessionQuestionCardsByItemId = useMemo(() => {
    const map = new Map<string, SessionQuestionCard[]>();
    for (const card of visibleSessionQuestionCards) {
      const cards = map.get(card.itemId);
      if (cards) cards.push(card);
      else map.set(card.itemId, [card]);
    }
    return map;
  }, [visibleSessionQuestionCards]);

  const sessionFlatEntries = useMemo<SessionFlatEntry[]>(() => {
    if (reviewStatusFilter !== "ALL") {
      return visibleSessionQuestionCards.map((card) => ({
        kind: "question" as const,
        key: card.key,
        card,
      }));
    }

    const entries: SessionFlatEntry[] = [];
    for (const item of filteredQueue) {
      if (item.status === "generating" || item.status === "error") {
        entries.push({ kind: "queue", key: item.id, item });
        continue;
      }
      const cards = visibleSessionQuestionCardsByItemId.get(item.id) ?? [];
      cards.forEach((card) => entries.push({
        kind: "question",
        key: card.key,
        card,
      }));
    }
    return entries;
  }, [
    filteredQueue,
    reviewStatusFilter,
    visibleSessionQuestionCards,
    visibleSessionQuestionCardsByItemId,
  ]);

  useEffect(() => {
    setSelectedSessionQuestionIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(sessionApprovableIds);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [sessionApprovableIds]);

  const toggleSessionQuestion = useCallback((id: string) => {
    setSelectedSessionQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSessionSelected =
    sessionApprovableIds.length > 0 &&
    sessionApprovableIds.every((id) => selectedSessionQuestionIds.has(id));
  const someSessionSelected =
    selectedSessionQuestionIds.size > 0 && !allSessionSelected;

  const toggleSelectAllSession = useCallback(() => {
    if (allSessionSelected) setSelectedSessionQuestionIds(new Set());
    else setSelectedSessionQuestionIds(new Set(sessionApprovableIds));
  }, [allSessionSelected, sessionApprovableIds]);

  const toggleSessionGroupSelection = useCallback((ids: string[]) => {
    setSelectedSessionQuestionIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, []);

  const handleBatchApprove = useCallback(async () => {
    if (selectedSessionQuestionIds.size === 0 || !onBatchApproveQuestions) return;
    setBatchApproving(true);
    try {
      await onBatchApproveQuestions(Array.from(selectedSessionQuestionIds));
      setSelectedSessionQuestionIds(new Set());
    } finally {
      setBatchApproving(false);
    }
  }, [onBatchApproveQuestions, selectedSessionQuestionIds]);

  function renderQueueStatusCard(item: QueueItem) {
    const planConfig = getQuestionGenerationPlanConfig(item.config.generationPlan || "STANDARD");

    if (item.status === "generating") {
      const requestedCount = item.config.mode === "auto"
        ? autoCount
        : Object.values(item.config.typeCounts).reduce((a, b) => a + b, 0);
      return (
        <WorkbenchLoadingCard
          key={item.id}
          title={item.passageTitle}
          contentPreview={`${item.passageContent.slice(0, 200)}...`}
          statusLabel="생성 중"
          progressLabel={`AI가 ${requestedCount}문제를 생성 중입니다...`}
          wordCount={countWords(item.passageContent)}
          showCheckbox={false}
          statusIcon={Loader2}
          variant="analyzing"
          fixedHeight
          ariaLabel={`${item.passageTitle} - 문제 생성 중`}
          planBadge={
            FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? (
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                planConfig.id === "PREMIUM"
                  ? "border-violet-200 bg-violet-50 text-violet-700"
                  : "border-sky-200 bg-sky-50 text-sky-700"
              }`}>
                {planConfig.id === "PREMIUM" ? <Gem className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {planConfig.shortLabel}
              </span>
            ) : null
          }
        />
      );
    }

    if (item.status === "error") {
      const questionType = Object.keys(item.config.typeCounts).find(
        (typeId) => Number(item.config.typeCounts[typeId]) > 0,
      );
      const errorDetail = getFriendlyQuestionGenerationError(
        item.error,
        questionType,
      );
      const requestedTypes = Object.entries(item.config.typeCounts)
        .filter(([, count]) => Number(count) > 0)
        .map(([typeId, count]) => `${typeLabel(typeId)} ${count}개`)
        .join(", ");

      return (
        <div key={item.id} className="h-[340px] overflow-hidden rounded-xl border border-red-200 bg-red-50/30 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h4 className="text-[13px] font-bold text-slate-800 truncate">{item.passageTitle}</h4>
                {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                    planConfig.id === "PREMIUM"
                      ? "border-violet-200 bg-violet-50 text-violet-700"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                  }`}>
                    {planConfig.id === "PREMIUM" ? <Gem className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                    {planConfig.shortLabel}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-red-500 font-medium">생성 실패</span>
              {requestedTypes && (
                <p className="mt-1 text-[11px] font-medium text-slate-500">
                  {requestedTypes} · {item.config.difficulty}
                </p>
              )}
              {errorDetail && (
                <p className="mt-1 line-clamp-5 break-words text-[11px] leading-4 text-red-600">
                  {errorDetail}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderSessionQuestionCard(card: SessionQuestionCard) {
    const canSelect = Boolean(card.persistedQuestionId) && !card.question.approved;
    const isSelected = canSelect
      ? selectedSessionQuestionIds.has(card.persistedQuestionId as string)
      : false;

    return (
      <div key={card.key} onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest('[role="checkbox"]')) return;
        setDetailQuestion(card.question);
      }} className="cursor-pointer">
        <QuestionCard
          q={card.question}
          num={card.number}
          readonly
          compact
          showReviewActions={Boolean(card.persistedQuestionId)}
          selected={isSelected}
          onToggle={canSelect ? () => toggleSessionQuestion(card.persistedQuestionId as string) : undefined}
          onApprove={() => card.persistedQuestionId && onApproveQuestion(card.persistedQuestionId)}
          onEdit={() => card.persistedQuestionId && onEditQuestion(card.persistedQuestionId)}
        />
      </div>
    );
  }

  function renderSavedQuestionCard(q: QuestionCardItem, index: number) {
    const cardQuestion = withVisiblePlanTag(q);
    return (
      <div key={q.id} onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("a") || target.closest("input")) return;
        setDetailQuestion(cardQuestion);
      }} className="cursor-pointer">
        <QuestionCard
          q={cardQuestion}
          num={index + 1}
          readonly
          compact
          showReviewActions
          onApprove={() => onApproveQuestion(cardQuestion.id)}
          onEdit={() => onEditQuestion(cardQuestion.id)}
        />
      </div>
    );
  }

  function renderPassageGroup<T>({
    group,
    source,
    renderCard,
    getSelectableIds,
  }: {
    group: GroupedQuestionCards<T>;
    source: "session" | "saved";
    renderCard: (card: T, index: number) => React.ReactNode;
    getSelectableIds?: (cards: T[]) => string[];
  }) {
    const groupKey = `${source}:${group.id}`;
    const isOpen = expandedPassageIds[groupKey] !== false;
    const selectableIds = getSelectableIds?.(group.cards) ?? [];
    const selectedInGroup = selectableIds.filter((id) => selectedSessionQuestionIds.has(id)).length;
    const checkState: boolean | "indeterminate" =
      selectableIds.length > 0 && selectedInGroup === selectableIds.length
        ? true
        : selectedInGroup > 0
          ? "indeterminate"
          : false;

    return (
      <section key={groupKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className={`flex items-center gap-2.5 border-b px-4 ${isOpen ? "bg-blue-50/50 border-blue-100" : "bg-white border-slate-100"}`}>
          {source === "session" && selectableIds.length > 0 ? (
            <div className="-m-1 flex shrink-0 cursor-pointer items-center p-1" onClick={(e) => {
              e.stopPropagation();
              toggleSessionGroupSelection(selectableIds);
            }}>
              <Checkbox
                checked={checkState}
                aria-label={`${group.title} 전체 선택`}
                className="size-4 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => toggleSessionGroupSelection(selectableIds)}
              />
            </div>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setExpandedPassageIds((prev) => ({ ...prev, [groupKey]: !isOpen }))}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-3 text-left"
          >
            <ChevronRight className={`size-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${isOpen ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{group.title}</span>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-blue-700 ring-1 ring-blue-200">
              {group.cards.length}개
            </span>
            {group.meta.length > 0 && (
              <span className="hidden min-w-0 truncate text-[11px] font-medium text-slate-400 md:block">
                {group.meta.join(" · ")}
              </span>
            )}
          </button>
        </header>
        {isOpen && (
          <div className="p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {group.cards.map((card, index) => renderCard(card, index))}
            </div>
          </div>
        )}
      </section>
    );
  }

  const reviewButtons = [
    { id: "ALL", label: "전체", count: reviewCounts.ALL },
    { id: "PENDING", label: "미검수", count: reviewCounts.PENDING },
    { id: "APPROVED", label: "검수완료", count: reviewCounts.APPROVED },
  ] as const;

  return (
    <div className="bg-[#F0F2F5]">
      <div className="px-8 pt-5 pb-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">생성/검수 결과</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              현재 세션과 저장된 AI 문제를 검수 상태와 지문 단위로 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              {reviewButtons.map(({ id, label, count }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setReviewStatusFilter(id)}
                  className={`h-7 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                    reviewStatusFilter === id
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                  aria-pressed={reviewStatusFilter === id}
                >
                  {label} <span className={reviewStatusFilter === id ? "text-slate-200" : "text-slate-400"}>{count}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setQuestionViewMode("flat")}
                className={`flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-semibold transition-colors ${
                  questionViewMode === "flat"
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
                aria-pressed={questionViewMode === "flat"}
              >
                <Rows3 className="w-3.5 h-3.5" />
                문제별
              </button>
              <button
                type="button"
                onClick={() => setQuestionViewMode("passage")}
                className={`flex h-8 items-center gap-1.5 border-l border-slate-200 px-2.5 text-[11px] font-semibold transition-colors ${
                  questionViewMode === "passage"
                    ? "bg-blue-600 text-white"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
                aria-pressed={questionViewMode === "passage"}
              >
                <FileText className="w-3.5 h-3.5" />
                지문별
              </button>
            </div>
          </div>
        </div>

        {sessionQueue.length > 0 && (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-[14px] font-bold text-slate-800">현재 세션</h3>
              {queueCounts.error > 0 && (
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                  {(["all", "error"] as const).map((f) => {
                    const labels = { all: "전체", error: "오류" };
                    const counts = { all: sessionQueue.length, error: queueCounts.error };
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setQueueFilter(f)}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                          queueFilter === f
                            ? "bg-blue-50 text-blue-700 shadow-sm"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {labels[f]} {counts[f]}
                      </button>
                    );
                  })}
                </div>
              )}

              {sessionApprovableIds.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <label className="inline-flex cursor-pointer select-none items-center gap-2">
                    <Checkbox
                      checked={allSessionSelected ? true : someSessionSelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAllSession}
                    />
                    <span className="text-[12px] font-semibold text-slate-700">
                      전체 선택
                      <span className="ml-1 font-medium text-slate-400">
                        ({selectedSessionQuestionIds.size}/{sessionApprovableIds.length})
                      </span>
                    </span>
                  </label>
                  <Button
                    size="sm"
                    disabled={selectedSessionQuestionIds.size === 0 || batchApproving}
                    onClick={handleBatchApprove}
                    className="h-7 bg-blue-600 px-3 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-blue-100 disabled:text-blue-400"
                  >
                    {batchApproving ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    일괄 검수완료
                    {selectedSessionQuestionIds.size > 0 && (
                      <span className="ml-1 text-[11px] font-bold opacity-90">
                        ({selectedSessionQuestionIds.size})
                      </span>
                    )}
                  </Button>
                </div>
              )}

              <div className="ml-auto inline-flex items-center gap-2 rounded-xl border border-blue-200/70 bg-blue-50 px-3.5 py-2 ring-1 ring-blue-200/40">
                <BadgeCheck className="h-4 w-4 shrink-0 text-blue-600" />
                <span className="text-[12px] font-semibold leading-snug text-blue-900">
                  <span className="font-bold text-blue-700">검수 완료</span>한 문제만{" "}
                  <span className="font-bold text-blue-700">문제 관리</span> 페이지의 기본 목록에 보입니다
                </span>
              </div>
            </div>

            {questionViewMode === "flat" ? (
              sessionFlatEntries.length === 0 ? (
                <EmptyState message="현재 필터에 해당하는 세션 문제가 없습니다." />
              ) : (
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sessionFlatEntries.map((entry) =>
                    entry.kind === "queue"
                      ? renderQueueStatusCard(entry.item)
                      : renderSessionQuestionCard(entry.card),
                  )}
                </div>
              )
            ) : (
              <>
                {visibleQueueCards.length > 0 && (
                  <div className="mb-3 grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visibleQueueCards.map(renderQueueStatusCard)}
                  </div>
                )}

                {visibleSessionQuestionCards.length === 0 ? (
                  reviewStatusFilter === "ALL" && visibleQueueCards.length > 0 ? null : (
                    <EmptyState message="현재 필터에 해당하는 세션 문제가 없습니다." />
                  )
                ) : (
                  <div className="space-y-3">
                    {sessionGroups.map((group) =>
                      renderPassageGroup({
                        group,
                        source: "session",
                        renderCard: (card) => renderSessionQuestionCard(card),
                        getSelectableIds: (cards) =>
                          cards
                            .filter((card) => card.persistedQuestionId && !card.question.approved)
                            .map((card) => card.persistedQuestionId as string),
                      }),
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[14px] font-bold text-slate-800">
              저장된 문제
              {savedQuestions.length > 0 && (
                <span className="ml-1 font-normal text-slate-400">
                  {visibleSavedQuestions.length}/{savedQuestions.length}개
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
                <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5">
                  {([
                    { id: "ALL", label: "전체", count: savedPlanCounts.ALL, Icon: Sparkles },
                    { id: "STANDARD", label: QUESTION_GENERATION_PLAN_TAGS.STANDARD, count: savedPlanCounts.STANDARD, Icon: Sparkles },
                    { id: "PREMIUM", label: QUESTION_GENERATION_PLAN_TAGS.PREMIUM, count: savedPlanCounts.PREMIUM, Icon: Gem },
                  ] as const).map(({ id, label, count, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSavedPlanFilter(id)}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all ${
                        savedPlanFilter === id
                          ? "bg-blue-50 text-blue-700 shadow-sm"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{label}</span>
                      <span className={savedPlanFilter === id ? "text-blue-500" : "text-slate-400"}>{count}</span>
                    </button>
                  ))}
                </div>
              )}
              {savedQuestions.length > 0 && (
                <Link href="/director/workbench/questions" className="text-[12px] font-medium text-blue-600 hover:text-blue-700">
                  문제은행 전체 보기 →
                </Link>
              )}
            </div>
          </div>

          {loadingSavedQuestions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : savedQuestions.length === 0 ? (
            <EmptyState message="아직 저장된 문제가 없습니다." />
          ) : visibleSavedQuestions.length === 0 ? (
            <EmptyState message="현재 필터에 해당하는 저장 문제가 없습니다." />
          ) : questionViewMode === "passage" ? (
            <div className="space-y-3">
              {savedGroups.map((group) =>
                renderPassageGroup({
                  group,
                  source: "saved",
                  renderCard: (q, index) => renderSavedQuestionCard(q, index),
                }),
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleSavedQuestions.slice(0, 30).map(renderSavedQuestionCard)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
