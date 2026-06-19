// @ts-nocheck
"use client";

// ---------------------------------------------------------------------------
// EmbeddedQuestionBank
// ---------------------------------------------------------------------------
// A self-contained client port of QuestionBankClient
// (src/components/workbench/question-bank-client.tsx) for embedding ABOVE the
// generate page's results box. Where QuestionBankClient is page-level and
// drives all state via URL searchParams + router.push (which triggers a server
// re-fetch), this component keeps every filter in LOCAL React state and
// re-fetches client-side through the existing @/actions/workbench server
// actions. It reuses the same presentational components and the same bulk /
// folder server actions, so the browsing + management experience matches the
// 문제 관리 page without touching the generate route's URL.
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Database,
  FileText,
  FolderX,
  Gem,
  Loader2,
  RotateCcw,
  Rows3,
  Trash2,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";

import {
  getWorkbenchQuestions,
  getWorkbenchQuestionsGroupedByPassage,
  getWorkbenchQuestionStatusCounts,
  getWorkbenchQuestion,
  getWorkbenchQuestionIds,
  deleteWorkbenchQuestion,
  bulkDeleteWorkbenchQuestions,
  bulkApproveWorkbenchQuestions,
  approveWorkbenchQuestion,
  unapproveWorkbenchQuestion,
  toggleQuestionStar,
  getQuestionCollections,
  getAcademyQuestionCollectionMembership,
  createQuestionCollection,
  updateQuestionCollection,
  deleteQuestionCollection,
  addQuestionsToCollection,
  removeQuestionsFromCollection,
} from "@/actions/workbench";
import { createExam } from "@/actions/exams";
import { EXAM_SEED_QUESTION_IDS_KEY } from "@/lib/exam-paper-seed";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DragSelect } from "@/components/ui/drag-select";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useSelection } from "@/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";

import { Pagination } from "@/components/workbench/shared/pagination";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import { QuestionBankCard } from "@/components/workbench/question-bank-card";
import { PassageGroupedView } from "@/components/workbench/question-bank-passage-view";
import { CreateExamDialog } from "@/components/workbench/question-bank-client/create-exam-dialog";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { GridToggle } from "@/components/workbench/question-bank-client/grid-toggle";
import { QuestionDetailDialog } from "@/components/workbench/question-bank-client/question-detail-dialog";
import { QuestionFiltersToolbar } from "@/components/workbench/question-bank-client/filters-toolbar";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";

import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getQuestionGenerationPlanConfig } from "@/lib/question-generation-plans";
import { getFriendlyQuestionGenerationError } from "@/lib/workbench-generation-errors";
import { countWords, typeLabel, type QueueItem } from "./generate-page-types";

// ---------------------------------------------------------------------------
// Local filter shape (mirrors the filters QuestionBankClient receives, minus
// the bits the generate embed doesn't expose).
// ---------------------------------------------------------------------------

interface LocalFilters {
  page: number;
  type?: string;
  subType?: string;
  difficulty?: string;
  collectionId?: string;
  approved?: boolean;
  starred?: boolean;
  sort?: string;
  search?: string;
}

const PAGE_SIZE = 20;

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  title,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: () => void;
  title: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function useMeasuredHeight(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled]);
  return [ref, height] as const;
}

// ── Live generation queue strip card (ported from BottomQueueSection) ──
// Renders generating / error queue items at the very front of the bank list.
function QueueStripCard({
  item,
  onRetryGeneration,
}: {
  item: QueueItem;
  onRetryGeneration?: (item: QueueItem) => void | Promise<void>;
}) {
  const planConfig = getQuestionGenerationPlanConfig(
    item.config.generationPlan || "STANDARD",
  );

  if (item.status === "generating") {
    const requestedCount = Object.values(item.config.typeCounts).reduce(
      (a: number, b: any) => a + Number(b),
      0,
    );
    return (
      <WorkbenchLoadingCard
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
            <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {planConfig.id === "PREMIUM" ? (
                <Gem className="w-3 h-3" />
              ) : (
                <PearlIcon className="w-3 h-3" />
              )}
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
      <div className="h-[340px] overflow-hidden rounded-xl border border-red-200 bg-red-50/30 p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h4 className="text-[13px] font-bold text-slate-800 truncate">
                {item.passageTitle}
              </h4>
              {FEATURE_FLAGS.SHOW_MODEL_SELECTOR && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {planConfig.id === "PREMIUM" ? (
                    <Gem className="w-3 h-3" />
                  ) : (
                    <PearlIcon className="w-3 h-3" />
                  )}
                  {planConfig.shortLabel}
                </span>
              )}
            </div>
            <span className="text-[11px] text-red-500 font-medium">
              생성 실패
            </span>
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
        {onRetryGeneration && (
          <button
            type="button"
            onClick={() => onRetryGeneration(item)}
            title="이 카드에 사용된 유형·난이도·조건 그대로 다시 생성합니다"
            className="mt-3 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[11.5px] font-bold text-red-600 shadow-sm transition-colors hover:bg-red-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            같은 조건으로 다시 생성하기
          </button>
        )}
      </div>
    );
  }

  return null;
}

// 방금 생성 완료된 문제의 파란 글로우 — passage-card-grid 의 fresh 글로우와 동일.
const FRESH_QUESTION_GLOW_CLASS =
  "rounded-xl !ring-2 !ring-blue-400/60 !shadow-[0_0_0_1px_rgba(37,99,235,0.45),0_0_30px_10px_rgba(37,99,235,0.32)] motion-safe:animate-pulse [&_[data-slot=card]]:!border-blue-400 [&_[data-slot=card]]:!bg-blue-50/25";

interface EmbeddedQuestionBankProps {
  academyId: string;
  // ── Live generation queue (ported from BottomQueueSection) ──
  sessionQueue?: QueueItem[];
  queueCounts?: { generating: number; done: number; error: number };
  queueFilter?: "all" | "error";
  setQueueFilter?: (v: "all" | "error") => void;
  onRetryGeneration?: (item: QueueItem) => void | Promise<void>;
  // 마키(영역 드래그) 시작 영역을 이 패널 전체로 넓히는 boundary — 지문 목록
  // (PassageCardGrid)과 동일한 방식. 문제별/지문별 두 뷰의 DragSelect 가 모두
  // 이 boundary 를 공유해, 패널 어디서든 드래그를 시작해 카드를 다중 선택한다.
  marqueeBoundaryRef?: RefObject<HTMLElement | null>;
}

export function EmbeddedQuestionBank({
  academyId,
  sessionQueue = [],
  queueCounts = { generating: 0, done: 0, error: 0 },
  queueFilter = "all",
  setQueueFilter,
  onRetryGeneration,
  marqueeBoundaryRef,
}: EmbeddedQuestionBankProps) {
  const router = useRouter();

  // ─── Local filter state (replaces URL searchParams) ───
  const [filters, setFilters] = useState<LocalFilters>({ page: 1 });
  const [view, setView] = useState<"flat" | "passage">("flat");
  const isGrouped = view === "passage";
  const [searchValue, setSearchValue] = useState("");

  // ─── Server data (re-fetched client-side on filter change) ───
  const [questionsData, setQuestionsData] = useState<{
    questions: any[];
    total: number;
    page: number;
    totalPages: number;
  } | null>(null);
  const [groupedData, setGroupedData] = useState<{
    passages: any[];
    total: number;
    page: number;
    totalPages: number;
  } | null>(null);
  const [statusCounts, setStatusCounts] = useState<{
    all: number;
    pending: number;
    approved: number;
  }>({ all: 0, pending: 0, approved: 0 });

  // Collapsible card chrome (mirrors QuestionBankClient's folder collapse).
  const [open, setOpen] = useState(true);

  // ─── Folder manager (client-side, like QuestionBankClient) ───
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const folders = useFolderManager({
    initialCollections: [],
    initialMembership: {},
    actions: {
      createCollection: createQuestionCollection,
      updateCollection: updateQuestionCollection,
      deleteCollection: deleteQuestionCollection,
      addToCollection: addQuestionsToCollection,
      removeFromCollection: removeQuestionsFromCollection,
    },
    itemLabel: "문제",
  });

  // Hydrate collections + membership once.
  const refreshCollections = useCallback(async () => {
    try {
      const [collections, membership] = await Promise.all([
        getQuestionCollections(academyId),
        getAcademyQuestionCollectionMembership(academyId),
      ]);
      folders.setCollections((collections ?? []) as any);
      const next: Record<string, Set<string>> = {};
      for (const [k, v] of Object.entries(membership ?? {})) {
        next[k] = new Set(v as string[]);
      }
      folders.setMembership(next);
      setCollectionsLoaded(true);
    } catch {
      setCollectionsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId]);

  useEffect(() => {
    if (open && !collectionsLoaded) void refreshCollections();
  }, [open, collectionsLoaded, refreshCollections]);

  // ─── Data loading ───
  const [loading, setLoading] = useState(false);
  const [showNavLoading, setShowNavLoading] = useState(false);
  const loadTokenRef = useRef(0);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      collectionId: folders.activeFolder ?? undefined,
      limit: PAGE_SIZE,
    }),
    [filters, folders.activeFolder],
  );

  const loadQuestions = useCallback(async () => {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setLoading(true);
    try {
      const [list, counts] = await Promise.all([
        isGrouped
          ? getWorkbenchQuestionsGroupedByPassage(academyId, effectiveFilters)
          : getWorkbenchQuestions(academyId, effectiveFilters),
        getWorkbenchQuestionStatusCounts(academyId, effectiveFilters),
      ]);
      if (loadTokenRef.current !== token) return;
      if (isGrouped) {
        setGroupedData(list as any);
        setQuestionsData(null);
      } else {
        setQuestionsData(list as any);
        setGroupedData(null);
      }
      setStatusCounts({
        all: (counts as any)?.all ?? 0,
        pending: (counts as any)?.pending ?? 0,
        approved: (counts as any)?.approved ?? 0,
      });
    } catch {
      if (loadTokenRef.current === token) toast.error("문제를 불러오지 못했습니다.");
    } finally {
      if (loadTokenRef.current === token) setLoading(false);
    }
  }, [academyId, effectiveFilters, isGrouped]);

  useEffect(() => {
    if (open) void loadQuestions();
  }, [open, loadQuestions]);

  // ─── Live queue strip (generating/error) sorted to the very front ───
  // Only "all" filter shows generating cards; "error" filter limits to errors.
  const queueStripItems = useMemo(() => {
    if (queueFilter === "error") {
      return sessionQueue.filter((q) => q.status === "error");
    }
    return sessionQueue.filter(
      (q) => q.status === "generating" || q.status === "error",
    );
  }, [sessionQueue, queueFilter]);

  // ─── Blue glow on freshly completed questions ───
  // Diff queue item statuses across renders: when an item flips to
  // done|reviewed, mark its questionIds "fresh" (same idiom as the passage
  // fresh glow). Cleared on click/interaction or after a timeout.
  const [freshQuestionIds, setFreshQuestionIds] = useState<Set<string>>(
    new Set(),
  );
  const prevQueueStatusRef = useRef<Map<string, string>>(new Map());
  const acknowledgeFreshQuestion = useCallback((id: string) => {
    setFreshQuestionIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const prev = prevQueueStatusRef.current;
    const next = new Map<string, string>();
    const newlyDoneIds: string[] = [];
    for (const item of sessionQueue) {
      next.set(item.id, item.status);
      const before = prev.get(item.id);
      const isDone = item.status === "done" || item.status === "reviewed";
      const wasDone = before === "done" || before === "reviewed";
      if (isDone && !wasDone && Array.isArray(item.questionIds)) {
        for (const qid of item.questionIds) {
          if (qid) newlyDoneIds.push(qid);
        }
      }
    }
    prevQueueStatusRef.current = next;
    if (newlyDoneIds.length === 0) return;
    setFreshQuestionIds((current) => {
      const merged = new Set(current);
      for (const id of newlyDoneIds) merged.add(id);
      return merged;
    });
  }, [sessionQueue]);

  // 자동 해제 없음 — 글로우는 사용자가 카드를 한 번 클릭할 때까지 유지된다
  // (acknowledgeFreshQuestion 이 클릭 시 해당 id 를 제거).

  // ─── Refetch the bank list when a generation completes ───
  // Mirrors the page's SAVED_QUESTIONS_DONE_REFRESH timing so the new question
  // appears in the bank list shortly after the queue item resolves.
  useEffect(() => {
    if (queueCounts.done <= 0 || !open) return;
    const t = window.setTimeout(() => {
      void loadQuestions();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [queueCounts.done, open, loadQuestions]);

  // Debounced spinner so fast loads don't flash.
  useEffect(() => {
    if (!loading) {
      setShowNavLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowNavLoading(true), 150);
    return () => window.clearTimeout(timer);
  }, [loading]);

  // ─── Local filter mutators (replace updateFilter / updateFilters / search) ───
  const normalize = (value: string | undefined) =>
    value && value !== "ALL" ? value : undefined;

  const updateFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const next: LocalFilters = { ...prev, page: 1 };
      if (key === "approved" || key === "starred") {
        next[key] =
          value === "true" ? true : value === "false" ? false : undefined;
      } else {
        next[key] = normalize(value);
      }
      return next;
    });
  }, []);

  const updateFilters = useCallback((updates: Record<string, string>) => {
    // `view` is handled by setView; everything else flows into filters.
    if ("view" in updates) {
      setView(updates.view === "passage" ? "passage" : "flat");
    }
    setFilters((prev) => {
      const next: LocalFilters = { ...prev, page: 1 };
      for (const [key, value] of Object.entries(updates)) {
        if (key === "view") continue;
        if (key === "collectionId") {
          // collection is owned by the folder manager — ignore here.
          continue;
        }
        if (key === "approved" || key === "starred") {
          next[key] =
            value === "true" ? true : value === "false" ? false : undefined;
        } else {
          next[key] = normalize(value);
        }
      }
      return next;
    });
  }, []);

  const handleSearch = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      search: searchValue.trim() || undefined,
    }));
  }, [searchValue]);

  const goToPage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  // ─── Optimistic removed-ids mask ───
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // ─── Derived question lists (mirrors QuestionBankClient) ───
  const rawFlatQuestions = questionsData?.questions ?? [];
  const flatQuestions = useMemo(
    () =>
      removedIds.size === 0
        ? rawFlatQuestions
        : rawFlatQuestions.filter((q) => !removedIds.has(q.id)),
    [rawFlatQuestions, removedIds],
  );
  const questionsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return flatQuestions;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return flatQuestions.filter((q) => ids.has(q.id));
  }, [flatQuestions, folders.activeFolder, folders.membership]);

  const rawGroupedPassages = groupedData?.passages ?? [];
  const groupedPassages = useMemo(() => {
    if (removedIds.size === 0) return rawGroupedPassages;
    return rawGroupedPassages
      .map((p) => ({
        ...p,
        questions: p.questions.filter((q) => !removedIds.has(q.id)),
      }))
      .filter((p) => p.questions.length > 0);
  }, [rawGroupedPassages, removedIds]);

  const [activePassageContext, setActivePassageContext] = useState<any | null>(
    null,
  );
  const [expandedPassageIds, setExpandedPassageIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!isGrouped) {
      setActivePassageContext(null);
      return;
    }
    if (
      activePassageContext &&
      !groupedPassages.some((p) => p.id === activePassageContext.id)
    ) {
      setActivePassageContext(null);
    }
  }, [activePassageContext, groupedPassages, isGrouped]);

  const displayedQuestions = isGrouped
    ? groupedPassages.flatMap((p) => p.questions)
    : folders.activeFolder === null
      ? flatQuestions
      : questionsInActiveFolder;

  // ─── Selection ───
  const displayedQuestionIds = useMemo(
    () => displayedQuestions.map((q) => q.id),
    [displayedQuestions],
  );
  const getDisplayedIds = useCallback(
    () => displayedQuestionIds,
    [displayedQuestionIds],
  );
  const { selectedIds, setSelectedIds, toggleSelect, clearSelection } =
    useSelection(getDisplayedIds);
  const isCurrentPageSelected =
    displayedQuestionIds.length > 0 &&
    displayedQuestionIds.every((id) => selectedIds.has(id));

  const handleSelectCurrentPage = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const shouldClearPage =
        displayedQuestionIds.length > 0 &&
        displayedQuestionIds.every((id) => next.has(id));
      for (const id of displayedQuestionIds) {
        if (shouldClearPage) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [displayedQuestionIds, setSelectedIds]);

  // ─── Grid view mode (separate storage key from question-management) ───
  const [gridCols, setGridCols] = usePersistedState<2 | 3 | "list">(
    "smoat:view-mode:generate-embedded-question-bank",
    3,
    (v): v is 2 | 3 | "list" => v === 2 || v === 3 || v === "list",
  );
  const viewSize: "lg" | "md" | "sm" = gridCols === 3 ? "md" : "lg";

  // ─── Stats ───
  const totalCount = isGrouped
    ? (groupedData?.total ?? 0)
    : (questionsData?.total ?? 0);
  const currentPage = isGrouped
    ? (groupedData?.page ?? 1)
    : (questionsData?.page ?? 1);
  const totalPages = isGrouped
    ? (groupedData?.totalPages ?? 1)
    : (questionsData?.totalPages ?? 1);

  // ─── Exam dialog ───
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  // ─── Bulk delete ───
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ─── Bulk approve ───
  const [bulkApproving, setBulkApproving] = useState(false);
  const [selectingAllPages, setSelectingAllPages] = useState(false);

  // ─── Detail dialog ───
  const detailLoadTokenRef = useRef(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const [detailQuestion, setDetailQuestion] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);

  const openDetail = useCallback(async (id: string) => {
    const token = detailLoadTokenRef.current + 1;
    detailLoadTokenRef.current = token;
    setDetailOpen(true);
    setDetailQuestionId(id);
    setDetailQuestion(null);
    setDetailLoadError(null);
    setDetailLoading(true);
    try {
      const question = await getWorkbenchQuestion(id);
      if (detailLoadTokenRef.current !== token) return;
      if (!question) {
        setDetailLoadError("문제를 찾을 수 없습니다.");
        toast.error("문제를 찾을 수 없습니다.");
        return;
      }
      setDetailQuestion(question);
    } catch {
      if (detailLoadTokenRef.current !== token) return;
      setDetailLoadError("문제를 불러오는 중 오류가 발생했습니다.");
      toast.error("문제를 불러오지 못했습니다.");
    } finally {
      if (detailLoadTokenRef.current === token) setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    detailLoadTokenRef.current += 1;
    setDetailOpen(false);
    setDetailQuestionId(null);
    setDetailQuestion(null);
    setDetailLoadError(null);
    setDetailLoading(false);
  }, []);

  const editor = useQuestionEditor((id) => {
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
  });

  // 상세 → 수정 진입 여부. true 일 때만 수정 모달에 '뒤로' 버튼을 노출한다.
  const [editorCameFromDetail, setEditorCameFromDetail] = useState(false);

  // 상세 보기 우측 상단 '문제 수정' → 상세를 닫고 수정 모달을 연다.
  const openEditorFromDetail = useCallback(
    (id: string) => {
      closeDetail();
      setEditorCameFromDetail(true);
      editor.openEditor(id);
    },
    [closeDetail, editor],
  );

  // 수정 모달 '뒤로' → 수정을 닫고 같은 문제의 상세로 복귀한다.
  const backToDetail = useCallback(() => {
    const id = editor.editingQuestionId;
    setEditorCameFromDetail(false);
    editor.closeEditor();
    if (id) void openDetail(id);
  }, [editor, openDetail]);

  // ─── Question actions ───
  const refreshAfterMutation = useCallback(() => {
    void loadQuestions();
    void refreshCollections();
  }, [loadQuestions, refreshCollections]);

  // AI '새 문제로 저장' → 새 문제를 방금 생성된 문제와 동일하게 파란 글로우로 강조하고,
  // 첫 페이지로 이동해 목록을 재조회한다(새 문제는 createdAt 최신이라 맨 앞에 나타남).
  const handleAiSavedAsNew = useCallback(
    (newId: string) => {
      if (newId) {
        setFreshQuestionIds((prev) => new Set(prev).add(newId));
      }
      setFilters((prev) => ({ ...prev, page: 1 }));
      void loadQuestions();
    },
    [loadQuestions],
  );

  async function handleDelete(id: string) {
    if (!confirm("이 문제를 삭제하시겠습니까?")) return;
    const result = await deleteWorkbenchQuestion(id);
    if (result.success) {
      toast.success("삭제됨");
      setRemovedIds((prev) => new Set(prev).add(id));
      selectedIds.delete(id);
      setSelectedIds(new Set(selectedIds));
      if (detailQuestionId === id) closeDetail();
      refreshAfterMutation();
    } else {
      toast.error(result.error || "삭제 실패");
    }
  }

  async function handleApprove(id: string) {
    const result = await approveWorkbenchQuestion(id);
    if (result.success) {
      toast.success("검수완료");
      setDetailQuestion((prev) =>
        prev && prev.id === id ? { ...prev, approved: true } : prev,
      );
      refreshAfterMutation();
    } else {
      toast.error(result.error || "승인 실패");
    }
  }

  async function handleUnapprove(id: string) {
    const result = await unapproveWorkbenchQuestion(id);
    if (result.success) {
      toast.success("검수 취소됨");
      setDetailQuestion((prev) =>
        prev && prev.id === id ? { ...prev, approved: false } : prev,
      );
      refreshAfterMutation();
    } else {
      toast.error(result.error || "검수 취소 실패");
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkApproving) return;
    setBulkApproving(true);
    try {
      const result = await bulkApproveWorkbenchQuestions(ids);
      if (!result.success) {
        toast.error(result.error || "검수 처리에 실패했습니다.");
        return;
      }
      toast.success(`${result.approved}문항을 검수완료 처리했습니다.`);
      clearSelection();
      refreshAfterMutation();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "검수 처리에 실패했습니다.",
      );
    } finally {
      setBulkApproving(false);
    }
  }

  async function handleToggleStar(id: string) {
    const result = await toggleQuestionStar(id);
    if (result.success) refreshAfterMutation();
    else toast.error(result.error || "중요 표시 변경 실패");
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteWorkbenchQuestions(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === result.requested) {
        toast.success(`${result.deleted}문항을 삭제했습니다.`);
      } else if (result.deleted === 0) {
        toast.error("삭제된 문제가 없습니다.");
      } else {
        toast.warning(
          `${result.deleted}문항 삭제됨, ${result.requested - result.deleted}문항 누락`,
        );
      }
      setRemovedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      clearSelection();
      setBulkDeleteOpen(false);
      refreshAfterMutation();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleCreateExam() {
    if (!examTitle.trim() || selectedIds.size === 0) return;
    setCreatingExam(true);
    const questions = Array.from(selectedIds).map((id, idx) => ({
      questionId: id,
      orderNum: idx + 1,
      points: 1,
    }));
    const result = await createExam(academyId, {
      title: examTitle.trim(),
      type: "OFFLINE",
      totalPoints: questions.length,
      questions,
    });
    if (result.success) {
      toast.success("시험지가 생성되었습니다.");
      setCreateExamOpen(false);
      router.push(`/director/exams/${result.id}`);
    } else {
      toast.error(result.error || "시험지 생성 실패");
    }
    setCreatingExam(false);
  }

  // ─── Folder navigation (folder manager owns the active folder) ───
  const handleNavigateFolder = useCallback(
    (id: string | null) => {
      folders.navigateToFolder(id);
      clearSelection();
      setFilters((prev) => ({ ...prev, page: 1 }));
    },
    [folders, clearSelection],
  );

  const handleNavigateToRoot = useCallback(() => {
    folders.setActiveFolder(null);
    clearSelection();
    setFilters((prev) => ({ ...prev, page: 1 }));
  }, [folders, clearSelection]);

  const handleDragToFolder = useCallback(
    async (itemId: string, folderId: string, copy: boolean) => {
      const success = await folders.handleDragToFolder(
        itemId,
        folderId,
        copy,
        selectedIds,
      );
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  const handleDragToRoot = useCallback(
    async (itemId: string, copy: boolean) => {
      if (copy || !folders.activeFolder) return;
      const ids = selectedIds.has(itemId) ? selectedIds : new Set([itemId]);
      const success = await folders.handleRemoveFromFolder(ids);
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  const getDragQuestionIds = useCallback(
    (draggedId: string) =>
      selectedIds.has(draggedId) ? Array.from(selectedIds) : [draggedId],
    [selectedIds],
  );

  const handleMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selectedIds.size === 0) return;
      const anyId = selectedIds.values().next().value as string | undefined;
      if (!anyId) return;
      const success = await folders.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selectedIds,
      );
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  async function handleAddToFolder(collectionId: string) {
    const success = await folders.handleAddToFolder(collectionId, selectedIds);
    if (success) clearSelection();
  }

  async function handleRemoveFromFolder() {
    const success = await folders.handleRemoveFromFolder(selectedIds);
    if (success) clearSelection();
  }

  const handleSelectAllPages = useCallback(async () => {
    if (selectingAllPages) return;
    setSelectingAllPages(true);
    try {
      const result = await getWorkbenchQuestionIds(
        academyId,
        { ...effectiveFilters, page: undefined, limit: undefined },
        { passageOnly: isGrouped },
      );
      if (!result.success) {
        toast.error(result.error || "전체 문제 선택에 실패했습니다.");
        return;
      }
      const ids = result.ids.filter((id) => !removedIds.has(id));
      if (ids.length === 0) {
        toast.error("선택할 문제가 없습니다.");
        return;
      }
      setSelectedIds(new Set(ids));
      toast.success(`${ids.length}문항을 전체 페이지에서 선택했습니다.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "전체 문제 선택에 실패했습니다.",
      );
    } finally {
      setSelectingAllPages(false);
    }
  }, [
    academyId,
    effectiveFilters,
    isGrouped,
    removedIds,
    selectingAllPages,
    setSelectedIds,
  ]);

  // ─── Toolbar pieces ───
  const VIEW_MODE_OPTIONS = [
    { value: "ALL", label: "문제별", Icon: Rows3 },
    { value: "passage", label: "지문별", Icon: FileText },
  ] satisfies ReadonlyArray<ViewModeCycleOption<string>>;

  const viewModeToggle = (
    <ViewModeCycleButton
      value={isGrouped ? "passage" : "ALL"}
      options={VIEW_MODE_OPTIONS}
      showLabel
      onChange={(next) => {
        clearSelection();
        setView(next === "passage" ? "passage" : "flat");
        setFilters((prev) => ({ ...prev, page: 1 }));
      }}
    />
  );


  const reviewStatusSegment = (() => {
    const segments = [
      {
        id: "all",
        label: "전체",
        count: statusCounts?.all ?? 0,
        value: "ALL",
        active: filters.approved === undefined,
      },
      {
        id: "pending",
        label: "미검수",
        count: statusCounts?.pending ?? 0,
        value: "false",
        active: filters.approved === false,
      },
      {
        id: "approved",
        label: "검수완료",
        count: statusCounts?.approved ?? 0,
        value: "true",
        active: filters.approved === true,
      },
    ] as const;
    return (
      <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200 bg-white">
        {segments.map((seg, index) => (
          <button
            key={seg.id}
            type="button"
            onClick={() => {
              clearSelection();
              updateFilter("approved", seg.value);
            }}
            aria-pressed={seg.active}
            className={`h-7 cursor-pointer px-2.5 text-[11px] font-semibold transition-colors ${
              index > 0 ? "border-l border-slate-200 " : ""
            }${
              seg.active
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            }`}
          >
            {seg.label}{" "}
            <span className={seg.active ? "text-slate-200" : "text-slate-400"}>
              {seg.count}
            </span>
          </button>
        ))}
      </div>
    );
  })();

  // 선택 항목 중 아직 검수완료되지 않은(미검수) 문항 수 — bulk 검수완료 버튼의
  // 빨강(검수필요 있음)/초록(모두 완료) 상태와 활성/비활성 판정에 쓴다.
  const selectedPendingApprovalCount = useMemo(
    () =>
      flatQuestions.filter((q) => selectedIds.has(q.id) && !q.approved).length,
    [flatQuestions, selectedIds],
  );

  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folders.collections}
        activeFolder={folders.activeFolder}
        selectedCount={selectedIds.size}
        onCopy={handleAddToFolder}
        onMove={handleMoveToFolder}
        compact
      />

      <button
        type="button"
        onClick={() => void handleBulkApprove()}
        disabled={selectedPendingApprovalCount === 0 || bulkApproving}
        title={
          selectedPendingApprovalCount > 0
            ? `미검수 ${selectedPendingApprovalCount}개 검수완료`
            : "선택한 문항이 모두 검수완료입니다"
        }
        className={
          // per-card 토글과 동일한 빨강/초록 언어: 선택 중 미검수가 있으면
          // 빨강(클릭 시 완료, hover 초록 미리보기), 없으면 초록(모두 완료).
          "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (selectedPendingApprovalCount > 0
            ? "border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
            : "border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700")
        }
      >
        {bulkApproving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5" />
        )}
        검수완료
      </button>

      <button
        type="button"
        onClick={() => setBulkDeleteOpen(true)}
        disabled={selectedIds.size === 0 || bulkDeleting}
        title="삭제"
        aria-label="삭제"
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {bulkDeleting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>
    </>
  );

  const gridToggle = <GridToggle gridCols={gridCols} setGridCols={setGridCols} />;

  // 전체 선택·검수 상태·보기(문제별/지문별)를 '줄 세개' 필터 팝오버 안으로 모은다.
  const filterPopoverExtra = (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void handleSelectAllPages()}
        disabled={selectingAllPages || totalCount === 0}
        className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectingAllPages ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : null}
        전체 선택
      </button>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-600">검수 상태</span>
        {reviewStatusSegment}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-slate-600">보기</span>
        {viewModeToggle}
      </div>
    </div>
  );

  const toggleActivePassage = useCallback(() => {
    if (!activePassageContext) return;
    if (activePassageContext.isOpen) {
      setExpandedPassageIds((prev) => ({
        ...prev,
        [activePassageContext.id]: false,
      }));
      setActivePassageContext(null);
      return;
    }
    const nextOpen = !activePassageContext.isOpen;
    setExpandedPassageIds((prev) => ({
      ...prev,
      [activePassageContext.id]: nextOpen,
    }));
    setActivePassageContext((prev) =>
      prev ? { ...prev, isOpen: nextOpen } : prev,
    );
  }, [activePassageContext]);

  const activePassageBar =
    isGrouped && activePassageContext ? (
      <div className="flex min-h-7 min-w-0 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-1.5 text-[11px]">
        <span className="shrink-0 font-semibold text-blue-500">현재 지문</span>
        <span className="h-3 w-px shrink-0 bg-blue-200" />
        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1 truncate font-bold text-blue-800">
          {activePassageContext.title}
        </span>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-blue-700 ring-1 ring-blue-200">
          {activePassageContext.visibleCount}문항
        </span>
        <button
          type="button"
          onClick={toggleActivePassage}
          aria-expanded={activePassageContext.isOpen}
          className="ml-auto inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-blue-200 bg-white px-2 text-[10.5px] font-bold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
        >
          {activePassageContext.isOpen ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
          {activePassageContext.isOpen ? "접기" : "펼치기"}
        </button>
      </div>
    ) : null;

  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(open);

  const toolbarRow = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <SelectAllCheckbox
          checked={isCurrentPageSelected && selectedIds.size > 0}
          indeterminate={selectedIds.size > 0 && !isCurrentPageSelected}
          disabled={displayedQuestions.length === 0}
          onChange={handleSelectCurrentPage}
          title={`${selectedIds.size}문항 선택`}
          ariaLabel={
            isCurrentPageSelected ? "현재 페이지 해제" : "현재 페이지 선택"
          }
        />
        <div
          className={
            "flex shrink-0 items-center gap-3 " +
            (selectedIds.size > 0 ? "" : "pointer-events-none opacity-50")
          }
          aria-disabled={selectedIds.size === 0}
        >
          {selectionExtraActions}
          {folders.activeFolder ? (
            <button
              type="button"
              onClick={handleRemoveFromFolder}
              title="폴더에서 삭제"
              aria-label="폴더에서 삭제"
              className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
            >
              <FolderX className="h-3.5 w-3.5" />
              폴더에서 삭제
            </button>
          ) : null}
        </div>
        {/* 시험지 만들기 — 흐림 처리되는 액션 클러스터 밖에 둬 비활성 시
            다음으로 버튼처럼 또렷한 회색으로 보이게 한다. */}
        <button
          type="button"
          disabled={selectedIds.size === 0 || creatingExam}
          title={
            selectedIds.size === 0
              ? "문항을 선택하면 시험지를 만들 수 있어요"
              : undefined
          }
          onClick={() => {
            const ids = [...selectedIds];
            if (ids.length === 0) return;
            // 선택한 문제 id 를 sessionStorage 로 넘겨 빌더가 미리보기에 바로 올린다.
            try {
              window.sessionStorage.setItem(
                EXAM_SEED_QUESTION_IDS_KEY,
                JSON.stringify(ids),
              );
            } catch {
              /* sessionStorage 실패해도 이동은 진행 (빈 빌더로 열림) */
            }
            router.push("/director/workbench/exams/create");
          }}
          className="flex h-7 grow cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-2.5 text-[11px] font-bold text-white shadow-sm transition-colors hover:border-blue-700 hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100 disabled:shadow-none"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          다음으로 (시험지 생성)
        </button>
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        <QuestionFiltersToolbar
          filters={filters}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSearchSubmit={handleSearch}
          updateFilter={updateFilter}
          updateFilters={updateFilters}
          popoverExtra={filterPopoverExtra}
        />
        {gridToggle}
      </div>
    </div>
  );

  // ── 생성 큐 스트립 (생성 중 / 오류) — 목록 맨 앞에 렌더 ──
  // 큐가 비어 있으면 아무것도 렌더하지 않는다 (빈 스트립 없음).
  const queueStrip =
    queueStripItems.length > 0 ? (
      <div className="mb-4 space-y-2.5">
        {queueStripItems.length > 0 ? (
          <div
            className={`grid gap-3 ${
              gridCols === 2
                ? "grid-cols-1 md:grid-cols-2"
                : gridCols === 3
                  ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1"
            }`}
          >
            {queueStripItems.map((item) => (
              <QueueStripCard
                key={item.id}
                item={item}
                onRetryGeneration={onRetryGeneration}
              />
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  // 생성 결과 목록의 모든 문제 카드를 QuestionBankCard "접힌 콤팩트 카드"
  // 한 가지로 통일한다(그룹/플랫 보기 공통). 기본 접힘 — 지문 2줄 + 정답 보기만
  // 보이고 '펼치기'로 전체를 펴며, 검수완료/수정하기·삭제·상세 보기는 그대로
  // 유지한다. 방금 생성 완료된 문제는 파란 글로우로 강조하고, 카드를 클릭하면
  // 글로우를 해제한다.
  // 같은 줄의 접힌 카드 높이를 통일해 footer(검수완료/수정하기)를 정렬한다.
  // 열 너비가 좁을수록 카드가 길어지므로 단(col) 수에 맞춰 바닥값을 달리한다.
  // 1열(list)은 카드가 각자 한 행이라 정렬 대상이 아니므로 적용하지 않는다.
  // 펼친 카드는 self-start 래퍼로 독립적으로 길어진다(옆 카드 영향 없음).
  // min-height는 바닥값이라 더 큰 카드(긴 발문 등)엔 영향이 없다.
  // 카드 폭(=뷰포트/단 수)이 좁을수록 발문·정답줄이 더 줄바꿈되어 길어지므로,
  // 같은 단 수라도 Tailwind 폭 구간(md/lg/xl/2xl)별로 floor를 달리한다.
  // (3단은 lg부터, 2단은 md부터 시작. 값은 실측 자연 최대 높이로 보정.)
  // 접힌 카드 바닥 높이(행 footer 정렬용)는 콘텐츠보다 과도하게 커서 해설보기와
  // footer 사이에 빈 공간이 크게 남았다 → 제거하고 콘텐츠 높이로 맞춘다.
  const collapsedMinHeightClass: string | undefined = undefined;

  const renderManagedQuestionCard = (q: any, displayNum: number) => {
    const card = (
      <QuestionBankCard
        key={q.id}
        q={q}
        num={displayNum}
        selected={selectedIds.has(q.id)}
        onToggle={() => toggleSelect(q.id)}
        onApprove={() => handleApprove(q.id)}
        onUnapprove={() => handleUnapprove(q.id)}
        onToggleStar={() => handleToggleStar(q.id)}
        onDelete={() => handleDelete(q.id)}
        onDetail={() => openDetail(q.id)}
        onEdit={() => editor.openEditor(q.id)}
        viewSize={viewSize}
        cardClickSelects
        showDetailButton
        getDragQuestionIds={getDragQuestionIds}
        collapsedMinHeightClass={collapsedMinHeightClass}
      />
    );
    // 각 카드를 content 높이 래퍼(self-start)로 감싸 그리드 행 stretch 를 막는다.
    // 래퍼가 없으면 카드의 h-full 이 행 높이(가장 큰 카드)를 따라가, 같은 줄의
    // 접힌 카드들까지 함께 길어진다. self-start 로 내가 펼친 카드만 길어지고
    // 나머지는 원래 접힌 높이를 유지한다.
    const isFresh = freshQuestionIds.has(q.id);
    return (
      <div
        key={q.id}
        className={
          "min-w-0 self-start" +
          (isFresh ? " " + FRESH_QUESTION_GLOW_CLASS : "")
        }
        onClickCapture={
          isFresh ? () => acknowledgeFreshQuestion(q.id) : undefined
        }
      >
        {card}
      </div>
    );
  };

  return (
    <section
      data-generate-embedded-question-bank
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      {/* Card header (collapse control) */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Database className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[13px] font-bold text-slate-900">문제 관리</h3>
        <span className="text-[11px] font-medium text-slate-400">
          전체 {isGrouped ? "지문" : "문제"} {totalCount}
        </span>
        {/* 펼치기는 접힌 상태에서만 헤더에 노출 — 접기는 창 맨 아래 오른쪽으로 이동. */}
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            title="펼치기"
            className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            펼치기
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="p-3 sm:p-4">
          <section className="flex flex-col rounded-xl border border-slate-200 bg-white">
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-20 shrink-0 rounded-t-xl bg-white"
            >
              <FolderSection
                embedded
                childFolders={folders.childFolders}
                activeFolder={folders.activeFolder}
                dragItemType="question"
                dragItemIdKey="questionId"
                itemCountLabel={isGrouped ? "지문" : "문제"}
                showNewFolder={folders.showNewFolder}
                newFolderName={folders.newFolderName}
                onNewFolderNameChange={folders.setNewFolderName}
                onShowNewFolder={folders.setShowNewFolder}
                onCreateFolder={folders.handleCreateFolder}
                onNavigateToFolder={handleNavigateFolder}
                onRenameFolder={folders.handleRenameFolder}
                onDeleteFolder={folders.handleDeleteFolder}
                onDragToFolder={handleDragToFolder}
                onDragToRoot={handleDragToRoot}
                breadcrumbPath={folders.breadcrumbPath}
                onNavigateToRoot={handleNavigateToRoot}
                useCardInsideFolder={true}
                rootLabel="전체 문제"
                enableFolderControls
                allFolders={folders.collections}
                storageKey="generate-embedded-questions"
                treatRootAsFolder
                contextBar={activePassageBar}
                pageHeader={{
                  icon: <Database className="h-3.5 w-3.5" />,
                  parentLabel: "문제 관리",
                  title: "전체 문제",
                  totalCount,
                  itemLabel: isGrouped ? "지문" : "문제",
                  itemUnit: isGrouped ? "편" : "문항",
                }}
              />
            </div>

            <div
              className="sticky z-10 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur-sm"
              style={{ top: folderStickyHeight }}
            >
              {toolbarRow}
            </div>

            <div className="relative min-w-0 px-4 pb-3 pt-3 sm:px-5">
              {showNavLoading ? (
                <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/55 pt-12 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500 shadow-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    불러오는 중…
                  </div>
                </div>
              ) : null}

              {/* 진행 중인 생성 큐 — 항상 목록 맨 앞에 (뷰/폴더/필터와 무관). */}
              {queueStrip}

              {isGrouped ? (
                <PassageGroupedView
                  passages={groupedPassages}
                  gridCols={gridCols}
                  viewSize={viewSize}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  marqueeBoundaryRef={marqueeBoundaryRef}
                  onToggleSelect={toggleSelect}
                  onDelete={handleDelete}
                  onApprove={handleApprove}
                  onUnapprove={handleUnapprove}
                  onToggleStar={handleToggleStar}
                  onDetail={openDetail}
                  onEdit={editor.openEditor}
                  cardClickSelects
                  showDetailButton
                  dragRequiresSelection
                  expandedPassageIds={expandedPassageIds}
                  setExpandedPassageIds={setExpandedPassageIds}
                  onActivePassageChange={setActivePassageContext}
                  getDragQuestionIds={getDragQuestionIds}
                  renderQuestion={(q, idx) =>
                    renderManagedQuestionCard(q, idx + 1)
                  }
                />
              ) : displayedQuestions.length === 0 && !loading ? (
                <div className="py-12 text-center">
                  <Database className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folders.activeFolder
                      ? "이 폴더에 문제가 없습니다."
                      : "등록된 문제가 없습니다."}
                  </p>
                  {folders.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">
                      문제를 선택 후 &quot;폴더에 추가&quot;를 사용하세요.
                    </p>
                  )}
                </div>
              ) : (
                <DragSelect
                  value={selectedIds}
                  onChange={setSelectedIds}
                  boundaryRef={marqueeBoundaryRef}
                  className={`grid items-start gap-3 ${
                    gridCols === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : gridCols === 3
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-1"
                  }`}
                >
                  {displayedQuestions.map((q, idx) => {
                    const startIdx = (currentPage - 1) * PAGE_SIZE;
                    return renderManagedQuestionCard(q, startIdx + idx + 1);
                  })}
                </DragSelect>
              )}
            </div>
          </section>

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onGoToPage={goToPage}
          />

          {/* 창 맨 아래 오른쪽 — 파란 ∧ 접기 */}
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-expanded
              title="접기"
              className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              접기
            </button>
          </div>
        </div>
      ) : null}

      {/* ─── Dialogs ─── */}
      <CreateExamDialog
        open={createExamOpen}
        onOpenChange={setCreateExamOpen}
        examTitle={examTitle}
        setExamTitle={setExamTitle}
        selectedCount={selectedIds.size}
        creating={creatingExam}
        onCreate={handleCreateExam}
      />

      <QuestionDetailDialog
        open={detailOpen}
        loading={detailLoading}
        loadError={detailLoadError}
        questionId={detailQuestionId}
        question={detailQuestion}
        onClose={closeDetail}
        onRetry={openDetail}
        onApprove={handleApprove}
        onUnapprove={handleUnapprove}
        onDelete={handleDelete}
        onEdit={openEditorFromDetail}
      />

      <EditQuestionDialog
        open={editor.editDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEditorCameFromDetail(false);
            editor.closeEditor();
          } else editor.setEditDialogOpen(true);
        }}
        loading={editor.questionLoading}
        loadError={editor.questionLoadError}
        editingQuestion={editor.editingQuestion}
        editingQuestionId={editor.editingQuestionId}
        onClose={() => {
          setEditorCameFromDetail(false);
          editor.closeEditor();
        }}
        onDeleted={editor.handleEditorDeleted}
        onRetry={editor.openEditor}
        onSaved={refreshAfterMutation}
        onApproved={refreshAfterMutation}
        onSavedAsNew={handleAiSavedAsNew}
        onBack={editorCameFromDetail ? backToDetail : undefined}
      />

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => {
          if (!bulkDeleting) setBulkDeleteOpen(o);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              선택한 문제 {selectedIds.size}문항을 삭제하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 문제에 연결된 해설/시험 연결도 함께
              삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
              disabled={bulkDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {bulkDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
