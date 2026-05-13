"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FolderPlus, PanelBottomOpen } from "lucide-react";
import { toast } from "sonner";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";
import {
  addDraftsToCollection,
  createM1DraftCollection,
  deleteM1DraftCollection,
  removeDraftsFromCollection,
  updateM1DraftCollection,
} from "@/actions/workbench";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { SelectionToolbar } from "@/components/workbench/shared/selection-toolbar";
import type { CollectionItem } from "@/components/workbench/shared/types";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/hooks/use-selection";

import { DetailPanel } from "./components/detail-panel";
import { DraftGrid, type GridCols } from "./components/draft-grid";
import {
  ManageHeader,
  type SortOrder,
  type StatusFilter,
} from "./components/manage-header";
import { QueueDrawer } from "./components/queue-drawer";
import type {
  JobDetailResponse,
  M1DraftJobSummary,
  M1PassageDraftWithJob,
} from "./types";

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

  // ─── Data state ───
  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rerestoringId, setRerestoringId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [resultScope, setResultScope] = useState<"all" | "job">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  // ─── UI state ───
  const [queueOpen, setQueueOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [gridCols, setGridCols] = useState<GridCols>(3);
  const [addToFolderOpen, setAddToFolderOpen] = useState(false);
  const addToFolderRef = useRef<HTMLDivElement>(null);

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

  // ─── Data fetchers ───
  const loadJobDetails = useCallback(async (nextJobId: string) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/jobs/" + nextJobId, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("작업 정보를 불러오지 못했습니다.");

      const data = (await res.json()) as JobDetailResponse;
      const jobSummary: M1DraftJobSummary = {
        id: data.job.id,
        originalFileName: data.job.originalFileName,
        totalPages: data.job.totalPages,
        status: data.job.status,
        createdAt: data.job.createdAt,
        completedAt: data.job.completedAt,
        pages: (data.pages ?? []).map((page) => ({
          pageIndex: page.pageIndex,
          sourceFileName: page.sourceFileName ?? null,
        })),
      };
      const nextDrafts = data.m1PassageDrafts.map((draft) => ({
        ...draft,
        job: jobSummary,
      }));
      setDrafts(nextDrafts);
      setSelectedDraftId(nextDrafts[0]?.id ?? null);
      setResultScope("job");
      setJobId(nextJobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadAllDrafts = useCallback(async () => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("자료 목록을 불러오지 못했습니다.");

      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
      setSelectedDraftId(data.drafts[0]?.id ?? null);
      setResultScope("all");
      setJobId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "자료 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // ─── Bootstrap ───
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const nextJobId =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("jobId");
    if (nextJobId) {
      void loadJobDetails(nextJobId);
      return;
    }
    void loadAllDrafts();
  }, [loadAllDrafts, loadJobDetails]);

  // ─── Silent polling for PENDING restoration ───
  const pollJobSilent = useCallback(async (nextJobId: string) => {
    try {
      const res = await fetch("/api/extraction/jobs/" + nextJobId, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as JobDetailResponse;
      const jobSummary: M1DraftJobSummary = {
        id: data.job.id,
        originalFileName: data.job.originalFileName,
        totalPages: data.job.totalPages,
        status: data.job.status,
        createdAt: data.job.createdAt,
        completedAt: data.job.completedAt,
        pages: (data.pages ?? []).map((page) => ({
          pageIndex: page.pageIndex,
          sourceFileName: page.sourceFileName ?? null,
        })),
      };
      setDrafts(data.m1PassageDrafts.map((draft) => ({ ...draft, job: jobSummary })));
    } catch {
      /* polling errors are non-fatal */
    }
  }, []);

  const pollAllSilent = useCallback(async () => {
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
    } catch {
      /* polling errors are non-fatal */
    }
  }, []);

  const hasPendingDrafts = useMemo(
    () => drafts.some((draft) => draft.restorationStatus === "PENDING"),
    [drafts],
  );

  useEffect(() => {
    if (!hasPendingDrafts) return;
    const POLL_INTERVAL_MS = 4000;
    const id = window.setInterval(() => {
      if (resultScope === "job" && jobId) void pollJobSilent(jobId);
      else void pollAllSilent();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasPendingDrafts, resultScope, jobId, pollJobSilent, pollAllSilent]);

  // ─── Navigation actions ───
  const showAllResults = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    void loadAllDrafts();
  }, [loadAllDrafts]);

  const refreshResults = useCallback(() => {
    setQueueRefreshKey((value) => value + 1);
    if (resultScope === "job" && jobId) void loadJobDetails(jobId);
    else void loadAllDrafts();
  }, [jobId, loadAllDrafts, loadJobDetails, resultScope]);

  const openJob = useCallback(
    (nextJobId: string) => {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "?jobId=" + nextJobId);
      }
      void loadJobDetails(nextJobId);
    },
    [loadJobDetails],
  );

  // ─── CRUD ───
  const updateDraftText = useCallback((id: string, teacherText: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, teacherText } : draft)),
    );
  }, []);

  const saveDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setSavingId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title ?? null,
          teacherText: draft.teacherText,
        }),
      });
      if (!res.ok) throw new Error("수정 내용을 저장하지 못했습니다.");
      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id ? { ...item, ...data.draft } : item,
        ),
      );
      toast.success("저장되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 내용을 저장하지 못했습니다.");
    } finally {
      setSavingId(null);
    }
  }, []);

  const rerestoreDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setRerestoringId(draft.id);
    setError(null);
    try {
      const res = await fetch(
        "/api/extraction/m1-passages/" + draft.id + "/rerestore",
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "AI 복원을 다시 실행하지 못했습니다.");
      }
      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id ? { ...item, ...data.draft } : item,
        ),
      );
      setQueueRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 복원을 다시 실행하지 못했습니다.");
    } finally {
      setRerestoringId(null);
    }
  }, []);

  const deleteDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("이 추출 지문을 삭제할까요?");
      if (!ok) return;

      setDeletingDraftId(draft.id);
      setError(null);
      try {
        const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("지문을 삭제하지 못했습니다.");
        setDrafts((current) => {
          const next = current.filter((item) => item.id !== draft.id);
          setSelectedDraftId((selected) =>
            selected === draft.id ? next[0]?.id ?? null : selected,
          );
          return next;
        });
        setQueueRefreshKey((value) => value + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "지문을 삭제하지 못했습니다.");
      } finally {
        setDeletingDraftId(null);
      }
    },
    [],
  );

  // ─── Folder filtering + search/filter/sort ───
  const draftsInActiveFolder = useMemo(() => {
    if (folders.activeFolder === null) return drafts;
    const ids = folders.membership[folders.activeFolder];
    if (!ids) return [];
    return drafts.filter((d) => ids.has(d.id));
  }, [drafts, folders.activeFolder, folders.membership]);

  const displayedDrafts = useMemo(() => {
    let result = draftsInActiveFolder;

    if (appliedSearch.trim()) {
      const q = appliedSearch.toLowerCase();
      result = result.filter((d) => {
        const title = (d.title ?? "").toLowerCase();
        const raw = d.rawText.toLowerCase();
        const fileName = d.job?.originalFileName?.toLowerCase() ?? "";
        return title.includes(q) || raw.includes(q) || fileName.includes(q);
      });
    }

    if (statusFilter !== "ALL") {
      result = result.filter((d) => d.restorationStatus === statusFilter);
    }

    const sorted = [...result];
    if (sortOrder === "newest") {
      sorted.sort((a, b) => {
        const aDate = new Date(a.createdAt as unknown as string).getTime();
        const bDate = new Date(b.createdAt as unknown as string).getTime();
        return bDate - aDate;
      });
    } else if (sortOrder === "oldest") {
      sorted.sort((a, b) => {
        const aDate = new Date(a.createdAt as unknown as string).getTime();
        const bDate = new Date(b.createdAt as unknown as string).getTime();
        return aDate - bDate;
      });
    } else if (sortOrder === "page_asc") {
      sorted.sort((a, b) => {
        const aPage = a.sourcePageIndex[0] ?? 0;
        const bPage = b.sourcePageIndex[0] ?? 0;
        return aPage - bPage;
      });
    }
    return sorted;
  }, [draftsInActiveFolder, appliedSearch, statusFilter, sortOrder]);

  const selectedDraft = useMemo(
    () =>
      displayedDrafts.find((d) => d.id === selectedDraftId) ??
      drafts.find((d) => d.id === selectedDraftId) ??
      displayedDrafts[0] ??
      null,
    [displayedDrafts, drafts, selectedDraftId],
  );

  // ─── Selection ───
  const getDisplayedIds = useCallback(
    () => displayedDrafts.map((d) => d.id),
    [displayedDrafts],
  );
  const { selectedIds, toggleSelect, selectAll, clearSelection } =
    useSelection(getDisplayedIds);

  const handleRemoveFromFolderClick = useCallback(async () => {
    const ok = await folders.handleRemoveFromFolder(selectedIds);
    if (ok) clearSelection();
  }, [folders, selectedIds, clearSelection]);

  const handleAddToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folders.handleAddToFolder(collectionId, selectedIds);
      if (ok) {
        clearSelection();
        setAddToFolderOpen(false);
      }
    },
    [folders, selectedIds, clearSelection],
  );

  const handleDragToFolder = useCallback(
    async (itemId: string, folderId: string, copy: boolean) => {
      await folders.handleDragToFolder(itemId, folderId, copy, selectedIds);
    },
    [folders, selectedIds],
  );

  // ─── Close "Add to folder" dropdown on outside click ───
  useEffect(() => {
    if (!addToFolderOpen) return;
    function handleClick(e: MouseEvent) {
      if (addToFolderRef.current && !addToFolderRef.current.contains(e.target as Node)) {
        setAddToFolderOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addToFolderOpen]);

  // ─── Search submission ───
  const handleSearchSubmit = useCallback(() => {
    setAppliedSearch(searchValue);
  }, [searchValue]);

  const resetFilters = useCallback(() => {
    setSearchValue("");
    setAppliedSearch("");
    setStatusFilter("ALL");
    setSortOrder("newest");
  }, []);

  // ─── Selection toolbar extra actions ───
  const selectionExtraActions = (
    <div ref={addToFolderRef} className="relative">
      <button
        type="button"
        onClick={() => setAddToFolderOpen((v) => !v)}
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-blue-200 bg-white px-2.5 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-50"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        폴더에 추가
      </button>
      {addToFolderOpen ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {folders.collections.length === 0 ? (
            <div className="px-2 py-2 text-[11px] text-slate-400">
              먼저 폴더를 만들어주세요.
            </div>
          ) : (
            folders.collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleAddToFolder(c.id)}
                className="block w-full cursor-pointer truncate rounded px-2 py-1.5 text-left text-[12px] text-slate-700 hover:bg-slate-50"
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );

  const hasActiveSearchOrFilter =
    appliedSearch.trim().length > 0 || statusFilter !== "ALL";
  const isAllSelected =
    selectedIds.size > 0 && selectedIds.size === displayedDrafts.length;

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-[#F4F6F9]">
      <ManageHeader
        totalCount={drafts.length}
        selectedJobId={jobId}
        resultScope={resultScope}
        activeFolder={folders.activeFolder}
        breadcrumbPath={folders.breadcrumbPath}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={handleSearchSubmit}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        queueOpen={queueOpen}
        onToggleQueue={() => setQueueOpen((v) => !v)}
        onRefresh={refreshResults}
        onBackToAllResults={showAllResults}
        onNavigateUp={() => {
          folders.navigateUp();
          clearSelection();
        }}
        onNavigateToFolder={(id) => {
          folders.navigateToFolder(id);
          clearSelection();
        }}
      />

      <SelectionToolbar
        selectedCount={selectedIds.size}
        totalCount={displayedDrafts.length}
        isAllSelected={isAllSelected}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        activeFolder={folders.activeFolder}
        onRemoveFromFolder={handleRemoveFromFolderClick}
        extraActions={selectionExtraActions}
      />

      {error ? (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <FolderSection
          childFolders={folders.childFolders}
          activeFolder={folders.activeFolder}
          dragItemType="draft"
          dragItemIdKey="draftId"
          itemCountLabel="자료"
          showNewFolder={folders.showNewFolder}
          newFolderName={folders.newFolderName}
          onNewFolderNameChange={folders.setNewFolderName}
          onShowNewFolder={folders.setShowNewFolder}
          onCreateFolder={folders.handleCreateFolder}
          onNavigateToFolder={(id) => {
            folders.navigateToFolder(id);
            clearSelection();
          }}
          onRenameFolder={folders.handleRenameFolder}
          onDeleteFolder={folders.handleDeleteFolder}
          onDragToFolder={handleDragToFolder}
          breadcrumbPath={folders.breadcrumbPath}
          onNavigateToRoot={() => {
            folders.setActiveFolder(null);
            clearSelection();
          }}
        />

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(540px,0.95fr)]">
          <DraftGrid
            drafts={displayedDrafts}
            loading={loadingDetails && drafts.length === 0}
            hasAnyDraft={drafts.length > 0}
            inFolder={folders.activeFolder !== null}
            hasActiveSearchOrFilter={hasActiveSearchOrFilter}
            selectedDraftId={selectedDraft?.id ?? null}
            checkedIds={selectedIds}
            gridCols={gridCols}
            onGridColsChange={setGridCols}
            onSelectDraft={setSelectedDraftId}
            onToggleCheck={toggleSelect}
            onResetFilters={resetFilters}
          />

          <DetailPanel
            selectedDraft={selectedDraft}
            loading={loadingDetails && drafts.length === 0}
            busy={false}
            savingId={savingId}
            rerestoringId={rerestoringId}
            deletingDraftId={deletingDraftId}
            onDelete={deleteDraft}
            onRerestore={rerestoreDraft}
            onSave={saveDraft}
            onTextChange={updateDraftText}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setQueueOpen((v) => !v)}
        className={
          "fixed bottom-24 right-8 z-40 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg transition-all " +
          (queueOpen
            ? "border-blue-500 bg-blue-600 text-white"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
        }
      >
        <PanelBottomOpen className="size-4" aria-hidden="true" />
        작업 목록
      </button>

      <QueueDrawer
        open={queueOpen}
        activeJobId={jobId}
        refreshKey={queueRefreshKey}
        onClose={() => setQueueOpen(false)}
        onDeleteActiveJob={showAllResults}
        onOpenJob={(id) => {
          setQueueOpen(false);
          openJob(id);
        }}
      />
    </div>
  );
}
