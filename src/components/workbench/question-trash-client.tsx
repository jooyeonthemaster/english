"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trash2,
  RotateCcw,
  Loader2,
  ArrowLeft,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import {
  restoreWorkbenchQuestions,
  purgeWorkbenchQuestions,
  createQuestionCollection,
  updateQuestionCollection,
  deleteQuestionCollection,
  addQuestionsToCollection,
  removeQuestionsFromCollection,
} from "@/actions/workbench";
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

import type { CollectionItem } from "./shared/types";
import { FolderSection } from "./shared/folder-section";
import { Pagination } from "./shared/pagination";
import { QuestionBankCard, type QuestionBankItem } from "./question-bank-card";
import { GridToggle } from "./question-bank-client/grid-toggle";
import { QuestionFiltersToolbar } from "./question-bank-client/filters-toolbar";
import { QuestionDetailDialog } from "./question-bank-client/question-detail-dialog";
import { DragSelect } from "@/components/ui/drag-select";

import { useUrlFilters } from "@/hooks/use-url-filters";
import { useSelection } from "@/hooks/use-selection";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants / Types
// ---------------------------------------------------------------------------

const QUESTION_TRASH_PATH = "/director/workbench/questions/trash";
const QUESTION_BANK_PATH = "/director/workbench/questions";
const PAGE_SIZE = 20;

// Trash questions are the same shape as the bank's QuestionBankItem PLUS the
// soft-delete bookkeeping columns — they come from the identical Prisma
// `include`, so the rich QuestionBankCard renders them with full fidelity.
// createdAt is pinned to Date (Prisma always returns a Date) so the read-only
// QuestionDetailDialog — which wants Date — accepts these items directly.
type TrashQuestionItem = Omit<QuestionBankItem, "createdAt"> & {
  createdAt: Date;
  deletedAt?: Date | string | null;
  deletedById?: string | null;
};

interface QuestionTrashProps {
  questionsData: {
    questions: TrashQuestionItem[];
    total: number;
    page: number;
    limit?: number;
    totalPages: number;
  };
  filters: {
    page: number;
    type?: string;
    subType?: string;
    difficulty?: string;
    collectionId?: string;
    starred?: boolean;
    search?: string;
    sort?: string;
  };
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "N일 전 삭제" / "오늘 삭제" — slate pill copy. No countdown (no auto-purge). */
function deletedAgoLabel(deletedAt?: Date | string | null): string | null {
  if (!deletedAt) return null;
  const then = new Date(deletedAt);
  if (Number.isNaN(then.getTime())) return null;
  const now = Date.now();
  const diffMs = now - then.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(diffMs / dayMs);
  if (days <= 0) return "오늘 삭제";
  if (days === 1) return "어제 삭제";
  if (days < 30) return `${days}일 전 삭제`;
  // 한 달이 넘으면 정확한 날짜를 보여준다(상대표현이 부정확해지는 구간).
  return `${formatDate(then)} 삭제`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function QuestionTrashClient({
  questionsData,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
}: QuestionTrashProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(filters.search || "");

  const {
    updateFilter,
    updateFilters,
    handleSearch: urlSearch,
    goToPage,
    isPending: isNavPending,
  } = useUrlFilters(QUESTION_TRASH_PATH);

  function handleSearch() {
    urlSearch(searchValue);
  }

  // ─── Folder manager (shared collections with 문제 관리) ───
  // Seeded with TRASHED membership so folder counts reflect deleted questions.
  // Create/rename/delete act on the SAME collections as the bank, keeping them
  // in sync. Drag-to-folder is intentionally disabled below (no-op handler).
  const folders = useFolderManager({
    initialCollections,
    initialMembership,
    actions: {
      createCollection: createQuestionCollection,
      updateCollection: updateQuestionCollection,
      deleteCollection: deleteQuestionCollection,
      addToCollection: addQuestionsToCollection,
      removeFromCollection: removeQuestionsFromCollection,
    },
    itemLabel: "문제",
  });

  // ─── Grid view mode (persisted, same pattern/key family as the bank) ───
  const [gridCols, setGridCols] = usePersistedState<2 | 3 | "list">(
    "smoat:view-mode:question-trash",
    2,
    (v): v is 2 | 3 | "list" => v === 2 || v === 3 || v === "list",
  );
  // 3열일 때는 카드를 살짝 콤팩트하게(md) — 문제 관리와 동일 규칙.
  const viewSize: "lg" | "md" | "sm" = gridCols === 3 ? "md" : "lg";

  // Optimistically remove cards we've already restored/purged until
  // router.refresh() reaches the page.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  // Smooth loading feedback for in-page navigations (folder/filter/pagination).
  // Debounced ~150ms so only genuinely slow loads surface a spinner.
  const [showNavLoading, setShowNavLoading] = useState(false);
  useEffect(() => {
    if (!isNavPending) {
      setShowNavLoading(false);
      return;
    }
    const timer = window.setTimeout(() => setShowNavLoading(true), 150);
    return () => window.clearTimeout(timer);
  }, [isNavPending]);

  // Folder selection is server-driven via the `collectionId` URL param: the
  // server scopes getTrashWorkbenchQuestions to the folder. Keep the active
  // folder UI in sync with the URL so deep links / refresh / back-forward all
  // resolve to the same folder the server queried.
  useEffect(() => {
    const target = filters.collectionId ?? null;
    if (target !== folders.activeFolder) {
      folders.setActiveFolder(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.collectionId]);

  const questions = useMemo(() => {
    const raw = questionsData?.questions ?? [];
    return removedIds.size === 0
      ? raw
      : raw.filter((q) => !removedIds.has(q.id));
  }, [questionsData, removedIds]);

  // Selection (multi-select via checkbox + DragSelect marquee)
  const displayedIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const getDisplayedIds = useCallback(() => displayedIds, [displayedIds]);
  const { selectedIds, setSelectedIds, toggleSelect, clearSelection } =
    useSelection(getDisplayedIds);

  // Keep selection in sync when the underlying list changes (e.g. after a
  // refresh removes restored/purged ids).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(displayedIds);
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [displayedIds, setSelectedIds]);

  const total = questionsData?.total ?? 0;
  const currentPage = questionsData?.page ?? 1;
  const totalPages = questionsData?.totalPages ?? 1;
  const isEmpty = questions.length === 0;

  // ─── Action state ───
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [bulkRestoring, setBulkRestoring] = useState(false);
  const [bulkPurging, setBulkPurging] = useState(false);
  // 영구 삭제 확인 대상. "bulk" = 선택 일괄, string = 단일 카드 id.
  const [purgeTarget, setPurgeTarget] = useState<"bulk" | string | null>(null);

  const markBusy = useCallback((ids: string[], busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (busy) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const optimisticallyRemove = useCallback(
    (ids: string[]) => {
      setRemovedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    },
    [setSelectedIds],
  );

  // ─── Detail (read-only, reuses the bank's QuestionDetailDialog) ───
  // 휴지통 문제는 getWorkbenchQuestion(deletedAt:null 가드) 으로 못 불러오므로,
  // 이미 로드된 휴지통 항목(지문 본문·해설·structuredData 포함)을 그대로 넘겨
  // 동기적으로 상세를 연다. (별도 fetch 없음 → 로딩/에러 상태 불필요.)
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailQuestionId, setDetailQuestionId] = useState<string | null>(null);
  const detailQuestion = useMemo(
    () =>
      detailQuestionId
        ? (questions.find((q) => q.id === detailQuestionId) ?? null)
        : null,
    [detailQuestionId, questions],
  );

  const openDetail = useCallback((id: string) => {
    setDetailQuestionId(id);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailQuestionId(null);
  }, []);

  // ─── Restore ───
  const handleRestore = useCallback(
    async (id: string) => {
      if (busyIds.has(id)) return;
      markBusy([id], true);
      try {
        const result = await restoreWorkbenchQuestions([id]);
        if (!result.success) {
          toast.error(result.error || "복원에 실패했습니다.");
          return;
        }
        if (result.restored > 0) {
          toast.success("문제를 복원했습니다.");
          optimisticallyRemove([id]);
          if (detailQuestionId === id) closeDetail();
          router.refresh();
        } else {
          toast.error("복원된 문제가 없습니다.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "복원에 실패했습니다.");
      } finally {
        markBusy([id], false);
      }
    },
    [busyIds, markBusy, optimisticallyRemove, router, detailQuestionId, closeDetail],
  );

  const handleBulkRestore = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || bulkRestoring) return;
    setBulkRestoring(true);
    markBusy(ids, true);
    try {
      const result = await restoreWorkbenchQuestions(ids);
      if (!result.success) {
        toast.error(result.error || "복원에 실패했습니다.");
        return;
      }
      const restoredIds =
        result.restoredIds?.length > 0 ? result.restoredIds : ids;
      if (result.restored === ids.length) {
        toast.success(`${result.restored}문항을 복원했습니다.`);
      } else if (result.restored === 0) {
        toast.error("복원된 문제가 없습니다.");
      } else {
        toast.success(
          `${result.restored}문항을 복원했습니다. (${ids.length - result.restored}문항 누락)`,
        );
      }
      optimisticallyRemove(restoredIds);
      clearSelection();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "복원에 실패했습니다.");
    } finally {
      markBusy(ids, false);
      setBulkRestoring(false);
    }
  }, [
    selectedIds,
    bulkRestoring,
    markBusy,
    optimisticallyRemove,
    clearSelection,
    router,
  ]);

  // ─── Purge (permanent, AlertDialog-confirmed) ───
  const handlePurgeConfirmed = useCallback(async () => {
    if (purgeTarget === null) return;

    if (purgeTarget === "bulk") {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) {
        setPurgeTarget(null);
        return;
      }
      setBulkPurging(true);
      markBusy(ids, true);
      try {
        const result = await purgeWorkbenchQuestions(ids);
        if (!result.success) {
          toast.error(result.error || "영구 삭제에 실패했습니다.");
          return;
        }
        const purgedIds = result.purgedIds?.length > 0 ? result.purgedIds : ids;
        if (result.purged === ids.length) {
          toast.success(`${result.purged}문항을 영구 삭제했습니다.`);
        } else if (result.purged === 0) {
          toast.error("삭제된 문제가 없습니다.");
        } else {
          toast.success(
            `${result.purged}문항을 영구 삭제했습니다. (${ids.length - result.purged}문항 누락)`,
          );
        }
        optimisticallyRemove(purgedIds);
        clearSelection();
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "영구 삭제에 실패했습니다.",
        );
      } finally {
        markBusy(ids, false);
        setBulkPurging(false);
        setPurgeTarget(null);
      }
      return;
    }

    // Single card purge
    const id = purgeTarget;
    markBusy([id], true);
    try {
      const result = await purgeWorkbenchQuestions([id]);
      if (!result.success) {
        toast.error(result.error || "영구 삭제에 실패했습니다.");
        return;
      }
      if (result.purged > 0) {
        toast.success("문제를 영구 삭제했습니다.");
        optimisticallyRemove([id]);
        if (detailQuestionId === id) closeDetail();
        router.refresh();
      } else {
        toast.error("삭제된 문제가 없습니다.");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "영구 삭제에 실패했습니다.",
      );
    } finally {
      markBusy([id], false);
      setPurgeTarget(null);
    }
  }, [
    purgeTarget,
    selectedIds,
    markBusy,
    optimisticallyRemove,
    clearSelection,
    router,
    detailQuestionId,
    closeDetail,
  ]);

  const purgeBusy =
    bulkPurging ||
    (purgeTarget !== null &&
      purgeTarget !== "bulk" &&
      busyIds.has(purgeTarget));
  const purgeCount =
    purgeTarget === "bulk" ? selectedIds.size : purgeTarget ? 1 : 0;

  // ─── Folder navigation (server-driven via collectionId URL param) ───
  const handleNavigateFolder = useCallback(
    (id: string | null) => {
      folders.navigateToFolder(id);
      clearSelection();
      updateFilter("collectionId", id || "ALL");
    },
    [folders, clearSelection, updateFilter],
  );

  const handleNavigateToRoot = useCallback(() => {
    folders.setActiveFolder(null);
    clearSelection();
    updateFilter("collectionId", "ALL");
  }, [folders, clearSelection, updateFilter]);

  // ─── Selection toolbar (bulk restore + bulk purge) ───
  const hasSelection = selectedIds.size > 0;

  const isAllSelected =
    displayedIds.length > 0 && displayedIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected =
        displayedIds.length > 0 && displayedIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(displayedIds);
    });
  }, [displayedIds, setSelectedIds]);

  // 필터(유형/난이도/정렬/검색) 토글 + 3열 토글 — 문제 관리와 동일한 컴포넌트.
  const filtersToolbar = (
    <QuestionFiltersToolbar
      filters={filters}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={handleSearch}
      updateFilter={updateFilter}
      updateFilters={updateFilters}
    />
  );

  const gridToggle = <GridToggle gridCols={gridCols} setGridCols={setGridCols} />;

  const toolbarRow = (
    <div className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {/* 선택 개수 + 전체 선택 */}
      <button
        type="button"
        onClick={toggleSelectAll}
        disabled={displayedIds.length === 0}
        className={
          "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
          (isAllSelected && hasSelection
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700")
        }
      >
        <Check className="h-3.5 w-3.5" />
        {isAllSelected && hasSelection ? "선택 해제" : "전체 선택"}
      </button>

      <span className="text-[12px] font-medium text-slate-500">
        {selectedIds.size}문항 선택
      </span>

      <span className="h-4 w-px bg-slate-200" />

      {/* 선택 복원 / 영구 삭제 — 선택이 없으면 흐리게(클릭 불가). */}
      <div
        className={
          "flex items-center gap-2 " +
          (hasSelection ? "" : "pointer-events-none opacity-50")
        }
        aria-disabled={!hasSelection}
      >
        <button
          type="button"
          onClick={() => void handleBulkRestore()}
          disabled={!hasSelection || bulkRestoring}
          title="선택한 문항 복원"
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-500 bg-white px-2.5 text-[11px] font-semibold text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bulkRestoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          선택 복원
        </button>

        <button
          type="button"
          onClick={() => setPurgeTarget("bulk")}
          disabled={!hasSelection || bulkPurging}
          title="선택한 문항 영구 삭제"
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bulkPurging ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          영구 삭제
        </button>
      </div>

      {hasSelection ? (
        <button
          type="button"
          onClick={clearSelection}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          선택 취소
        </button>
      ) : null}

      {/* 우측 클러스터 — 필터/검색 팝오버 + 3열 토글 (문제 관리와 동일). */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        {filtersToolbar}
        {gridToggle}
      </div>
    </div>
  );

  // 메인 그리드 sticky 오프셋 계산용 — FolderSection 높이를 측정한다(은행과 동일).
  const folderStickyRef = useRef<HTMLDivElement>(null);
  const [folderStickyHeight, setFolderStickyHeight] = useState(0);
  useEffect(() => {
    const el = folderStickyRef.current;
    if (!el) return;
    const update = () =>
      setFolderStickyHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      <div className="-mx-6 flex-1 bg-[#F4F6F9] px-6 pt-2 pb-4 sm:px-8">
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* ─── Header (FolderSection with REAL folders, synced with 문제 관리) ─── */}
          <div
            ref={folderStickyRef}
            className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
          >
            <FolderSection
              embedded
              childFolders={folders.childFolders}
              activeFolder={folders.activeFolder}
              dragItemType="question"
              dragItemIdKey="questionId"
              itemCountLabel="문제"
              showNewFolder={folders.showNewFolder}
              newFolderName={folders.newFolderName}
              onNewFolderNameChange={folders.setNewFolderName}
              onShowNewFolder={folders.setShowNewFolder}
              onCreateFolder={folders.handleCreateFolder}
              onNavigateToFolder={handleNavigateFolder}
              onRenameFolder={folders.handleRenameFolder}
              onDeleteFolder={folders.handleDeleteFolder}
              // 휴지통에서는 폴더로 드래그가 무의미하므로 비활성(no-op). 폴더 탐색/생성/이름변경/삭제는 유지.
              onDragToFolder={() => {}}
              breadcrumbPath={folders.breadcrumbPath}
              onNavigateToRoot={handleNavigateToRoot}
              useCardInsideFolder
              rootLabel="전체 휴지통"
              enableFolderControls
              allFolders={folders.collections}
              storageKey="questions-trash"
              treatRootAsFolder
              pageHeader={{
                icon: <Trash2 className="h-3.5 w-3.5" />,
                parentLabel: "문제 관리",
                title: "휴지통",
                totalCount: Math.max(0, total - removedIds.size),
                itemLabel: "문제",
                itemUnit: "문항",
                // 헤더 맨 앞에 '문제 관리로 돌아가기' 백링크를 끼운다(별도 상단 바 제거).
                backLink: (
                  <Link
                    href={QUESTION_BANK_PATH}
                    className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    문제 관리로 돌아가기
                  </Link>
                ),
              }}
            />
          </div>

          {/* ─── Selection / filter toolbar ─── */}
          <div
            style={{ top: folderStickyHeight }}
            className="sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90"
          >
            {toolbarRow}
          </div>

          {/* ─── Card grid / empty state ─── */}
          <div className="relative min-w-0 px-4 pb-3 pt-3 sm:px-5">
            {showNavLoading ? (
              <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/55 pt-12 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-500 shadow-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  불러오는 중…
                </div>
              </div>
            ) : null}

            {isEmpty && !isNavPending ? (
              <div className="py-20 text-center">
                <Trash2 className="mx-auto mb-3 h-12 w-12 text-slate-200" />
                <p className="font-medium text-slate-500">
                  {folders.activeFolder
                    ? "이 폴더의 휴지통이 비어 있습니다"
                    : "휴지통이 비어 있습니다"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  삭제한 문제는 여기에 보관되며 언제든 복원할 수 있습니다.
                </p>
              </div>
            ) : (
              <DragSelect
                value={selectedIds}
                onChange={setSelectedIds}
                className={`grid gap-3 ${
                  gridCols === 2
                    ? "grid-cols-1 md:grid-cols-2"
                    : gridCols === 3
                      ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                      : "grid-cols-1"
                }`}
              >
                {questions.map((q, idx) => {
                  const num = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const isBusy = busyIds.has(q.id);
                  return (
                    // 문제 관리와 동일한 리치 카드(QuestionBankCard)를 그대로 재사용한다.
                    // trashMode 로 검수/수정 풋터 대신 '복원 / 영구삭제 / 상세보기' 풋터를 노출.
                    // - onRestore: 즉시 복원
                    // - onDelete: 영구삭제 확인 다이얼로그 오픈(setPurgeTarget)
                    // - enableDrag={false}: 휴지통에선 폴더로 드래그가 무의미(드롭 핸들러 no-op)
                    // - onToggleStar 미전달: 별표는 정적 표시(상태 변경 없음)
                    <QuestionBankCard
                      key={q.id}
                      q={q}
                      num={num}
                      selected={selectedIds.has(q.id)}
                      onToggle={() => toggleSelect(q.id)}
                      onDetail={() => void openDetail(q.id)}
                      onRestore={() => void handleRestore(q.id)}
                      onDelete={() => setPurgeTarget(q.id)}
                      viewSize={viewSize}
                      cardClickSelects
                      showDetailButton
                      enableDrag={false}
                      trashMode
                      actionBusy={isBusy}
                      deletedLabel={deletedAgoLabel(q.deletedAt)}
                    />
                  );
                })}
              </DragSelect>
            )}
          </div>
        </section>

        {/* Pagination — self-hides when there's a single page. */}
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onGoToPage={goToPage}
        />
      </div>

      {/* ─── Read-only detail (reused from 문제 관리) ─── */}
      <QuestionDetailDialog
        open={detailOpen}
        loading={false}
        loadError={null}
        questionId={detailQuestionId}
        question={detailQuestion}
        onClose={closeDetail}
        onRetry={openDetail}
        // 휴지통 문제는 검수/수정 대상이 아니다 — approve/unapprove/edit 은 비활성(no-op·미노출).
        onApprove={() => {}}
        onUnapprove={() => {}}
        // 상세에서 '삭제'는 영구 삭제 확인 다이얼로그로 연결.
        onDelete={(id) => setPurgeTarget(id)}
      />

      {/* ─── Permanent-delete confirm (irreversible) ─── */}
      <AlertDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!purgeBusy && !open) setPurgeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {purgeTarget === "bulk"
                ? `선택한 문제 ${purgeCount}문항을 영구 삭제하시겠습니까?`
                : "이 문제를 영구 삭제하시겠습니까?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 영구적으로 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeBusy}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handlePurgeConfirmed();
              }}
              disabled={purgeBusy}
              className="bg-red-500 hover:bg-red-600"
            >
              {purgeBusy ? "삭제 중..." : "영구 삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
