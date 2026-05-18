"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  CopyMinus,
  Database,
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
import { ManageFiltersBar } from "./components/manage-filters-bar";
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

  // ─── Folder-aware drafts subset ───
  const draftsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return data.drafts;
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
      if (nextJobId) {
        const next = new Set([nextJobId]);
        display.setJobFilter(next);
        await data.loadJobDetails(nextJobId);
      }
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

  const refreshResults = useCallback(() => {
    queueDrawer.triggerRefresh();
    if (display.jobFilter.size === 1) {
      const [nextJobId] = Array.from(display.jobFilter);
      void data.loadJobDetails(nextJobId);
    } else if (display.jobFilter.size > 1)
      void data.loadJobsDetails(display.jobFilter);
    else void data.loadAllDrafts();
  }, [data, display.jobFilter, queueDrawer]);

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
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
        onClick={() => void bulk.bulkPromote(actionTargetIds, clearActionSelection)}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPromoting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        지문 등록
      </button>

      <button
        type="button"
        onClick={() => void bulk.bulkDelete(actionTargetIds, clearActionSelection)}
        disabled={anyBulkRunning || noSelection}
        className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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
      queueOpen={queueDrawer.open}
      onToggleQueue={queueDrawer.toggle}
      onRefresh={refreshResults}
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

  const isAllSelected =
    actionTargetIds.size > 0 &&
    actionTargetIds.size === display.displayedDrafts.length;

  return (
    <div className="-m-6 flex h-[calc(100vh-56px)] min-w-0 flex-col bg-[#F4F6F9]">
      <div className="mx-auto flex h-full w-full min-w-0 max-w-[1680px] flex-col">
        {data.error ? (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 sm:mx-8">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{data.error}</span>
          </div>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-6 pt-3 pb-2 sm:px-8">
            <DraftFolderSection
              childFolders={folders.childFolders}
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
              toolbar={filtersToolbar}
              selectionBar={
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
                />
              }
              pageHeader={{
                icon: <Database className="h-3.5 w-3.5" aria-hidden="true" />,
                title: "자료 관리",
                totalCount:
                  data.resultScope === "all" && folders.activeFolder === null
                    ? display.serverVisibleDraftTotal || data.drafts.length
                    : draftsInActiveFolder.length,
                itemLabel: "자료",
                description:
                  "추출한 지문을 폴더로 정리하고 복원문을 검수합니다.",
              }}
              resultScope={data.resultScope}
              onBackToAllResults={showAllResults}
            />
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-5 sm:px-8 sm:pb-6">
            {display.pageMode === "duplicates" ? (
              <section className="space-y-4 pt-2">
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
                                checked={selectedIds.has(draft.id)}
                                onClick={() => data.openDraftDetail(draft.id)}
                                onToggleCheck={() => toggleSelect(draft.id)}
                                dupCount={group.items.length - 1}
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
              />
            )}
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
