"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

import { ExtractionTaskListIcon } from "@/components/icons/workflow-icons";
import {
  addDraftsToCollection,
  createM1DraftCollection,
  deleteM1DraftCollection,
  removeDraftsFromCollection,
  updateM1DraftCollection,
} from "@/actions/workbench";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/hooks/use-selection";

import { useQueueDrawer } from "../queue-drawer-context";

import { DraftDetailModal } from "./components/draft-detail-modal";
import { DraftFolderSection } from "./components/draft-folder-section";
import { DraftGrid } from "./components/draft-grid";
import { DraftSelectionToolbar } from "./components/draft-selection-toolbar";
import { JobCard } from "@/components/workbench/shared/job-card";
import { JobReviewModal } from "./components/job-review-modal";
import { ManageFiltersBar } from "./components/manage-filters-bar";
import {
  ManageFiltersBarTasks,
  type TaskSortOrder,
  type TaskStatusFilter,
} from "./components/manage-filters-bar-tasks";
import {
  TaskQueueInlineList,
  type BaseTask,
} from "@/components/workbench/task-queue";
import { ViewToggleButton } from "./components/view-toggle-button";
import { useBulkActions } from "./hooks/use-bulk-actions";
import { useDraftActions } from "./hooks/use-draft-actions";
import { useDraftDisplay } from "./hooks/use-draft-display";
import { useDraftsData } from "./hooks/use-drafts-data";
import type { M1PassageDraftWithJob } from "./types";

interface ExtractionManageClientProps {
  academyId: string;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
  /** When true, drop the page-bleed wrapper (-m-6) and render inside a
   *  scrollable container that fits its parent. Used when embedding this
   *  surface as a left-column picker (e.g. in 지문 분석 - 새 지문 등록). */
  embedded?: boolean;
  /** When provided, clicking a draft card calls this callback instead of
   *  opening the built-in DraftDetailModal. Used by embedders that want to
   *  use draft selection as a picker for an external editor. */
  onSelectDraftExternal?: (draft: M1PassageDraftWithJob) => void;
  /** Highlighted draft id when an external picker controls selection. */
  selectedExternalDraftId?: string | null;
}

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


const TASK_SORT_ORDER_STORAGE_KEY =
  "smoat:extraction-manage:task-sort-order";
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

export function ExtractionManageClient({
  academyId,
  initialCollections,
  initialCollectionMembership,
  embedded = false,
  onSelectDraftExternal,
  selectedExternalDraftId = null,
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

  // ─── Filter state for the "전체 자료" (tasks) view ───
  // Task domain has its own status vocabulary and no dedup concept, so it
  // gets a parallel set of controls rather than sharing with the draft bar.
  const [taskSearchValue, setTaskSearchValue] = useState("");
  const [taskAppliedSearch, setTaskAppliedSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] =
    useState<TaskStatusFilter>("ALL");
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
  const JOB_ROW_MIN = 40;
  const JOB_ROW_MAX = 320;
  const JOB_ROW_DEFAULT = 96;
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
  });

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

  const clearActionSelection = useCallback(() => {
    if (selectedIds.size > 0) {
      clearSelection();
      return;
    }
    if (display.jobFilter.size > 0) {
      display.setJobFilter(new Set());
    }
  }, [clearSelection, display, selectedIds.size]);

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
        onClick={() => void bulk.bulkRerestore(actionTargetIds, clearActionSelection)}
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
        onClick={() => void bulk.bulkDelete(actionTargetIds, clearActionSelection)}
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

  const filtersToolbar = (
    <ManageFiltersBar
      compact={embedded}
      searchValue={display.searchValue}
      onSearchChange={display.setSearchValue}
      onSearchSubmit={() => display.setAppliedSearch(display.searchValue)}
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
  );

  const promoteAction = (
    <button
      type="button"
      onClick={() => void bulk.bulkPromote(actionTargetIds, clearActionSelection)}
      disabled={anyBulkRunning || noSelection}
      title={embedded ? "검수완료" : undefined}
      aria-label={embedded ? "검수완료" : undefined}
      className={
        embedded
          ? "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-emerald-600 text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          : "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {isPromoting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {embedded ? null : "검수완료"}
    </button>
  );

  const totalSelectableCount = isAllMaterialsView
    ? visibleTasks.reduce(
        (sum, task) => sum + (draftIdsByJobId.get(task.id)?.length ?? 0),
        0,
      )
    : display.displayedDrafts.length;

  const isAllSelected =
    actionTargetIds.size > 0 &&
    actionTargetIds.size === totalSelectableCount;

  // Pin the top sections (job list, folder header, filters toolbar) in both
  // 전체 자료 and folder/drafts views. The page wrapper scrolls in both views
  // so sticky positions resolve against the same scroll container.
  const shouldPinManageHeaders = true;
  const hasStickyJobList =
    !embedded &&
    shouldPinManageHeaders &&
    display.availableJobs.length > 0;
  const [jobListStickyRef, jobListStickyHeight] = useMeasuredHeight(
    hasStickyJobList,
  );
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(
    shouldPinManageHeaders,
  );
  const folderStickyTop = hasStickyJobList ? jobListStickyHeight : 0;
  const materialToolbarStickyTop = shouldPinManageHeaders
    ? folderStickyTop + folderStickyHeight
    : 0;

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 min-w-0 flex-col overflow-y-auto"
          : "-m-6 flex min-h-[calc(100%+3rem)] min-w-0 flex-col bg-[#F4F6F9]"
      }
    >
      <div
        className={
          "flex w-full min-w-0 flex-col" +
          (embedded ? " min-h-0 flex-1" : "")
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
            "flex min-w-0 flex-col" +
            (embedded ? " min-h-0 flex-1" : "")
          }
        >
          {!embedded && display.availableJobs.length > 0 ? (
            <div
              ref={jobListStickyRef}
              className={
                "shrink-0 px-6 pt-2 sm:px-8 " +
                (shouldPinManageHeaders
                  ? "sticky top-0 z-40 bg-[#F4F6F9]"
                  : "")
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
                : "flex min-w-0 flex-col px-6 pb-2 pt-2 sm:px-8 sm:pb-3"
            }
          >
            <section
              className={
                "flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm" +
                (embedded ? " min-h-0 flex-1" : "")
              }
            >
              <div
                ref={folderStickyRef}
                style={
                  shouldPinManageHeaders ? { top: folderStickyTop } : undefined
                }
                className={
                  "shrink-0 overflow-hidden rounded-t-2xl " +
                  (shouldPinManageHeaders ? "sticky z-30 bg-white" : "")
                }
              >
                <DraftFolderSection
                  embedded
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
                />
              </div>

              {isAllMaterialsView ? (
              <div
                style={{ top: materialToolbarStickyTop }}
                className="sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90"
              >
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/95">
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
                    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
                      <ManageFiltersBarTasks
                        variant="filters-only"
                        compact={embedded}
                        searchValue={taskSearchValue}
                        onSearchChange={setTaskSearchValue}
                        onSearchSubmit={() =>
                          setTaskAppliedSearch(taskSearchValue)
                        }
                        statusFilter={taskStatusFilter}
                        onStatusFilterChange={setTaskStatusFilter}
                        sortOrder={taskSortOrder}
                        onSortOrderChange={setTaskSortOrder}
                      />
                      <ManageFiltersBarTasks
                        variant="search-only"
                        compact={embedded}
                        searchValue={taskSearchValue}
                        onSearchChange={setTaskSearchValue}
                        onSearchSubmit={() =>
                          setTaskAppliedSearch(taskSearchValue)
                        }
                        statusFilter={taskStatusFilter}
                        onStatusFilterChange={setTaskStatusFilter}
                        sortOrder={taskSortOrder}
                        onSortOrderChange={setTaskSortOrder}
                      />
                      {!embedded ? (
                        <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-slate-200">
                          <ViewToggleButton
                            active={display.gridCols === "grid3"}
                            label="3열 보기"
                            onClick={() => display.setGridCols("grid3")}
                          >
                            <Grid3X3 className="size-4" />
                          </ViewToggleButton>
                          <ViewToggleButton
                            active={display.gridCols === "grid2"}
                            label="2열 보기"
                            onClick={() => display.setGridCols("grid2")}
                            middle
                          >
                            <Grid2X2 className="size-4" />
                          </ViewToggleButton>
                          <ViewToggleButton
                            active={display.gridCols === "list"}
                            label="목록 보기"
                            onClick={() => display.setGridCols("list")}
                          >
                            <List className="size-4" />
                          </ViewToggleButton>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              ) : null}

              {isAllMaterialsView ? (
                embedded ? (
                  <EmbeddedJobCardGrid
                    jobs={display.availableJobs}
                    searchQuery={taskAppliedSearch}
                    statusFilter={taskStatusFilter}
                    sortOrder={taskSortOrder}
                    reviewingJobId={reviewingJobId}
                    onOpenJob={setReviewingJobId}
                    onRenameJob={actions.renameJob}
                    onVisibleJobsChange={setVisibleTasks}
                  />
                ) : (
                  <div className="min-w-0 rounded-b-2xl border-t border-slate-200 bg-slate-50/40 px-4 pb-3 pt-3 sm:px-5">
                    <TaskQueueInlineList
                      domain="extraction"
                      layout="grid"
                      limit={100}
                      bare
                      viewMode={
                        display.gridCols === "grid3"
                          ? "grid-3"
                          : display.gridCols === "grid2"
                            ? "grid-2"
                            : "list"
                      }
                      onViewModeChange={(mode) =>
                        display.setGridCols(
                          mode === "grid-3"
                            ? "grid3"
                            : mode === "grid-2"
                              ? "grid2"
                              : "list",
                        )
                      }
                      onTaskClick={(task) => setReviewingJobId(task.id)}
                      searchQuery={taskAppliedSearch}
                      statusFilter={taskStatusFilter}
                      sortOrder={taskSortOrder}
                      onVisibleTasksChange={setVisibleTasks}
                      isTaskChecked={isTaskChecked}
                      onToggleTaskCheck={onToggleTaskCheck}
                      getTaskDragData={getTaskDragData}
                      getTaskDragCount={getTaskDragCount}
                      onRenameTask={(task, next) =>
                        actions.renameJob(task.id, next.length > 0 ? next : null)
                      }
                    />
                  </div>
                )
              ) : (
              <div
                className={
                  "flex min-w-0 flex-col rounded-b-2xl border-t border-slate-200 bg-slate-50/40 px-4 pb-3 sm:px-5" +
                  (embedded ? " min-h-0 flex-1" : "")
                }
              >
              <DraftGrid
                drafts={display.displayedDrafts}
                loading={data.loadingDetails && data.drafts.length === 0}
                hasAnyDraft={data.drafts.length > 0}
                inFolder={folders.activeFolder !== null}
                hasActiveSearchOrFilter={display.hasActiveSearchOrFilter}
                stickyTop={materialToolbarStickyTop}
                selectedDraftId={
                  externallyPicking ? selectedExternalDraftId : data.selectedDraftId
                }
                lastViewedDraftId={data.lastViewedDraftId}
                checkedIds={selectedIds}
                gridCols={display.gridCols}
                onGridColsChange={display.setGridCols}
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
                onSelectJob={(nextJobId) => {
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
                }}
                onRenameJob={actions.renameJob}
                onRenameDraft={actions.updateDraftTitle}
                onRenameSourceMaterial={actions.renameSourceMaterial}
                groupIndexBySourceMaterialId={
                  display.groupIndexBySourceMaterialId
                }
                dupCountById={display.dupInfo.countById}
                filedDraftIds={
                  folders.activeFolder === null ? filedDraftIds : undefined
                }
                filtersToolbar={filtersToolbar}
                onDropDraftsIntoCurrentFolder={
                  folders.activeFolder
                    ? (itemId, copy) =>
                        handleDragToFolder(itemId, folders.activeFolder!, copy)
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
  sortOrder,
  reviewingJobId,
  onOpenJob,
  onRenameJob,
  onVisibleJobsChange,
}: {
  jobs: AvailableJob[];
  searchQuery: string;
  statusFilter: TaskStatusFilter;
  sortOrder: TaskSortOrder;
  reviewingJobId: string | null;
  onOpenJob: (jobId: string) => void;
  onRenameJob: (jobId: string, next: string | null) => void | Promise<void>;
  onVisibleJobsChange: (tasks: BaseTask[]) => void;
}) {
  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let next = jobs.filter((j) => {
      if (q && !j.label.toLowerCase().includes(q)) return false;
      if (statusFilter !== "ALL") {
        if (mapJobStatusToTaskStatus(j.status) !== statusFilter) return false;
      }
      return true;
    });
    next = [...next].sort((a, b) => {
      switch (sortOrder) {
        case "name_asc":
          return a.label.localeCompare(b.label);
        case "name_desc":
          return b.label.localeCompare(a.label);
        case "oldest":
          return (a.createdAt ?? 0) - (b.createdAt ?? 0);
        case "newest":
        default:
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      }
    });
    return next;
  }, [jobs, searchQuery, statusFilter, sortOrder]);

  useEffect(() => {
    const tasks: BaseTask[] = filteredJobs.map((j) => ({
      id: j.jobId,
      domain: "extraction",
      title: j.label,
      subtitle: j.subLabel ?? "",
      status: mapJobStatusToTaskStatus(j.status),
      createdAt:
        j.createdAt !== null
          ? new Date(j.createdAt).toISOString()
          : new Date(0).toISOString(),
      thumbnailUrl: j.thumbnailUrl ?? null,
    }));
    onVisibleJobsChange(tasks);
  }, [filteredJobs, onVisibleJobsChange]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-b-2xl border-t border-slate-200 bg-slate-50/40 px-3 pb-3 pt-3">
      {filteredJobs.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-[12px] font-medium text-slate-400">
          표시할 자료가 없습니다.
        </div>
      ) : (
        <div className="flex flex-wrap items-stretch gap-3">
          {filteredJobs.map((job) => (
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
              onClick={() => onOpenJob(job.jobId)}
              onRename={(next) => onRenameJob(job.jobId, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
