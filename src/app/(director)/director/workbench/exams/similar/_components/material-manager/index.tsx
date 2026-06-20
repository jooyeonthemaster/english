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

import { useQueueDrawer } from "./queue-drawer-context";

import { DraftDetailModal } from "./components/draft-detail-modal";
import { DraftFolderSection } from "./components/draft-folder-section";
import { DraftGrid, type GridCols } from "./components/draft-grid";
import { DraftSelectionToolbar } from "./components/draft-selection-toolbar";
import { JobCard } from "@/components/workbench/shared/job-card";
import { MaterialJobCard } from "./components/material-job-card";
import { DragSelect } from "@/components/ui/drag-select";
import { JobReviewModal } from "./components/job-review-modal";
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
import { useBulkActions } from "./hooks/use-bulk-actions";
import { useDraftActions } from "./hooks/use-draft-actions";
import { useDraftDisplay } from "./hooks/use-draft-display";
import { useDraftsData } from "./hooks/use-drafts-data";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import {
  getQuestionGenerationCreditCost,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import type { M1PassageDraftWithJob } from "./types";
import { isDraftAnalysisComplete } from "./utils/analysis-status";

interface ExtractionManageClientProps {
  academyId: string;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
  /** When true, drop the page-bleed wrapper (-m-6) and render inside a
   *  clipped container that fits its parent. Used when embedding this
   *  surface as a left-column picker (e.g. in 지문 분석 - 새 지문 등록). */
  embedded?: boolean;
  /** When provided, clicking a draft card calls this callback instead of
   *  opening the built-in DraftDetailModal. Used by embedders that want to
   *  use draft selection as a picker for an external editor. */
  onSelectDraftExternal?: (draft: M1PassageDraftWithJob) => void;
  /** Highlighted draft id when an external picker controls selection. */
  selectedExternalDraftId?: string | null;
  /** Optional bridge used by the passage-registration embed to register and
   *  analyze extraction drafts without copying them into the editor first. */
  onBulkAnalyze?: (
    drafts: M1PassageDraftWithJob[],
    generationPlan: QuestionGenerationPlan,
  ) => Promise<void>;
  bulkAnalyzing?: boolean;
  /** 마키(영역 드래그) 시작 영역 경계. 임베드(자료 관리 패널)처럼 한 화면에 다른
   *  선택 영역(예: 지문 목록 큐)과 함께 놓일 때, 영역이 섞이지 않도록 이 패널만의
   *  경계를 지정한다. 미지정 시 DragSelect 가 전역 기본 경계(본문)를 쓴다. */
  marqueeBoundaryRef?: React.RefObject<HTMLElement | null>;
  /** 동형 시험지 생성 임베드: 체크된 자료(드래프트) 선택 집합을 부모로 올려
   *  "시험지 생성" 입력으로 쓰게 한다. selectedIds 가 바뀔 때마다 호출된다. */
  onSelectionChange?: (selectedDraftIds: Set<string>) => void;
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
  onBulkAnalyze,
  bulkAnalyzing = false,
  marqueeBoundaryRef,
  onSelectionChange,
}: ExtractionManageClientProps) {
  void academyId;

  const externallyPicking = typeof onSelectDraftExternal === "function";

  const queueDrawer = useQueueDrawer();

  // ─── Data hook (state + loaders + polling) ───
  const data = useDraftsData({ onJobsRefresh: queueDrawer.triggerRefresh });

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
  const [taskAnalysisFilter, setTaskAnalysisFilter] =
    useState<TaskAnalysisFilter>("all");
  const [taskSortOrder, setTaskSortOrder] = useState<TaskSortOrder>(
    readStoredTaskSortOrder,
  );
  const [reanalyzeDialogOpen, setReanalyzeDialogOpen] = useState(false);
  const [pendingBulkAnalysisDrafts, setPendingBulkAnalysisDrafts] = useState<
    M1PassageDraftWithJob[] | null
  >(null);
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
  const display = useDraftDisplay({
    drafts: data.drafts,
    draftsInActiveFolder,
    activeFolder: folders.activeFolder,
    jobMetaByJobId: data.jobMetaByJobId,
    prioritizeAnalysisNeeded: embedded,
  });
  const { gridCols, setGridCols } = display;
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

  const isAllMaterialsView =
    folders.activeFolder === null && data.resultScope === "all";

  // In the all-materials view, "전체 선택" should cover the drafts of every
  // currently-visible task card. Elsewhere, fall back to the filtered drafts
  // list that the draft grid renders directly.
  const getDisplayedIds = useCallback(() => {
    if (isAllMaterialsView) {
      const ids: string[] = [];
      for (const task of visibleTasks) {
        const draftIds = draftIdsByJobId.get(task.id);
        if (draftIds) ids.push(...draftIds);
      }
      return ids;
    }
    return display.displayedDrafts.map((d) => d.id);
  }, [
    isAllMaterialsView,
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

  // 동형 임베드: 체크된 자료(드래프트) 선택을 부모로 올린다.
  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [selectedIds, onSelectionChange]);

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
  const bulkAnalysisPlan: QuestionGenerationPlan =
    FEATURE_FLAGS.SHOW_MODEL_SELECTOR ? "PREMIUM" : "STANDARD";
  const bulkAnalysisUnitCreditCost = getQuestionGenerationCreditCost(
    CREDIT_COSTS.PASSAGE_ANALYSIS,
    bulkAnalysisPlan,
  );
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

  const pendingAnalysisDrafts = useMemo(
    () => pendingBulkAnalysisDrafts ?? [],
    [pendingBulkAnalysisDrafts],
  );
  const pendingAlreadyAnalyzedCount =
    pendingAnalysisDrafts.filter(isDraftAnalyzed).length;
  const pendingUnanalyzedDrafts = useMemo(
    () => pendingAnalysisDrafts.filter(isDraftReadyForAnalysis),
    [pendingAnalysisDrafts],
  );

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

    if (bulkAnalysisAlreadyAnalyzedCount > 0) {
      setPendingBulkAnalysisDrafts(bulkAnalysisRunnableDrafts);
      setReanalyzeDialogOpen(true);
      return;
    }

    await runBulkAnalyze(bulkAnalysisRunnableDrafts);
  }, [
    bulkAnalysisAlreadyAnalyzedCount,
    bulkAnalysisRunnableDrafts,
    bulkAnalyzing,
    onBulkAnalyze,
    runBulkAnalyze,
  ]);

  const handleReanalysisDialogOpenChange = useCallback((open: boolean) => {
    setReanalyzeDialogOpen(open);
    if (!open) setPendingBulkAnalysisDrafts(null);
  }, []);

  const rejectReanalysis = useCallback(() => {
    if (pendingUnanalyzedDrafts.length === 0) {
      toast.info("추가 분석을 취소했습니다.");
      setPendingBulkAnalysisDrafts(null);
      return;
    }
    void runBulkAnalyze(pendingUnanalyzedDrafts);
    setPendingBulkAnalysisDrafts(null);
  }, [pendingUnanalyzedDrafts, runBulkAnalyze]);

  const approveReanalysis = useCallback(() => {
    if (pendingAnalysisDrafts.length === 0) return;
    void runBulkAnalyze(pendingAnalysisDrafts);
    setPendingBulkAnalysisDrafts(null);
  }, [pendingAnalysisDrafts, runBulkAnalyze]);

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
  const handleRemoveFromFolderClick = useCallback(async () => {
    const ok = await folders.handleRemoveFromFolder(actionTargetIds);
    if (ok) clearActionSelection();
  }, [actionTargetIds, clearActionSelection, folders]);

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

  const selectionExtraActions = (
    <>
      <MoveOrCopyFolderPicker
        collections={folders.collections}
        activeFolder={folders.activeFolder}
        selectedCount={actionTargetIds.size}
        onCopy={handleAddToFolder}
        onMove={handleMoveToFolder}
        disabled={anyBulkRunning || noSelection}
        compact={embedded}
      />

      <button
        type="button"
        onClick={() =>
          void bulk.bulkRerestore(actionTargetIds, clearActionSelection)
        }
        disabled={anyBulkRunning || noSelection}
        title={embedded ? "AI 복원 다시" : undefined}
        aria-label={embedded ? "AI 복원 다시" : undefined}
        className={
          embedded
            ? "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            : "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isRerestoring ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {embedded ? null : "AI 복원 다시"}
      </button>

      <button
        type="button"
        onClick={() =>
          void bulk.bulkDelete(actionTargetIds, clearActionSelection)
        }
        disabled={anyBulkRunning || noSelection}
        title={embedded ? "삭제" : undefined}
        aria-label={embedded ? "삭제" : undefined}
        className={
          embedded
            ? "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            : "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {isDeleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {embedded ? null : "삭제"}
      </button>
    </>
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

  const promoteAction = embedded ? null : (
    <button
      type="button"
      onClick={() =>
        void bulk.bulkPromote(actionTargetIds, clearActionSelection)
      }
      disabled={anyBulkRunning || noSelection}
      className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPromoting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      검수완료
    </button>
  );

  const totalSelectableCount = isAllMaterialsView
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
    !embedded && shouldPinManageHeaders && display.availableJobs.length > 0;
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
          : "-m-6 flex min-h-[calc(100%+3rem)] min-w-0 flex-col bg-[#F4F6F9]"
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
          {!embedded && display.availableJobs.length > 0 ? (
            <div
              ref={jobListStickyRef}
              className={
                "shrink-0 px-6 pb-6 pt-2 sm:px-8 " +
                (shouldPinManageHeaders ? "sticky top-0 z-40 bg-[#F4F6F9]" : "")
              }
            >
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
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
                <DraftFolderSection
                  embedded
                  gridOnly={embedded}
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
                  resultScope={data.resultScope}
                  onBackToAllResults={showAllResults}
                  toolbar={
                    embedded && isAllMaterialsView ? (
                      <ManageFiltersBarTasks
                        variant="all"
                        compact
                        searchValue={taskSearchValue}
                        onSearchChange={setTaskSearchValue}
                        resultCount={visibleTasks.length}
                        statusFilter={taskStatusFilter}
                        onStatusFilterChange={setTaskStatusFilter}
                        sortOrder={taskSortOrder}
                        onSortOrderChange={setTaskSortOrder}
                        analysisFilter={taskAnalysisFilter}
                        onAnalysisFilterChange={setTaskAnalysisFilter}
                      />
                    ) : undefined
                  }
                />
              </div>

              {isAllMaterialsView ? (
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
                      activeFolder={folders.activeFolder}
                      onRemoveFromFolder={handleRemoveFromFolderClick}
                      extraActions={selectionExtraActions}
                      primaryAction={promoteAction}
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

              {isAllMaterialsView ? (
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
                      marqueeSelectedTaskIds={checkedTaskIds}
                      onMarqueeChange={handleTaskMarqueeChange}
                      marqueeBoundaryRef={marqueeBoundaryRef}
                    />
                  </div>
                )
              ) : (
                <div
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
                        activeFolder={folders.activeFolder}
                        onRemoveFromFolder={handleRemoveFromFolderClick}
                        extraActions={selectionExtraActions}
                        primaryAction={promoteAction}
                      />
                    }
                  />
                </div>
              )}
            </section>
            {onBulkAnalyze ? (
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

        <AlertDialog
          open={reanalyzeDialogOpen}
          onOpenChange={handleReanalysisDialogOpenChange}
        >
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>이미 분석된 지문이 있습니다</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 leading-relaxed">
                <span className="block">
                  {pendingAlreadyAnalyzedCount}개는 이미 분석이 된 지문입니다.
                  추가 분석을 진행하시겠습니까?
                </span>
                <span className="block">
                  승인하면 선택한 {pendingAnalysisDrafts.length}개 전체를 새
                  분석 큐에 등록합니다.
                  {pendingUnanalyzedDrafts.length > 0
                    ? ` 거절하면 이미 분석된 지문은 제외하고 ${pendingUnanalyzedDrafts.length}개만 진행합니다.`
                    : " 거절하면 이번 일괄 분석은 취소됩니다."}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={rejectReanalysis}>
                거절
              </AlertDialogCancel>
              <AlertDialogAction onClick={approveReanalysis}>
                승인
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
        const analysisDiff = Number(aFullyAnalyzed) - Number(bFullyAnalyzed);
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
