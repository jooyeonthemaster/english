// @ts-nocheck
"use client";

import {
  Search,
  Loader2,
  X,
  Check,
  FileText,
  Eye,
  Filter,
  BookOpen,
  Braces,
  Target,
  Zap,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type PassageItem, type FilterOptions, countWords } from "./generate-page-types";

// ─── Props ───────────────────────────────────────────

interface PassageCardGridProps {
  // Data
  passages: PassageItem[];
  filteredPassages: PassageItem[];
  filterOptions: FilterOptions;
  collections: { id: string; name: string; _count: { items: number } }[];
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

  // Generation
  genMode: "auto" | "manual";
  totalQuestions: number;
  handleBatchGenerate: () => void;

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
  showFilters,
  setShowFilters,
  activeFilterCount,
  selectedCollectionId,
  setSelectedCollectionId,
  selectedIds,
  toggleCheckbox,
  selectAll,
  deselectAll,
  genMode,
  totalQuestions,
  handleBatchGenerate,
  handleOpenAnalysisModal,
}: PassageCardGridProps) {
  return (
    <div className="flex flex-col overflow-hidden bg-white border-r lg:border-r-0 border-slate-200/80 flex-1 min-w-0">
      {/* Selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="px-5 py-2 bg-blue-50 border-b border-blue-200 shrink-0 flex items-center gap-3">
          <span className="text-[12px] font-semibold text-blue-700">{selectedIds.size}개 선택</span>
          <div className="w-px h-4 bg-blue-200" />
          <button onClick={selectedIds.size === filteredPassages.length ? deselectAll : selectAll}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-medium">
            {selectedIds.size === filteredPassages.length ? "선택 해제" : "전체 선택"}
          </button>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700 rounded-lg"
            onClick={handleBatchGenerate}
            disabled={genMode === "manual" && totalQuestions === 0}
          >
            <Zap className="w-3.5 h-3.5 mr-1" />
            {selectedIds.size}개 지문 일괄 생성
          </Button>
          <button onClick={deselectAll} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">취소</button>
        </div>
      )}

      {/* Search & filter bar */}
      <div className="px-5 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              placeholder="지문 제목 또는 내용으로 검색..."
              value={passageSearch}
              onChange={(e) => setPassageSearch(e.target.value)}
              className="w-full h-9 pl-10 pr-4 text-[13px] rounded-lg border border-slate-200 bg-slate-50/80 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 transition-all"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all border ${
              showFilters || activeFilterCount > 0
                ? "bg-blue-50 text-blue-700 border-blue-300 shadow-sm shadow-blue-100"
                : "text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            필터{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <div className="flex items-center gap-1 px-2.5 h-9 rounded-lg bg-slate-50 border border-slate-200">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[12px] font-semibold text-slate-600">{filteredPassages.length}</span>
            <span className="text-[11px] text-slate-400">개</span>
          </div>
        </div>

        {showFilters && (
          <div className="flex items-center flex-wrap gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
            {filterOptions.schools.length > 0 && (
              <select value={filterSchool} onChange={(e) => setFilterSchool(e.target.value)}
                className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                  filterSchool ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}>
                <option value="">학교 전체</option>
                {filterOptions.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {filterOptions.grades.length > 0 && (
              <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}
                className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                  filterGrade ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}>
                <option value="">학년 전체</option>
                {filterOptions.grades.map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
            )}
            <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              {[{ value: "", label: "전체" }, { value: "FIRST", label: "1학기" }, { value: "SECOND", label: "2학기" }].map((s) => (
                <button key={s.value} onClick={() => setFilterSemester(s.value)}
                  className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                    filterSemester === s.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}>{s.label}</button>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilterSchool(""); setFilterGrade(""); setFilterSemester(""); }}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium ml-auto flex items-center gap-1">
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
              className={`shrink-0 h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border ${
                !selectedCollectionId
                  ? "bg-blue-50 text-blue-700 border-blue-300"
                  : "text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              전체 지문
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCollectionId(selectedCollectionId === c.id ? "" : c.id)}
                className={`shrink-0 h-7 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border ${
                  selectedCollectionId === c.id
                    ? "bg-blue-50 text-blue-700 border-blue-300"
                    : "text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <FolderOpen className="w-3 h-3" />
                {c.name}
                <span className="text-[10px] text-slate-400">{c._count.items}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Passage card grid -- scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingPassages ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span className="text-[12px] text-slate-400">지문 불러오는 중...</span>
          </div>
        ) : filteredPassages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <FileText className="w-8 h-8 text-slate-300" />
            <span className="text-[13px] text-slate-400 font-medium">
              {passages.length === 0 ? "등록된 지문이 없습니다" : "검색 결과가 없습니다"}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {filteredPassages.map((p) => {
              // Parse analysis
              let aData: any = null;
              if (p.analysis?.analysisData) {
                try { aData = typeof p.analysis.analysisData === "string" ? JSON.parse(p.analysis.analysisData) : p.analysis.analysisData; } catch {}
              }
              const vocabCount = aData?.vocabulary?.length || 0;
              const grammarCount = aData?.grammarPoints?.length || 0;
              const syntaxCount = aData?.syntaxAnalysis?.length || 0;
              const keySentenceCount = aData?.structure?.topicSentenceIndex != null ? 1 : 0;
              const examPointCount = (aData?.examDesign?.paraphrasableSegments?.length || 0) + (aData?.examDesign?.structureTransformPoints?.length || 0);
              const mainIdea = aData?.structure?.mainIdea;

              const isChecked = selectedIds.has(p.id);

              return (
                <div
                  key={p.id}
                  className={`group relative rounded-xl border p-4 transition-all duration-200 hover:shadow-md flex flex-col ${
                    isChecked
                      ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-300/30"
                      : "border-emerald-200 bg-white"
                  }`}
                >
                  {/* Header with checkbox */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      {/* Checkbox */}
                      <button
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
                        <h4 className="text-[13px] font-semibold text-slate-800 truncate">{p.title}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
                          <span className="text-[10px] text-slate-400">{countWords(p.content)} words</span>
                        </div>
                      </div>
                    </div>

                    {/* Hover actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button
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
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{mainIdea}</p>
                    )}
                    {(p.school || p.grade || p.semester) && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.school && <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">{p.school.name}</Badge>}
                        {p.grade && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{p.grade}학년</Badge>}
                        {p.semester && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{p.semester === "FIRST" ? "1학기" : "2학기"}</Badge>}
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
                            <Target className="w-3 h-3" /> 출제포인트 {examPointCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Detail view button -- pinned to bottom */}
                  <div className="flex-1" />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenAnalysisModal(p.id); }}
                    className="w-full mt-3 h-8 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[11px] font-medium text-blue-700 hover:text-blue-800 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3 h-3" />
                    상세 보기
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
