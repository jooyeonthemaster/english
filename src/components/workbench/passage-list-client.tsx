// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Copy,
  CopyMinus,
  FileText,
  Plus,
  Folder,
  BookMarked,
  Layers3,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";
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
} from "@/actions/workbench";

// Shared modules
import type { CollectionItem } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { SelectionToolbar } from "./shared/selection-toolbar";
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
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [importOpen, setImportOpen] = useState(false);
  const [viewType, setViewType] = useState<"grid" | "list">("grid");
  const [modalPassageId, setModalPassageId] = useState<string | null>(null);
  const [studyNoteOpen, setStudyNoteOpen] = useState(false);
  const [dupSummary, setDupSummary] = useState<DupSummary | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<"list" | "duplicates">("list");

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

  const dupCountById = useMemo(() => {
    const map = new Map<string, number>();
    if (!dupSummary) return map;
    for (const group of dupSummary.groups) {
      const siblings = group.items.length - 1;
      for (const item of group.items) map.set(item.id, siblings);
    }
    return map;
  }, [dupSummary]);

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

  // Filter passages by active folder
  const displayedPassages = useMemo(
    () => filterByActiveFolder(passagesData.passages),
    [filterByActiveFolder, passagesData.passages],
  );

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

  // ─── Filter + view-toggle bar (rendered inside FolderSection.toolbar) ───
  const filtersToolbar = (
    <>
      <PassageFiltersToolbar
        filters={filters}
        schools={schools}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={() => handleSearch(searchValue)}
        updateFilter={updateFilter}
        viewType={viewType}
        setViewType={setViewType}
        onImportClick={() => setImportOpen(true)}
      />

      <button
        type="button"
        onClick={() =>
          setPageMode((mode) =>
            mode === "duplicates" ? "list" : "duplicates",
          )
        }
        disabled={dupLoading || (dupSummary?.groupCount ?? 0) === 0}
        className={
          "flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11.5px] font-medium transition-all " +
          (pageMode === "duplicates"
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : (dupSummary?.groupCount ?? 0) === 0 && !dupLoading
              ? "cursor-not-allowed border-slate-200 text-slate-300"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50")
        }
        title={
          dupLoading
            ? "중복 자료 분석 중"
            : (dupSummary?.groupCount ?? 0) === 0
              ? "중복 자료가 없습니다"
              : pageMode === "duplicates"
                ? "목록으로 돌아가기"
                : "중복 그룹 모아보기"
        }
        aria-pressed={pageMode === "duplicates"}
      >
        {dupLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : pageMode === "duplicates" ? (
          <CopyMinus className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        <span>{pageMode === "duplicates" ? "목록 보기" : "중복 모아보기"}</span>
        {dupSummary && dupSummary.groupCount > 0 ? (
          <span
            className={
              "rounded px-1 text-[10px] font-semibold tabular-nums " +
              (pageMode === "duplicates"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500")
            }
          >
            {dupSummary.groupCount}
          </span>
        ) : null}
      </button>
    </>
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

  const selectionActions = (
    <>
      {studyNoteAction}
      {addToFolderAction}
    </>
  );

  const modalPassage = modalPassageId
    ? passagesData.passages.find((x) => x.id === modalPassageId)
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ─── Deep-link filter badges (sourceMaterial / collection) ─── */}
      <DeepLinkBadges
        sourceMaterialBadge={sourceMaterialBadge}
        collectionBadge={collectionBadge}
        updateFilter={updateFilter}
      />

      {/* ─── Content ─── */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 pt-0 pb-4">
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
          <>
            {/* Folders section — selection toolbar embedded inside so it
              inherits the sticky pinning. */}
            <FolderSection
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
              toolbar={filtersToolbar}
              pageHeader={{
                icon: <FileText className="h-3.5 w-3.5" />,
                title: "지문 관리",
                totalCount,
                itemLabel: "지문",
              }}
              selectionBar={
                <SelectionToolbar
                  embedded
                  selectedCount={selection.selectedIds.size}
                  totalCount={displayedPassages.length}
                  isAllSelected={selection.isAllSelected}
                  onSelectAll={selection.selectAll}
                  onClearSelection={selection.clearSelection}
                  activeFolder={folder.activeFolder}
                  onRemoveFromFolder={onRemoveFromFolder}
                  extraActions={selectionActions}
                />
              }
            />

            {pageMode === "duplicates" ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-600">
                    <Layers3 className="h-3.5 w-3.5 text-slate-400" />
                    중복 그룹 모아보기
                    {dupSummary ? (
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                        그룹 {dupSummary.groupCount}개 · 중복 자료{" "}
                        {dupSummary.totalDuplicateCount}개
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
                ) : !dupSummary || dupSummary.groups.length === 0 ? (
                  <div className="rounded-xl border bg-white py-16 text-center">
                    <CopyMinus className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                    <p className="font-medium text-slate-500">
                      중복 자료가 없습니다
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      총 {dupSummary?.totalScanned ?? 0}개 지문을 검사했습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dupSummary.groups.map((group, groupIndex) => (
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
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-slate-600">
                    파일
                    <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                      {displayedPassages.length}개
                    </span>
                  </h3>
                </div>
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
                ) : viewType === "grid" ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
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
                ) : (
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
                )}
              </div>
            )}
          </>
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

      <PassageImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <PassageStudyNotePrintDialog
        open={studyNoteOpen}
        onOpenChange={setStudyNoteOpen}
        passages={selectedPassages}
      />

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
