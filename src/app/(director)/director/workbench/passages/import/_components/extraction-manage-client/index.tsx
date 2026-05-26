"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  CopyMinus,
  Database,
  Grid2X2,
  Grid3X3,
  Layers,
  List,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

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

import { DraftCard } from "./components/draft-card";
import { DraftDetailModal } from "./components/draft-detail-modal";
import { DraftFolderSection } from "./components/draft-folder-section";
import { DraftGrid } from "./components/draft-grid";
import { DraftSelectionToolbar } from "./components/draft-selection-toolbar";
import { JobCard } from "@/components/workbench/shared/job-card";
import { JobReviewModal } from "./components/job-review-modal";
import { ManageFiltersBar } from "./components/manage-filters-bar";
import { RootDropPlaceholder } from "./components/root-drop-placeholder";
import { ViewToggleButton } from "./components/view-toggle-button";
import { useBulkActions } from "./hooks/use-bulk-actions";
import { useDraftActions } from "./hooks/use-draft-actions";
import { useDraftDisplay } from "./hooks/use-draft-display";
import { useDraftsData } from "./hooks/use-drafts-data";

interface ExtractionManageClientProps {
  academyId: string;
  initialCollections: CollectionItem[];
  initialCollectionMembership: Record<string, Set<string>>;
}

export function ExtractionManageClient({
  academyId,
  initialCollections,
  initialCollectionMembership,
}: ExtractionManageClientProps) {
  void academyId;

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
    setDrafts: data.setDrafts,
    setSelectedDraftDetail: data.setSelectedDraftDetail,
    closeDraftDetail: data.closeDraftDetail,
    setError: data.setError,
    refreshQueueDrawer: queueDrawer.triggerRefresh,
  });
  const bulk = useBulkActions({
    setDrafts: data.setDrafts,
    setError: data.setError,
    refreshQueueDrawer: queueDrawer.triggerRefresh,
  });

  // ─── Bootstrap ───
  useEffect(() => {
    if (data.bootstrapped.current) return;
    data.bootstrapped.current = true;
    const nextJobId =
      typeof window === "undefined"
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
  const getDisplayedIds = useCallback(
    () => display.displayedDrafts.map((d) => d.id),
    [display.displayedDrafts],
  );
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
  } = useSelection(getDisplayedIds);

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
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    display.setJobFilter(new Set());
    void data.loadAllDrafts();
  }, [data, display]);

  const navigateToFolderView = useCallback(
    (folderId: string | null) => {
      folders.navigateToFolder(folderId);
      display.setJobFilter(new Set());
      data.setResultScope("all");
      data.setJobId(null);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
      clearSelection();
    },
    [folders, display, data, clearSelection],
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
      />

      <button
        type="button"
        onClick={() => void bulk.bulkRerestore(actionTargetIds, clearActionSelection)}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRerestoring ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        AI 복원 다시
      </button>

      <button
        type="button"
        onClick={() => void bulk.bulkDelete(actionTargetIds, clearActionSelection)}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDeleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        삭제
      </button>
    </>
  );

  const filtersToolbar = (
    <ManageFiltersBar
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
      className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPromoting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      지문 등록
    </button>
  );

  const isAllSelected =
    actionTargetIds.size > 0 &&
    actionTargetIds.size === display.displayedDrafts.length;

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] min-w-0 flex-col bg-[#F4F6F9]">
      <div className="flex h-full w-full min-w-0 flex-col">
        {data.error ? (
          <div className="mx-6 mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 sm:mx-8">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{data.error}</span>
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {display.availableJobs.length > 0 ? (
            <div className="shrink-0 px-6 pt-2 sm:px-8">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-1">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <h3 className="truncate text-[13px] font-bold text-slate-900">
                    추출 작업 목록
                  </h3>
                  <span className="shrink-0 text-[11px] font-medium text-slate-400 tabular-nums">
                    · {display.availableJobs.length}개
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

          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-2 pb-2 sm:px-8 sm:pb-3">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="shrink-0">
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
                      <Database
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    ),
                    title: "전체 자료",
                    totalCount:
                      data.resultScope === "all" &&
                      folders.activeFolder === null
                        ? display.serverVisibleDraftTotal || data.drafts.length
                        : draftsInActiveFolder.length,
                    itemLabel: "자료",
                    description:
                      "업로드한 자료 단위로 확인한 뒤, 아래 자료 영역으로 옮겨 저장하세요.",
                  }}
                  resultScope={data.resultScope}
                  onBackToAllResults={showAllResults}
                />
              </div>

              {folders.activeFolder === null &&
              data.resultScope === "all" &&
              display.pageMode !== "duplicates" ? (
              <div className="shrink-0 border-t border-slate-200 bg-slate-50/40 px-4 py-2">
                <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h3 className="shrink-0 text-sm font-bold tracking-tight text-slate-700">
                    자료
                    <span className="ml-1.5 text-xs font-normal tabular-nums text-slate-400">
                      {display.displayedDrafts.length}개
                    </span>
                  </h3>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {filtersToolbar}
                  </div>
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
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/95">
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
                </div>
              </div>
              ) : null}

              {folders.activeFolder === null &&
              data.resultScope === "all" &&
              display.pageMode !== "duplicates" ? (
              <RootDropPlaceholder onDrop={handleDragToRoot} />
              ) : (
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-t border-slate-200 bg-slate-50/40 px-4 pb-3 sm:px-5">
                {display.pageMode === "duplicates" ? (
              <section className="space-y-4 pt-3">
                <div className="flex items-center gap-2">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                    중복 그룹 모아보기
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      그룹 {display.dupInfo.groupCount}개 · 중복 자료{" "}
                      {display.dupInfo.totalDuplicateCount}개
                    </span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => display.setPageMode("list")}
                    className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                    목록으로
                  </button>
                </div>

                {display.dupInfo.groups.length === 0 ? (
                  <div className="rounded-xl border bg-white py-16 text-center">
                    <CopyMinus className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                    <p className="font-medium text-slate-500">
                      중복 자료가 없습니다
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      총 {data.drafts.length}개 자료를 검사했습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {display.dupInfo.groups.map((group, groupIndex) => (
                      <section
                        key={group.key}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/40 px-4 py-2.5">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                            <Copy className="h-3 w-3" />
                          </span>
                          <h4 className="text-[12.5px] font-bold text-slate-800">
                            그룹 {groupIndex + 1}
                          </h4>
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700">
                            {group.items.length}개 동일
                          </span>
                          <span className="ml-auto max-w-[400px] truncate text-[10.5px] text-slate-400">
                            {group.items[0]?.title ?? "(제목 없음)"}
                          </span>
                        </header>
                        <div className="p-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {group.items.map((draft, index) => (
                              <DraftCard
                                key={draft.id}
                                draft={draft}
                                index={index}
                                selected={false}
                                active={data.selectedDraftId === draft.id}
                                recentlyViewed={
                                  data.selectedDraftId !== draft.id &&
                                  data.lastViewedDraftId === draft.id
                                }
                                checked={selectedIds.has(draft.id)}
                                onClick={() => data.openDraftDetail(draft.id)}
                                onToggleCheck={() => toggleSelect(draft.id)}
                                dupCount={group.items.length - 1}
                                unfiled={!filedDraftIds.has(draft.id)}
                              />
                            ))}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <DraftGrid
                drafts={display.displayedDrafts}
                loading={data.loadingDetails && data.drafts.length === 0}
                hasAnyDraft={data.drafts.length > 0}
                inFolder={folders.activeFolder !== null}
                hasActiveSearchOrFilter={display.hasActiveSearchOrFilter}
                selectedDraftId={data.selectedDraftId}
                lastViewedDraftId={data.lastViewedDraftId}
                checkedIds={selectedIds}
                gridCols={display.gridCols}
                onGridColsChange={display.setGridCols}
                onSelectDraft={data.openDraftDetail}
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
                    if (typeof window !== "undefined") {
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
                onRenameSourceMaterial={actions.renameSourceMaterial}
                groupIndexBySourceMaterialId={
                  display.groupIndexBySourceMaterialId
                }
                dupCountById={display.dupInfo.countById}
                filedDraftIds={
                  folders.activeFolder === null ? filedDraftIds : undefined
                }
                filtersToolbar={filtersToolbar}
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
            )}
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
            dupCountById={display.dupInfo.countById}
          />
        ) : null}

        {selectedDraft ? (
          <DraftDetailModal
            draft={selectedDraft}
            savingId={actions.savingId}
            rerestoringId={actions.rerestoringId}
            deletingDraftId={actions.deletingDraftId}
            promotingId={actions.promotingId}
            onClose={data.closeDraftDetail}
            onDelete={actions.deleteDraft}
            onRerestore={actions.rerestoreDraft}
            onSave={actions.saveDraft}
            onPromote={actions.promoteDraft}
            onTextChange={actions.updateDraftText}
            onTitleChange={actions.updateDraftTitle}
          />
        ) : null}
      </div>
    </div>
  );
}
