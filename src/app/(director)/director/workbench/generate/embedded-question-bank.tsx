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
import { QuestionSetSection } from "@/components/workbench/question-set-section";
import { getAcademyQuestionSetMemberMap } from "@/actions/question-sets";
import { EXAM_SEED_QUESTION_IDS_KEY } from "@/lib/exam-paper-seed";

import { confirmNative } from "@/lib/browser-confirm";
import { DragSelect } from "@/components/ui/drag-select";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useSelection } from "@/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";

import { Pagination } from "@/components/workbench/shared/pagination";
import { useIsMobile } from "@/hooks/use-is-mobile";
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
  "rounded-xl !ring-2 !ring-blue-400/60 !shadow-[0_0_0_1px_rgba(37,99,235,0.45),0_0_30px_10px_rgba(37,99,235,0.32)] motion-safe:animate-pulse [&_[data-slot=card]]:!border-blue-400";

interface EmbeddedQuestionBankProps {
  academyId: string;
  /**
   * 과목 스코프 — "KOREAN" 이면 국어 문항(subType KO_*)만 조회·노출하고 유형
   * 필터도 국어 그룹으로 바뀐다. 미전달 = 영어 기본(KO_* 문항 제외).
   */
  subjectScope?: "KOREAN";
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
  /** 값이 바뀌면 하단 지문 세트 섹션을 다시 불러온다(세트 생성 완료 신호). */
  setRefreshKey?: number | string;
}

export function EmbeddedQuestionBank({
  academyId,
  subjectScope,
  sessionQueue = [],
  queueCounts = { generating: 0, done: 0, error: 0 },
  queueFilter = "all",
  setQueueFilter,
  setRefreshKey = 0,
  onRetryGeneration,
  marqueeBoundaryRef,
}: EmbeddedQuestionBankProps) {
  const router = useRouter();

  // 모바일에선 한 페이지 카드 수를 10개로 줄인다(서버 페이지 크기 자체를 변경).
  const isMobile = useIsMobile();
  const pageSize = isMobile ? 10 : PAGE_SIZE;

  // ─── Local filter state (replaces URL searchParams) ───
  const [filters, setFilters] = useState<LocalFilters>({ page: 1 });
  const [view, setView] = useState<"flat" | "passage">("flat");
  const isGrouped = view === "passage";
  const [searchValue, setSearchValue] = useState("");

  // ─── Server data (re-fetched client-side on filter change) ───
  const [questionsData, setQuestionsData] = useState<{
    questions: any[];
    setIds?: string[];
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
  const [open] = useState(true);

  // ─── Folder manager (client-side, like QuestionBankClient) ───
  const [collectionsLoaded, setCollectionsLoaded] = useState(false);
  const [setMemberMap, setSetMemberMap] = useState<Record<string, string>>({});
  useEffect(() => {
    getAcademyQuestionSetMemberMap()
      .then(setSetMemberMap)
      .catch(() => {});
  }, [setRefreshKey]);

  const folders = useFolderManager({
    initialCollections: [],
    initialMembership: {},
    actions: {
      // 폴더 생성에 과목 스코프를 실어 감싼다 — 국어 라우트에서 만든 폴더는
      // subject='KOREAN' 으로 저장돼 영어 폴더 목록과 완전 분리(영어 기본
      // 경로는 subject 미전달 = 기존 INSERT 그대로, 무회귀).
      createCollection: (data: Parameters<typeof createQuestionCollection>[0]) =>
        createQuestionCollection(
          subjectScope === "KOREAN"
            ? { ...data, subject: "KOREAN" as const }
            : data,
        ),
      updateCollection: updateQuestionCollection,
      deleteCollection: deleteQuestionCollection,
      addToCollection: addQuestionsToCollection,
      removeFromCollection: removeQuestionsFromCollection,
    },
    itemLabel: "문제",
    questionSetIdOf: (id) => setMemberMap[id] ?? null,
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거). 세트 멤버는
    // questionSetIdOf 로 한 세트를 1개로 접어, 실제 카드 단위와 배지를 맞춘다.
    cumulativeCounts: true,
  });

  // Hydrate collections + membership once.
  const refreshCollections = useCallback(async () => {
    try {
      const [collections, membership] = await Promise.all([
        // 과목 스코프 — 국어 라우트는 국어 폴더만, 영어(기본)는 국어 폴더 제외.
        getQuestionCollections(
          academyId,
          subjectScope === "KOREAN" ? { subject: "KOREAN" } : undefined,
        ),
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
  }, [academyId, subjectScope]);

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
      limit: pageSize,
      // 과목 스코프 — 서버 where(buildWorkbenchQuestionWhere)가 국어/영어를
      // 완전 분리한다("KOREAN"=KO_* 만 / 미지정=KO_* 제외).
      subject: subjectScope,
    }),
    [filters, folders.activeFolder, pageSize, subjectScope],
  );

  // 모바일↔데스크톱 전환으로 페이지 크기가 바뀌면 1페이지로 되돌린다(범위 밖 방지).
  useEffect(() => {
    setFilters((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
  }, [pageSize]);

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

  // ── 지문 세트 ── 일반 문항과 별개의 전용 섹션(QuestionSetSection)이 세트를 한 장의
  // 카드로 묶어 보여준다. null 은 아직 세트 목록 로딩 전이라 빈 상태를 확정하지 않는다.
  const [setCount, setSetCount] = useState<number | null>(null);

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

  const handleSearch = useCallback(
    (value?: string) => {
      // X 버튼은 빈 값을 명시적으로 넘긴다(상태 갱신은 비동기라 stale 방지).
      const next = (value !== undefined ? value : searchValue).trim();
      setFilters((prev) => ({
        ...prev,
        page: 1,
        search: next || undefined,
      }));
    },
    [searchValue],
  );

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

  // 세트 카드 체크박스 — 세트의 멤버 문항 id 전체를 선택/해제(일반 카드와 동일 selectedIds 공유).
  // 시험지 빌더가 setId 로 묶어 렌더하므로 멤버를 개별 id 로 담아도 세트가 유지된다.
  const handleToggleSetSelection = useCallback(
    (memberQuestionIds: string[], select: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of memberQuestionIds) {
          if (select) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [setSelectedIds],
  );

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
  const pageSetIds = questionsData?.setIds ?? [];
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
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ─── Bulk approve ───
  const [bulkApproving, setBulkApproving] = useState(false);
  const [selectingAllPages, setSelectingAllPages] = useState(false);

  // ─── Detail dialog ───
  const detailLoadTokenRef = useRef(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  // 방금 상세를 열어본 문제 id — 모달을 닫아도 유지해, 닫는 순간 해당 카드를
  // 한 번 배경 반짝임으로 "여기 봤었지"라고 알려준다.
  const [lastViewedQuestionId, setLastViewedQuestionId] = useState<
    string | null
  >(null);
  const [detailQuestion, setDetailQuestion] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoadError, setDetailLoadError] = useState<string | null>(null);

  const openDetail = useCallback(async (id: string) => {
    const token = detailLoadTokenRef.current + 1;
    detailLoadTokenRef.current = token;
    setDetailOpen(true);
    setDetailQuestionId(id);
    setLastViewedQuestionId(id);
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

  // 세트 멤버 분리 후 — 새 단독 복제본을 파란 글로우로 강조 + 1페이지로 재조회 + 그 카드로
  // 스크롤해 바로 보이게 한다(세트 카드가 앞에 깔려 밀려나도 사용자가 찾을 수 있게).
  const handleSplitCreated = useCallback(
    (newId?: string) => {
      if (!newId) {
        void loadQuestions();
        return;
      }
      setFreshQuestionIds((prev) => new Set(prev).add(newId));
      setFilters((prev) => ({ ...prev, page: 1 }));
      window.setTimeout(() => {
        document
          .querySelector(`[data-drag-item-id="${newId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 900);
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
    // 세트 드래그면 itemId 가 멤버 배열 — 훅이 배열째 받아 전체를 폴더에 넣는다.
    // keepFolderIds = 이동 시 사본을 남길 폴더들(이동/복사 팝오버의 "폴더별 남기기").
    async (
      itemId: string | string[],
      folderId: string,
      copy: boolean,
      keepFolderIds: string[] = [],
    ) => {
      const success = await folders.handleDragToFolder(
        itemId,
        folderId,
        copy,
        selectedIds,
        keepFolderIds,
      );
      if (success) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  const handleDragToRoot = useCallback(
    async (itemId: string | string[], copy: boolean) => {
      if (copy || !folders.activeFolder) return;
      // 세트는 멤버 전체(배열)를 폴더에서 뺀다.
      const draggedIds = Array.isArray(itemId) ? itemId : [itemId];
      const ids = draggedIds.some((id) => selectedIds.has(id))
        ? selectedIds
        : new Set(draggedIds);
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

  // 헤더 체크박스 = "전체 페이지 선택". 현재 페이지(20개)만이 아니라 현재 필터의
  // 전체 문항(getWorkbenchQuestionIds)을 선택한다 → 선택→드래그로 전체를 폴더 이동
  // 가능. 이미 전체가 선택돼 있으면 해제한다.
  const allFilteredSelected =
    totalCount > 0 && selectedIds.size >= totalCount;
  const someSelected = selectedIds.size > 0 && !allFilteredSelected;
  const handleToggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      clearSelection();
      return;
    }
    void handleSelectAllPages();
  }, [allFilteredSelected, clearSelection, handleSelectAllPages]);

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
        {/* 내 지문함과 동일 — 좁은 폭(모바일)에서는 라벨을 숨겨 아이콘만 남긴다. */}
        <span className="@max-[30rem]:hidden">검수완료</span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (
            !confirmNative(
              `선택한 문제 ${selectedIds.size}문항을 삭제하시겠습니까?`,
              "이 작업은 되돌릴 수 없습니다. 문제에 연결된 해설/시험 연결도 함께 삭제됩니다.",
            )
          )
            return;
          void handleBulkDelete();
        }}
        disabled={selectedIds.size === 0 || bulkDeleting}
        title="삭제"
        aria-label="삭제"
        // 모바일(<30rem 컨테이너)에서만 내 지문함과 동일한 흰 배경으로 맞춘다.
        // PC 폭에서는 기존 red-50 배경·hover 언어를 그대로 유지(데스크톱 무변경).
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 @max-[30rem]:bg-white text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
  // 문항 카드 영역 — '다음으로(시험지 생성)'가 비활성(선택 0개)일 때 눌리면 이 안의
  // 카드들을 글로우시켜 "문항을 먼저 고르세요"를 유도한다.
  const cardZoneRef = useRef<HTMLDivElement>(null);

  // 페이지 이동(필터.page 변경) 시 카드 목록 맨 위로 부드럽게 스크롤한다.
  // 최초 마운트에서는 스크롤하지 않는다(불필요한 점프 방지).
  const pageScrollSkipRef = useRef(true);
  useEffect(() => {
    if (pageScrollSkipRef.current) {
      pageScrollSkipRef.current = false;
      return;
    }
    cardZoneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filters.page]);

  const toolbarRow = (
    // 모바일에서도 한 줄로 — 그룹을 w-full로 쌓지 않고 nowrap으로 배치.
    // PC(md:)는 기존 flex-wrap/gap 그대로 복원해 데스크톱 무변경.
    <div className="flex min-h-9 flex-nowrap items-center gap-x-1.5 gap-y-1.5 md:flex-wrap md:gap-x-2">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 md:gap-2">
        <SelectAllCheckbox
          checked={allFilteredSelected}
          indeterminate={someSelected}
          disabled={(totalCount === 0 && displayedQuestions.length === 0) || selectingAllPages}
          onChange={handleToggleSelectAll}
          title={
            allFilteredSelected
              ? `전체 ${selectedIds.size}문항 선택됨 — 클릭 시 해제`
              : `전체 ${totalCount}문항 선택`
          }
          ariaLabel={allFilteredSelected ? "전체 해제" : "전체 페이지 선택"}
        />
        <div
          className={
            "flex min-w-0 shrink-0 flex-nowrap items-center gap-1.5 md:gap-3 " +
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
          // 네이티브 disabled 대신 aria-disabled — 비활성처럼 보이되 클릭은 살려
          // 둬야, 눌렀을 때 "문항을 먼저 고르세요" 힌트 글로우를 띄울 수 있다.
          aria-disabled={selectedIds.size === 0 || creatingExam}
          title={
            selectedIds.size === 0
              ? "문항을 선택하면 시험지를 만들 수 있어요"
              : undefined
          }
          onClick={() => {
            if (creatingExam) return;
            const ids = [...selectedIds];
            if (ids.length === 0) {
              // 비활 사유 = 문항 미선택 → 카드들을 글로우시켜 선택을 유도.
              triggerHintGlowWithin(cardZoneRef.current);
              return;
            }
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
          className={
            // 모바일: min-w-0 + basis-auto 로 좁으면 줄어들어 한 줄을 유지(요청대로
            // 시험지 생성 폭을 필요한 만큼 축소). PC(md:)는 기존과 동일.
            "flex h-10 min-w-0 flex-[1_1_auto] items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md border px-2.5 text-[13px] font-bold text-white shadow-sm transition-colors md:h-12 md:min-w-0 md:basis-auto md:grow md:text-[14px] " +
            (selectedIds.size === 0 || creatingExam
              ? "cursor-not-allowed border-blue-200 bg-blue-300 shadow-none"
              : "cursor-pointer border-blue-600 bg-blue-600 hover:border-blue-700 hover:bg-blue-700")
          }
        >
          <ClipboardList className="size-4 md:size-5" />
          <span className="md:hidden">시험지 생성</span>
          <span className="hidden md:inline">다음으로 (시험지 생성)</span>
        </button>
      </div>
      {/* 모바일은 ml-auto 제거 — auto 마진이 free space를 먹어 좌측 flex-1(시험지
          생성 grow)이 못 자라던 문제를 풀어, 시험지 생성이 오른쪽까지 채워지고
          필터와의 간격이 좁아진다. PC(md:)는 기존 ml-auto 정렬 그대로. */}
      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1.5 md:ml-auto md:w-auto md:flex-wrap md:gap-2">
        <QuestionFiltersToolbar
          filters={filters}
          subjectScope={subjectScope}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSearchSubmit={handleSearch}
          updateFilter={updateFilter}
          updateFilters={updateFilters}
          popoverExtra={filterPopoverExtra}
        />
        {/* 2·3열/목록 그리드 토글 — 모바일(<lg)은 항상 1열이라 의미가 없어 숨긴다.
            PC(lg 이상)에서는 그대로 노출한다. */}
        <div className="hidden lg:block">{gridToggle}</div>
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
            className={`grid gap-2 lg:gap-3 ${
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
        recentlyViewed={
          lastViewedQuestionId === q.id && detailQuestionId !== q.id
        }
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
        showQuickActions
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
      className="min-w-0"
    >
      {open ? (
        <>
          <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
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
                useCardInsideFolder={false}
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
              // @container: 내 지문함 툴바와 동일하게, 패널 폭 기준으로 일괄 액션
              // 버튼의 라벨(예: 검수완료)을 좁은 폭에서 숨겨 아이콘만 남긴다.
              className="@container sticky z-10 shrink-0 border-t border-slate-200 bg-slate-50/95 px-2 py-2 backdrop-blur-sm lg:px-4"
              style={{ top: folderStickyHeight }}
            >
              {toolbarRow}
            </div>

            <div
              ref={cardZoneRef}
              className="relative min-w-0 px-2 pb-3 pt-3 lg:px-5"
              // 페이지 이동 스크롤 시 스티키 폴더/툴바 아래에 카드 첫 줄이 오도록 여백 확보.
              style={{ scrollMarginTop: folderStickyHeight + 56 }}
            >
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
                <>
                  <div className="mb-3">
                    <QuestionSetSection
                      // 국어 스코프에서만 세트 카드를 노출한다 — KO 세트 멤버는
                      // inSet=true 라 세트 카드가 유일한 묶음 표면. 영어는 기존
                      // 그대로(카운트/분리 다이얼로그만, 카드 숨김).
                      showSets={subjectScope === "KOREAN"}
                      subjectScope={subjectScope}
                      setIds={pageSetIds}
                      refreshKey={`${open}:${queueCounts.done}:${setRefreshKey}:${folders.activeFolder ?? "all"}`}
                      onCountChange={setSetCount}
                      onMemberSplit={handleSplitCreated}
                      selectedQuestionIds={selectedIds}
                      onToggleSetSelection={handleToggleSetSelection}
                      collectionId={folders.activeFolder ?? undefined}
                      filters={effectiveFilters}
                      gridClassName={`grid items-start gap-2 lg:gap-3 ${
                        gridCols === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : gridCols === 3
                            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                            : "grid-cols-1"
                      }`}
                    />
                  </div>
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
                </>
              ) : displayedQuestions.length === 0 &&
                setCount === 0 &&
                !loading ? (
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
                  className={`grid items-start gap-2 lg:gap-3 ${
                    gridCols === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : gridCols === 3
                        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-1"
                  }`}
                >
                  {/* 세트 카드 + 일반 카드를 한 그리드에서 createdAt 최신순으로 섞어 렌더
                      (종류 불문 통합 정렬). 세트는 최신이라 1페이지에서만 끼운다. */}
                  <QuestionSetSection
                    inline
                    // 국어 스코프: 1페이지에서 세트 카드를 일반 카드와 최신순으로
                    // 섞어 노출(세트는 최신이라 1페이지 위치). 영어는 기존 그대로.
                    showSets={subjectScope === "KOREAN" && currentPage === 1}
                    subjectScope={subjectScope}
                    setIds={pageSetIds}
                    refreshKey={`${open}:${queueCounts.done}:${setRefreshKey}:${folders.activeFolder ?? "all"}`}
                    onCountChange={setSetCount}
                    onMemberSplit={handleSplitCreated}
                    selectedQuestionIds={selectedIds}
                    onToggleSetSelection={handleToggleSetSelection}
                    collectionId={folders.activeFolder ?? undefined}
                    filters={effectiveFilters}
                    normalItems={displayedQuestions.map((q, idx) => {
                      const startIdx = (currentPage - 1) * pageSize;
                      return {
                        id: q.id,
                        createdAt: q.createdAt,
                        node: renderManagedQuestionCard(q, startIdx + idx + 1),
                      };
                    })}
                  />
                </DragSelect>
              )}
            </div>
          </section>

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onGoToPage={goToPage}
          />
        </>
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

    </section>
  );
}
