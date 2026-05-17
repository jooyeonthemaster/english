// @ts-nocheck
"use client";

import { useState, useMemo, useCallback } from "react";
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
} from "@/actions/workbench";

// Shared modules
import type { CollectionItem, CollectionActions } from "./shared/types";
import { Pagination } from "./shared/pagination";
import { FolderSection } from "./shared/folder-section";
import { SelectionToolbar } from "./shared/selection-toolbar";
import { MoveOrCopyFolderPicker } from "./shared/move-or-copy-folder-picker";

// Hooks
import { useFolderManager } from "./hooks/use-folder-manager";
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
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  _count: { questions: number; notes: number };
}

interface PassageListProps {
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
const folderActions: CollectionActions = {
  create: createPassageCollection,
  update: updatePassageCollection,
  delete: deletePassageCollection,
  addItems: addPassagesToCollection,
  removeItems: removePassagesFromCollection,
};

// ─── Main Component ──────────────────────────────────────
export function PassageListClient({
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

  // ─── Shared hooks ───
  const { updateFilter, goToPage } = useUrlFilters("/director/workbench/passages");

  const folder = useFolderManager({
    initialCollections,
    initialMembership,
    actions: folderActions,
    entityLabel: "지문",
  });

  // Filter passages by active folder
  const displayedPassages = useMemo(
    () => folder.filterByActiveFolder(passagesData.passages),
    [folder.filterByActiveFolder, passagesData.passages],
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
      const result = await folder.handleAddToFolder(collectionId, [...selection.selectedIds]);
      if (result?.success) {
        selection.clearSelection();
      }
    },
    [folder, selection],
  );

  const onMoveToFolder = useCallback(
    async (collectionId: string) => {
      if (selection.selectedIds.size === 0) return;
      const anyId = selection.selectedIds.values().next().value as string | undefined;
      if (!anyId) return;
      const result = await folder.handleDragToFolder(
        anyId,
        collectionId,
        false,
        selection.selectedIds,
      );
      if (result?.success) selection.clearSelection();
    },
    [folder, selection],
  );

  const onRemoveFromFolder = useCallback(async () => {
    const result = await folder.handleRemoveFromFolder([...selection.selectedIds]);
    if (result?.success) selection.clearSelection();
  }, [folder, selection]);

  const onDragToFolder = useCallback(
    (itemId: string, folderId: string, copy: boolean) => {
      folder.handleDragToFolder(itemId, folderId, copy, selection.selectedIds).then((result) => {
        if (result?.success) selection.clearSelection();
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

      <Select value={filters.schoolId || "ALL"} onValueChange={(v) => updateFilter("schoolId", v)}>
        <SelectTrigger className="w-[112px] h-7 text-[11.5px] px-2.5">
          <SelectValue placeholder="학교" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">전체 학교</SelectItem>
          {schools.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.grade ? String(filters.grade) : "ALL"} onValueChange={(v) => updateFilter("grade", v)}>
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

      <Button
        variant="outline"
        size="sm"
        onClick={() => setImportOpen(true)}
        className="h-7 text-[11.5px] px-2.5"
      >
        <Upload className="w-3 h-3 mr-1" />일괄 등록
      </Button>
      <Link href="/director/workbench/passages/create">
        <Button size="sm" className="h-7 text-[11.5px] px-2.5 bg-blue-600 hover:bg-blue-700">
          <Plus className="w-3 h-3 mr-1" />지문 등록
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
              <span className="truncate max-w-[220px]">{sourceMaterialBadge.label}</span>
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
              <span className="truncate max-w-[180px]">{collectionBadge.label}</span>
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
            <p className="text-sm text-slate-400 mt-1">지문을 등록하여 AI 문제 생성을 시작하세요</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Link href="/director/workbench/passages/create">
                <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />지문 등록
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
            breadcrumbPath={folder.breadcrumbPath}
            onNavigateToRoot={() => { folder.setActiveFolder(null); selection.clearSelection(); }}
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

            {/* Files section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold text-slate-600">
                  파일
                  <span className="ml-1.5 text-[11px] text-slate-400 font-normal">{displayedPassages.length}개</span>
                </h3>
              </div>
              {displayedPassages.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-[13px] text-slate-400">
                    {folder.activeFolder ? "이 폴더에 지문이 없습니다." : "등록된 지문이 없습니다."}
                  </p>
                  {folder.activeFolder && (
                    <p className="text-[12px] text-slate-400 mt-1">지문을 드래그하거나 선택 후 &quot;폴더에 추가&quot;를 사용하세요.</p>
                  )}
                </div>
              ) : viewType === "grid" ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                  {displayedPassages.map((p) => (
                    <PassageFileCard key={p.id} passage={p} selected={selection.selectedIds.has(p.id)} onToggleSelect={selection.toggleSelect} onViewDetail={setModalPassageId} />
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {displayedPassages.map((p) => (
                    <PassageFileRow key={p.id} passage={p} selected={selection.selectedIds.has(p.id)} onToggleSelect={selection.toggleSelect} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Pagination */}
        {!folder.activeFolder && (
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
      {modalPassageId && (() => {
        const p = passagesData.passages.find((x) => x.id === modalPassageId);
        if (!p) return null;
        let analysisData: PassageAnalysisData | null = null;
        try { if (p.analysis?.analysisData) analysisData = JSON.parse(p.analysis.analysisData as string); } catch {}
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
              analysis: p.analysis ? { id: p.analysis.id, analysisData: p.analysis.analysisData as string, contentHash: "", updatedAt: p.analysis.updatedAt } : null,
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
