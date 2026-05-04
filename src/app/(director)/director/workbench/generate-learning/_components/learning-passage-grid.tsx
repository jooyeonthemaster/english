"use client";

import {
  Search,
  Loader2,
  FileText,
  Zap,
  SquareCheck,
  Square,
  Filter,
  BookOpen,
  FolderOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PassageItem } from "./generate-learning-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  passages: PassageItem[];
  totalPassages: number;
  loading: boolean;
  filterOptions: {
    schools: { id: string; name: string }[];
    grades: number[];
    semesters: string[];
  };
  collections: { id: string; name: string; _count: { items: number } }[];
  search: string;
  setSearch: (v: string) => void;
  filterGrade: string;
  setFilterGrade: (v: string) => void;
  filterSchool: string;
  setFilterSchool: (v: string) => void;
  filterSemester: string;
  setFilterSemester: (v: string) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  activeFilterCount: number;
  selectedCollectionId: string;
  setSelectedCollectionId: (v: string) => void;
  selectedIds: Set<string>;
  toggleCheckbox: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  canGenerate: boolean;
  handleBatchGenerate: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LearningPassageGrid({
  passages,
  totalPassages,
  loading,
  filterOptions,
  collections,
  search,
  setSearch,
  filterGrade,
  setFilterGrade,
  filterSchool,
  setFilterSchool,
  filterSemester,
  setFilterSemester,
  showFilters,
  setShowFilters,
  activeFilterCount,
  selectedCollectionId,
  setSelectedCollectionId,
  selectedIds,
  toggleCheckbox,
  selectAll,
  deselectAll,
  canGenerate,
  handleBatchGenerate,
}: Props) {
  return (
    <div className="flex flex-col overflow-hidden bg-white border-r border-slate-200/80">
      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="px-5 py-2 bg-blue-50 border-b border-blue-200 shrink-0 flex items-center gap-3">
          <span className="text-[12px] font-semibold text-blue-700">
            {selectedIds.size}개 선택
          </span>
          <div className="w-px h-4 bg-blue-200" />
          <button
            onClick={
              selectedIds.size === passages.length ? deselectAll : selectAll
            }
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
          >
            {selectedIds.size === passages.length
              ? "선택 해제"
              : "전체 선택"}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleBatchGenerate}
            disabled={!canGenerate}
            className="h-8 px-4 text-[12px] font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-40 flex items-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" />
            {selectedIds.size}개 지문 일괄 생성
          </button>
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
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              placeholder="지문 제목 또는 내용으로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-10 pr-4 text-[13px] rounded-lg border border-slate-200 bg-slate-50/80 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all border",
              showFilters || activeFilterCount > 0
                ? "bg-blue-50 text-blue-700 border-blue-300 shadow-sm"
                : "text-slate-500 border-slate-200 hover:bg-slate-50"
            )}
          >
            <Filter className="w-3.5 h-3.5" />
            필터{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <div className="flex items-center gap-1 px-2.5 h-9 rounded-lg bg-slate-50 border border-slate-200">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[12px] font-semibold text-slate-600">
              {passages.length}
            </span>
            <span className="text-[11px] text-slate-400">개</span>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
            {filterOptions.schools.length > 0 && (
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className={cn(
                  "h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all",
                  filterSchool
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "bg-white text-slate-500 border-slate-200"
                )}
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
                className={cn(
                  "h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all",
                  filterGrade
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "bg-white text-slate-500 border-slate-200"
                )}
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
                  className={cn(
                    "h-6 px-2.5 rounded-md text-[11px] font-medium transition-all",
                    filterSemester === s.value
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setFilterSchool("");
                  setFilterGrade("");
                  setFilterSemester("");
                }}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium ml-auto flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                초기화
              </button>
            )}
          </div>
        )}

        {/* Collection tabs */}
        {collections.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-100 overflow-x-auto">
            <button
              onClick={() => setSelectedCollectionId("")}
              className={cn(
                "shrink-0 h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border",
                !selectedCollectionId
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "text-slate-500 border-slate-200 hover:border-slate-300"
              )}
            >
              전체 지문
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  setSelectedCollectionId(
                    selectedCollectionId === c.id ? "" : c.id
                  )
                }
                className={cn(
                  "shrink-0 h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border",
                  selectedCollectionId === c.id
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "text-slate-500 border-slate-200 hover:border-slate-300"
                )}
              >
                <FolderOpen className="w-3 h-3" />
                {c.name}
                <span className="text-[10px] text-slate-400">
                  {c._count.items}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Passage card grid */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 pt-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : passages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileText className="w-8 h-8 mb-2" />
            <p className="text-[13px]">
              {totalPassages === 0
                ? "등록된 지문이 없습니다"
                : "검색 결과가 없습니다"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
            {passages.map((p) => {
              const checked = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleCheckbox(p.id)}
                  className={cn(
                    "text-left rounded-xl border p-3.5 transition-all group",
                    checked
                      ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-200"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      {checked ? (
                        <SquareCheck className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-slate-800 truncate">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {p.content.slice(0, 120)}...
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {p.analysis && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">
                            분석 완료
                          </span>
                        )}
                        {p.grade && (
                          <span className="text-[10px] text-slate-400">
                            {p.grade}학년
                          </span>
                        )}
                        {p.school?.name && (
                          <span className="text-[10px] text-slate-400">
                            {p.school.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
