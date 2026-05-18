// @ts-nocheck
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Search,
  Folder,
  Grid2x2,
  List,
  Upload,
  X,
  BookMarked,
  Copy,
  CopyMinus,
  Layers3,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import { PassageStudyNotePrintDialog } from "@/components/workbench/passage-study-note-print-dialog";
import { PassageFileRow } from "@/components/workbench/passage-file-row";
import { PassageFileCard } from "@/components/workbench/passage-file-card";
import type { PassageAnalysisData } from "@/types/passage-analysis";
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

  // ─── Duplicate detection (academy-wide) ───
  const [dupSummary, setDupSummary] = useState<DupSummary | null>(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);
  // View mode: "list" = paginated grid (default); "duplicates" = cluster view
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

  // Fetch duplicates once on mount so the toolbar can show a live count + the
  // flat-list cards can render "+N 중복" badges without per-card round-trips.
  useEffect(() => {
    void loadDuplicates();
  }, [loadDuplicates]);

  // O(1) lookup: passageId → number of other passages sharing its content.
  const dupCountById = useMemo(() => {
    const m = new Map<string, number>();
    if (!dupSummary) return m;
    for (const g of dupSummary.groups) {
      const siblings = g.items.length - 1;
      for (const it of g.items) m.set(it.id, siblings);
    }
    return m;
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
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
        <input
          placeholder="검색..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch(searchValue)}
          className="w-40 h-7 pl-7 pr-2.5 text-[11.5px] rounded-md border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
        />
      </div>

      <Select
        value={filters.schoolId || "ALL"}
        onValueChange={(v) => updateFilter("schoolId", v)}
      >
        <SelectTrigger className="w-[112px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="학교" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 학교</SelectItem>
          {schools.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.grade ? String(filters.grade) : "ALL"}
        onValueChange={(v) => updateFilter("grade", v)}
      >
        <SelectTrigger className="w-[80px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="학년" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체</SelectItem>
          <SelectItem value="1">1학년</SelectItem>
          <SelectItem value="2">2학년</SelectItem>
          <SelectItem value="3">3학년</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md">
        <button
          onClick={() => setViewType("grid")}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            viewType === "grid"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          aria-label="그리드 보기"
        >
          <Grid2x2 className="w-3 h-3" />
        </button>
        <button
          onClick={() => setViewType("list")}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            viewType === "list"
              ? "bg-white shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          aria-label="목록 보기"
        >
          <List className="w-3 h-3" />
        </button>
      </div>

      <span className="h-5 w-px bg-slate-200" />

      {/* ─── Duplicate-cluster toggle ─── */}
      <button
        type="button"
        onClick={() => setPageMode((m) => (m === "duplicates" ? "list" : "duplicates"))}
        disabled={dupLoading || (dupSummary?.groupCount ?? 0) === 0}
        className={
          "h-7 px-2.5 rounded-md flex items-center gap-1 text-[11.5px] font-medium border transition-all " +
          (pageMode === "duplicates"
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : (dupSummary?.groupCount ?? 0) === 0 && !dupLoading
              ? "border-slate-200 text-slate-300 cursor-not-allowed"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300")
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
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : pageMode === "duplicates" ? (
          <CopyMinus className="w-3.5 h-3.5" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
        <span>{pageMode === "duplicates" ? "목록 보기" : "중복 모아보기"}</span>
        {dupSummary && dupSummary.groupCount > 0 ? (
          <span
            className={
              "tabular-nums text-[10px] font-semibold px-1 rounded " +
              (pageMode === "duplicates"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-500")
            }
            title={`중복 그룹 ${dupSummary.groupCount}개 · 중복 자료 ${dupSummary.totalDuplicateCount}개`}
          >
            {dupSummary.groupCount}
          </span>
        ) : null}
      </button>

      <span className="h-5 w-px bg-slate-200" />

      <Button
        variant="outline"
        size="sm"
        onClick={() => setImportOpen(true)}
        className="h-7 text-[11.5px] px-2.5"
      >
        <Upload className="w-3 h-3 mr-1" />
        일괄 등록
      </Button>
      <Link href="/director/workbench/passages/create">
        <Button
          size="sm"
          className="h-7 text-[11.5px] px-2.5 bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-3 h-3 mr-1" />
          지문 등록
        </Button>
      </Link>
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

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ─── Deep-link filter badges (sourceMaterial / collection) ─── */}
      {(sourceMaterialBadge || collectionBadge) && (
        <div className="px-6 py-2 bg-sky-50/70 border-b border-sky-100 flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold text-slate-500 mr-1">
            필터 고정됨
          </span>
          {sourceMaterialBadge && (
            <button
              type="button"
              onClick={() => updateFilter("sourceMaterialId", "")}
              className="group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-white text-[11px] font-medium text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
              title="이 시험지 필터 해제"
            >
              <BookMarked className="w-3 h-3" />
              <span className="truncate max-w-[220px]">
                {sourceMaterialBadge.label}
              </span>
              <X className="w-3 h-3 text-slate-400 group-hover:text-sky-700" />
            </button>
          )}
          {collectionBadge && (
            <button
              type="button"
              onClick={() => updateFilter("collectionId", "")}
              className="group inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-white text-[11px] font-medium text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
              title="이 폴더 필터 해제"
            >
              <Folder className="w-3 h-3" />
              <span className="truncate max-w-[180px]">
                {collectionBadge.label}
              </span>
              <X className="w-3 h-3 text-slate-400 group-hover:text-sky-700" />
            </button>
          )}
        </div>
      )}

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

            {/* ─── Duplicate cluster view (pageMode === "duplicates") ─── */}
            {pageMode === "duplicates" ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-semibold text-slate-600 flex items-center gap-1.5">
                    <Layers3 className="w-3.5 h-3.5 text-slate-400" />
                    중복 그룹 모아보기
                    {dupSummary ? (
                      <span className="ml-1.5 text-[11px] text-slate-400 font-normal">
                        그룹 {dupSummary.groupCount}개 · 중복 자료 {dupSummary.totalDuplicateCount}개
                      </span>
                    ) : null}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPageMode("list")}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    목록으로
                  </button>
                </div>

                {dupLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[13px]">중복 자료 분석 중...</span>
                  </div>
                ) : dupError ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <p className="text-[12px] text-red-600">{dupError}</p>
                    <button
                      type="button"
                      onClick={() => void loadDuplicates()}
                      className="mt-1 h-8 px-3 rounded-lg text-[12px] font-medium border border-slate-200 hover:bg-slate-50 text-slate-600"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : !dupSummary || dupSummary.groups.length === 0 ? (
                  <div className="bg-white rounded-xl border text-center py-16">
                    <CopyMinus className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">중복 자료가 없습니다</p>
                    <p className="text-sm text-slate-400 mt-1">
                      총 {dupSummary?.totalScanned ?? 0}개 지문을 검사했습니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dupSummary.groups.map((group, gi) => (
                      <section
                        key={group.key}
                        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                      >
                        <header className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/40">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                            <Copy className="w-3 h-3" />
                          </span>
                          <h4 className="text-[12.5px] font-bold text-slate-800">
                            그룹 {gi + 1}
                          </h4>
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 tabular-nums">
                            {group.items.length}개 동일
                          </span>
                          <span className="ml-auto text-[10.5px] text-slate-400 font-mono truncate max-w-[400px]">
                            {group.items[0]?.title ?? "(제목 없음)"}
                          </span>
                        </header>
                        <div className="p-3">
                          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                            {group.items.map((p) => {
                              // The cluster view uses the lightweight payload
                              // from the server action — adapt to the shape
                              // PassageFileCard expects.
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
                                      updatedAt: new Date(p.analysis.updatedAt as any),
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
            /* ─── Default flat list ─── */
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-slate-600">
                  파일
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">
                    {displayedPassages.length}개
                  </span>
                </h3>
              </div>
              {displayedPassages.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folder.activeFolder
                      ? "이 폴더에 지문이 없습니다."
                      : "등록된 지문이 없습니다."}
                  </p>
                  {folder.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">
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

        {/* Pagination — only in flat list mode */}
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
      {modalPassageId &&
        (() => {
          const p = passagesData.passages.find((x) => x.id === modalPassageId);
          if (!p) return null;
          let analysisData: PassageAnalysisData | null = null;
          try {
            if (p.analysis?.analysisData)
              analysisData = JSON.parse(p.analysis.analysisData as string);
          } catch {}
          return (
            <PassageAnalysisModal
              open={true}
              onClose={() => setModalPassageId(null)}
              passage={{
                id: p.id,
                title: p.title,
                content: p.content,
                grade: p.grade,
                semester: p.semester,
                unit: p.unit,
                publisher: p.publisher,
                difficulty: p.difficulty,
                tags: p.tags,
                source: null,
                createdAt: p.createdAt,
                school: p.school,
                analysis: p.analysis
                  ? {
                      id: p.analysis.id,
                      analysisData: p.analysis.analysisData as string,
                      contentHash: "",
                      updatedAt: p.analysis.updatedAt,
                    }
                  : null,
                notes: [],
                questions: [],
              }}
              initialAnalysis={analysisData}
            />
          );
        })()}
    </div>
  );
}
