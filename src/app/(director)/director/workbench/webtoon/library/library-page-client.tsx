"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  FolderX,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "@/components/workbench/hooks/use-selection";
import { FolderSection } from "@/components/workbench/shared/folder-section";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
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

const GRID_OPTIONS: { value: GridCols; label: string }[] = [
  { value: "grid3", label: "3" },
  { value: "grid4", label: "4" },
  { value: "grid5", label: "5" },
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
}

export function WebtoonLibraryClient({
  academyId,
  collections: initialCollections,
  collectionMembership: initialMembership,
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

  // ─── Folder manager (shared with 지문/문제/시험지 관리) ───
  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    itemLabel: "웹툰",
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

  const totalCount = items.length;
  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight();

  const hasSelection = selection.selectedIds.size > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="-mx-6 flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pb-4 sm:px-8">
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
          <section className="mt-2 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* ─── 파일창 (folder browser, sticky) ─── */}
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
            >
              <FolderSection
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
                useCardInsideFolder
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
                toolbar={
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-[12px]"
                      onClick={() => fetchAll()}
                      disabled={loading}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                      />
                      새로고침
                    </Button>
                    <Link
                      href="/director/workbench/webtoon"
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      <Palette className="h-3.5 w-3.5" />새 웹툰 생성
                    </Link>
                  </>
                }
              />
            </div>

            {/* ─── Toolbar: 선택 · 폴더 작업 · 필터 (sticky) ─── */}
            <div
              style={{ top: folderStickyHeight > 0 ? folderStickyHeight - 1 : 0 }}
              className="sticky z-20 shrink-0 border-y border-slate-200 bg-slate-50 px-4 py-2 shadow-[0_6px_8px_-4px_rgba(15,23,42,0.08)]"
            >
              <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
                <div className="flex items-center gap-2">
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
                  <div
                    className={
                      "flex items-center gap-3 " +
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
                    />
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={!hasSelection}
                      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      삭제
                    </button>
                    {folder.activeFolder ? (
                      <button
                        type="button"
                        onClick={onRemoveFromFolder}
                        title="폴더에서 삭제"
                        className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
                      >
                        <FolderX className="h-3.5 w-3.5" />
                        폴더에서 삭제
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {/* Search */}
                  <div className="relative w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      placeholder="지문 제목으로 검색..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[12px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
                    />
                  </div>

                  {/* Status filter */}
                  <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                    {STATUS_FILTERS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setStatusFilter(s.id);
                          setPage(1);
                        }}
                        className={`h-7 rounded-md px-2.5 text-[11px] font-semibold transition-all ${
                          statusFilter === s.id
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  {/* Style filter */}
                  <select
                    value={styleFilter}
                    onChange={(e) => {
                      setStyleFilter(e.target.value as WebtoonStyleId | "ALL");
                      setPage(1);
                    }}
                    className={`h-8 cursor-pointer appearance-none rounded-lg border px-3 pr-7 text-[12px] font-semibold ${
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

                  {/* Grid column toggle */}
                  <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
                    {GRID_OPTIONS.map((g) => (
                      <button
                        key={g.value}
                        onClick={() => setGridCols(g.value)}
                        title={`${g.label}열 보기`}
                        className={`h-7 w-7 rounded-md text-[11px] font-bold tabular-nums transition-all ${
                          gridCols === g.value
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-400 hover:text-slate-600"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
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

function useMeasuredHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
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
