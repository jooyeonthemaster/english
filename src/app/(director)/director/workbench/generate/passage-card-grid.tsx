"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Loader2,
  X,
  Check,
  FileText,
  Eye,
  ChevronRight,
  CornerUpLeft,
  ListFilter,
  BookOpen,
  Trash2,
  Braces,
  Target,
  Zap,
  Folder,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoveOrCopyFolderPicker } from "@/components/workbench/shared/move-or-copy-folder-picker";
import type { CollectionItem } from "@/components/workbench/shared/types";
import {
  type PassageItem,
  type PassageCollectionItem,
  type FilterOptions,
  type PassageAnalysisStatusFilter,
  countWords,
} from "./generate-page-types";

type ParsedAnalysisSummary = {
  vocabulary?: unknown[];
  grammarPoints?: unknown[];
  syntaxAnalysis?: unknown[];
  structure?: {
    topicSentenceIndex?: number | null;
    mainIdea?: string | null;
  };
  examDesign?: {
    paraphrasableSegments?: unknown[];
    structureTransformPoints?: unknown[];
  };
};

// ─── Props ───────────────────────────────────────────

interface PassageCardGridProps {
  // Data
  passages: PassageItem[];
  filteredPassages: PassageItem[];
  filterOptions: FilterOptions;
  collections: PassageCollectionItem[];
  loadingPassages: boolean;

  // Search/filter state
  passageSearch: string;
  setPassageSearch: (v: string) => void;
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  analysisStatusFilter: PassageAnalysisStatusFilter;
  setAnalysisStatusFilter: (v: PassageAnalysisStatusFilter) => void;
  passageStatusCounts: { all: number; analyzed: number; unanalyzed: number };
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  activeFilterCount: number;

  // Collection
  selectedCollectionId: string;
  setSelectedCollectionId: (v: string) => void;

  // Selection
  selectedIds: Set<string>;
  toggleCheckbox: (id: string, e?: React.MouseEvent) => void;
  selectAll: () => void;
  deselectAll: () => void;
  onCopySelectedToCollection?: (collectionId: string) => Promise<void> | void;
  onMoveSelectedToCollection?: (collectionId: string) => Promise<void> | void;
  onDeleteSelectedPassages?: () => Promise<void> | void;
  passageBulkAction?: "move" | "delete" | null;

  // Generation
  genMode: "auto" | "manual";
  totalQuestions: number;
  handleBatchGenerate: () => void;
  selectionActionText?: string;
  selectionActionDisabled?: boolean;

  // Actions
  handleOpenAnalysisModal: (passageId: string) => void;
}

// ─── Component ───────────────────────────────────────

export function PassageCardGrid({
  passages,
  filteredPassages,
  filterOptions,
  collections,
  loadingPassages,
  passageSearch,
  setPassageSearch,
  filterSchool,
  setFilterSchool,
  filterGrade,
  setFilterGrade,
  filterSemester,
  setFilterSemester,
  analysisStatusFilter,
  setAnalysisStatusFilter,
  passageStatusCounts,
  showFilters,
  setShowFilters,
  activeFilterCount,
  selectedCollectionId,
  setSelectedCollectionId,
  selectedIds,
  toggleCheckbox,
  selectAll,
  deselectAll,
  onCopySelectedToCollection,
  onMoveSelectedToCollection,
  onDeleteSelectedPassages,
  passageBulkAction = null,
  genMode,
  totalQuestions,
  handleBatchGenerate,
  selectionActionText,
  selectionActionDisabled,
  handleOpenAnalysisModal,
}: PassageCardGridProps) {
  const [showSearch, setShowSearch] = useState(() => passageSearch.length > 0);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const allVisibleSelected =
    filteredPassages.length > 0 &&
    filteredPassages.every((passage) => selectedIds.has(passage.id));
  const someVisibleSelected = filteredPassages.some((passage) =>
    selectedIds.has(passage.id),
  );
  const selectedCollection =
    selectedCollectionId.length > 0
      ? collections.find((collection) => collection.id === selectedCollectionId)
      : null;
  const breadcrumbPath = (() => {
    if (!selectedCollection) return [] as PassageCollectionItem[];
    const path: PassageCollectionItem[] = [];
    const byId = new Map(
      collections.map((collection) => [collection.id, collection]),
    );
    let current: PassageCollectionItem | undefined = selectedCollection;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  })();
  const childCollections = collections.filter((collection) =>
    selectedCollectionId
      ? collection.parentId === selectedCollectionId
      : collection.parentId == null,
  );
  const parentCollectionId = selectedCollection?.parentId ?? "";
  const movePickerCollections = useMemo<CollectionItem[]>(() => {
    const childCountByParent = new Map<string, number>();
    for (const collection of collections) {
      if (!collection.parentId) continue;
      childCountByParent.set(
        collection.parentId,
        (childCountByParent.get(collection.parentId) ?? 0) + 1,
      );
    }
    return collections.map((collection) => ({
      id: collection.id,
      parentId: collection.parentId ?? null,
      name: collection.name,
      description: null,
      color: null,
      createdAt: null,
      _count: {
        items: collection._count.items,
        children: childCountByParent.get(collection.id) ?? 0,
      },
    }));
  }, [collections]);
  const canManageSelectedPassages =
    !!onCopySelectedToCollection &&
    !!onMoveSelectedToCollection &&
    !!onDeleteSelectedPassages;
  const copySelectedToCollection = onCopySelectedToCollection ?? (() => {});
  const moveSelectedToCollection = onMoveSelectedToCollection ?? (() => {});
  const deleteSelectedPassages = onDeleteSelectedPassages ?? (() => {});

  useEffect(() => {
    if (!selectAllCheckboxRef.current) return;
    selectAllCheckboxRef.current.indeterminate =
      someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  const handleCardKeyDown = (
    id: string,
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleCheckbox(id);
  };

  const renderFolderChip = (
    key: string,
    label: string,
    count: number,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={label}
      className={
        "group relative flex w-[64px] cursor-pointer flex-col items-center justify-center rounded-lg border px-1 py-1 shadow-sm transition-all " +
        (active
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200/60 shadow-md"
          : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md")
      }
    >
      {active ? (
        <FolderOpen
          className="mb-0.5 size-3 text-blue-600"
          aria-hidden="true"
        />
      ) : (
        <Folder className="mb-0.5 size-3 text-blue-500" aria-hidden="true" />
      )}
      <span
        className={
          "max-w-[56px] truncate text-center text-[9.5px] font-bold leading-tight " +
          (active ? "text-blue-700" : "text-slate-800")
        }
      >
        {label}
      </span>
      <span
        className={
          "text-[8.5px] tabular-nums " +
          (active ? "text-blue-500" : "text-slate-400")
        }
      >
        {count}개
      </span>
    </button>
  );

  const renderParentChip = () => (
    <button
      type="button"
      onClick={() => setSelectedCollectionId(parentCollectionId)}
      title={parentCollectionId ? "상위 폴더로 이동" : "전체 지문으로 이동"}
      className="group relative flex size-[48px] cursor-pointer flex-col items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-blue-600 hover:shadow-md"
    >
      <CornerUpLeft className="mb-0.5 size-3.5" aria-hidden="true" />
      <span className="text-[9.5px] font-semibold">상위</span>
    </button>
  );

  return (
    <div className="flex flex-1 min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      {/* ─── 지문 폴더 (탐색/필터 전용) ─── */}
      <div className="shrink-0 border-b border-slate-100">
        <div className="flex min-w-0 items-center gap-2 px-5 pt-3 pb-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <FolderOpen className="h-3.5 w-3.5" />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="shrink-0 truncate text-[12px] font-medium text-slate-400">
              지문 관리 ·
            </span>
            <button
              type="button"
              onClick={() => setSelectedCollectionId("")}
              className={
                "shrink-0 cursor-pointer truncate text-[12px] transition-colors hover:text-blue-700 " +
                (breadcrumbPath.length === 0
                  ? "font-bold text-slate-900"
                  : "font-medium text-slate-500")
              }
            >
              전체 지문
            </button>
            {breadcrumbPath.map((folder, index) => {
              const current = index === breadcrumbPath.length - 1;
              return (
                <span
                  key={folder.id}
                  className="flex min-w-0 items-center gap-1"
                >
                  <ChevronRight
                    className="size-3 shrink-0 text-slate-300"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedCollectionId(folder.id)}
                    className={
                      "cursor-pointer truncate text-[12px] transition-colors hover:text-blue-700 " +
                      (current
                        ? "font-bold text-slate-900"
                        : "font-medium text-slate-500")
                    }
                  >
                    {folder.name}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
        <div className="max-h-[136px] overflow-y-auto bg-slate-50/70 px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {selectedCollectionId
              ? renderParentChip()
              : renderFolderChip(
                  "__all__",
                  "전체 지문",
                  passages.length,
                  true,
                  () => setSelectedCollectionId(""),
                )}
            {childCollections.map((c) =>
              renderFolderChip(c.id, c.name, c._count.items, false, () =>
                setSelectedCollectionId(c.id),
              ),
            )}
          </div>
        </div>
      </div>

      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="px-5 py-2 bg-blue-50 border-b border-blue-200 shrink-0 flex items-center gap-3">
          <span className="text-[12px] font-semibold text-blue-700">
            {selectedIds.size}개 선택
          </span>
          <div className="w-px h-4 bg-blue-200" />
          <button
            onClick={
              selectedIds.size === filteredPassages.length
                ? deselectAll
                : selectAll
            }
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
          >
            {selectedIds.size === filteredPassages.length
              ? "선택 해제"
              : "전체 선택"}
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700 rounded-lg"
            onClick={handleBatchGenerate}
            disabled={
              selectionActionDisabled ??
              (genMode === "manual" && totalQuestions === 0)
            }
          >
            <Zap className="w-3.5 h-3.5 mr-1" />
            {selectionActionText ?? `${selectedIds.size}개 지문 일괄 생성`}
          </Button>
          <button
            onClick={deselectAll}
            className="text-[11px] text-blue-500 hover:text-blue-700 font-medium"
          >
            취소
          </button>
        </div>
      )}

      {/* Search & filter bar */}
      <div className="px-5 py-3 border-b border-slate-100 shrink-0">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
          <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="flex min-h-9 shrink-0 items-center gap-x-1.5 gap-y-1.5 py-1 pl-2 pr-0 transition-colors">
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() =>
                  allVisibleSelected ? deselectAll() : selectAll()
                }
                disabled={filteredPassages.length === 0}
                title={
                  allVisibleSelected
                    ? "선택 해제"
                    : `${filteredPassages.length}개 전체 선택`
                }
                aria-label={allVisibleSelected ? "선택 해제" : "전체 선택"}
                className="size-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {canManageSelectedPassages ? (
                <div
                  className={
                    "flex items-center gap-3 " +
                    (selectedIds.size > 0
                      ? ""
                      : "pointer-events-none opacity-50")
                  }
                  aria-disabled={selectedIds.size === 0}
                >
                  <MoveOrCopyFolderPicker
                    collections={movePickerCollections}
                    activeFolder={selectedCollectionId || null}
                    selectedCount={selectedIds.size}
                    onCopy={copySelectedToCollection}
                    onMove={moveSelectedToCollection}
                    disabled={
                      selectedIds.size === 0 || passageBulkAction !== null
                    }
                    compact
                  />
                  <button
                    type="button"
                    onClick={deleteSelectedPassages}
                    disabled={
                      selectedIds.size === 0 || passageBulkAction !== null
                    }
                    title="삭제"
                    aria-label="삭제"
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {passageBulkAction === "delete" ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                aria-expanded={showFilters}
                title={
                  activeFilterCount > 0
                    ? `필터 ${activeFilterCount}개 적용`
                    : "필터"
                }
                aria-label="필터"
                className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  showFilters || activeFilterCount > 0
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-input bg-transparent text-slate-700 hover:bg-slate-50"
                }`}
              >
                <ListFilter className="size-3.5 shrink-0" aria-hidden="true" />
                {activeFilterCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
                  />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setShowSearch((open) => !open)}
                aria-expanded={showSearch}
                title={passageSearch ? "검색어 적용 중" : "검색"}
                aria-label="검색"
                className={`relative flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  showSearch || passageSearch
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-input bg-transparent text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Search className="size-3.5 shrink-0" aria-hidden="true" />
                {passageSearch ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 inline-block size-1.5 rounded-full bg-blue-500"
                  />
                ) : null}
              </button>
            </div>
          </div>

          {showSearch && (
            <div className="mt-1.5 border-t border-slate-100 pt-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="지문 제목 또는 내용으로 검색..."
                  value={passageSearch}
                  onChange={(e) => setPassageSearch(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-7 pr-7 text-[12px] text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
                />
                {passageSearch ? (
                  <button
                    type="button"
                    onClick={() => setPassageSearch("")}
                    className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="검색어 지우기"
                    title="검색어 지우기"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {showFilters && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
              {filterOptions.schools.length > 0 && (
                <select
                  value={filterSchool}
                  onChange={(e) => setFilterSchool(e.target.value)}
                  className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                    filterSchool
                      ? "bg-blue-50 text-blue-700 border-blue-300"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <option value="">학교 전체</option>
                  {filterOptions.schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              {filterOptions.grades.length > 0 && (
                <select
                  value={filterGrade}
                  onChange={(e) => setFilterGrade(e.target.value)}
                  className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                    filterGrade
                      ? "bg-blue-50 text-blue-700 border-blue-300"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <option value="">학년 전체</option>
                  {filterOptions.grades.map((g) => (
                    <option key={g} value={g}>
                      {g}학년
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {[
                  { value: "", label: "전체" },
                  { value: "FIRST", label: "1학기" },
                  { value: "SECOND", label: "2학기" },
                ].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setFilterSemester(s.value)}
                    className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                      filterSemester === s.value
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                {[
                  {
                    value: "all" as const,
                    label: "전체",
                    count: passageStatusCounts.all,
                  },
                  {
                    value: "analyzed" as const,
                    label: "분석 완료",
                    count: passageStatusCounts.analyzed,
                  },
                  {
                    value: "unanalyzed" as const,
                    label: "미분석",
                    count: passageStatusCounts.unanalyzed,
                  },
                ].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setAnalysisStatusFilter(s.value)}
                    className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                      analysisStatusFilter === s.value
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {s.label}{" "}
                    <span className="text-[10px] opacity-70">{s.count}</span>
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilterSchool("");
                    setFilterGrade("");
                    setFilterSemester("");
                    setAnalysisStatusFilter("all");
                  }}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium ml-auto flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  초기화
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Passage card grid -- scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingPassages ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-[12px] text-slate-400">
              지문 불러오는 중...
            </span>
          </div>
        ) : filteredPassages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <FileText className="w-8 h-8 text-slate-300" />
            <span className="text-[13px] text-slate-400 font-medium">
              {passages.length === 0
                ? "등록된 지문이 없습니다"
                : "검색 결과가 없습니다"}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {filteredPassages.map((p) => {
              // Parse analysis
              let aData: ParsedAnalysisSummary | null = null;
              if (p.analysis?.analysisData) {
                try {
                  aData =
                    typeof p.analysis.analysisData === "string"
                      ? JSON.parse(p.analysis.analysisData)
                      : p.analysis.analysisData;
                } catch {}
              }
              const vocabCount = aData?.vocabulary?.length || 0;
              const grammarCount = aData?.grammarPoints?.length || 0;
              const syntaxCount = aData?.syntaxAnalysis?.length || 0;
              const keySentenceCount =
                aData?.structure?.topicSentenceIndex != null ? 1 : 0;
              const examPointCount =
                (aData?.examDesign?.paraphrasableSegments?.length || 0) +
                (aData?.examDesign?.structureTransformPoints?.length || 0);
              const mainIdea = aData?.structure?.mainIdea;

              const isChecked = selectedIds.has(p.id);
              const hasAnalysis = !!p.analysis;

              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isChecked}
                  aria-label={`${p.title} passage ${isChecked ? "deselect" : "select"}`}
                  onClick={(e) => toggleCheckbox(p.id, e)}
                  onKeyDown={(e) => handleCardKeyDown(p.id, e)}
                  className={`group relative rounded-xl border p-4 transition-all duration-200 hover:shadow-md flex flex-col ${
                    isChecked
                      ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-300/30"
                      : hasAnalysis
                        ? "border-emerald-200 bg-white"
                        : "border-slate-200 bg-white"
                  } cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white`}
                >
                  {/* Header with checkbox */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {/* Checkbox */}
                      <button
                        type="button"
                        aria-pressed={isChecked}
                        aria-label={`${p.title} passage ${isChecked ? "deselect" : "select"}`}
                        onClick={(e) => toggleCheckbox(p.id, e)}
                        className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                          isChecked
                            ? "bg-blue-600 text-white border border-blue-600"
                            : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[13px] font-semibold text-slate-800 truncate">
                          {p.title}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {p.analysis && (
                            <span className="text-[10px] font-medium text-emerald-600">
                              분석 완료
                            </span>
                          )}
                          {!hasAnalysis && (
                            <span className="text-[10px] font-medium text-slate-400">
                              미분석
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            {countWords(p.content)} words
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Hover actions */}
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenAnalysisModal(p.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                        title="상세 보기"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </div>
                  </div>

                  {/* Content preview */}
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-3">
                    {p.content.slice(0, 200)}...
                  </p>

                  {/* Main idea + Meta + Analysis badges */}
                  <div className="mt-3 space-y-2">
                    {mainIdea && (
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                        {mainIdea}
                      </p>
                    )}
                    {(p.school || p.grade || p.semester) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.school && (
                          <Badge
                            variant="outline"
                            className="text-[9px] h-5 px-1.5 font-medium"
                          >
                            {p.school.name}
                          </Badge>
                        )}
                        {p.grade && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] h-5 px-1.5"
                          >
                            {p.grade}학년
                          </Badge>
                        )}
                        {p.semester && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] h-5 px-1.5"
                          >
                            {p.semester === "FIRST" ? "1학기" : "2학기"}
                          </Badge>
                        )}
                      </div>
                    )}
                    {aData && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {vocabCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            <BookOpen className="w-3 h-3" /> 어휘 {vocabCount}
                          </span>
                        )}
                        {grammarCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                            <Braces className="w-3 h-3" /> 문법 {grammarCount}
                          </span>
                        )}
                        {syntaxCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                            <Braces className="w-3 h-3" /> 구문 {syntaxCount}
                          </span>
                        )}
                        {keySentenceCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                            핵심문장 {keySentenceCount}
                          </span>
                        )}
                        {examPointCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                            <Target className="w-3 h-3" /> 출제포인트{" "}
                            {examPointCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex-1" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
