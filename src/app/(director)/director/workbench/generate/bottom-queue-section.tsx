// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Braces,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileOutput,
  FileText,
  Gem,
  Grid2x2,
  Grid3x3,
  List as ListIcon,
  Loader2,
  Rows3,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { seedExamAndNavigate } from "./seed-exam-and-navigate";
import { Checkbox } from "@/components/ui/checkbox";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import { confirmNative } from "@/lib/browser-confirm";
import {
  QuestionCard,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import { QuestionSetSection } from "@/components/workbench/question-set-section";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import { DragSelect } from "@/components/ui/drag-select";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "@/components/workbench/shared/card-click";
import { type QueueItem, buildQuestionText } from "./generate-page-types";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { QueueStatusCard } from "./queue-status-card";
import {
  getQuestionGenerationPlanFromTags,
  mergeQuestionGenerationPlanTag,
  QUESTION_GENERATION_PLAN_TAGS,
  sanitizeAiModelDisclosureText,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";

interface BottomQueueSectionProps {
  sessionQueue: QueueItem[];
  filteredQueue: QueueItem[];
  queueFilter: "all" | "error";
  setQueueFilter: (v: "all" | "error") => void;
  queueCounts: { generating: number; done: number; error: number };
  savedQuestions: QuestionCardItem[];
  loadingSavedQuestions: boolean;
  setDetailQuestion: (q: QuestionCardItem | null) => void;
  /** 지금 상세가 열려 있는 문제 id(부모 관리). 상세를 닫는 순간 그 카드를 한 번
   *  배경 반짝임으로 강조하기 위해, 내부 lastViewed 와 함께 사용한다. */
  openDetailQuestionId?: string | null;
  /** Per-card 검수완료/해제 핸들러. 선택 — 미지정 시(기본 생성 페이지) 카드 단건 검수
   *  액션을 숨기고 일괄 검수만 노출한다. 커스텀/동형 패널이 전달한다. */
  onApproveQuestion?: (questionId: string) => void;
  onUnapproveQuestion?: (questionId: string) => void;
  onBatchApproveQuestions?: (questionIds: string[]) => void | Promise<void>;
  /** Single-question delete wired to QuestionCard's header/dropdown delete. */
  onDeleteQuestion?: (questionId: string) => void | Promise<void>;
  /** Bulk-delete persisted questions. Returns true if deletion actually ran
   *  (false on user-cancel) so the section can keep the selection on cancel. */
  onBatchDeleteQuestions?: (
    questionIds: string[],
  ) => boolean | void | Promise<boolean | void>;
  /** Session-scoped tombstones — ids deleted this session, kept hidden across
   *  the 5s session-queue poll that would otherwise resurrect their cards. */
  deletedQuestionIds?: Set<string>;
  /** Signature tombstones for the same deletions — catches session cards that
   *  resolve to a saved row by signature rather than by aligned questionId. */
  deletedQuestionSignatures?: Set<string>;
  batchDeleting?: boolean;
  onEditQuestion: (questionId: string) => void;
  /** 생성 실패 카드에서 같은 조건으로 다시 생성 — 미지정 시 버튼을 숨긴다. */
  onRetryGeneration?: (item: QueueItem) => void | Promise<void>;
  /** 마키(영역 드래그) 시작 영역을 이 섹션 전체로 넓히기 위한 boundary(부모에서 내려줌). */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  /** 카드 '상세 보기' 옆에 끼울 추가 액션 렌더러(예: 동형 '분석 정보'). 선택 — 미지정 시 표시 안 함. */
  renderCardDetailExtra?: (q: QuestionCardItem) => React.ReactNode;
  /** 튜토리얼 중 최신 세션 문제 카드 일부만 강조하기 위한 개수. */
  tourHighlightSessionQuestionCount?: number;
}

type SavedQuestionPlanFilter = "ALL" | QuestionGenerationPlan;
type ReviewStatusFilter = "ALL" | "PENDING" | "APPROVED";
type QuestionViewMode = "flat" | "passage";
type CardLayoutMode = "grid2" | "grid3" | "list";

const cardLayoutClassNames: Record<CardLayoutMode, string> = {
  grid2: "grid grid-cols-1 items-stretch gap-3 md:grid-cols-2",
  grid3: "grid grid-cols-1 items-stretch gap-3 md:grid-cols-3",
  list: "grid grid-cols-1 items-stretch gap-3",
};

// "최근 N개" 윈도우 크기. 새 세션 문제가 들어오면 가장 오래된 저장 문제가 이 한도 밖으로 밀려난다.
// (저장 문제 fetch limit과 일치해야 함 — generate-page-client.tsx loadSavedQuestions)
const RECENT_QUESTION_LIMIT = 100;

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
  if (Array.isArray(rawTags))
    return rawTags.filter((tag): tag is string => typeof tag === "string");
  if (typeof rawTags !== "string") return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return rawTags
      .split(/[,;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
}

function getQuestionPlan(q: QuestionCardItem): QuestionGenerationPlan | null {
  const tagPlan = getQuestionGenerationPlanFromTags(parseQuestionTags(q.tags));
  if (tagPlan) return tagPlan;

  if (
    q.structuredData &&
    typeof q.structuredData === "object" &&
    "_generationPlan" in q.structuredData
  ) {
    const plan = (q.structuredData as { _generationPlan?: unknown })
      ._generationPlan;
    if (plan === "STANDARD" || plan === "PREMIUM") return plan;
  }

  return null;
}

function matchesPlanFilter(
  q: QuestionCardItem,
  filter: SavedQuestionPlanFilter,
): boolean {
  if (filter === "ALL") return true;
  const plan = getQuestionPlan(q);
  if (filter === "PREMIUM") return plan === "PREMIUM";
  return plan !== "PREMIUM";
}

function matchesReviewFilter(
  q: QuestionCardItem,
  filter: ReviewStatusFilter,
): boolean {
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
    tags: JSON.stringify(
      mergeQuestionGenerationPlanTag(parseQuestionTags(q.tags), plan),
    ),
  };
}

function withSessionPlanTag(
  q: QuestionCardItem,
  fallbackPlan?: QuestionGenerationPlan,
): QuestionCardItem {
  const plan = getQuestionPlan(q) ?? fallbackPlan ?? "STANDARD";
  const structuredData =
    q.structuredData && typeof q.structuredData === "object"
      ? {
          ...(q.structuredData as Record<string, unknown>),
          _generationPlan: plan,
        }
      : q.structuredData;

  return {
    ...q,
    tags: JSON.stringify(
      mergeQuestionGenerationPlanTag(parseQuestionTags(q.tags), plan),
    ),
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
    const title =
      sanitizeAiModelDisclosureText(passage?.title || "") || "지문 없음";
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
  filteredQueue,
  savedQuestions,
  loadingSavedQuestions,
  setDetailQuestion,
  openDetailQuestionId,
  onApproveQuestion,
  onUnapproveQuestion,
  onBatchApproveQuestions,
  // Single-delete now routes through requestDelete -> 네이티브 확인창 ->
  // onBatchDeleteQuestions (with tombstone tracking). onDeleteQuestion is kept
  // in the prop contract for the parent's wiring but superseded by that flow.
  onDeleteQuestion,
  onBatchDeleteQuestions,
  deletedQuestionIds,
  deletedQuestionSignatures,
  batchDeleting = false,
  onEditQuestion,
  onRetryGeneration,
  marqueeBoundaryRef,
  renderCardDetailExtra,
  tourHighlightSessionQuestionCount = 0,
}: BottomQueueSectionProps) {
  const [savedPlanFilter, setSavedPlanFilter] =
    useState<SavedQuestionPlanFilter>("ALL");
  const [reviewStatusFilter, setReviewStatusFilter] =
    useState<ReviewStatusFilter>("ALL");
  const [questionViewMode, setQuestionViewMode] =
    useState<QuestionViewMode>("flat");
  const [cardLayoutMode, setCardLayoutMode] = usePersistedState<CardLayoutMode>(
    "smoat:view-mode:generate-bottom-queue",
    "grid3",
    (v): v is CardLayoutMode => v === "grid2" || v === "grid3" || v === "list",
  );
  // 카드 체크박스 선택 — 검수완료(승인 가능한 것만 적용)와 선택 삭제가 공유한다.
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(
    new Set(),
  );
  // 방금 생성된(현재 세션) 문제 카드의 파란 글로우 — 한 번 클릭하면 해제된다.
  // (지문 추출의 fresh 글로우와 동일 패턴) 카드 key 기준으로 확인 처리.
  const [acknowledgedFreshKeys, setAcknowledgedFreshKeys] = useState<
    Set<string>
  >(new Set());
  const acknowledgeFreshCard = useCallback((key: string) => {
    setAcknowledgedFreshKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);
  // 방금 상세를 열어본 문제 id — 모달을 닫아도 유지해, 닫는 순간 카드를 한 번 반짝인다.
  const [lastViewedQuestionId, setLastViewedQuestionId] = useState<
    string | null
  >(null);
  const openQuestionDetail = useCallback(
    (q: QuestionCardItem) => {
      setLastViewedQuestionId(q.id);
      setDetailQuestion(q);
    },
    [setDetailQuestion],
  );
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();
  const [batchApproving, setBatchApproving] = useState(false);
  const [expandedPassageIds, setExpandedPassageIds] = useState<
    Record<string, boolean>
  >({});
  // Live (non-tombstoned) saved questions — the source of truth for every
  // saved-question derivation below, so deletes take effect immediately and
  // survive the periodic session-queue refetch.
  const liveSavedQuestions = useMemo(
    () =>
      deletedQuestionIds && deletedQuestionIds.size > 0
        ? savedQuestions.filter((q) => !deletedQuestionIds.has(q.id))
        : savedQuestions,
    [savedQuestions, deletedQuestionIds],
  );

  const savedQuestionsById = useMemo(
    () => new Map(liveSavedQuestions.map((q) => [q.id, q])),
    [liveSavedQuestions],
  );

  const savedQuestionsBySignature = useMemo(() => {
    const map = new Map<string, QuestionCardItem>();
    for (const q of liveSavedQuestions) {
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
  }, [liveSavedQuestions]);

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
        const sig = questionSignature({
          passageId: item.passageId,
          subType,
          questionText,
          correctAnswer,
          options: optionsJson,
        });
        // Signature tombstone: covers cards that resolve via the signature
        // fallback (legacy jobs with no aligned questionIds), where the deleted
        // row has already left the signature map so the id guard below can't fire.
        if (deletedQuestionSignatures?.has(sig)) return;
        const savedQuestion = savedQuestionId
          ? savedQuestionsById.get(savedQuestionId)
          : savedQuestionsBySignature.get(sig);
        const persistedQuestionId = savedQuestionId ?? savedQuestion?.id;
        // Id tombstone: drops id-aligned cards whose row was deleted this session
        // (the job still references the id, but the row is gone).
        if (persistedQuestionId && deletedQuestionIds?.has(persistedQuestionId))
          return;
        const createdAt =
          savedQuestion?.createdAt ??
          (item.createdAt ? new Date(item.createdAt) : new Date());
        const cardItem: QuestionCardItem = withSessionPlanTag(
          {
            id: persistedQuestionId || `${item.id}-${qi}`,
            type: q.options ? "MULTIPLE_CHOICE" : "SHORT_ANSWER",
            subType,
            questionText,
            options: optionsJson,
            correctAnswer,
            difficulty: q.difficulty || "INTERMEDIATE",
            tags: Array.isArray(q.tags)
              ? JSON.stringify(q.tags)
              : q.tags
                ? String(q.tags)
                : null,
            aiGenerated: true,
            approved: savedQuestion?.approved ?? Boolean(q.approved),
            createdAt,
            passage: {
              id: item.passageId,
              title: item.passageTitle,
              content: item.passageContent,
            },
            explanation: q.explanation
              ? {
                  id: `${item.id}-${qi}-exp`,
                  content: q.explanation,
                  keyPoints: q.keyPoints ? JSON.stringify(q.keyPoints) : null,
                  wrongOptionExplanations: q.wrongOptionExplanations
                    ? JSON.stringify(q.wrongOptionExplanations)
                    : null,
                }
              : null,
            structuredData: q,
          },
          item.config.generationPlan,
        );

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
  }, [
    filteredQueue,
    savedQuestionsById,
    savedQuestionsBySignature,
    deletedQuestionIds,
    deletedQuestionSignatures,
  ]);

  const visibleSessionQuestionCards = useMemo(
    () =>
      sessionQuestionCards.filter((card) =>
        matchesReviewFilter(card.question, reviewStatusFilter),
      ),
    [reviewStatusFilter, sessionQuestionCards],
  );

  const tourHighlightedSessionQuestionIndex = useMemo(() => {
    const map = new Map<string, number>();
    visibleSessionQuestionCards
      .slice(0, Math.max(0, tourHighlightSessionQuestionCount))
      .forEach((card, index) => map.set(card.key, index));
    return map;
  }, [tourHighlightSessionQuestionCount, visibleSessionQuestionCards]);

  // Persisted ids already shown as 현재 세션 cards — used to dedupe the saved list
  // (especially in delete mode) so one question isn't checkboxed twice.
  const sessionShownPersistedIds = useMemo(
    () =>
      new Set(
        visibleSessionQuestionCards
          .filter((card) => card.persistedQuestionId)
          .map((card) => card.persistedQuestionId as string),
      ),
    [visibleSessionQuestionCards],
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
    () =>
      liveSavedQuestions.filter((q) =>
        matchesReviewFilter(q, reviewStatusFilter),
      ),
    [reviewStatusFilter, liveSavedQuestions],
  );

  const savedPlanCounts = useMemo(() => {
    const premium = reviewFilteredSavedQuestions.filter(
      (q) => getQuestionPlan(q) === "PREMIUM",
    ).length;
    return {
      ALL: reviewFilteredSavedQuestions.length,
      STANDARD: reviewFilteredSavedQuestions.length - premium,
      PREMIUM: premium,
    };
  }, [reviewFilteredSavedQuestions]);

  const visibleSavedQuestions = useMemo(
    () =>
      reviewFilteredSavedQuestions.filter((q) =>
        matchesPlanFilter(q, savedPlanFilter),
      ),
    [reviewFilteredSavedQuestions, savedPlanFilter],
  );

  const questionSetFilters = useMemo(
    () => ({
      approved:
        reviewStatusFilter === "APPROVED"
          ? true
          : reviewStatusFilter === "PENDING"
            ? false
            : undefined,
    }),
    [reviewStatusFilter],
  );

  // 현재 세션에서 이미 카드로 보여주는 문제 id (저장 목록과의 중복 제거용)
  const sessionCardQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const card of sessionQuestionCards) {
      ids.add(card.question.id);
      if (card.persistedQuestionId) ids.add(card.persistedQuestionId);
    }
    return ids;
  }, [sessionQuestionCards]);

  // 세션 카드와 중복되지 않는 저장 문제 (최신 100개 중 세션에 안 나온 것)
  const mergedSavedQuestions = useMemo(
    () =>
      visibleSavedQuestions.filter((q) => !sessionCardQuestionIds.has(q.id)),
    [visibleSavedQuestions, sessionCardQuestionIds],
  );

  // "최근 N개" 윈도우: 세션 문제가 먼저 자리를 차지하고, 남는 칸만큼만 저장 문제를 채운다.
  // → 새로 생성한 세션 문제 수만큼 가장 오래된 저장 문제가 잘려나간다.
  const cappedMergedSavedQuestions = useMemo(
    () =>
      mergedSavedQuestions.slice(
        0,
        Math.max(0, RECENT_QUESTION_LIMIT - visibleSessionQuestionCards.length),
      ),
    [mergedSavedQuestions, visibleSessionQuestionCards.length],
  );

  const reviewCounts = useMemo(() => {
    // "최근 N개" 윈도우 기준으로 집계 — 세션 문제가 먼저, 남는 칸만 저장 문제로 채운다.
    // 삭제된(tombstoned) 저장 문제는 liveSavedQuestions에서 이미 제외돼 집계되지 않는다.
    const questionsById = new Map<string, QuestionCardItem>();
    for (const card of sessionQuestionCards) {
      const previous = questionsById.get(card.question.id);
      questionsById.set(card.question.id, {
        ...(previous ?? card.question),
        approved: Boolean(previous?.approved || card.question.approved),
      });
    }
    const remaining = Math.max(0, RECENT_QUESTION_LIMIT - questionsById.size);
    let added = 0;
    for (const q of liveSavedQuestions) {
      if (added >= remaining) break;
      if (questionsById.has(q.id) || sessionCardQuestionIds.has(q.id)) continue;
      questionsById.set(q.id, q);
      added++;
    }
    const allQuestions = [...questionsById.values()];
    return {
      ALL: allQuestions.length,
      PENDING: allQuestions.filter((q) => !q.approved).length,
      APPROVED: allQuestions.filter((q) => q.approved).length,
    };
  }, [liveSavedQuestions, sessionQuestionCards, sessionCardQuestionIds]);

  const sessionGroups = useMemo(
    () => groupByPassage(visibleSessionQuestionCards, (card) => card.question),
    [visibleSessionQuestionCards],
  );

  const visibleQueueCards = useMemo(
    () =>
      reviewStatusFilter === "ALL"
        ? filteredQueue.filter(
            (item) => item.status === "generating" || item.status === "error",
          )
        : [],
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
      cards.forEach((card) =>
        entries.push({
          kind: "question",
          key: card.key,
          card,
        }),
      );
    }
    return entries;
  }, [
    filteredQueue,
    reviewStatusFilter,
    visibleSessionQuestionCards,
    visibleSessionQuestionCardsByItemId,
  ]);

  // ── 선택 풀 (session + saved persisted questions) ──
  // The selectable pool mirrors exactly what the user can see (session cards +
  // the windowed saved cards), so "전체 선택" stays honest.
  const selectableSessionIds = useMemo(
    () => [...sessionShownPersistedIds],
    [sessionShownPersistedIds],
  );

  // Drop saved cards already shown as a 현재 세션 card so each question is
  // checkboxed exactly once.
  const savedCardsForDisplay = useMemo(
    () =>
      cappedMergedSavedQuestions.filter(
        (q) => !sessionShownPersistedIds.has(q.id),
      ),
    [cappedMergedSavedQuestions, sessionShownPersistedIds],
  );

  // ── 지문 세트 ── 일반 문항과 완전히 별개의 렌더 경로. 멤버는 inSet=true 라 일반
  // 목록에는 안 뜨고, 전용 QuestionSetSection 이 세트를 한 장의 카드로 묶어 보여준다.
  // 여기선 빈-상태 판정에 쓸 세트 수만 추적한다(섹션이 콜백으로 알려줌).
  const [setCount, setSetCount] = useState<number | null>(null);

  // Passage-grouped saved cards for the 지문별 view.
  const savedCardsForDisplayGroups = useMemo(
    () =>
      groupByPassage(savedCardsForDisplay.map(withVisiblePlanTag), (q) => q),
    [savedCardsForDisplay],
  );

  const selectableSavedIds = useMemo(
    () => savedCardsForDisplay.map((q) => q.id),
    [savedCardsForDisplay],
  );

  const allSelectableIds = useMemo(
    () => [...new Set([...selectableSessionIds, ...selectableSavedIds])],
    [selectableSessionIds, selectableSavedIds],
  );

  const router = useRouter();
  // '시험지 생성' — 아래에서 '선택한' 문제만 데리고 시험지 생성로 이동한다.
  // (선택이 없으면 비활성) id 목록은 sessionStorage 로 넘겨 빌더가
  // 미리보기(시험지)에 바로 올린다.
  const examSeedIds = useMemo(
    () => allSelectableIds.filter((id) => selectedQuestionIds.has(id)),
    [selectedQuestionIds, allSelectableIds],
  );
  const handleCreateExam = useCallback(() => {
    if (examSeedIds.length === 0) return;
    seedExamAndNavigate(router, examSeedIds);
  }, [examSeedIds, router]);

  // Prune stale selections once items leave the selectable pool (e.g. deleted).
  useEffect(() => {
    setSelectedQuestionIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(allSelectableIds);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (valid.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [allSelectableIds]);

  const toggleQuestionSelection = useCallback((id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroupSelection = useCallback((ids: string[]) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, []);

  const allSelected =
    allSelectableIds.length > 0 &&
    allSelectableIds.every((id) => selectedQuestionIds.has(id));
  const someSelected = selectedQuestionIds.size > 0 && !allSelected;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) setSelectedQuestionIds(new Set());
    else setSelectedQuestionIds(new Set(allSelectableIds));
  }, [allSelected, allSelectableIds]);

  // 검수완료는 선택 중 승인 가능한(미검수 세션) 문제에만 적용된다.
  const selectedApprovableIds = useMemo(
    () => sessionApprovableIds.filter((id) => selectedQuestionIds.has(id)),
    [sessionApprovableIds, selectedQuestionIds],
  );

  const handleBatchApprove = useCallback(async () => {
    if (selectedApprovableIds.length === 0 || !onBatchApproveQuestions) return;
    setBatchApproving(true);
    try {
      await onBatchApproveQuestions(selectedApprovableIds);
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev);
        selectedApprovableIds.forEach((id) => next.delete(id));
        return next;
      });
    } finally {
      setBatchApproving(false);
    }
  }, [onBatchApproveQuestions, selectedApprovableIds]);

  // 네이티브 확인창으로 삭제 확인 후 곧바로 실행한다.
  const requestDelete = useCallback(
    async (ids: string[], source: "bulk" | "single") => {
      if (!onBatchDeleteQuestions || ids.length === 0 || batchDeleting) return;
      const title =
        source === "single"
          ? "이 문제를 삭제하시겠습니까?"
          : `선택한 문제 ${ids.length}개를 삭제하시겠습니까?`;
      if (
        !confirmNative(
          title,
          "이 작업은 되돌릴 수 없습니다. 문제에 연결된 해설·시험 연결도 함께 삭제됩니다.",
        )
      )
        return;
      const ran = await onBatchDeleteQuestions(ids);
      if (ran !== false && source === "bulk") setSelectedQuestionIds(new Set());
    },
    [batchDeleting, onBatchDeleteQuestions],
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedQuestionIds.size === 0) return;
    void requestDelete(Array.from(selectedQuestionIds), "bulk");
  }, [requestDelete, selectedQuestionIds]);

  // renderSessionQuestionCard + renderSavedQuestionCard 병합 — 공유 핸들러/
  // QuestionCard 블록은 한 벌만 두고, 가변부만 옵션으로 받는다.
  // - persistedId: 저장 정합 id. 세션 카드는 미저장이면 undefined(선택/검수/삭제
  //   비활성 가드), 저장 카드는 항상 q.id.
  // - source "session": 투어 강조/fresh 글로우 래퍼 + acknowledgeFreshCard,
  //   상세는 setDetailQuestion 직행(마일스톤 디스패치 포함).
  // - source "saved": recentlyViewed(상세 닫힘 반짝임) + openQuestionDetail
  //   (lastViewed 추적) 경로.
  function renderQuestionCard({
    source,
    cardKey,
    question,
    num,
    persistedId,
  }: {
    source: "session" | "saved";
    cardKey: string;
    question: QuestionCardItem;
    num: number;
    persistedId?: string;
  }) {
    const isSelected = persistedId
      ? selectedQuestionIds.has(persistedId)
      : false;
    const cardToggle = persistedId
      ? () => toggleQuestionSelection(persistedId)
      : undefined;
    const tourHighlightIndex =
      source === "session"
        ? tourHighlightedSessionQuestionIndex.get(cardKey)
        : undefined;
    const isTourHighlighted = tourHighlightIndex !== undefined;
    const isFirstTourHighlighted = tourHighlightIndex === 0;
    // 방금 생성된 카드의 파란 글로우 — 클릭 전까지 표시(투어 강조와는 별개).
    const isFreshGlow =
      source === "session" &&
      !isTourHighlighted &&
      !acknowledgedFreshKeys.has(cardKey);
    const openDetail = () => {
      if (isFirstTourHighlighted) {
        dispatchGenerateTourMilestone("question-detail-opened");
      }
      // 저장 카드는 방금 본 카드 반짝임을 위해 lastViewed 를 함께 기록한다.
      if (source === "saved") openQuestionDetail(question);
      else setDetailQuestion(question);
    };

    return (
      <div
        key={cardKey}
        data-generate-tour={
          isFirstTourHighlighted
            ? "generated-question-card-first"
            : isTourHighlighted
              ? "generated-question-card"
              : undefined
        }
        onClick={(e) => {
          if (source === "session") acknowledgeFreshCard(cardKey);
          if (
            e.detail > 1 ||
            !cardToggle ||
            shouldIgnoreCardSelectionClick(e)
          )
            return;
          scheduleCardSelectionClick(cardToggle);
        }}
        onDoubleClick={(e) => {
          if (source === "session") acknowledgeFreshCard(cardKey);
          cancelPendingCardSelectionClick();
          clearCardTextSelection();
          if (shouldIgnoreCardDoubleClick(e)) return;
          openDetail();
        }}
        onMouseDown={preventCardDoubleClickTextSelection}
        className={
          source === "session"
            ? `h-full cursor-pointer rounded-xl transition-shadow ${
                isTourHighlighted
                  ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-white"
                  : isFreshGlow
                    ? "ring-2 ring-blue-400/70 shadow-[0_0_0_1px_rgba(37,99,235,0.45),0_0_26px_8px_rgba(37,99,235,0.30)] motion-safe:animate-pulse [&_[data-slot=card]]:!border-transparent [&_[data-slot=card]]:!shadow-none"
                    : ""
              }`
            : "h-full cursor-pointer"
        }
      >
        <QuestionCard
          q={question}
          num={num}
          readonly
          compact
          showReviewActions={Boolean(persistedId)}
          showHeaderActions={Boolean(persistedId)}
          selected={isSelected}
          recentlyViewed={
            source === "saved"
              ? lastViewedQuestionId === question.id &&
                openDetailQuestionId !== question.id
              : undefined
          }
          dragItemId={persistedId ?? null}
          onToggle={cardToggle}
          onDetail={openDetail}
          showDetailButton
          showDetailIconButton
          detailExtra={renderCardDetailExtra?.(question)}
          onApprove={
            !onApproveQuestion
              ? undefined
              : () => persistedId && onApproveQuestion(persistedId)
          }
          onUnapprove={
            !onUnapproveQuestion
              ? undefined
              : () => persistedId && onUnapproveQuestion(persistedId)
          }
          onEdit={() => persistedId && onEditQuestion(persistedId)}
          onDelete={
            !persistedId
              ? undefined
              : () => void requestDelete([persistedId as string], "single")
          }
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
    const showGroupCheckbox = selectableIds.length > 0;
    const selectedInGroup = selectableIds.filter((id) =>
      selectedQuestionIds.has(id),
    ).length;
    const checkState: boolean | "indeterminate" =
      selectableIds.length > 0 && selectedInGroup === selectableIds.length
        ? true
        : selectedInGroup > 0
          ? "indeterminate"
          : false;

    return (
      <section
        key={groupKey}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <header
          className={`flex items-center gap-2.5 border-b px-4 ${isOpen ? "bg-blue-50/50 border-blue-100" : "bg-white border-slate-100"}`}
        >
          {showGroupCheckbox ? (
            <div
              className="-m-1 flex shrink-0 cursor-pointer items-center p-1"
              onClick={(e) => {
                e.stopPropagation();
                toggleGroupSelection(selectableIds);
              }}
            >
              <Checkbox
                checked={checkState}
                aria-label={`${group.title} 전체 선택`}
                className="size-4 cursor-pointer"
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => toggleGroupSelection(selectableIds)}
              />
            </div>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() =>
              setExpandedPassageIds((prev) => ({
                ...prev,
                [groupKey]: !isOpen,
              }))
            }
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-3 text-left"
          >
            <ChevronRight
              className={`size-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-md ${isOpen ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}
            >
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
              {group.title}
            </span>
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
            <DragSelect
              className={cardLayoutClassNames[cardLayoutMode]}
              value={selectedQuestionIds}
              onChange={setSelectedQuestionIds}
              boundaryRef={marqueeBoundaryRef}
            >
              {group.cards.map((card, index) => renderCard(card, index))}
            </DragSelect>
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

  const layoutButtons = [
    { value: "grid2", label: "2열 보기", Icon: Grid2x2 },
    { value: "grid3", label: "3열 보기", Icon: Grid3x3 },
    { value: "list", label: "목록 보기", Icon: ListIcon },
  ] satisfies ReadonlyArray<ViewModeCycleOption<CardLayoutMode>>;

  const QUESTION_VIEW_MODE_OPTIONS = [
    { value: "flat", label: "문제별", Icon: Rows3 },
    { value: "passage", label: "지문별", Icon: FileText },
  ] satisfies ReadonlyArray<ViewModeCycleOption<QuestionViewMode>>;

  return (
    <div className="rounded-lg bg-white">
      <div className="sticky top-0 z-20 flex flex-col gap-3 rounded-t-lg border-b border-slate-100 bg-white px-4 py-3">
        {/* ── 1행: 제목 + 시험지 생성 ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <ClipboardList className="size-4" aria-hidden="true" />
            </span>
            <h2 className="truncate text-[13px] font-bold text-slate-900">
              문제 생성/검수 결과
            </h2>
            <span
              aria-hidden="true"
              className="shrink-0 text-[11px] font-medium text-slate-300"
            >
              ·
            </span>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400">
              최근 {reviewCounts.ALL}개
            </span>
          </div>
          {/* 시험지 생성 — 아래에서 선택한 문제만 데리고 시험지 생성로 이동 */}
          <button
            type="button"
            onClick={handleCreateExam}
            disabled={examSeedIds.length === 0}
            title={
              examSeedIds.length === 0
                ? "아래에서 시험지에 넣을 문제를 먼저 선택하세요"
                : "선택한 문제로 시험지를 만듭니다 (미리보기에 바로 올라갑니다)"
            }
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            <FileOutput className="h-4 w-4" aria-hidden="true" />
            시험지 생성
            {examSeedIds.length > 0 && (
              <span className="rounded bg-white/20 px-1 text-[11px] font-bold tabular-nums">
                {examSeedIds.length}
              </span>
            )}
          </button>
        </div>

        {/* ── 2행: 선택/삭제 + 필터 ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5">
            {allSelectableIds.length > 0 && (
              <>
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={toggleSelectAll}
                  aria-label="문제 전체 선택"
                  title="전체 선택"
                  className="size-4 cursor-pointer"
                />
                {sessionApprovableIds.length > 0 && (
                  <button
                    type="button"
                    disabled={
                      selectedApprovableIds.length === 0 || batchApproving
                    }
                    onClick={handleBatchApprove}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-none transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:opacity-100"
                  >
                    {batchApproving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    검수완료
                    {selectedApprovableIds.length > 0 && (
                      <span className="text-[11px] font-bold opacity-90">
                        ({selectedApprovableIds.length})
                      </span>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    selectedQuestionIds.size === 0 ||
                    batchDeleting ||
                    !onBatchDeleteQuestions
                  }
                  onClick={handleBatchDelete}
                  aria-label="선택한 문제 삭제"
                  title="선택한 문제 삭제"
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
                >
                  {batchDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <ViewModeCycleButton
              value={reviewStatusFilter}
              options={reviewButtons.map(({ id, label, count }) => ({
                value: id,
                label,
                content: (
                  <>
                    {label} <span className="text-slate-400">{count}</span>
                  </>
                ),
              }))}
              onChange={setReviewStatusFilter}
            />

            {/* 생성 플랜 필터 — 전체 → 일반 생성 → 프리미엄 생성 순환(단일 버튼).
                PREMIUM 결과가 있으면 모델 셀렉터 플래그와 무관하게 노출(MINE 게이트 보존). */}
            {(FEATURE_FLAGS.SHOW_MODEL_SELECTOR || savedPlanCounts.PREMIUM > 0) && (
              <ViewModeCycleButton
                value={savedPlanFilter}
                options={(
                  [
                    {
                      value: "ALL",
                      label: "전체",
                      count: savedPlanCounts.ALL,
                      Icon: Sparkles,
                    },
                    {
                      value: "STANDARD",
                      label: QUESTION_GENERATION_PLAN_TAGS.STANDARD,
                      count: savedPlanCounts.STANDARD,
                      Icon: PearlIcon,
                    },
                    {
                      value: "PREMIUM",
                      label: QUESTION_GENERATION_PLAN_TAGS.PREMIUM,
                      count: savedPlanCounts.PREMIUM,
                      Icon: Gem,
                    },
                  ] as const
                ).map(({ value, label, count, Icon }) => ({
                  value,
                  label,
                  content: (
                    <>
                      <Icon className="h-3 w-3" aria-hidden />
                      <span>{label}</span>
                      <span className="text-slate-400">{count}</span>
                    </>
                  ),
                }))}
                onChange={setSavedPlanFilter}
              />
            )}

            <ViewModeCycleButton
              value={questionViewMode}
              options={QUESTION_VIEW_MODE_OPTIONS}
              showLabel
              onChange={setQuestionViewMode}
            />

            <ViewModeCycleButton
              value={cardLayoutMode}
              options={layoutButtons}
              onChange={setCardLayoutMode}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-b-lg bg-white px-4 py-4">
        {questionViewMode === "flat" ? (
          loadingSavedQuestions &&
          sessionFlatEntries.length === 0 &&
          savedCardsForDisplay.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : sessionFlatEntries.length === 0 &&
            savedCardsForDisplay.length === 0 &&
            setCount === 0 ? (
            <EmptyState
              message={
                reviewStatusFilter === "ALL" && savedPlanFilter === "ALL"
                  ? "아직 저장된 문제가 없습니다."
                  : "현재 필터에 해당하는 문제가 없습니다."
              }
            />
          ) : (
            <div className="space-y-3">
              <QuestionSetSection
                refreshKey={savedQuestions}
                onCountChange={setSetCount}
                filters={questionSetFilters}
                gridClassName={cardLayoutClassNames[cardLayoutMode]}
              />
              <DragSelect
                className={cardLayoutClassNames[cardLayoutMode]}
                value={selectedQuestionIds}
                onChange={setSelectedQuestionIds}
                boundaryRef={marqueeBoundaryRef}
              >
                {sessionFlatEntries.map((entry) =>
                  entry.kind === "queue" ? (
                    <QueueStatusCard
                      key={entry.item.id}
                      item={entry.item}
                      onRetryGeneration={onRetryGeneration}
                      showPremiumBadgeWhenFlagOff
                    />
                  ) : (
                    renderQuestionCard({
                      source: "session",
                      cardKey: entry.card.key,
                      question: entry.card.question,
                      num: entry.card.number,
                      persistedId: entry.card.persistedQuestionId,
                    })
                  ),
                )}
                {savedCardsForDisplay.map((q, index) =>
                  renderQuestionCard({
                    source: "saved",
                    cardKey: q.id,
                    question: withVisiblePlanTag(q),
                    num: index + 1,
                    persistedId: q.id,
                  }),
                )}
              </DragSelect>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {visibleQueueCards.length > 0 && (
              <div className={cardLayoutClassNames[cardLayoutMode]}>
                {visibleQueueCards.map((item) => (
                  <QueueStatusCard
                    key={item.id}
                    item={item}
                    onRetryGeneration={onRetryGeneration}
                    showPremiumBadgeWhenFlagOff
                  />
                ))}
              </div>
            )}
            {sessionGroups.map((group) =>
              renderPassageGroup({
                group,
                source: "session",
                renderCard: (card) =>
                  renderQuestionCard({
                    source: "session",
                    cardKey: card.key,
                    question: card.question,
                    num: card.number,
                    persistedId: card.persistedQuestionId,
                  }),
                getSelectableIds: (cards) =>
                  cards
                    .filter((card) => card.persistedQuestionId)
                    .map((card) => card.persistedQuestionId as string),
              }),
            )}
            <QuestionSetSection
              refreshKey={savedQuestions}
              onCountChange={setSetCount}
              filters={questionSetFilters}
              gridClassName={cardLayoutClassNames[cardLayoutMode]}
            />
            {savedCardsForDisplayGroups.map((group) =>
              renderPassageGroup({
                group,
                source: "saved",
                renderCard: (q, index) =>
                  renderQuestionCard({
                    source: "saved",
                    cardKey: q.id,
                    question: withVisiblePlanTag(q),
                    num: index + 1,
                    persistedId: q.id,
                  }),
                getSelectableIds: (qs) => qs.map((q) => q.id),
              }),
            )}
            {loadingSavedQuestions &&
              visibleQueueCards.length === 0 &&
              sessionGroups.length === 0 &&
              savedCardsForDisplayGroups.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              )}
            {!loadingSavedQuestions &&
              visibleQueueCards.length === 0 &&
              sessionGroups.length === 0 &&
              savedCardsForDisplayGroups.length === 0 &&
              setCount === 0 && (
                <EmptyState
                  message={
                    reviewStatusFilter === "ALL" && savedPlanFilter === "ALL"
                      ? "아직 저장된 문제가 없습니다."
                      : "현재 필터에 해당하는 문제가 없습니다."
                  }
                />
              )}
          </div>
        )}
      </div>

    </div>
  );
}
