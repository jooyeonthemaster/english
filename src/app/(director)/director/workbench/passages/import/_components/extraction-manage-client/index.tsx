"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  LogIn,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Grid2X2,
  Grid3X3,
  Layers,
  List,
  Loader2,
  RefreshCw,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import { confirmNative } from "@/lib/browser-confirm";
import {
  addDraftsToCollection,
  createM1DraftCollection,
  deleteM1DraftCollection,
  removeDraftsFromCollection,
  updateM1DraftCollection,
} from "@/actions/workbench";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import {
  ViewModeCycleButton,
  type ViewModeCycleOption,
} from "@/components/workbench/shared/view-mode-cycle-button";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/hooks/use-selection";

import { useQueueDrawer } from "../queue-drawer-context";

import { DraftDetailModal } from "./components/draft-detail-modal";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { DraftGrid, type GridCols } from "./components/draft-grid";
import { DraftSelectionToolbar } from "./components/draft-selection-toolbar";
import { triggerHintGlowWithin } from "@/lib/hint-glow";
import { JobCard } from "@/components/workbench/shared/job-card";
import { MaterialJobCard } from "./components/material-job-card";
import { DragSelect } from "@/components/ui/drag-select";
import { JobReviewModal } from "./components/job-review-modal";
import {
  JobReviewToggleButton,
  JobReviewDisabledButton,
} from "./components/job-review-toggle-button";
import {
  ManageFiltersBar,
  ManageFiltersPanel,
} from "./components/manage-filters-bar";
import {
  ManageFiltersBarTasks,
  type TaskAnalysisFilter,
  type TaskSortOrder,
  type TaskStatusFilter,
} from "./components/manage-filters-bar-tasks";
import {
  TaskQueueInlineList,
  type BaseTask,
} from "@/components/workbench/task-queue";
import { ACTIVE_STATUSES } from "@/components/workbench/task-queue/constants";
import type { PendingExtraction } from "@/app/(director)/director/workbench/generate/intake/use-generate-extraction";
import { useBulkActions } from "./hooks/use-bulk-actions";
import { useDraftActions } from "./hooks/use-draft-actions";
import { useDraftDisplay } from "./hooks/use-draft-display";
import { useDraftsData } from "./hooks/use-drafts-data";
import { PASSAGE_ANALYSIS_BASE_CREDIT_COST } from "@/lib/passage-analysis-credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import type { M1PassageDraftWithJob } from "./types";
import { isDraftAnalysisComplete } from "./utils/analysis-status";

interface ExtractionManageClientProps {
  academyId: string;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
  /** When true, drop the page-bleed wrapper (-m-6) and render inside a
   *  clipped container that fits its parent. Used when embedding this
   *  surface as a left-column picker (e.g. in 학습지 생성 - 새 지문 등록). */
  embedded?: boolean;
  /** When provided, clicking a draft card calls this callback instead of
   *  opening the built-in DraftDetailModal. Used by embedders that want to
   *  use draft selection as a picker for an external editor. */
  onSelectDraftExternal?: (draft: M1PassageDraftWithJob) => void;
  /** Highlighted draft id when an external picker controls selection. */
  selectedExternalDraftId?: string | null;
  /** 임베더(학습지 생성) 워크스페이스에 이미 불러와 있는 드래프트 id — 해당
   *  자료 카드에 은은한 '불러옴' 표시를 입힌다. */
  loadedExternalDraftIds?: string[];
  /** Optional bridge used by the passage-registration embed to register and
   *  analyze extraction drafts without copying them into the editor first. */
  onBulkAnalyze?: (
    drafts: M1PassageDraftWithJob[],
    generationPlan: QuestionGenerationPlan,
  ) => Promise<void>;
  bulkAnalyzing?: boolean;
  /** Embedder bridge (학습지 생성): load the checked drafts into the right
   *  "지문" annotation stack as rows. When provided, the grid shows a
   *  "선택 불러오기" action instead of the 일괄 분석 button — analysis then runs
   *  from the right section after the teacher marks each passage. */
  onLoadSelectedDrafts?: (drafts: M1PassageDraftWithJob[]) => void;
  /** 마키(영역 드래그) 시작 영역 경계. 임베드(자료 관리 패널)처럼 한 화면에 다른
   *  선택 영역(예: 지문 목록 큐)과 함께 놓일 때, 영역이 섞이지 않도록 이 패널만의
   *  경계를 지정한다. 미지정 시 DragSelect 가 전역 기본 경계(본문)를 쓴다. */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  /** Page-specific copy for draft card action buttons. Defaults to 상세보기. */
  draftDetailActionMode?: "detail" | "import";
  /** Bumped by an embedder when a new extraction job is created/completed, to
   *  force an immediate job-meta + drafts refetch (used by the 학습지 생성
   *  intake so freshly-extracted 자료 cards appear without the 30s poll lag). */
  refreshToken?: number;
  /** Session in-flight extractions from the embedder's useCreateExtraction.
   *  Merged with server jobMeta to render IMMEDIATE "추출 중" skeleton cards in
   *  the grid (session covers the gap before the server poll sees the job). */
  sessionPending?: PendingExtraction[];
  /** When false, drop the full-page bleed wrapper (-m-6 + bg) so this surface
   *  can be embedded inline below another section (e.g. the 자료 추출 upload
   *  panel) whose parent already supplies the page background and padding.
   *  Unlike `embedded`, this keeps ALL standalone behavior (job list row,
   *  job cards, review modal) — it only swaps the outermost wrapper. */
  pageBleed?: boolean;
  /** When false, hide the horizontal "자료 목록"(작업/권) 카드 행. Used by the
   *  자료 추출 embed, where the same jobs are already tracked by the global
   *  작업 목록 드로어 — so an inline copy of the row is redundant. */
  showJobListRow?: boolean;
  /** 과목 스코프 — "KOREAN"=국어 라우트(/director/korean/extraction)에서 마운트.
   *  국어 자료/잡만 조회·캐시한다. 미전달(undefined)=영어 기본으로, 임베더(학습지
   *  생성)·영어 워크벤치는 종전 동작이 한 줄도 달라지지 않는다(무회귀). */
  subjectScope?: "KOREAN";
}

const MATERIAL_GRID_OPTIONS = [
  { value: "grid3", label: "3열 보기", Icon: Grid3X3 },
  { value: "grid2", label: "2열 보기", Icon: Grid2X2 },
  { value: "list", label: "목록 보기", Icon: List },
] satisfies ReadonlyArray<ViewModeCycleOption<GridCols>>;

function useMeasuredHeight(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const el = ref.current;
    if (!el) return;

    const update = () => {
      setHeight(Math.ceil(el.getBoundingClientRect().height));
    };

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

const TASK_SORT_ORDER_STORAGE_KEY = "smoat:extraction-manage:task-sort-order";
const TASK_SORT_ORDERS: readonly TaskSortOrder[] = [
  "newest",
  "oldest",
  "name_asc",
  "name_desc",
];

function readStoredTaskSortOrder(): TaskSortOrder {
  if (typeof window === "undefined") return "newest";
  try {
    const stored = window.localStorage.getItem(TASK_SORT_ORDER_STORAGE_KEY);
    return TASK_SORT_ORDERS.includes(stored as TaskSortOrder)
      ? (stored as TaskSortOrder)
      : "newest";
  } catch {
    return "newest";
  }
}

function getDraftAnalysisText(draft: M1PassageDraftWithJob): string {
  return (
    draft.teacherText?.trim() ||
    draft.restoredText?.trim() ||
    draft.rawText?.trim() ||
    ""
  );
}

function isDraftReadyForAnalysis(draft: M1PassageDraftWithJob): boolean {
  return (
    !isDraftAnalysisComplete(draft) && getDraftAnalysisText(draft).length > 0
  );
}

function isDraftAnalyzable(draft: M1PassageDraftWithJob): boolean {
  return getDraftAnalysisText(draft).length > 0;
}

function isDraftAnalyzed(draft: M1PassageDraftWithJob): boolean {
  return isDraftAnalysisComplete(draft);
}

export function ExtractionManageClient({
  academyId,
  initialCollections,
  initialCollectionMembership,
  embedded = false,
  onSelectDraftExternal,
  selectedExternalDraftId = null,
  loadedExternalDraftIds,
  onBulkAnalyze,
  bulkAnalyzing = false,
  onLoadSelectedDrafts,
  marqueeBoundaryRef,
  draftDetailActionMode = "detail",
  refreshToken = 0,
  sessionPending = [],
  pageBleed = true,
  showJobListRow = true,
  subjectScope,
}: ExtractionManageClientProps) {
  const draftDetailAction =
    draftDetailActionMode === "import"
      ? { label: "가져오기", icon: LogIn }
      : undefined;
  void academyId;

  const externallyPicking = typeof onSelectDraftExternal === "function";
  const loadedExternalDraftIdSet = useMemo(
    () => new Set(loadedExternalDraftIds ?? []),
    [loadedExternalDraftIds],
  );

  const queueDrawer = useQueueDrawer();

  // ─── Data hook (state + loaders + polling) ───
  const data = useDraftsData({
    onJobsRefresh: queueDrawer.triggerRefresh,
    refreshToken,
    subject: subjectScope,
  });

  // ─── Folder manager ───
  const folders = useFolderManager({
    initialCollections,
    initialMembership: initialCollectionMembership,
    actions: {
      createCollection: createM1DraftCollection,
      updateCollection: updateM1DraftCollection,
      deleteCollection: deleteM1DraftCollection,
      addToCollection: addDraftsToCollection,
      removeFromCollection: removeDraftsFromCollection,
    },
    itemLabel: "자료",
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거).
    cumulativeCounts: true,
  });

  // ─── Per-job review popup state ───
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null);

  // Toggles the inline sub-filter panel rendered below the draft toolbar
  // header (mirrors the 문제 생성 page) instead of a floating popover.
  const [showMaterialFilters, setShowMaterialFilters] = useState(false);

  // ─── Filter state for the "전체 자료" (tasks) view ───
  // Task domain has its own status vocabulary and no dedup concept, so it
  // gets a parallel set of controls rather than sharing with the draft bar.
  const [taskSearchValue, setTaskSearchValue] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] =
    useState<TaskStatusFilter>("ALL");
  // setter dropped: the analysis filter was only set by the embedded job-card
  // toolbar, which the 학습지 생성 panel no longer renders (it shows individual
  // draft cards now). The standalone task view doesn't use this filter.
  const [taskAnalysisFilter] = useState<TaskAnalysisFilter>("all");
  const [taskSortOrder, setTaskSortOrder] = useState<TaskSortOrder>(
    readStoredTaskSortOrder,
  );
  // Visible tasks reported by TaskQueueInlineList. We need the actual list (not
  // just a count) so task-level checkboxes can map back to the underlying
  // drafts that the selection actions operate on.
  const [visibleTasks, setVisibleTasks] = useState<BaseTask[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TASK_SORT_ORDER_STORAGE_KEY, taskSortOrder);
    } catch {
      /* ignore */
    }
  }, [taskSortOrder]);

  // ─── Job row (추출 작업 목록) collapse + resize state ───
  const JOB_ROW_COLLAPSE_KEY = "smoat:extraction-manage:job-row:collapsed";
  const JOB_ROW_HEIGHT_KEY = "smoat:extraction-manage:job-row:height";
  // 자료 카드(JobCard compact)가 A4 썸네일 + 제목·날짜까지 한눈에 보이려면
  // ~180px 가 필요하다. 최소도 그만큼 올려 두면, 예전 96px 로 저장돼 있던
  // 사용자도 읽기 값을 [MIN,MAX] 로 클램프할 때 자동으로 따라 올라간다.
  const JOB_ROW_MIN = 192;
  const JOB_ROW_MAX = 380;
  const JOB_ROW_DEFAULT = 208;
  const [jobRowCollapsed, setJobRowCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(JOB_ROW_COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [jobRowHeight, setJobRowHeight] = useState<number>(() => {
    if (typeof window === "undefined") return JOB_ROW_DEFAULT;
    try {
      const raw = window.localStorage.getItem(JOB_ROW_HEIGHT_KEY);
      if (!raw) return JOB_ROW_DEFAULT;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return JOB_ROW_DEFAULT;
      return Math.min(JOB_ROW_MAX, Math.max(JOB_ROW_MIN, n));
    } catch {
      return JOB_ROW_DEFAULT;
    }
  });
  const toggleJobRowCollapsed = useCallback(() => {
    setJobRowCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(JOB_ROW_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const beginJobRowResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = jobRowHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          JOB_ROW_MAX,
          Math.max(JOB_ROW_MIN, startHeight + (ev.clientY - startY)),
        );
        setJobRowHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(JOB_ROW_HEIGHT_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [jobRowHeight],
  );
  const resetJobRowHeight = useCallback(() => {
    setJobRowHeight(JOB_ROW_DEFAULT);
    try {
      window.localStorage.setItem(JOB_ROW_HEIGHT_KEY, String(JOB_ROW_DEFAULT));
    } catch {
      /* ignore */
    }
  }, []);

  // ─── Folder-aware drafts subset ───
  // At the root (no folder selected) show ALL drafts — filed and unfiled —
  // and mark unfiled ones with a "미분류" badge on the card. Inside a folder
  // we filter down to that folder's members.
  const filedDraftIds = useMemo(() => {
    const set = new Set<string>();
    for (const ids of Object.values(folders.membership)) {
      for (const id of ids) set.add(id);
    }
    return set;
  }, [folders.membership]);

  const draftsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) {
      return data.drafts;
    }
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return data.drafts.filter((d) => ids.has(d.id));
  }, [data.drafts, folders.activeFolder, folders.membership]);

  // ─── Display hook (filter/sort/jobFilter + derived state) ───
  // NOTE: prioritizeAnalysisNeeded is intentionally OFF — it floated "미분석"
  // drafts to the top, which pushed a freshly-extracted draft DOWN whenever it
  // got auto-tagged "분석완료" by content-match (a same-text passage analyzed
  // earlier). Users expect what they just extracted to appear first, so the
  // grid now follows the plain sort order (newest-first by default).
  const display = useDraftDisplay({
    drafts: data.drafts,
    draftsInActiveFolder,
    activeFolder: folders.activeFolder,
    jobMetaByJobId: data.jobMetaByJobId,
    prioritizeAnalysisNeeded: false,
  });
  const { gridCols, setGridCols } = display;

  // ─── In-progress extraction skeleton count (embedded 학습지 생성 only) ───
  // Combines two sources so the "추출 중" cards are BOTH immediate AND robust:
  //  • SESSION (sessionPending): the upload this tab just started — shows the
  //    instant 추출 시작 is pressed, before any server poll. Covers the jobId-less
  //    pre-creation moment and the gap before the first jobMeta poll.
  //  • SERVER (jobMeta availableJobs, PENDING/PROCESSING): survives refresh and
  //    surfaces jobs started elsewhere. Authoritative once it sees a job.
  // Deduped by jobId (a job tracked by the server poll is dropped from the
  // session tally) so a job never double-counts. Per-job skeleton count =
  // REMAINING expected passages (totalPages − already-extracted), so the
  // skeletons + the real DraftCards always sum to N (no overlap on partial
  // completion). The skeleton cards render in-grid with the real DraftCard shape.
  const inProgressCount = useMemo(() => {
    if (!embedded) return 0;
    const activeJobs = display.availableJobs.filter((j) =>
      ACTIVE_STATUSES.has(mapJobStatusToTaskStatus(j.status)),
    );
    const activeJobIds = new Set(activeJobs.map((j) => j.jobId));
    const serverRemaining = activeJobs.reduce(
      (sum, j) => sum + Math.max(0, (j.totalPages || 0) - j.count),
      0,
    );
    const sessionRemaining = sessionPending
      .filter((p) => !p.jobId || !activeJobIds.has(p.jobId))
      .reduce((sum, p) => sum + Math.max(1, p.count), 0);
    return serverRemaining + sessionRemaining;
  }, [embedded, display.availableJobs, sessionPending]);

  const reviewDrawerOpen = reviewingJobId !== null;
  const materialGridCols =
    reviewDrawerOpen && gridCols === "grid3" ? "grid2" : gridCols;
  const setMaterialGridCols = useCallback(
    (cols: GridCols) => {
      if (reviewDrawerOpen && cols === "grid3") return;
      setGridCols(cols);
    },
    [reviewDrawerOpen, setGridCols],
  );

  useEffect(() => {
    if (reviewDrawerOpen && gridCols === "grid3") {
      setGridCols("grid2");
    }
  }, [gridCols, reviewDrawerOpen, setGridCols]);

  // ─── Actions hooks (per-draft + bulk) ───
  const actions = useDraftActions({
    drafts: data.drafts,
    setDrafts: data.setDrafts,
    setSelectedDraftDetail: data.setSelectedDraftDetail,
    closeDraftDetail: data.closeDraftDetail,
    setError: data.setError,
    refreshQueueDrawer: queueDrawer.triggerRefresh,
  });
  const bulk = useBulkActions({
    drafts: data.drafts,
    setDrafts: data.setDrafts,
    setError: data.setError,
    refreshQueueDrawer: queueDrawer.triggerRefresh,
  });

  // ─── Bootstrap ───
  useEffect(() => {
    if (data.bootstrapped.current) return;
    data.bootstrapped.current = true;
    const nextJobId =
      embedded || typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("jobId");
    void (async () => {
      await data.loadAllDrafts();
      // Deep-links like `?jobId=...` now open the per-job review modal
      // directly rather than narrowing the grid — the grid stays focused
      // on "drafts to file" and the modal handles per-job review.
      if (nextJobId) setReviewingJobId(nextJobId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Selected draft (lookup with detail fallback) ───
  const selectedDraft =
    data.selectedDraftDetail ??
    data.drafts.find((draft) => draft.id === data.selectedDraftId) ??
    null;

  // ─── Selection ───
  // Map from extraction jobId → its draft IDs. Used to translate task-level
  // checkbox clicks (in the "전체 자료" view) into the draft-level selection
  // that bulk actions operate on.
  const draftIdsByJobId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const d of data.drafts) {
      const jobId = d.job?.id;
      if (!jobId) continue;
      const arr = map.get(jobId);
      if (arr) arr.push(d.id);
      else map.set(jobId, [d.id]);
    }
    return map;
  }, [data.drafts]);

  // 작업(자료 카드) 단위로 그 작업에 속한 복원 자료들을 모아 둔다 — 카드의
  // "검수완료" 토글이 작업 단위로 모든 draft 의 검수 상태를 뒤집는 데 쓴다.
  const draftsByJobId = useMemo(() => {
    const map = new Map<string, M1PassageDraftWithJob[]>();
    for (const d of data.drafts) {
      const jobId = d.job?.id;
      if (!jobId) continue;
      const arr = map.get(jobId);
      if (arr) arr.push(d);
      else map.set(jobId, [d]);
    }
    return map;
  }, [data.drafts]);

  const isAllMaterialsView =
    folders.activeFolder === null && data.resultScope === "all";

  // Standalone (/import/jobs) keeps the JOB-GROUPED task cards at the 전체 자료
  // root. The embedded 학습지 생성 picker instead unpacks every 자료 into its own
  // DraftCard (문제 생성 페이지와 동일), so the job-card path is gated to !embedded.
  const showJobCards = isAllMaterialsView && !embedded;

  // In the job-card view, "전체 선택" should cover the drafts of every
  // currently-visible task card. Elsewhere (folder view, or the embedded draft
  // grid), fall back to the filtered drafts list the draft grid renders.
  const getDisplayedIds = useCallback(() => {
    if (showJobCards) {
      const ids: string[] = [];
      for (const task of visibleTasks) {
        const draftIds = draftIdsByJobId.get(task.id);
        if (draftIds) ids.push(...draftIds);
      }
      return ids;
    }
    return display.displayedDrafts.map((d) => d.id);
  }, [
    showJobCards,
    visibleTasks,
    draftIdsByJobId,
    display.displayedDrafts,
  ]);
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
  } = useSelection(getDisplayedIds);

  const isTaskChecked = useCallback(
    (task: BaseTask): boolean | "indeterminate" => {
      const ids = draftIdsByJobId.get(task.id);
      if (!ids || ids.length === 0) return false;
      let selectedCount = 0;
      for (const id of ids) if (selectedIds.has(id)) selectedCount++;
      if (selectedCount === 0) return false;
      if (selectedCount === ids.length) return true;
      return "indeterminate";
    },
    [draftIdsByJobId, selectedIds],
  );

  const onToggleTaskCheck = useCallback(
    (task: BaseTask) => {
      const ids = draftIdsByJobId.get(task.id);
      if (!ids || ids.length === 0) return;
      const allSelected = ids.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          for (const id of ids) next.delete(id);
        } else {
          for (const id of ids) next.add(id);
        }
        return next;
      });
    },
    [draftIdsByJobId, selectedIds, setSelectedIds],
  );

  // ─── 마키(영역 드래그)로 작업(자료 묶음) 선택 ───
  // 작업의 "선택" 상태는 그 작업에 속한 draft 들이 모두 selectedIds 에 있는지로
  // 표현된다(체크박스와 동일). 마키는 task id 공간에서 동작하고, 여기서 draft
  // 선택집합으로 번역한다.
  const checkedTaskIds = useMemo(() => {
    const s = new Set<string>();
    for (const [taskId, ids] of draftIdsByJobId) {
      if (ids.length > 0 && ids.every((id) => selectedIds.has(id))) {
        s.add(taskId);
      }
    }
    return s;
  }, [draftIdsByJobId, selectedIds]);

  const handleTaskMarqueeChange = useCallback(
    (nextTaskIds: Set<string>) => {
      // DragSelect 가 넘기는 next 는 "이번 선택의 전체 집합"이다(새 드래그=교체,
      // Shift=추가). 각 task 의 draft id 들로 펼쳐 draft 선택집합을 만든다.
      const nextDraftIds = new Set<string>();
      for (const taskId of nextTaskIds) {
        const ids = draftIdsByJobId.get(taskId);
        if (ids) for (const id of ids) nextDraftIds.add(id);
      }
      setSelectedIds(nextDraftIds);
    },
    [draftIdsByJobId, setSelectedIds],
  );

  // Dropping a task card onto a folder should move every draft inside that
  // task (the side-panel surfaces the same set under "전체 선택"). Folders
  // accept the `draft-bulk` payload already; we just need to enumerate the
  // task's drafts here.
  const getTaskDragData = useCallback(
    (task: BaseTask) => {
      const ids = draftIdsByJobId.get(task.id);
      if (!ids || ids.length === 0) return null;
      return { type: "draft-bulk", draftIds: ids };
    },
    [draftIdsByJobId],
  );
  const getTaskDragCount = useCallback(
    (task: BaseTask) => draftIdsByJobId.get(task.id)?.length ?? 0,
    [draftIdsByJobId],
  );

  const actionTargetIds = useMemo(() => {
    if (selectedIds.size > 0) return selectedIds;
    if (folders.activeFolder === null && display.jobFilter.size > 0) {
      return new Set(display.displayedDrafts.map((draft) => draft.id));
    }
    return new Set<string>();
  }, [
    display.displayedDrafts,
    folders.activeFolder,
    display.jobFilter.size,
    selectedIds,
  ]);

  const bulkAnalysisCandidateDrafts = useMemo(() => {
    if (actionTargetIds.size === 0) return [];
    return data.drafts.filter((draft) => actionTargetIds.has(draft.id));
  }, [actionTargetIds, data.drafts]);

  const bulkAnalysisRunnableDrafts = useMemo(
    () => bulkAnalysisCandidateDrafts.filter(isDraftAnalyzable),
    [bulkAnalysisCandidateDrafts],
  );

  const bulkAnalysisAlreadyAnalyzedCount =
    bulkAnalysisRunnableDrafts.filter(isDraftAnalyzed).length;
  const bulkAnalysisPlan: QuestionGenerationPlan = "STANDARD";
  const bulkAnalysisUnitCreditCost = PASSAGE_ANALYSIS_BASE_CREDIT_COST;
  const bulkAnalysisTotalCreditCost =
    bulkAnalysisRunnableDrafts.length * bulkAnalysisUnitCreditCost;
  const bulkAnalysisSummaryLabel =
    bulkAnalysisAlreadyAnalyzedCount > 0
      ? `${bulkAnalysisCandidateDrafts.length}개 선택/${bulkAnalysisAlreadyAnalyzedCount}개 분석완료`
      : `${bulkAnalysisCandidateDrafts.length}개 선택`;
  const bulkAnalysisTitle =
    actionTargetIds.size === 0
      ? "분석할 자료를 선택하세요."
      : bulkAnalysisRunnableDrafts.length > 0
        ? bulkAnalysisAlreadyAnalyzedCount > 0
          ? `${bulkAnalysisAlreadyAnalyzedCount}개는 이미 분석된 지문입니다. 실행 전에 추가 분석 여부를 확인합니다. 예상 소모: ${bulkAnalysisTotalCreditCost.toLocaleString("ko-KR")} 크레딧.`
          : `${bulkAnalysisRunnableDrafts.length}개 자료를 AI 분석 큐에 등록합니다. 예상 소모: ${bulkAnalysisTotalCreditCost.toLocaleString("ko-KR")} 크레딧.`
        : "분석할 수 있는 자료가 없습니다.";

  const clearActionSelection = useCallback(() => {
    if (selectedIds.size > 0) {
      clearSelection();
      return;
    }
    if (display.jobFilter.size > 0) {
      display.setJobFilter(new Set());
    }
  }, [clearSelection, display, selectedIds.size]);

  const runBulkAnalyze = useCallback(
    async (draftsToAnalyze: M1PassageDraftWithJob[]) => {
      if (!onBulkAnalyze || bulkAnalyzing || draftsToAnalyze.length === 0) {
        return;
      }
      await onBulkAnalyze(draftsToAnalyze, bulkAnalysisPlan);
      clearActionSelection();
      await data.loadAllDrafts();
    },
    [
      bulkAnalysisPlan,
      bulkAnalyzing,
      clearActionSelection,
      data,
      onBulkAnalyze,
    ],
  );

  const handleBulkAnalyze = useCallback(async () => {
    if (
      !onBulkAnalyze ||
      bulkAnalyzing ||
      bulkAnalysisRunnableDrafts.length === 0
    ) {
      return;
    }

    const alreadyAnalyzedCount =
      bulkAnalysisRunnableDrafts.filter(isDraftAnalyzed).length;

    if (alreadyAnalyzedCount > 0) {
      const unanalyzedDrafts = bulkAnalysisRunnableDrafts.filter(
        isDraftReadyForAnalysis,
      );
      const rejectClause =
        unanalyzedDrafts.length > 0
          ? `취소를 누르면 이미 분석된 지문은 제외하고 ${unanalyzedDrafts.length}개만 진행합니다.`
          : "취소를 누르면 이번 일괄 분석은 취소됩니다.";
      const approved = confirmNative(
        "이미 분석된 지문이 있습니다",
        `${alreadyAnalyzedCount}개는 이미 분석이 된 지문입니다. 추가 분석을 진행하시겠습니까?\n\n확인을 누르면 선택한 ${bulkAnalysisRunnableDrafts.length}개 전체를 새 분석 큐에 등록합니다. ${rejectClause}`,
      );

      if (approved) {
        // 확인(승인): 선택한 전체를 새 분석 큐에 등록
        await runBulkAnalyze(bulkAnalysisRunnableDrafts);
      } else if (unanalyzedDrafts.length > 0) {
        // 취소(거절): 이미 분석된 지문은 제외하고 미분석분만 진행
        await runBulkAnalyze(unanalyzedDrafts);
      } else {
        // 취소(거절): 진행할 미분석 지문이 없으면 일괄 분석 취소
        toast.info("추가 분석을 취소했습니다.");
      }
      return;
    }

    await runBulkAnalyze(bulkAnalysisRunnableDrafts);
  }, [
    bulkAnalysisRunnableDrafts,
    bulkAnalyzing,
    onBulkAnalyze,
    runBulkAnalyze,
  ]);

  // ─── Load checked drafts into the embedder's right "지문" stack ───
  // Mirrors the bulk-analyze selection (actionTargetIds → drafts with content)
  // but hands them to the parent to render as editable, markable rows instead
  // of submitting them to analysis directly.
  const handleLoadSelected = useCallback(() => {
    if (!onLoadSelectedDrafts || bulkAnalysisRunnableDrafts.length === 0) return;
    onLoadSelectedDrafts(bulkAnalysisRunnableDrafts);
    clearActionSelection();
  }, [onLoadSelectedDrafts, bulkAnalysisRunnableDrafts, clearActionSelection]);

  const toggleGroupCheck = useCallback(
    (ids: string[], select: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (select) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [setSelectedIds],
  );

  // ─── Navigation actions ───
  const showAllResults = useCallback(() => {
    if (!embedded && typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    display.setJobFilter(new Set());
    void data.loadAllDrafts();
  }, [data, display, embedded]);

  const navigateToFolderView = useCallback(
    (folderId: string | null) => {
      folders.navigateToFolder(folderId);
      display.setJobFilter(new Set());
      data.setResultScope("all");
      data.setJobId(null);
      if (!embedded && typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      clearSelection();
    },
    [folders, display, data, clearSelection, embedded],
  );

  // ─── Folder bulk bridges ───
  const handleAddToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folders.handleAddToFolder(collectionId, actionTargetIds);
      if (ok) clearActionSelection();
    },
    [actionTargetIds, clearActionSelection, folders],
  );

  const handleMoveToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folders.handleDragToFolder(
        [...actionTargetIds],
        collectionId,
        false,
        actionTargetIds,
      );
      if (ok) clearActionSelection();
    },
    [actionTargetIds, clearActionSelection, folders],
  );

  const handleDragToFolder = useCallback(
    async (itemId: string | string[], folderId: string, copy: boolean) => {
      await folders.handleDragToFolder(itemId, folderId, copy, selectedIds);
    },
    [folders, selectedIds],
  );

  const handleDragToRoot = useCallback(
    async (itemId: string | string[], copy: boolean) => {
      if (copy) {
        toast.info("전체 자료에는 이미 포함되어 있습니다.");
        return;
      }
      const draggedIds = Array.isArray(itemId) ? itemId : [itemId];
      const shouldUseSelection = draggedIds.some((id) => selectedIds.has(id));
      const idsToMove = shouldUseSelection
        ? [...selectedIds]
        : Array.from(new Set(draggedIds));
      if (idsToMove.length === 0) return;
      const ok = await folders.handleRemoveFromFolder(new Set(idsToMove));
      if (ok) clearSelection();
    },
    [folders, selectedIds, clearSelection],
  );

  // Toggle a job in/out of the jobFilter set — drives the JobCard checkbox
  // and the legacy DraftGrid jobs filter dropdown alike.
  const toggleJobSelection = useCallback(
    (nextJobId: string | null) => {
      void (async () => {
        if (nextJobId === null) {
          display.setJobFilter(new Set());
          await data.loadAllDrafts();
          return;
        }
        const next = new Set(display.jobFilter);
        if (next.has(nextJobId)) next.delete(nextJobId);
        else next.add(nextJobId);
        display.setJobFilter(next);
        if (!embedded && typeof window !== "undefined") {
          const nextUrl =
            next.size === 1
              ? "?jobId=" + Array.from(next)[0]
              : window.location.pathname;
          window.history.replaceState(null, "", nextUrl);
        }
        if (next.size === 0) await data.loadAllDrafts();
        else if (next.size === 1) {
          const [targetJobId] = Array.from(next);
          await data.loadJobDetails(targetJobId);
        } else await data.loadJobsDetails(next);
      })();
    },
    [data, display, embedded],
  );

  // ─── Selection toolbar ───
  const isRerestoring = bulk.bulkActionRunning === "rerestore";
  const isDeleting = bulk.bulkActionRunning === "delete";
  const isPromoting = bulk.bulkActionRunning === "promote";
  const anyBulkRunning = bulk.bulkActionRunning !== null;
  const noSelection = actionTargetIds.size === 0;

  // 일괄 버튼(복원·삭제)이 비활(선택 0개)일 때 눌리면 자료 카드들을 글로우해
  // "자료를 먼저 고르세요"를 유도한다.
  const draftZoneRef = useRef<HTMLDivElement>(null);
  const hintSelectDrafts = useCallback(() => {
    triggerHintGlowWithin(draftZoneRef.current);
  }, []);

  // 자료 관리 툴바: 이동/복사·삭제는 아이콘 전용(이미지 디자인), AI 복원 다시는
  // 가장 오른쪽으로 분리 배치한다. 각각 개별 슬롯으로 DraftSelectionToolbar 에
  // 전달해 [체크박스] [이동/복사] [검수완료] [삭제] … [AI 복원 다시] 순서를 만든다.
  const moveAction = (
    <MoveOrCopyFolderPicker
      collections={folders.collections}
      activeFolder={folders.activeFolder}
      selectedCount={actionTargetIds.size}
      onCopy={handleAddToFolder}
      onMove={handleMoveToFolder}
      disabled={anyBulkRunning || noSelection}
      compact
    />
  );

  const deleteAction = (
    <button
      type="button"
      onClick={() => {
        if (anyBulkRunning) return;
        if (noSelection) {
          hintSelectDrafts();
          return;
        }
        void bulk.bulkDelete(actionTargetIds, clearActionSelection);
      }}
      disabled={anyBulkRunning}
      aria-disabled={noSelection}
      title="삭제"
      aria-label="삭제"
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      {isDeleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );

  const rerestoreAction = (
    <button
      type="button"
      onClick={() => {
        if (anyBulkRunning) return;
        if (noSelection) {
          hintSelectDrafts();
          return;
        }
        void bulk.bulkRerestore(actionTargetIds, clearActionSelection);
      }}
      // 실행 중엔 진짜 비활, 미선택은 aria-disabled(눌리면 힌트 글로우).
      disabled={anyBulkRunning}
      aria-disabled={noSelection}
      title={embedded ? "AI 복원 다시" : undefined}
      aria-label={embedded ? "AI 복원 다시" : undefined}
      className={
        embedded
          ? "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          : "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      }
    >
      {isRerestoring ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {embedded ? null : "AI 복원 다시"}
    </button>
  );

  const materialDuplicateMode =
    display.pageMode === "duplicates"
      ? "grouped"
      : display.hideDuplicates
        ? "hidden"
        : "all";
  const materialHasActiveFilter =
    display.statusFilter !== "ALL" ||
    display.sortOrder !== "newest" ||
    materialDuplicateMode !== "all";

  const filtersToolbar = (
    <ManageFiltersBar
      compact={embedded}
      searchValue={display.searchValue}
      onSearchChange={display.setSearchValue}
      onSearchSubmit={() => display.setAppliedSearch(display.searchValue)}
      showFilters={showMaterialFilters}
      onToggleFilters={() => setShowMaterialFilters((v) => !v)}
      hasActiveFilter={materialHasActiveFilter}
    />
  );

  const filtersPanel = showMaterialFilters ? (
    <ManageFiltersPanel
      statusFilter={display.statusFilter}
      onStatusFilterChange={display.setStatusFilter}
      sortOrder={display.sortOrder}
      onSortOrderChange={display.setSortOrder}
      pageMode={display.pageMode}
      onTogglePageMode={() =>
        display.setPageMode((mode) =>
          mode === "duplicates" ? "list" : "duplicates",
        )
      }
      hideDuplicates={display.hideDuplicates}
      onToggleHideDuplicates={() =>
        display.setHideDuplicates((value) => !value)
      }
      duplicateGroupCount={display.dupInfo.groupCount}
      totalDuplicateCount={display.dupInfo.totalDuplicateCount}
    />
  ) : null;

  const pendingReviewSelectedCount = bulkAnalysisCandidateDrafts.filter(
    (draft) => draft.reviewStatus !== "COMMITTED",
  ).length;
  const promoteAction = embedded ? null : (
    <button
      type="button"
      onClick={() =>
        void bulk.bulkPromote(actionTargetIds, clearActionSelection)
      }
      disabled={anyBulkRunning || noSelection}
      title={
        pendingReviewSelectedCount > 0
          ? `미검수 ${pendingReviewSelectedCount}개 검수완료`
          : "검수완료"
      }
      className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border bg-white px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600"
    >
      {isPromoting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      검수완료
    </button>
  );

  const totalSelectableCount = showJobCards
    ? visibleTasks.reduce(
        (sum, task) => sum + (draftIdsByJobId.get(task.id)?.length ?? 0),
        0,
      )
    : display.displayedDrafts.length;

  const isAllSelected =
    actionTargetIds.size > 0 && actionTargetIds.size === totalSelectableCount;

  // Standalone mode uses the page wrapper as its scroll container, so the top
  // sections need sticky offsets. Embedded mode keeps those sections fixed and
  // scrolls only the materials list below them.
  const shouldPinManageHeaders = !embedded;
  const hasStickyJobList =
    !embedded &&
    showJobListRow &&
    shouldPinManageHeaders &&
    display.availableJobs.length > 0;
  const [jobListStickyRef, jobListStickyHeight] =
    useMeasuredHeight(hasStickyJobList);
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(
    shouldPinManageHeaders,
  );
  // The job-list sticky band extends one corner-radius (16px) BELOW the visible
  // gap so its #F4F6F9 fill sits behind the folder card's rounded top corners
  // (otherwise the transparent corner notches expose scrolling content). Pin the
  // folder header 16px higher so it overlaps that extended band region.
  const STICKY_CORNER_OVERLAP = 16;
  const folderStickyTop = hasStickyJobList
    ? jobListStickyHeight - STICKY_CORNER_OVERLAP
    : 0;
  const materialToolbarStickyTop = shouldPinManageHeaders
    ? folderStickyTop + folderStickyHeight
    : 0;

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          : pageBleed
            ? "-m-6 flex min-h-[calc(100%+3rem)] min-w-0 flex-col bg-[#F4F6F9]"
            : "flex min-w-0 flex-col"
      }
    >
      <div
        className={
          "flex w-full min-w-0 flex-col" + (embedded ? " min-h-0 flex-1" : "")
        }
      >
        {data.error ? (
          <div className="mx-6 mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 sm:mx-8">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{data.error}</span>
          </div>
        ) : null}

        <div
          className={
            "flex min-w-0 flex-col" + (embedded ? " min-h-0 flex-1" : "")
          }
        >
          {!embedded && showJobListRow && display.availableJobs.length > 0 ? (
            <div
              ref={jobListStickyRef}
              className={
                "shrink-0 px-6 pb-6 pt-2 sm:px-8 " +
                (shouldPinManageHeaders ? "sticky top-0 z-40 bg-[#F4F6F9]" : "")
              }
            >
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <h3 className="truncate text-[13px] font-bold text-slate-900">
                    자료 목록
                  </h3>
                  <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums">
                    · {display.availableJobs.length}권
                  </span>
                  {jobRowCollapsed ? (
                    <button
                      type="button"
                      onClick={toggleJobRowCollapsed}
                      aria-expanded={false}
                      title="작업 목록 펼치기"
                      className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
                    >
                      <ChevronDown className="size-3.5" aria-hidden="true" />
                      <span>펼치기</span>
                    </button>
                  ) : null}
                </div>
                {!jobRowCollapsed ? (
                  <>
                    <div
                      className="overflow-y-auto px-4 py-1.5"
                      style={{ height: jobRowHeight }}
                    >
                      <div className="flex min-w-0 items-stretch gap-3 overflow-x-auto">
                        {display.availableJobs.map((job) => (
                          <JobCard
                            key={job.jobId}
                            variant="compact"
                            active={reviewingJobId === job.jobId}
                            label={job.label}
                            subLabel={job.subLabel}
                            count={job.count}
                            draftIds={job.draftIds}
                            tone="blue"
                            editable
                            createdAt={job.createdAt ?? null}
                            thumbnailUrl={job.thumbnailUrl ?? null}
                            status={job.status ?? null}
                            checked={display.jobFilter.has(job.jobId)}
                            onToggleCheck={() => toggleJobSelection(job.jobId)}
                            onClick={() => setReviewingJobId(job.jobId)}
                            onRename={(next) =>
                              actions.renameJob(job.jobId, next)
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <div className="relative flex items-center justify-end px-4 pb-0 pt-0">
                      <div
                        onPointerDown={beginJobRowResize}
                        onDoubleClick={resetJobRowHeight}
                        title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
                        className="group/jhandle absolute left-1/2 top-1/2 inline-flex h-3 w-[200px] -translate-x-1/2 -translate-y-1/2 cursor-row-resize items-center justify-center px-1 select-none"
                      >
                        <div className="h-0.5 w-full rounded-full bg-slate-200 transition-colors group-hover/jhandle:bg-blue-400 group-active/jhandle:bg-blue-500" />
                      </div>
                      <button
                        type="button"
                        onClick={toggleJobRowCollapsed}
                        aria-expanded
                        title="작업 목록 접기"
                        className="inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
                      >
                        <ChevronUp className="size-3.5" aria-hidden="true" />
                        <span>접기</span>
                      </button>
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          ) : null}

          <div
            className={
              embedded
                ? "flex min-h-0 min-w-0 flex-1 flex-col"
                : "flex min-w-0 flex-col px-6 pb-2 sm:px-8 sm:pb-3" +
                  // Pull back up under the job-list band's extended 16px tail so
                  // the visible gap stays 8px while the band covers the corners.
                  (hasStickyJobList ? " -mt-4" : "")
            }
          >
            <section
              className={
                "flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm" +
                (embedded ? " min-h-0 flex-1 overflow-hidden" : "")
              }
            >
              <div
                ref={folderStickyRef}
                style={
                  shouldPinManageHeaders ? { top: folderStickyTop } : undefined
                }
                className={
                  "shrink-0 overflow-hidden rounded-t-2xl " +
                  (shouldPinManageHeaders
                    ? "sticky z-40 bg-white shadow-[0_1px_0_rgba(148,163,184,0.22)]"
                    : "bg-white")
                }
              >
                <FolderSection
                  embedded
                  dragItemType="draft"
                  // 임베드(학습지 생성 좌측)는 그리드 전용, standalone(자료추출)은
                  // 정렬·검색·리스트(밀러) 풀 컨트롤. 둘 다 높이 조절 가능.
                  enableFolderControls={!embedded}
                  resizableGrid={embedded}
                  treatRootAsFolder
                  rootLabel="전체 자료"
                  storageKey="extraction-drafts"
                  childFolders={folders.childFolders}
                  allFolders={folders.collections}
                  activeFolder={folders.activeFolder}
                  dragItemIdKey="draftId"
                  itemCountLabel="자료"
                  showNewFolder={folders.showNewFolder}
                  newFolderName={folders.newFolderName}
                  onNewFolderNameChange={folders.setNewFolderName}
                  onShowNewFolder={folders.setShowNewFolder}
                  onCreateFolder={folders.handleCreateFolder}
                  onNavigateToFolder={(id) => navigateToFolderView(id)}
                  onRenameFolder={folders.handleRenameFolder}
                  onDeleteFolder={folders.handleDeleteFolder}
                  onDragToFolder={handleDragToFolder}
                  onDragToRoot={handleDragToRoot}
                  breadcrumbPath={folders.breadcrumbPath}
                  onNavigateToRoot={() => navigateToFolderView(null)}
                  pageHeader={{
                    icon: (
                      <ExtractionTaskListIcon
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    ),
                    parentLabel: "자료 관리",
                    title: "전체 자료",
                    totalCount:
                      data.resultScope === "all" &&
                      folders.activeFolder === null
                        ? display.serverVisibleDraftTotal || data.drafts.length
                        : draftsInActiveFolder.length,
                    itemLabel: "자료",
                  }}
                  toolbar={
                    // "전체 결과로" 되돌리기 — 단일 잡으로 드릴인했을 때만. (예전
                    // DraftFolderSection의 resultScope/onBackToAllResults를 toolbar로 이전)
                    data.resultScope === "job" ? (
                      <button
                        type="button"
                        onClick={showAllResults}
                        className="shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                      >
                        전체 결과로
                      </button>
                    ) : undefined
                  }
                />
              </div>

              {showJobCards ? (
                <div
                  style={
                    embedded ? undefined : { top: materialToolbarStickyTop }
                  }
                  className={
                    (embedded
                      ? "shrink-0"
                      : "sticky z-30 shrink-0 shadow-[0_1px_0_rgba(148,163,184,0.22)]") +
                    " border-t border-slate-200 bg-slate-50 px-4 py-2"
                  }
                >
                  <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
                    <DraftSelectionToolbar
                      embedded
                      selectedCount={actionTargetIds.size}
                      totalCount={totalSelectableCount}
                      isAllSelected={isAllSelected}
                      onSelectAll={selectAll}
                      onClearSelection={clearActionSelection}
                      moveAction={moveAction}
                      primaryAction={promoteAction}
                      deleteAction={deleteAction}
                      trailingAction={rerestoreAction}
                    />
                    {!embedded ? (
                      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <ManageFiltersBarTasks
                          variant="filters-only"
                          searchValue={taskSearchValue}
                          onSearchChange={setTaskSearchValue}
                          statusFilter={taskStatusFilter}
                          onStatusFilterChange={setTaskStatusFilter}
                          sortOrder={taskSortOrder}
                          onSortOrderChange={setTaskSortOrder}
                        />
                        <ManageFiltersBarTasks
                          variant="search-only"
                          searchValue={taskSearchValue}
                          onSearchChange={setTaskSearchValue}
                          statusFilter={taskStatusFilter}
                          onStatusFilterChange={setTaskStatusFilter}
                          sortOrder={taskSortOrder}
                          onSortOrderChange={setTaskSortOrder}
                        />
                        <ViewModeCycleButton
                          value={materialGridCols}
                          options={MATERIAL_GRID_OPTIONS.map((option) =>
                            option.value === "grid3"
                              ? {
                                  ...option,
                                  disabled: reviewDrawerOpen,
                                  disabledTitle:
                                    "드로어가 열려 있는 동안 3열 보기는 사용할 수 없습니다",
                                }
                              : option,
                          )}
                          onChange={setMaterialGridCols}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {showJobCards ? (
                embedded ? (
                  <EmbeddedJobCardGrid
                    jobs={display.availableJobs}
                    searchQuery={taskSearchValue}
                    statusFilter={taskStatusFilter}
                    analysisFilter={taskAnalysisFilter}
                    sortOrder={taskSortOrder}
                    reviewingJobId={reviewingJobId}
                    onOpenJob={setReviewingJobId}
                    isTaskChecked={isTaskChecked}
                    onToggleTaskCheck={onToggleTaskCheck}
                    onRenameJob={actions.renameJob}
                    onVisibleJobsChange={setVisibleTasks}
                    marqueeSelectedTaskIds={checkedTaskIds}
                    onMarqueeChange={handleTaskMarqueeChange}
                    marqueeBoundaryRef={marqueeBoundaryRef}
                  />
                ) : (
                  <div className="min-w-0 rounded-b-2xl border-t border-slate-200 bg-slate-50/40 px-4 pb-3 pt-3 sm:px-5">
                    <TaskQueueInlineList
                      domain="extraction"
                      layout="grid"
                      limit={100}
                      bare
                      viewMode={
                        materialGridCols === "grid3"
                          ? "grid-3"
                          : materialGridCols === "grid2"
                            ? "grid-2"
                            : "list"
                      }
                      onViewModeChange={(mode) =>
                        setMaterialGridCols(
                          mode === "grid-3"
                            ? "grid3"
                            : mode === "grid-2"
                              ? "grid2"
                              : "list",
                        )
                      }
                      onTaskClick={(task) => setReviewingJobId(task.id)}
                      searchQuery={taskSearchValue}
                      statusFilter={taskStatusFilter}
                      sortOrder={taskSortOrder}
                      onVisibleTasksChange={setVisibleTasks}
                      isTaskChecked={isTaskChecked}
                      onToggleTaskCheck={onToggleTaskCheck}
                      getTaskDragData={getTaskDragData}
                      getTaskDragCount={getTaskDragCount}
                      onRenameTask={(task, next) =>
                        actions.renameJob(
                          task.id,
                          next.length > 0 ? next : null,
                        )
                      }
                      renderTaskActions={(task) => {
                        const jobDrafts = draftsByJobId.get(task.id);
                        if (!jobDrafts?.length) {
                          // 취소·실패한 작업은 복원 자료가 없지만, 검수 토글이
                          // 들어갈 자리를 비워두면 카드 레이아웃이 들쭉날쭉해진다.
                          // 같은 크기의 비활성 "미검수" 버튼으로 자리를 채운다.
                          return task.status === "cancelled" ||
                            task.status === "failed" ? (
                            <JobReviewDisabledButton status={task.status} />
                          ) : null;
                        }
                        return (
                          <JobReviewToggleButton
                            drafts={jobDrafts}
                            onPromote={actions.promoteDraft}
                            onUnpromote={actions.unpromoteDraft}
                          />
                        );
                      }}
                      marqueeSelectedTaskIds={checkedTaskIds}
                      onMarqueeChange={handleTaskMarqueeChange}
                      marqueeBoundaryRef={marqueeBoundaryRef}
                    />
                  </div>
                )
              ) : (
                <div
                  ref={draftZoneRef}
                  className={
                    "flex min-w-0 flex-col rounded-b-2xl border-t border-slate-200 bg-slate-50/40 px-4 pb-3 sm:px-5" +
                    (embedded
                      ? " min-h-0 flex-1 overflow-y-auto overscroll-contain"
                      : "")
                  }
                >
                  <DraftGrid
                    marqueeBoundaryRef={marqueeBoundaryRef}
                    gridOnly={embedded}
                    inProgressCount={inProgressCount}
                    drafts={display.displayedDrafts}
                    loading={data.loadingDetails && data.drafts.length === 0}
                    hasAnyDraft={data.drafts.length > 0}
                    inFolder={folders.activeFolder !== null}
                    hasActiveSearchOrFilter={display.hasActiveSearchOrFilter}
                    stickyTop={embedded ? 0 : materialToolbarStickyTop}
                    selectedDraftId={
                      externallyPicking
                        ? selectedExternalDraftId
                        : data.selectedDraftId
                    }
                    lastViewedDraftId={data.lastViewedDraftId}
                    loadedDraftIds={loadedExternalDraftIdSet}
                    checkedIds={selectedIds}
                    setCheckedIds={setSelectedIds}
                    gridCols={materialGridCols}
                    onGridColsChange={setMaterialGridCols}
                    grid3Disabled={reviewDrawerOpen}
                    onSelectDraft={
                      externallyPicking
                        ? (id: string) => {
                            const draft = data.drafts.find((d) => d.id === id);
                            if (draft) onSelectDraftExternal!(draft);
                          }
                        : data.openDraftDetail
                    }
                    // When an external picker owns the primary action (가져오기 →
                    // editor), expose a SECOND "지문 전체 보기" affordance that opens
                    // the 복원 근거 detail modal — matching the 문제 생성 page. In
                    // standalone, the primary button already opens detail, so no
                    // second button is needed.
                    onOpenDetail={
                      externallyPicking ? data.openDraftDetail : undefined
                    }
                    onToggleCheck={toggleSelect}
                    onToggleGroupCheck={toggleGroupCheck}
                    onResetFilters={display.resetFilters}
                    jobs={display.availableJobs}
                    selectedJobIds={display.jobFilter}
                    totalDraftCount={
                      folders.activeFolder === null
                        ? display.serverVisibleDraftTotal ||
                          draftsInActiveFolder.length
                        : draftsInActiveFolder.length
                    }
                    onSelectJob={toggleJobSelection}
                    onRenameJob={actions.renameJob}
                    onRenameDraft={actions.updateDraftTitle}
                    onRenameSourceMaterial={actions.renameSourceMaterial}
                    statusBadgeMode={embedded ? "analysis" : "review"}
                    flatCards={embedded}
                    detailAction={draftDetailAction}
                    // 자료 관리(standalone) 카드는 다른 검수 화면처럼 푸터에 검수완료
                    // 버튼 + 상세보기 아이콘을 둔다. 임베드(학습지 생성)는 분석/가져오기
                    // 흐름이라 검수 토글을 두지 않는다.
                    onPromote={embedded ? undefined : actions.promoteDraft}
                    onUnpromote={embedded ? undefined : actions.unpromoteDraft}
                    onDeleteDraft={embedded ? undefined : actions.deleteDraft}
                    deletingDraftId={actions.deletingDraftId}
                    groupIndexBySourceMaterialId={
                      display.groupIndexBySourceMaterialId
                    }
                    dupCountById={display.dupInfo.countById}
                    filedDraftIds={
                      folders.activeFolder === null ? filedDraftIds : undefined
                    }
                    filtersToolbar={filtersToolbar}
                    filtersPanel={filtersPanel}
                    onDropDraftsIntoCurrentFolder={
                      folders.activeFolder
                        ? (itemId, copy) =>
                            handleDragToFolder(
                              itemId,
                              folders.activeFolder!,
                              copy,
                            )
                        : undefined
                    }
                    selectionToolbar={
                      <DraftSelectionToolbar
                        embedded
                        selectedCount={actionTargetIds.size}
                        totalCount={display.displayedDrafts.length}
                        isAllSelected={isAllSelected}
                        onSelectAll={selectAll}
                        onClearSelection={clearActionSelection}
                        moveAction={moveAction}
                        primaryAction={promoteAction}
                        deleteAction={deleteAction}
                        trailingAction={rerestoreAction}
                      />
                    }
                  />
                </div>
              )}
            </section>
            {onLoadSelectedDrafts ? (
              <div className="shrink-0 pt-2">
                <button
                  type="button"
                  onClick={handleLoadSelected}
                  disabled={bulkAnalysisRunnableDrafts.length === 0}
                  title={
                    bulkAnalysisRunnableDrafts.length === 0
                      ? "불러올 자료를 선택하세요."
                      : `선택한 ${bulkAnalysisRunnableDrafts.length}개 지문을 오른쪽 지문 섹션으로 불러옵니다. 마킹·복원 후 분석을 시작하세요.`
                  }
                  className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                >
                  <LogIn className="size-4" aria-hidden="true" />
                  <span>선택 지문 불러오기</span>
                  {bulkAnalysisRunnableDrafts.length > 0 ? (
                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                      {bulkAnalysisRunnableDrafts.length}개 선택
                    </span>
                  ) : null}
                </button>
              </div>
            ) : onBulkAnalyze ? (
              <div className="shrink-0 pt-2">
                <button
                  type="button"
                  onClick={() => void handleBulkAnalyze()}
                  disabled={
                    bulkAnalyzing || bulkAnalysisRunnableDrafts.length === 0
                  }
                  title={bulkAnalysisTitle}
                  className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-[12.5px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                >
                  {bulkAnalyzing ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Wand2 className="size-4" aria-hidden="true" />
                  )}
                  <span>
                    {bulkAnalyzing ? "일괄 분석 등록 중" : "일괄 분석 시작"}
                  </span>
                  {bulkAnalysisCandidateDrafts.length > 0 ? (
                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                      {bulkAnalysisSummaryLabel}
                    </span>
                  ) : null}
                  {bulkAnalysisTotalCreditCost > 0 ? (
                    <CreditCostChip
                      amount={bulkAnalysisTotalCreditCost}
                      className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]"
                    />
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {data.detailLoadingId && !selectedDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-xl">
              <Loader2 className="size-4 animate-spin text-blue-600" />
              자료 상세를 불러오는 중
            </div>
          </div>
        ) : null}

        {reviewingJobId ? (
          <JobReviewModal
            jobId={reviewingJobId}
            jobMeta={data.jobMetaByJobId.get(reviewingJobId)}
            drafts={data.drafts.filter((d) => d.job?.id === reviewingJobId)}
            collections={folders.collections}
            activeFolder={folders.activeFolder}
            onClose={() => setReviewingJobId(null)}
            onOpenDraft={(id) => data.openDraftDetail(id)}
            onAddToFolder={async (collectionId, draftIds) => {
              await folders.handleAddToFolder(collectionId, draftIds);
            }}
            onMoveToFolder={async (collectionId, draftIds) => {
              const anyId = draftIds.values().next().value;
              if (!anyId) return;
              await folders.handleDragToFolder(
                anyId,
                collectionId,
                false,
                draftIds,
              );
            }}
            onPromoteDrafts={(draftIds, clearModalChecks) =>
              bulk.bulkPromote(draftIds, clearModalChecks)
            }
            onPromoteDraft={actions.promoteDraft}
            onUnpromoteDraft={actions.unpromoteDraft}
            onDeleteDrafts={(draftIds, clearModalChecks) =>
              bulk.bulkDelete(draftIds, clearModalChecks)
            }
            bulkActionRunning={bulk.bulkActionRunning}
            dupCountById={display.dupInfo.countById}
            onRenameDraft={actions.updateDraftTitle}
            externalSelectedIds={selectedIds}
            externalSetSelectedIds={setSelectedIds}
            externalSelectedDraftId={
              externallyPicking ? selectedExternalDraftId : null
            }
            onSelectDraftExternal={
              externallyPicking ? onSelectDraftExternal : undefined
            }
            statusBadgeMode={embedded ? "analysis" : "review"}
            detailAction={draftDetailAction}
          />
        ) : null}

        {selectedDraft ? (
          <DraftDetailModal
            draft={selectedDraft}
            savingId={actions.savingId}
            rerestoringId={actions.rerestoringId}
            deletingDraftId={actions.deletingDraftId}
            promotingId={actions.promotingId}
            unpromotingId={actions.unpromotingId}
            onClose={data.closeDraftDetail}
            onDelete={actions.deleteDraft}
            onRerestore={actions.rerestoreDraft}
            onSave={actions.saveDraft}
            onPromote={actions.promoteDraft}
            onUnpromote={actions.unpromoteDraft}
            onTextChange={actions.updateDraftText}
            onTitleChange={actions.updateDraftTitle}
          />
        ) : null}
      </div>
    </div>
  );
}

type AvailableJob = {
  jobId: string;
  label: string;
  subLabel?: string;
  count: number;
  analyzedCount: number;
  /** Lowercased haystack (title + filename + every draft's body) for search. */
  searchText: string;
  draftIds: string[];
  createdAt: number | null;
  thumbnailUrl?: string | null;
  status?: string | null;
  totalPages?: number;
};

function mapJobStatusToTaskStatus(
  status: string | null | undefined,
): import("@/components/workbench/task-queue").TaskStatus {
  switch (status) {
    case "PENDING":
      return "pending";
    case "PROCESSING":
      return "processing";
    case "COMPLETED":
      return "completed";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "completed";
  }
}

function EmbeddedJobCardGrid({
  jobs,
  searchQuery,
  statusFilter,
  analysisFilter,
  sortOrder,
  reviewingJobId,
  onOpenJob,
  isTaskChecked,
  onToggleTaskCheck,
  onRenameJob,
  onVisibleJobsChange,
  marqueeSelectedTaskIds,
  onMarqueeChange,
  marqueeBoundaryRef,
}: {
  jobs: AvailableJob[];
  searchQuery: string;
  statusFilter: TaskStatusFilter;
  analysisFilter: TaskAnalysisFilter;
  sortOrder: TaskSortOrder;
  reviewingJobId: string | null;
  onOpenJob: (jobId: string) => void;
  isTaskChecked: (task: BaseTask) => boolean | "indeterminate";
  onToggleTaskCheck: (task: BaseTask) => void;
  onRenameJob: (jobId: string, next: string | null) => void | Promise<void>;
  onVisibleJobsChange: (tasks: BaseTask[]) => void;
  /** 마키(영역 드래그) 선택 — 작업(자료 묶음) id 집합 + 갱신 콜백 + 시작 영역 경계. */
  marqueeSelectedTaskIds: Set<string>;
  onMarqueeChange: (next: Set<string>) => void;
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
}) {
  // Defer the query so typing stays smooth even while re-filtering across every
  // job's full-body haystack.
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredJobs = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    let next = jobs.filter((j) => {
      if (q && !j.searchText.includes(q)) return false;
      if (statusFilter !== "ALL") {
        if (mapJobStatusToTaskStatus(j.status) !== statusFilter) return false;
      }
      if (analysisFilter !== "all") {
        const fullyAnalyzed = j.count > 0 && j.analyzedCount >= j.count;
        if (analysisFilter === "analyzed" && !fullyAnalyzed) return false;
        if (analysisFilter === "pending" && fullyAnalyzed) return false;
      }
      return true;
    });
    next = [...next].sort((a, b) => {
      if (analysisFilter === "all") {
        const aFullyAnalyzed = a.count > 0 && a.analyzedCount >= a.count;
        const bFullyAnalyzed = b.count > 0 && b.analyzedCount >= b.count;
        const analysisDiff =
          Number(aFullyAnalyzed) - Number(bFullyAnalyzed);
        if (analysisDiff !== 0) return analysisDiff;
      }

      switch (sortOrder) {
        case "name_asc":
          return a.label.localeCompare(b.label, "ko");
        case "name_desc":
          return b.label.localeCompare(a.label, "ko");
        case "oldest":
          return (a.createdAt ?? 0) - (b.createdAt ?? 0);
        case "newest":
        default:
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      }
    });
    return next;
  }, [jobs, deferredQuery, statusFilter, analysisFilter, sortOrder]);

  const taskRows = useMemo(
    () =>
      filteredJobs.map((job) => ({
        job,
        task: {
          id: job.jobId,
          domain: "extraction" as const,
          title: job.label,
          subtitle: job.subLabel ?? "",
          status: mapJobStatusToTaskStatus(job.status),
          createdAt:
            job.createdAt !== null
              ? new Date(job.createdAt).toISOString()
              : new Date(0).toISOString(),
          thumbnailUrl: job.thumbnailUrl ?? null,
        } satisfies BaseTask,
      })),
    [filteredJobs],
  );

  useEffect(() => {
    onVisibleJobsChange(taskRows.map((row) => row.task));
  }, [taskRows, onVisibleJobsChange]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-b-2xl border-t border-slate-200 bg-slate-50/40 px-3 pb-3 pt-3">
      {filteredJobs.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-[12px] font-medium text-slate-400">
          표시할 자료가 없습니다.
        </div>
      ) : (
        <DragSelect
          className="grid grid-cols-3 items-stretch gap-2.5"
          value={marqueeSelectedTaskIds}
          onChange={onMarqueeChange}
          boundaryRef={marqueeBoundaryRef}
        >
          {taskRows.map(({ job, task }) => {
            const checked = isTaskChecked(task);
            return (
              <MaterialJobCard
                key={job.jobId}
                active={reviewingJobId === job.jobId}
                checked={checked === true}
                label={job.label}
                count={job.count}
                analyzedCount={job.analyzedCount}
                draftIds={job.draftIds}
                createdAt={job.createdAt ?? null}
                thumbnailUrl={job.thumbnailUrl ?? null}
                status={job.status ?? null}
                onToggleCheck={() => onToggleTaskCheck(task)}
                onClick={() => onOpenJob(job.jobId)}
                onRename={(next) => onRenameJob(job.jobId, next)}
                dragItemId={job.jobId}
              />
            );
          })}
        </DragSelect>
      )}
    </div>
  );
}
