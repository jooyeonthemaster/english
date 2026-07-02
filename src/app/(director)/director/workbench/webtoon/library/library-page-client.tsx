"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CheckCircle2,
  FolderX,
  Image as ImageIcon,
  ListFilter,
  Loader2,
  Palette,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/components/workbench/hooks/use-selection";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import { ViewModeCycleButton } from "@/components/workbench/shared/view-mode-cycle-button";
import { GridColsIcon } from "@/components/workbench/shared/grid-cols-icon";
import { Pagination } from "@/components/workbench/shared/pagination";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  createWebtoonCollection,
  updateWebtoonCollection,
  deleteWebtoonCollection,
  addWebtoonsToCollection,
  removeWebtoonsFromCollection,
} from "@/actions/workbench";
import {
  DEFAULT_WEBTOON_LANGUAGE,
  WEBTOON_STYLES,
  type WebtoonRow,
  type WebtoonStatus,
  type WebtoonStyleId,
} from "../webtoon-page-types";
import { WebtoonQueueCard } from "../webtoon-queue-card";
import { WebtoonTextEditor } from "../editor/webtoon-text-editor";

const PAGE_SIZE = 24;
// API caps `limit` at 100; we pull every page so folder membership filtering
// (which spans the whole library) stays correct rather than per-page.
const FETCH_LIMIT = 100;

const STATUS_FILTERS: { id: WebtoonStatus | "ALL"; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "COMPLETED", label: "완료" },
  { id: "GENERATING", label: "생성 중" },
  { id: "PENDING", label: "대기" },
  { id: "FAILED", label: "실패" },
];

type GridCols = "grid3" | "grid4" | "grid5";

const GRID_CLASS: Record<GridCols, string> = {
  grid3: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
  grid4: "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4",
  grid5: "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5",
};

const GRID_OPTIONS: { value: GridCols; cols: number }[] = [
  { value: "grid3", cols: 3 },
  { value: "grid4", cols: 4 },
  { value: "grid5", cols: 5 },
];

// ─── Server-action adapters for the shared folder manager ───
const folderActions = {
  createCollection: createWebtoonCollection,
  updateCollection: updateWebtoonCollection,
  deleteCollection: deleteWebtoonCollection,
  addToCollection: addWebtoonsToCollection,
  removeFromCollection: removeWebtoonsFromCollection,
};

interface WebtoonLibraryClientProps {
  academyId: string;
  collections: CollectionItem[];
  collectionMembership: Record<string, Set<string>>;
  /** When true, drops the full-height page chrome (height/scroll/page bg) and
   *  hides the FolderSection header so this can live inside another section
   *  (e.g. the 웹툰 생성 페이지의 '생성한 웹툰' 카드). */
  embedded?: boolean;
  /** Bumping this number triggers a silent refetch — used by the host page to
   *  refresh the list after a new webtoon is queued. */
  refreshSignal?: number;
  /** Height (px) of the host section header that sits above this component, so
   *  the embedded folder/toolbar can stick *below* it instead of at viewport 0. */
  stickyTopOffset?: number;
}

export function WebtoonLibraryClient({
  academyId,
  collections: initialCollections,
  collectionMembership: initialMembership,
  embedded = false,
  refreshSignal,
  stickyTopOffset = 0,
}: WebtoonLibraryClientProps) {
  void academyId;

  const [items, setItems] = useState<WebtoonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WebtoonStatus | "ALL">("ALL");
  const [styleFilter, setStyleFilter] = useState<WebtoonStyleId | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [gridCols, setGridCols] = usePersistedState<GridCols>(
    "smoat:view-mode:webtoon-library",
    "grid4",
    (v): v is GridCols => v === "grid3" || v === "grid4" || v === "grid5",
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingItem = useMemo(
    () => items.find((it) => it.id === editingId) ?? null,
    [items, editingId],
  );

  // ─── Data fetch — pull the whole library (all pages) so folder filtering
  //     works across the entire set, then paginate client-side. ───
  const fetchAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const first = await fetch(
        `/api/webtoons/list?page=1&limit=${FETCH_LIMIT}`,
      ).then((r) => r.json());
      if (!first.ok) throw new Error(first.error || "목록 로드 실패");

      let all: WebtoonRow[] = first.items;
      const total: number = first.total ?? first.items.length;
      if (total > FETCH_LIMIT) {
        const pages = Math.ceil(total / FETCH_LIMIT);
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) =>
            fetch(`/api/webtoons/list?page=${i + 2}&limit=${FETCH_LIMIT}`)
              .then((r) => r.json())
              .catch(() => null),
          ),
        );
        for (const r of rest) if (r?.ok) all = all.concat(r.items);
      }
      setItems(all);
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch error";
      toast.error(`목록 로드 실패: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Auto-refresh every 5s while any item is still generating.
  useEffect(() => {
    const hasActive = items.some(
      (it) => it.status === "PENDING" || it.status === "GENERATING",
    );
    if (!hasActive) return;
    const tid = setInterval(() => void fetchAll(false), 5000);
    return () => clearInterval(tid);
  }, [items, fetchAll]);

  // Host-triggered refresh (e.g. after a new webtoon is queued from the
  // generate page). Skips the initial mount (handled by the fetch-on-mount).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    void fetchAll(false);
  }, [refreshSignal, fetchAll]);

  // ─── Folder manager (shared with 지문/문제/시험지 관리) ───
  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    itemLabel: "웹툰",
    // 폴더 배지를 하위 폴더까지 합산한 누적 수치로 표시(중복 제거).
    cumulativeCounts: true,
  });
  const { filterByActiveFolder } = folder;

  // ─── Filter pipeline: folder → status → style → search ───
  const filtered = useMemo(() => {
    let list = filterByActiveFolder(items);
    if (statusFilter !== "ALL") {
      list = list.filter((it) => it.status === statusFilter);
    }
    if (styleFilter !== "ALL") {
      list = list.filter((it) => it.style === styleFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((it) => it.passage.title.toLowerCase().includes(q));
    }
    return list;
  }, [items, filterByActiveFolder, statusFilter, styleFilter, search]);

  // Reset to page 1 whenever the filtered set changes shape.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const filteredIds = useMemo(() => filtered.map((it) => it.id), [filtered]);
  const selection = useSelection(filteredIds);

  // ─── Folder action wrappers (operate on current selection) ───
  const onAddToFolder = useCallback(
    async (collectionId: string) => {
      const ok = await folder.handleAddToFolder(
        collectionId,
        selection.selectedIds,
      );
      if (ok) selection.clearSelection();
    },
    [folder, selection],
  );

  const onMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selection.selectedIds.size === 0) return;
      const anyId = selection.selectedIds.values().next().value as
        | string
        | undefined;
      if (!anyId) return;
      const ok = await folder.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selection.selectedIds,
      );
      if (ok) selection.clearSelection();
    },
    [folder, selection],
  );

  const onRemoveFromFolder = useCallback(async () => {
    const ok = await folder.handleRemoveFromFolder(selection.selectedIds);
    if (ok) selection.clearSelection();
  }, [folder, selection]);

  const onFolderClick = useCallback(
    (folderId: string) => {
      folder.setActiveFolder(folderId);
      selection.clearSelection();
      setPage(1);
    },
    [folder, selection],
  );

  // ─── Card action handlers ───
  const applyEdited = useCallback(
    (webtoonId: string, editedImageUrl: string) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === webtoonId ? { ...it, editedImageUrl } : it,
        ),
      );
    },
    [],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("이 웹툰을 삭제하시겠습니까? 이미지 파일도 함께 삭제됩니다."))
      return;
    try {
      const res = await fetch(`/api/webtoons/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `${res.status}`);
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast.success("삭제됨");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }, []);

  const handleToggleApprove = useCallback(
    async (id: string) => {
      const target = items.find((it) => it.id === id);
      if (!target) return;
      const next = !target.approved;
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, approved: next } : it)),
      );
      try {
        const res = await fetch(`/api/webtoons/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: next }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `${res.status}`);
      } catch (err) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === id ? { ...it, approved: target.approved } : it,
          ),
        );
        toast.error(err instanceof Error ? err.message : "검수 상태 변경 실패");
      }
    },
    [items],
  );

  const handleRetry = useCallback(
    async (id: string) => {
      const target = items.find((it) => it.id === id);
      if (!target) return;
      try {
        const res = await fetch("/api/ai/webtoon/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passageIds: [target.passageId],
            style: target.style,
            language: target.language ?? DEFAULT_WEBTOON_LANGUAGE,
            customPrompt: target.customPrompt ?? "",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || `${res.status}`);
        toast.message("웹툰 재생성을 시작했습니다.");
        await fetchAll(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "재생성 요청 실패");
      }
    },
    [items, fetchAll],
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selection.selectedIds).filter((id) => {
      const it = items.find((x) => x.id === id);
      return it && it.status !== "PENDING" && it.status !== "GENERATING";
    });
    if (ids.length === 0) {
      toast.info("삭제할 수 있는 웹툰이 없습니다.");
      return;
    }
    if (!confirm(`선택한 웹툰 ${ids.length}개를 삭제하시겠습니까? 이미지 파일도 함께 삭제됩니다.`))
      return;
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/webtoons/${id}`, { method: "DELETE" })
          .then((r) => r.json())
          .then((d) => (d.ok ? id : null))
          .catch(() => null),
      ),
    );
    const deleted = results.filter((x): x is string => x !== null);
    if (deleted.length > 0) {
      const deletedSet = new Set(deleted);
      setItems((prev) => prev.filter((it) => !deletedSet.has(it.id)));
      selection.clearSelection();
      toast.success(`${deleted.length}개 삭제됨`);
    }
    if (deleted.length < ids.length) {
      toast.error(`${ids.length - deleted.length}개는 삭제하지 못했습니다.`);
    }
  }, [selection, items]);

  // 선택한 완료 웹툰을 일괄 검수완료 처리한다(이미 검수된 항목은 제외). 카드별
  // handleToggleApprove 와 같은 PATCH 엔드포인트를 쓰되 한 번에 모아 호출한다.
  const handleBulkApprove = useCallback(async () => {
    const ids = Array.from(selection.selectedIds).filter((id) => {
      const it = items.find((x) => x.id === id);
      return it && it.status === "COMPLETED" && !it.approved;
    });
    if (ids.length === 0) {
      toast.info("검수완료할 웹툰이 없습니다.");
      return;
    }
    const idSet = new Set(ids);
    // Optimistic — flip locally, revert the ones whose PATCH fails.
    setItems((prev) =>
      prev.map((it) => (idSet.has(it.id) ? { ...it, approved: true } : it)),
    );
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/webtoons/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: true }),
        })
          .then((r) => r.json())
          .then((d) => (d.ok ? id : null))
          .catch(() => null),
      ),
    );
    const ok = results.filter((x): x is string => x !== null);
    if (ok.length > 0) {
      selection.clearSelection();
      toast.success(`${ok.length}개 검수완료`);
    }
    if (ok.length < ids.length) {
      const failed = new Set(ids.filter((id) => !ok.includes(id)));
      setItems((prev) =>
        prev.map((it) => (failed.has(it.id) ? { ...it, approved: false } : it)),
      );
      toast.error(`${ids.length - ok.length}개는 검수완료하지 못했습니다.`);
    }
  }, [selection, items]);

  const totalCount = items.length;
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight();

  const hasSelection = selection.selectedIds.size > 0;
  const hasActiveFilter = statusFilter !== "ALL" || styleFilter !== "ALL";

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col h-[calc(100vh-64px)]"}>
      <div
        className={
          embedded
            ? ""
            : "-mx-6 flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pb-4 sm:px-8"
        }
      >
        {loading && items.length === 0 ? (
          <div className="mt-2 flex flex-col items-center justify-center gap-3 rounded-xl border bg-white py-24">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="text-[13px] text-slate-500">불러오는 중...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="mt-2 rounded-xl border bg-white py-20 text-center">
            <ImageIcon className="mx-auto mb-3 h-12 w-12 text-slate-200" />
            <p className="font-medium text-slate-500">아직 생성된 웹툰이 없습니다</p>
            <p className="mt-1 text-sm text-slate-400">
              지문으로 첫 웹툰을 만들어보세요
            </p>
            <div className="mt-4 flex items-center justify-center">
              <Link href="/director/workbench/webtoon">
                <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Palette className="mr-1.5 h-3.5 w-3.5" />새 웹툰 생성
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <section
            className={
              embedded
                ? "flex flex-col"
                : "mt-2 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
            }
          >
            {/* ─── 파일창 (folder browser, sticky) ─── */}
            <div
              ref={folderStickyRef}
              style={embedded ? { top: stickyTopOffset } : undefined}
              className={
                embedded
                  ? "sticky z-30 shrink-0 overflow-hidden bg-white"
                  : "sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
              }
            >
              <FolderSection
                hideHeader={embedded}
                embedded
                childFolders={folder.childFolders}
                activeFolder={folder.activeFolder}
                dragItemType="passage"
                dragItemIdKey="webtoonId"
                itemCountLabel="웹툰"
                showNewFolder={folder.showNewFolder}
                newFolderName={folder.newFolderName}
                onNewFolderNameChange={folder.setNewFolderName}
                onShowNewFolder={folder.setShowNewFolder}
                onCreateFolder={folder.handleCreateFolder}
                onNavigateToFolder={onFolderClick}
                onRenameFolder={folder.handleRenameFolder}
                onDeleteFolder={folder.handleDeleteFolder}
                onDragToFolder={() => {}}
                onDragToRoot={() => {}}
                breadcrumbPath={folder.breadcrumbPath}
                onNavigateToRoot={() => {
                  folder.setActiveFolder(null);
                  selection.clearSelection();
                  setPage(1);
                }}
                useCardInsideFolder={false}
                rootLabel="전체 웹툰"
                enableFolderControls
                allFolders={folder.collections}
                storageKey="webtoon-library"
                treatRootAsFolder
                pageHeader={{
                  icon: <Palette className="h-3.5 w-3.5" />,
                  parentLabel: "웹툰 관리",
                  title: "전체 웹툰",
                  totalCount,
                  itemLabel: "웹툰",
                  itemUnit: "개",
                }}
              />
            </div>

            {/* ─── Toolbar: 선택 · 폴더 작업 · 필터 (sticky) ─── */}
            <div
              style={{
                top:
                  (embedded ? stickyTopOffset : 0) +
                  (folderStickyHeight > 0 ? folderStickyHeight - 1 : 0),
              }}
              className="sticky z-20 shrink-0 border-y border-slate-200 bg-slate-50 px-4 py-2 shadow-[0_6px_8px_-4px_rgba(15,23,42,0.08)]"
            >
              <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
                {/* ─── 선택 액션: 체크박스 · 이동/복사 · 검수완료 · 삭제 ─── */}
                <div className="flex items-center gap-1.5">
                  <SelectAllCheckbox
                    checked={selection.isAllSelected && hasSelection}
                    indeterminate={hasSelection && !selection.isAllSelected}
                    disabled={filtered.length === 0}
                    onChange={() =>
                      hasSelection
                        ? selection.clearSelection()
                        : selection.selectAll()
                    }
                    title={`${selection.selectedIds.size}개 선택`}
                    ariaLabel={hasSelection ? "선택 해제" : "전체 선택"}
                  />
                  {/* 이동/복사 · 삭제는 선택이 없으면 흐리게 + 클릭 차단 */}
                  <div
                    className={
                      "flex items-center gap-1.5 " +
                      (hasSelection ? "" : "pointer-events-none opacity-50")
                    }
                    aria-disabled={!hasSelection}
                  >
                    <MoveOrCopyFolderPicker
                      collections={folder.collections}
                      activeFolder={folder.activeFolder}
                      selectedCount={selection.selectedIds.size}
                      onCopy={onAddToFolder}
                      onMove={onMoveToFolder}
                      disabled={!hasSelection}
                      compact
                    />
                  </div>
                  {/* 검수완료 — 자체 disabled 를 관리하므로 게이트 밖에 둔다 */}
                  <button
                    type="button"
                    onClick={handleBulkApprove}
                    disabled={!hasSelection}
                    title="검수완료"
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-200 bg-white px-2.5 text-[11px] font-semibold text-emerald-600 shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    검수완료
                  </button>
                  <div
                    className={
                      "flex items-center gap-1.5 " +
                      (hasSelection ? "" : "pointer-events-none opacity-50")
                    }
                    aria-disabled={!hasSelection}
                  >
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={!hasSelection}
                      title="삭제"
                      aria-label="삭제"
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    {folder.activeFolder ? (
                      <button
                        type="button"
                        onClick={onRemoveFromFolder}
                        title="폴더에서 삭제"
                        aria-label="폴더에서 삭제"
                        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
                      >
                        <FolderX className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* ─── 필터 묶음: 새 웹툰 생성 · 필터 · 검색 · 그리드 ─── */}
                <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5">
                  <Link
                    href="/director/workbench/webtoon"
                    className="flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <Palette className="h-3.5 w-3.5" />새 웹툰 생성
                  </Link>

                  {/* Filter popover (상태 + 화풍) */}
                  <Popover>
                    <PopoverTrigger
                      title="필터"
                      aria-label="필터"
                      className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-blue-500/20 ${
                        hasActiveFilter
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <ListFilter className="size-3.5 shrink-0" aria-hidden="true" />
                      {hasActiveFilter ? (
                        <span
                          aria-hidden="true"
                          className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
                        />
                      ) : null}
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-3">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-medium text-slate-600">
                            상태
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {STATUS_FILTERS.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setStatusFilter(s.id);
                                  setPage(1);
                                }}
                                className={`h-7 rounded-md px-2.5 text-[11px] font-semibold transition-all ${
                                  statusFilter === s.id
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                }`}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[11px] font-medium text-slate-600">
                            화풍
                          </span>
                          <select
                            value={styleFilter}
                            onChange={(e) => {
                              setStyleFilter(
                                e.target.value as WebtoonStyleId | "ALL",
                              );
                              setPage(1);
                            }}
                            className={`h-8 w-full cursor-pointer appearance-none rounded-lg border px-3 pr-7 text-[12px] font-semibold ${
                              styleFilter !== "ALL"
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-500"
                            }`}
                          >
                            <option value="ALL">화풍 전체</option>
                            {WEBTOON_STYLES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Search popover */}
                  <Popover>
                    <PopoverTrigger
                      title="검색"
                      aria-label="검색"
                      className="relative flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-xs outline-none transition-colors hover:bg-slate-50 focus-visible:ring-[3px] focus-visible:ring-blue-500/20"
                    >
                      <Search className="size-3.5 shrink-0" aria-hidden="true" />
                      {search ? (
                        <span
                          aria-hidden="true"
                          className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
                        />
                      ) : null}
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-60 p-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium text-slate-600">
                          지문 검색
                        </span>
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                            aria-hidden="true"
                          />
                          <input
                            autoFocus
                            placeholder="지문 제목으로 검색..."
                            value={search}
                            onChange={(e) => {
                              setSearch(e.target.value);
                              setPage(1);
                            }}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-7 text-[12px] text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                          />
                          {search ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSearch("");
                                setPage(1);
                              }}
                              aria-label="검색 지우기"
                              className="absolute right-1.5 top-1/2 inline-flex size-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            >
                              <X className="size-3" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Grid column cycle */}
                  <ViewModeCycleButton
                    value={gridCols}
                    onChange={setGridCols}
                    options={GRID_OPTIONS.map((g) => ({
                      value: g.value,
                      label: `${g.cols}열 보기`,
                      Icon: (props) => <GridColsIcon cols={g.cols} {...props} />,
                    }))}
                  />
                </div>
              </div>
            </div>

            {/* ─── Cards ─── */}
            <div className="min-w-0 px-4 pb-3 pt-3 sm:px-5">
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <ImageIcon className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                  <p className="text-[13px] text-slate-400">
                    {folder.activeFolder
                      ? "이 폴더에 웹툰이 없습니다."
                      : "검색 결과가 없습니다."}
                  </p>
                  {folder.activeFolder && (
                    <p className="mt-1 text-[12px] text-slate-400">
                      웹툰을 선택한 뒤 &quot;이동 / 복사&quot;로 폴더에 담을 수
                      있습니다.
                    </p>
                  )}
                </div>
              ) : (
                <div className={GRID_CLASS[gridCols]}>
                  {pageItems.map((item) => (
                    <WebtoonQueueCard
                      key={item.id}
                      item={item}
                      selected={selection.selectedIds.has(item.id)}
                      onToggleSelected={() => selection.toggleSelect(item.id)}
                      onRetry={handleRetry}
                      onRemove={handleDelete}
                      onEditText={(id) => setEditingId(id)}
                      onToggleApprove={handleToggleApprove}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Pagination */}
        {filtered.length > 0 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            onGoToPage={(p) => {
              setPage(p);
            }}
          />
        ) : null}
      </div>

      {editingId ? (
        <WebtoonTextEditor
          key={editingId}
          webtoonId={editingId}
          title={editingItem?.passage.title}
          onClose={() => setEditingId(null)}
          onExported={(editedImageUrl) => applyEdited(editingId, editedImageUrl)}
        />
      ) : null}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────

// Callback ref so the height is (re)measured whenever the node mounts — the
// folder bar only renders after the client-side fetch, so an effect keyed on
// mount would measure 0 and never re-run, leaving the sticky toolbar at top:0.
function useMeasuredHeight() {
  const [height, setHeight] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;
    const update = () =>
      setHeight(Math.ceil(el.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    cleanupRef.current = () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return [ref, height] as const;
}

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
