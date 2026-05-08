"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Palette,
  Search,
  Filter,
  BookOpen,
  Loader2,
  FileText,
  Check,
  Zap,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  WEBTOON_STYLES,
  type WebtoonStyleId,
} from "./webtoon-page-types";
import { useWebtoonState } from "./use-webtoon-state";
import { WebtoonQueueCard } from "./webtoon-queue-card";

interface PassageItem {
  id: string;
  title: string;
  grade: number | null;
  semester: string | null;
  content: string;
  school: { id: string; name: string } | null;
  analysis?: { analysisData: string } | null;
}

interface FilterOptions {
  schools: { id: string; name: string }[];
  grades: number[];
  semesters: string[];
}

export function WebtoonPageClient({ academyId }: { academyId: string }) {
  // ── Passage data ──
  const [passages, setPassages] = useState<PassageItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ schools: [], grades: [], semesters: [] });
  const [loadingPassages, setLoadingPassages] = useState(true);

  // ── Search/filter ──
  const [passageSearch, setPassageSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [onlyAnalyzed, setOnlyAnalyzed] = useState(true);

  // ── Selection ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Config ──
  const [style, setStyle] = useState<WebtoonStyleId>("KOREAN_WEBTOON");
  const [customPrompt, setCustomPrompt] = useState("");

  // ── Queue (DB-backed, polled) ──
  const {
    items: queue,
    loading: queueLoading,
    handleBatchGenerate,
    handleRetry,
    handleRemove,
  } = useWebtoonState({ academyId });

  // ── Load passages ──
  useEffect(() => {
    fetch(`/api/passages/list?academyId=${academyId}`)
      .then((r) => r.json())
      .then((data) => {
        setPassages(data.passages || []);
        if (data.filters) setFilterOptions(data.filters);
      })
      .catch(() => toast.error("지문을 불러오지 못했습니다"))
      .finally(() => setLoadingPassages(false));
  }, [academyId]);

  // ── Filtering ──
  const filteredPassages = useMemo(() => {
    return passages.filter((p) => {
      if (onlyAnalyzed && !p.analysis) return false;
      if (passageSearch) {
        const q = passageSearch.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
      }
      if (filterSchool && p.school?.id !== filterSchool) return false;
      if (filterGrade && p.grade !== Number(filterGrade)) return false;
      if (filterSemester && p.semester !== filterSemester) return false;
      return true;
    });
  }, [passages, passageSearch, filterSchool, filterGrade, filterSemester, onlyAnalyzed]);

  const activeFilterCount = [filterSchool, filterGrade, filterSemester].filter(Boolean).length;

  const queueCounts = useMemo(() => ({
    generating: queue.filter((q) => q.status === "PENDING" || q.status === "GENERATING").length,
    done: queue.filter((q) => q.status === "COMPLETED").length,
    error: queue.filter((q) => q.status === "FAILED").length,
  }), [queue]);

  // ── Selection handlers ──
  const toggleCheckbox = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filteredPassages.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());

  // ── Generation ──
  const canGenerate = selectedIds.size > 0;
  const onGenerate = () => {
    if (!canGenerate) return;
    const selected = passages
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({ id: p.id, title: p.title, content: p.content }));
    handleBatchGenerate(selected, style, customPrompt);
    setSelectedIds(new Set());
  };

  return (
    <main className="flex-1 overflow-y-auto p-6 relative">
      <div className="flex flex-col min-h-[calc(100vh-64px)] bg-slate-50">
        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-8 py-4 bg-white border-b border-slate-200/80 shrink-0">
          <Link
            href="/director/workbench"
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-slate-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-[18px] font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 border border-blue-100">
                <Palette className="w-4.5 h-4.5 text-blue-600" />
              </div>
              지문 기반 웹툰 생성
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            {queueCounts.generating > 0 && (
              <Badge className="bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-50">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                생성 중 {queueCounts.generating}
              </Badge>
            )}
            {queueCounts.done > 0 && (
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50">
                완료 {queueCounts.done}
              </Badge>
            )}
            {queueCounts.error > 0 && (
              <Badge className="bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-50">
                실패 {queueCounts.error}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col">
          {/* ── Top: Passage grid + Config panel ── */}
          <div className="flex flex-col lg:flex-row bg-white lg:h-[600px] xl:h-[680px] w-full">
            {/* LEFT: Passage grid */}
            <div className="flex flex-col overflow-hidden bg-white border-r lg:border-r-0 border-slate-200/80 flex-1 min-w-0">
              {/* Selection toolbar */}
              {selectedIds.size > 0 && (
                <div className="px-5 py-2 bg-blue-50 border-b border-blue-200 shrink-0 flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-blue-700">{selectedIds.size}개 선택</span>
                  <div className="w-px h-4 bg-blue-200" />
                  <button
                    onClick={selectedIds.size === filteredPassages.length ? deselectAll : selectAll}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {selectedIds.size === filteredPassages.length ? "선택 해제" : "전체 선택"}
                  </button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700 rounded-lg"
                    onClick={onGenerate}
                  >
                    <Zap className="w-3.5 h-3.5 mr-1" />
                    {selectedIds.size}개 지문 웹툰 생성
                  </Button>
                  <button onClick={deselectAll} className="text-[11px] text-blue-500 hover:text-blue-700 font-medium">
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
                  <button
                    onClick={() => setOnlyAnalyzed(!onlyAnalyzed)}
                    className={`h-9 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-all border ${
                      onlyAnalyzed
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    분석된 지문만
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
                      <select
                        value={filterSchool}
                        onChange={(e) => setFilterSchool(e.target.value)}
                        className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                          filterSchool ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <option value="">학교 전체</option>
                        {filterOptions.schools.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    {filterOptions.grades.length > 0 && (
                      <select
                        value={filterGrade}
                        onChange={(e) => setFilterGrade(e.target.value)}
                        className={`h-7 px-2 pr-6 rounded-md text-[11px] font-medium border appearance-none cursor-pointer transition-all ${
                          filterGrade ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <option value="">학년 전체</option>
                        {filterOptions.grades.map((g) => (
                          <option key={g} value={g}>{g}학년</option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                      {[{ value: "", label: "전체" }, { value: "FIRST", label: "1학기" }, { value: "SECOND", label: "2학기" }].map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setFilterSemester(s.value)}
                          className={`h-6 px-2.5 rounded-md text-[11px] font-medium transition-all ${
                            filterSemester === s.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => { setFilterSchool(""); setFilterGrade(""); setFilterSemester(""); }}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium ml-auto flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        초기화
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Passage card grid */}
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
                      {onlyAnalyzed && passages.some((p) => !p.analysis)
                        ? "분석된 지문이 없습니다 (필터 해제 시 표시)"
                        : passages.length === 0
                          ? "등록된 지문이 없습니다"
                          : "검색 결과가 없습니다"}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                    {filteredPassages.map((p) => {
                      const isChecked = selectedIds.has(p.id);
                      const wordCount = p.content.trim().split(/\s+/).filter(Boolean).length;
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleCheckbox(p.id)}
                          className={`group relative rounded-xl border p-4 transition-all duration-200 hover:shadow-md flex flex-col cursor-pointer ${
                            isChecked
                              ? "border-blue-400 bg-blue-50/20 ring-1 ring-blue-300/30"
                              : "border-emerald-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCheckbox(p.id); }}
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
                                {p.analysis && (
                                  <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
                                )}
                                <span className="text-[10px] text-slate-400">{wordCount} words</span>
                              </div>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-3">
                            {p.content.slice(0, 200)}...
                          </p>
                          {(p.school || p.grade || p.semester) && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-3">
                              {p.school && <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">{p.school.name}</Badge>}
                              {p.grade && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{p.grade}학년</Badge>}
                              {p.semester && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{p.semester === "FIRST" ? "1학기" : "2학기"}</Badge>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Config panel */}
            <div className="flex flex-col bg-white overflow-hidden w-full lg:w-[360px] xl:w-[440px] shrink-0 border-l border-slate-200/80">
              <div className="flex-1 overflow-y-auto">
                <div className="px-5 pt-5 pb-3">
                  <div className="rounded-xl bg-gradient-to-br from-blue-50/80 to-blue-50/30 border border-blue-200/50 p-4 space-y-4">
                    <div className="flex items-start gap-2.5">
                      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-100/80 shrink-0 mt-0.5">
                        <Palette className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-blue-800">웹툰 자동 생성</p>
                        <p className="text-[11px] text-blue-600/80 mt-1 leading-relaxed">
                          지문을 직접 읽고 4K 세로(2160×3840) 한 장에 흐름을 통합해 그립니다. 별도 시나리오 단계 없이 단일 호출.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Style picker */}
                <div className="px-5 py-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">화풍</span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {WEBTOON_STYLES.map((s) => {
                      const active = style === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setStyle(s.id)}
                          className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                            active
                              ? "bg-blue-50 border-blue-300 ring-1 ring-blue-200"
                              : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className={`text-[12px] font-bold ${active ? "text-blue-800" : "text-slate-700"}`}>
                            {s.label}
                          </div>
                          <div className={`text-[10.5px] mt-0.5 ${active ? "text-blue-600/80" : "text-slate-400"}`}>
                            {s.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Auto layout notice */}
                <div className="px-5 py-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 flex items-start gap-2">
                    <Zap className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-700">컷 수와 대사는 AI가 직접 결정</span>합니다.
                      지문 길이와 복잡도에 맞춰 6~8컷이 한 장의 세로 이미지에 통합 렌더링됩니다.
                    </p>
                  </div>
                </div>

                {/* Custom prompt */}
                <div className="px-5 py-3">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">추가 지시사항</span>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="예: 주인공은 고등학생, 배경은 한국 학교, 명대사는 풍선말로 강조..."
                    className="w-full min-h-[88px] px-3.5 py-2.5 text-[12px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 resize-none transition-all"
                  />
                </div>
              </div>

              {/* Generate button */}
              <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0">
                <Button
                  className={`w-full h-12 rounded-xl text-[14px] font-bold transition-all duration-200 ${
                    canGenerate
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  disabled={!canGenerate}
                  onClick={onGenerate}
                >
                  <span className="flex items-center gap-2">
                    <Palette className="w-4.5 h-4.5" />
                    {canGenerate
                      ? `${selectedIds.size}개 지문 웹툰 생성`
                      : "지문을 선택하세요"}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-3 bg-[#E8EAEE] shrink-0 border-y border-slate-200/60" />

          {/* ── Bottom: Queue ── */}
          <div className="bg-[#F0F2F5]">
            <div className="px-8 pt-5 pb-8 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[14px] font-bold text-slate-800">최근 생성 (백그라운드 처리)</h3>
                  <Link
                    href="/director/workbench/webtoon/library"
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    전체 보관함 →
                  </Link>
                </div>
                {queueLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    <p className="text-[12px] text-slate-400">목록 불러오는 중...</p>
                  </div>
                ) : queue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 opacity-60">
                    <ImageIcon className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-[13px] text-slate-400">아직 생성된 웹툰이 없습니다</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      지문을 선택하고 우측에서 화풍을 설정한 뒤 생성을 눌러주세요
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {queue.map((item) => (
                      <WebtoonQueueCard
                        key={item.id}
                        item={item}
                        onRetry={handleRetry}
                        onRemove={handleRemove}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
