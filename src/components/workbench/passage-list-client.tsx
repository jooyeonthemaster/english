// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Copy,
  CopyMinus,
  FileText,
  Plus,
  Folder,
  FolderX,
  BookMarked,
  Layers3,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import type {
  PassageSortOrder,
  PassageGridCols,
} from "./passage-list-client/filters-toolbar";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { PassageStudyNotePrintDialog } from "@/components/workbench/passage-study-note-print-dialog";
import { PassageFileRow } from "@/components/workbench/passage-file-row";
import { PassageFileCard } from "@/components/workbench/passage-file-card";
import {
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
  removePassagesFromCollection,
  findWorkbenchPassageDuplicates,
  bulkDeleteWorkbenchPassages,
} from "@/actions/workbench";

// Shared modules
import type { CollectionItem } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { MoveOrCopyFolderPicker } from "./shared/move-or-copy-folder-picker";

// Hooks
import { useFolderManager } from "@/hooks/use-folder-manager";
import { useSelection } from "./hooks/use-selection";
import { useUrlFilters } from "./hooks/use-url-filters";

// Local sub-components
import { PassageAnalysisModalWrapper } from "./passage-list-client/analysis-modal-wrapper";
import { DeepLinkBadges } from "./passage-list-client/deep-link-badges";
import { PassageFiltersToolbar } from "./passage-list-client/filters-toolbar";

// ─── Types ───────────────────────────────────────────────
interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: {
    id: string;
    updatedAt: Date;
    analysisData?: string | null;
  } | null;
  _count: { questions: number; notes: number };
}

interface DupGroupPassage {
  id: string;
  title: string;
  contentPreview: string;
  wordCount: number;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date | string;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date | string } | null;
  _count: { questions: number; notes: number };
}

interface DupSummary {
  groups: Array<{ key: string; items: DupGroupPassage[] }>;
  groupCount: number;
  totalDuplicateCount: number;
  totalScanned: number;
}

interface PassageListProps {
  academyId: string;
  passagesData: {
    passages: PassageItem[];
    total: number;
    page: number;
    totalPages: number;
  };
  schools: Array<{
    id: string;
    name: string;
    type: string;
    publisher: string | null;
  }>;
  filters: {
    page: number;
    schoolId?: string;
    grade?: number;
    semester?: string;
    publisher?: string;
    search?: string;
    sourceMaterialId?: string;
    collectionId?: string;
  };
  collections: CollectionItem[];
  /** passageIds belonging to each collection, keyed by collectionId */
  collectionMembership: Record<string, Set<string>>;
  /** when entering from 시험지 인식 완료 화면, show a pinned source material badge */
  sourceMaterialBadge?: { id: string; label: string } | null;
  /** when entering from a collection deep-link, show the collection badge */
  collectionBadge?: { id: string; label: string } | null;
}

// ─── Server action adapters ──────────────────────────────
const folderActions = {
  createCollection: createPassageCollection,
  updateCollection: updatePassageCollection,
  deleteCollection: deletePassageCollection,
  addToCollection: addPassagesToCollection,
  removeFromCollection: removePassagesFromCollection,
};

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

// ─── Main Component ──────────────────────────────────────
export function PassageListClient({
  academyId,
  passagesData,
  schools,
  filters,
  collections: initialCollections,
  collectionMembership: initialMembership,
  sourceMaterialBadge = null,
  collectionBadge = null,
}: PassageListProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [gridCols, setGridCols] = useState<PassageGridCols>("grid3");
  const [sortOrder, setSortOrder] = useState<PassageSortOrder>("newest");
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);
  const [studyNoteOpen, setStudyNoteOpen] = useState(false);
  const [dupSummary, setDupSummary] = useState<DupSummary | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<"list" | "duplicates">("list");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  // Optimistic local removal — router.refresh() updates server-side props
  // eventually, but we hide deleted rows immediately so the user doesn't have
  // to wait (and so the duplicates view, which has its own client-side cache,
  // doesn't keep showing already-deleted items).
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const loadDuplicates = useCallback(async () => {
    setDupLoading(true);
    setDupError(null);
    try {
      const result = await findWorkbenchPassageDuplicates(academyId, {
        analyzedOnly: true,
      });
      setDupSummary(result as DupSummary);
    } catch (err) {
      setDupError(
        err instanceof Error
          ? err.message
          : "중복 자료를 조회하지 못했습니다.",
      );
    } finally {
      setDupLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  // Hide optimistically-removed items from the cached duplicates summary so
  // the "중복 모아보기" view updates instantly after a delete. Groups that
  // shrink below 2 members are no longer duplicates and drop off too.
  const visibleDupSummary = useMemo<DupSummary | null>(() => {
    if (!dupSummary) return null;
    if (removedIds.size === 0) return dupSummary;
    const groups = dupSummary.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => !removedIds.has(it.id)),
      }))
      .filter((g) => g.items.length >= 2);
    const totalDuplicateCount = groups.reduce(
      (sum, g) => sum + (g.items.length - 1),
      0,
    );
    return {
      ...dupSummary,
      groups,
      groupCount: groups.length,
      totalDuplicateCount,
    };
  }, [dupSummary, removedIds]);

  const dupCountById = useMemo(() => {
    const map = new Map<string, number>();
    if (!visibleDupSummary) return map;
    for (const group of visibleDupSummary.groups) {
      const siblings = group.items.length - 1;
      for (const item of group.items) map.set(item.id, siblings);
    }
    return map;
  }, [visibleDupSummary]);

  // ─── Shared hooks ───
  const { updateFilter, goToPage } = useUrlFilters(
    "/director/workbench/passages",
  );

  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    itemLabel: "지문",
  });
  const { filterByActiveFolder } = folder;

  // Non-first members of each duplicate group, used when 중복 숨기기 is on.
  const duplicateMembersToHide = useMemo<Set<string>>(() => {
    const hidden = new Set<string>();
    if (!visibleDupSummary) return hidden;
    for (const group of visibleDupSummary.groups) {
      const sorted = [...group.items].sort(
        (a, b) =>
          new Date(b.createdAt as any).getTime() -
          new Date(a.createdAt as any).getTime(),
      );
      for (let i = 1; i < sorted.length; i += 1) hidden.add(sorted[i].id);
    }
    return hidden;
  }, [visibleDupSummary]);

  // Filter passages by active folder, hide optimistically-removed rows, then
  // sort. When 중복 숨기기 is on we also drop non-first members of each
  // duplicate group so the user sees one representative per group.
  const displayedPassages = useMemo(() => {
    const base = filterByActiveFolder(passagesData.passages).filter(
      (p) =>
        !removedIds.has(p.id) &&
        !(hideDuplicates && duplicateMembersToHide.has(p.id)),
    );
    const sorted = [...base];
    sorted.sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case "oldest":
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case "name_asc":
          return (a.title || "").localeCompare(b.title || "", "ko");
        case "name_desc":
          return (b.title || "").localeCompare(a.title || "", "ko");
        default:
          return 0;
      }
    });
    return sorted;
  }, [
    filterByActiveFolder,
    passagesData.passages,
    removedIds,
    hideDuplicates,
    duplicateMembersToHide,
    sortOrder,
  ]);

  const passageIds = useMemo(
    () => displayedPassages.map((p) => p.id),
    [displayedPassages],
  );

  const selection = useSelection(passageIds);

  const selectedPassages = useMemo(
    () => displayedPassages.filter((p) => selection.selectedIds.has(p.id)),
    [displayedPassages, selection.selectedIds],
  );

  // Stats
  const totalCount = passagesData.total;

  // ─── Folder action wrappers (pass selectedIds from selection hook) ───
  const onAddToFolder = useCallback(
    async (collectionId: string) => {
      const success = await folder.handleAddToFolder(
        collectionId,
        selection.selectedIds,
      );
      if (success) {
        selection.clearSelection();
      }
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
      const success = await folder.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selection.selectedIds,
      );
      if (success) selection.clearSelection();
    },
    [folder, selection],
  );

  const onRemoveFromFolder = useCallback(async () => {
    const success = await folder.handleRemoveFromFolder(selection.selectedIds);
    if (success) selection.clearSelection();
  }, [folder, selection]);

  const onDragToFolder = useCallback(
    (itemId: string, folderId: string, copy: boolean) => {
      folder
        .handleDragToFolder(itemId, folderId, copy, selection.selectedIds)
        .then((success) => {
          if (success) selection.clearSelection();
        });
    },
    [folder, selection],
  );

  const onDragToRoot = useCallback(
    (itemId: string, copy: boolean) => {
      if (copy || !folder.activeFolder) return;
      const ids = selection.selectedIds.has(itemId)
        ? selection.selectedIds
        : new Set([itemId]);
      folder.handleRemoveFromFolder(ids).then((success) => {
        if (success) selection.clearSelection();
      });
    },
    [folder, selection],
  );

  const onFolderClick = useCallback(
    (folderId: string) => {
      folder.setActiveFolder(folderId);
      selection.clearSelection();
    },
    [folder, selection],
  );

  const handleSearch = useCallback(
    (value: string) => updateFilter("search", value),
    [updateFilter],
  );

  const togglePageMode = useCallback(() => {
    setPageMode((mode) => (mode === "duplicates" ? "list" : "duplicates"));
  }, []);

  const toggleHideDuplicates = useCallback(() => {
    setHideDuplicates((v) => !v);
  }, []);

  // ─── Combined filters + view toggle bar (rendered in stickyFooter) ───
  const filtersToolbar = (
    <PassageFiltersToolbar
      filters={filters}
      schools={schools}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      onSearchSubmit={() => handleSearch(searchValue)}
      updateFilter={updateFilter}
      sortOrder={sortOrder}
      onSortOrderChange={setSortOrder}
      pageMode={pageMode}
      onTogglePageMode={togglePageMode}
      hideDuplicates={hideDuplicates}
      onToggleHideDuplicates={toggleHideDuplicates}
      duplicateGroupCount={visibleDupSummary?.groupCount ?? 0}
      totalDuplicateCount={visibleDupSummary?.totalDuplicateCount ?? 0}
      duplicatesLoading={dupLoading}
      gridCols={gridCols}
      setGridCols={setGridCols}
    />
  );

  // ─── "Add to folder" extra action for SelectionToolbar ───
  const addToFolderAction = (
    <MoveOrCopyFolderPicker
      collections={folder.collections}
      activeFolder={folder.activeFolder}
      selectedCount={selection.selectedIds.size}
      onCopy={onAddToFolder}
      onMove={onMoveToFolder}
    />
  );

  const studyNoteAction = (
    <button
      onClick={() => setStudyNoteOpen(true)}
      className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium text-emerald-700 bg-white border border-emerald-200 rounded-md hover:bg-emerald-50"
    >
      <BookMarked className="w-3.5 h-3.5" />
      학습자료 만들기
    </button>
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === result.requested) {
        toast.success(`${result.deleted}편의 지문을 삭제했습니다.`);
      } else if (result.deleted === 0) {
        toast.error("삭제된 지문이 없습니다.");
      } else {
        toast.warning(
          `${result.deleted}편 삭제됨, ${result.requested - result.deleted}편 누락`,
        );
      }
      // Mark as removed immediately so the grid and duplicates view update
      // without waiting for router.refresh() to round-trip.
      setRemovedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
      selection.clearSelection();
      setBulkDeleteOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }, [selection, bulkDeleting, router]);

  const bulkDeleteAction = (
    <button
      type="button"
      onClick={() => setBulkDeleteOpen(true)}
      disabled={selection.selectedIds.size === 0 || bulkDeleting}
      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {bulkDeleting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Trash2 className="w-3.5 h-3.5" />
      )}
      삭제
    </button>
  );

  const selectionActions = (
    <>
      {studyNoteAction}
      {addToFolderAction}
      {bulkDeleteAction}
    </>
  );

  const modalPassage = modalPassageId
    ? passagesData.passages.find((x) => x.id === modalPassageId)
    : null;

  const [folderStickyRef, folderStickyHeight] = useMeasuredHeight(true);

  const toolbarRow = (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/95">
      <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-2">
          <SelectAllCheckbox
            checked={
              selection.isAllSelected && selection.selectedIds.size > 0
            }
            indeterminate={
              selection.selectedIds.size > 0 && !selection.isAllSelected
            }
            disabled={displayedPassages.length === 0}
            onChange={() =>
              selection.selectedIds.size > 0
                ? selection.clearSelection()
                : selection.selectAll()
            }
            title={`${selection.selectedIds.size}개 선택`}
            ariaLabel={
              selection.selectedIds.size > 0 ? "선택 해제" : "전체 선택"
            }
          />
          <div
            className={
              "flex items-center gap-3 " +
              (selection.selectedIds.size > 0
                ? ""
                : "pointer-events-none opacity-50")
            }
            aria-disabled={selection.selectedIds.size === 0}
          >
            {selectionActions}
            {folder.activeFolder ? (
              <button
                type="button"
                onClick={onRemoveFromFolder}
                title="폴더에서 삭제"
                aria-label="폴더에서 삭제"
                className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-red-300 bg-red-50 px-2.5 text-[11px] font-semibold text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 hover:text-red-800"
              >
                <FolderX className="h-3.5 w-3.5" />
                폴더에서 삭제
              </button>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {filtersToolbar}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ─── Deep-link filter badges (sourceMaterial / collection) ─── */}
      <DeepLinkBadges
        sourceMaterialBadge={sourceMaterialBadge}
        collectionBadge={collectionBadge}
        updateFilter={updateFilter}
      />

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pt-2 pb-4">
        {passagesData.passages.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">등록된 지문이 없습니다</p>
            <p className="text-sm text-slate-400 mt-1">
              지문을 등록하여 AI 문제 생성을 시작하세요
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Link href="/director/workbench/passages/create">
                <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  지문 등록
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div
              ref={folderStickyRef}
              className="sticky top-0 z-30 shrink-0 overflow-hidden rounded-t-2xl bg-white"
            >
              <FolderSection
                embedded
                childFolders={folder.childFolders}
                activeFolder={folder.activeFolder}
                dragItemType="passage"
                dragItemIdKey="passageId"
                itemCountLabel="지문"
                showNewFolder={folder.showNewFolder}
                newFolderName={folder.newFolderName}
                onNewFolderNameChange={folder.setNewFolderName}
                onShowNewFolder={folder.setShowNewFolder}
                onCreateFolder={folder.handleCreateFolder}
                onNavigateToFolder={onFolderClick}
                onRenameFolder={folder.handleRenameFolder}
                onDeleteFolder={folder.handleDeleteFolder}
                onDragToFolder={onDragToFolder}
                onDragToRoot={onDragToRoot}
                breadcrumbPath={folder.breadcrumbPath}
                onNavigateToRoot={() => {
                  folder.setActiveFolder(null);
                  selection.clearSelection();
                }}
                useCardInsideFolder={true}
                rootLabel="전체 지문"
                enableFolderControls
                allFolders={folder.collections}
                storageKey="passages"
                treatRootAsFolder
                pageHeader={{
                  icon: <FileText className="h-3.5 w-3.5" />,
                  parentLabel: "지문 관리",
                  title: "전체 지문",
                  totalCount,
                  itemLabel: "지문",
                  itemUnit: "편",
                }}
              />
            </div>

            <div
              style={{ top: folderStickyHeight }}
              className="sticky z-20 shrink-0 border-t border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90"
            >
              {toolbarRow}
            </div>

            <div className="min-w-0 px-4 pb-3 pt-3 sm:px-5">
            {pageMode === "duplicates" ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
                    <Layers3 className="h-3.5 w-3.5 text-slate-400" />
                    중복 그룹 모아보기
                    {visibleDupSummary ? (
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                        그룹 {visibleDupSummary.groupCount}개 · 중복 지문{" "}
                        {visibleDupSummary.totalDuplicateCount}편
                      </span>
                    ) : null}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPageMode("list")}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-3 w-3" />
                    목록으로
                  </button>
                </div>

                {dupLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-[13px]">중복 자료 분석 중...</span>
                  </div>
                ) : dupError ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <p className="text-[12px] text-red-600">{dupError}</p>
                    <button
                      type="button"
                      onClick={() => void loadDuplicates()}
                      className="mt-1 h-8 rounded-lg border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : !visibleDupSummary ||
                  visibleDupSummary.groups.length === 0 ? (
                  <div className="rounded-xl border bg-white py-16 text-center">
                    <CopyMinus className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                    <p className="font-medium text-slate-500">
                      중복 자료가 없습니다
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      총 {visibleDupSummary?.totalScanned ?? 0}편의 지문을
                      검사했습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {visibleDupSummary.groups.map((group, groupIndex) => (
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
                            {group.items.length}편 동일
                          </span>
                          <span className="ml-auto max-w-[400px] truncate font-mono text-[10.5px] text-slate-400">
                            {group.items[0]?.title ?? "(제목 없음)"}
                          </span>
                        </header>
                        <div className="p-3">
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                            {group.items.map((p) => {
                              const adapted = {
                                id: p.id,
                                title: p.title,
                                content: p.contentPreview,
                                grade: p.grade,
                                semester: p.semester,
                                unit: p.unit,
                                publisher: p.publisher,
                                difficulty: p.difficulty,
                                tags: p.tags,
                                createdAt: new Date(p.createdAt as any),
                                school: p.school,
                                analysis: p.analysis
                                  ? {
                                      id: p.analysis.id,
                                      updatedAt: new Date(
                                        p.analysis.updatedAt as any,
                                      ),
                                      analysisData: null,
                                    }
                                  : null,
                                _count: p._count,
                              };
                              return (
                                <PassageFileCard
                                  key={p.id}
                                  passage={adapted}
                                  selected={selection.selectedIds.has(p.id)}
                                  onToggleSelect={selection.toggleSelect}
                                  onViewDetail={setModalPassageId}
                                  dupCount={group.items.length - 1}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {displayedPassages.length === 0 ? (
                  <div className="py-12 text-center">
                    <FileText className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                    <p className="text-[13px] text-slate-400">
                      {folder.activeFolder
                        ? "이 폴더에 지문이 없습니다."
                        : "등록된 지문이 없습니다."}
                    </p>
                    {folder.activeFolder && (
                      <p className="mt-1 text-[12px] text-slate-400">
                        지문을 드래그하거나 선택 후 &quot;폴더에 추가&quot;를
                        사용하세요.
                      </p>
                    )}
                  </div>
                ) : gridCols === "list" ? (
                  <div className="space-y-1.5">
                    {displayedPassages.map((p) => (
                      <PassageFileRow
                        key={p.id}
                        passage={p}
                        selected={selection.selectedIds.has(p.id)}
                        onToggleSelect={selection.toggleSelect}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className={
                      gridCols === "grid2"
                        ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                        : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    }
                  >
                    {displayedPassages.map((p) => (
                      <PassageFileCard
                        key={p.id}
                        passage={p}
                        selected={selection.selectedIds.has(p.id)}
                        onToggleSelect={selection.toggleSelect}
                        onViewDetail={setModalPassageId}
                        dupCount={dupCountById.get(p.id) ?? 0}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </section>
        )}

        {/* Pagination */}
        {pageMode === "list" && !folder.activeFolder && (
          <Pagination
            page={passagesData.page}
            totalPages={passagesData.totalPages}
            onGoToPage={goToPage}
          />
        )}
      </div>

      <PassageStudyNotePrintDialog
        open={studyNoteOpen}
        onOpenChange={setStudyNoteOpen}
        passages={selectedPassages}
      />

      {/* ─── Bulk Delete Confirmation ─── */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!bulkDeleting) setBulkDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              선택한 지문 {selection.selectedIds.size}편을 삭제하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 지문에 연결된 분석/문제 데이터도
              함께 삭제될 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
              disabled={bulkDeleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {bulkDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Analysis Modal ─── */}
      {modalPassage && (
        <PassageAnalysisModalWrapper
          passage={modalPassage}
          onClose={() => setModalPassageId(null)}
        />
      )}
    </div>
  );
}
