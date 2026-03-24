// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Folder,
  FolderOpen,
  Grid3X3,
  Calendar,
  BookOpen,
  Building2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, truncate, getSemesterLabel } from "@/lib/utils";
import { PassageImportDialog } from "@/components/workbench/passage-import-dialog";

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

interface AnalysisData {
  structure?: {
    mainIdea?: string;
    purpose?: string;
    textType?: string;
    keyPoints?: string[];
    paragraphSummaries?: string[];
  };
  vocabulary?: Array<{
    word: string;
    meaning: string;
    partOfSpeech?: string;
    difficulty?: string;
  }>;
  grammar?: Array<{
    pattern: string;
    explanation?: string;
    textFragment?: string;
  }>;
  sentences?: Array<{
    index: number;
    english: string;
    korean: string;
  }>;
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
  };
}

const DIFFICULTY_LABELS: Record<string, { label: string; className: string }> = {
  BEGINNER: { label: "초급", className: "bg-green-50 text-green-700 border-green-200" },
  ELEMENTARY: { label: "기초", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  UPPER_INTERMEDIATE: { label: "중상", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  ADVANCED: { label: "고급", className: "bg-orange-50 text-orange-700 border-orange-200" },
  EXPERT: { label: "최상급", className: "bg-red-50 text-red-700 border-red-200" },
};

type ViewMode = "all" | "school" | "publisher" | "year";

function parseAnalysisData(analysis: PassageItem["analysis"]): AnalysisData | null {
  if (!analysis?.analysisData) return null;
  try {
    return typeof analysis.analysisData === "string"
      ? JSON.parse(analysis.analysisData)
      : (analysis.analysisData as unknown as AnalysisData);
  } catch {
    return null;
  }
}

function PassageCard({ passage }: { passage: PassageItem }) {
  const analysisData = parseAnalysisData(passage.analysis);
  const vocabCount = analysisData?.vocabulary?.length ?? 0;
  const grammarCount = analysisData?.grammar?.length ?? 0;
  const sentenceCount = analysisData?.sentences?.length ?? 0;
  const mainIdea = analysisData?.structure?.mainIdea;
  const topVocab = analysisData?.vocabulary?.slice(0, 5) ?? [];
  const topGrammar = analysisData?.grammar?.slice(0, 3) ?? [];

  return (
    <Link href={`/director/workbench/passages/${passage.id}`} className="block group">
      <div className="bg-white rounded-xl border border-slate-200 p-4 h-full hover:border-slate-300 hover:shadow-sm transition-all">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-[14px] font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors leading-tight flex-1">
            {passage.title}
          </h3>
          {passage.difficulty && DIFFICULTY_LABELS[passage.difficulty] && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${DIFFICULTY_LABELS[passage.difficulty].className}`}>
              {DIFFICULTY_LABELS[passage.difficulty].label}
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
          {passage.school && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {passage.school.name}
            </span>
          )}
          {passage.grade && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {passage.grade}학년
            </span>
          )}
          {passage.semester && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
              {getSemesterLabel(passage.semester)}
            </span>
          )}
        </div>

        {/* Content preview */}
        <p className="text-[11px] text-slate-500 font-mono leading-relaxed line-clamp-3 mb-3">
          {passage.content}
        </p>

        {/* Analysis section */}
        {analysisData ? (
          <div className="border-t border-slate-100 pt-2.5 space-y-2">
            {/* Main idea */}
            {mainIdea && (
              <p className="text-[11px] text-slate-600 truncate leading-tight">
                <span className="font-medium text-slate-700">주제</span>{" "}
                {mainIdea}
              </p>
            )}

            {/* Stats row */}
            <p className="text-[10px] text-slate-400 font-medium">
              어휘 {vocabCount}개 · 문법 {grammarCount}개 · 문장 {sentenceCount}개
            </p>

            {/* Vocabulary pills */}
            {topVocab.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {topVocab.map((v, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium"
                  >
                    {v.word}
                  </span>
                ))}
              </div>
            )}

            {/* Grammar pills */}
            {topGrammar.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {topGrammar.map((g, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium"
                  >
                    {g.pattern}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-slate-100 pt-2.5">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200">
              분석 대기
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
          <span className="text-[10px] text-slate-400">
            {formatDate(passage.createdAt)}
          </span>
          <span className="text-[11px] text-slate-500 font-medium">
            문제 {passage._count.questions}개
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PassageListClient({
  passagesData,
  schools,
  filters,
}: PassageListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [importOpen, setImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["__all__"]));

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/director/workbench/passages?${params.toString()}`);
  }

  function handleSearch() {
    updateFilter("search", searchValue);
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/director/workbench/passages?${params.toString()}`);
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const grouped = useMemo(() => {
    const passages = passagesData.passages;
    if (viewMode === "school") {
      const map: Record<string, { label: string; passages: PassageItem[] }> = {};
      passages.forEach((p) => {
        const key = p.school?.name || "미분류";
        if (!map[key]) map[key] = { label: key, passages: [] };
        map[key].passages.push(p);
      });
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    }
    if (viewMode === "publisher") {
      const map: Record<string, { label: string; passages: PassageItem[] }> = {};
      passages.forEach((p) => {
        const key = p.publisher || p.school?.name || "미분류";
        if (!map[key]) map[key] = { label: key, passages: [] };
        map[key].passages.push(p);
      });
      return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    }
    if (viewMode === "year") {
      const map: Record<string, { label: string; passages: PassageItem[] }> = {};
      passages.forEach((p) => {
        const year = new Date(p.createdAt).getFullYear().toString();
        if (!map[year]) map[year] = { label: `${year}년`, passages: [] };
        map[year].passages.push(p);
      });
      return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
    }
    return [["__all__", { label: "전체 지문", passages }]] as [
      string,
      { label: string; passages: PassageItem[] },
    ][];
  }, [passagesData.passages, viewMode]);

  const VIEW_TABS = [
    { id: "all" as ViewMode, label: "전체", icon: Grid3X3 },
    { id: "school" as ViewMode, label: "학교별", icon: Building2 },
    { id: "publisher" as ViewMode, label: "출판사별", icon: BookOpen },
    { id: "year" as ViewMode, label: "연도별", icon: Calendar },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/director/workbench">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
              <ArrowLeft className="w-4 h-4 text-slate-500" />
            </button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">지문 관리</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              총 {passagesData.total}개 지문
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="h-9 text-[13px]"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            일괄 등록
          </Button>
          <Link href="/director/workbench/passages/create">
            <Button size="sm" className="h-9 text-[13px] bg-slate-900 hover:bg-slate-800">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              지문 등록
            </Button>
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border p-3 space-y-3">
        {/* View mode tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setViewMode(tab.id);
                  setExpandedGroups(new Set(["__all__"]));
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
                  viewMode === tab.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
              <input
                placeholder="지문 검색..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-[200px] h-8 pl-8 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
            <button
              onClick={handleSearch}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={filters.schoolId || "ALL"} onValueChange={(v) => updateFilter("schoolId", v)}>
            <SelectTrigger className="w-[140px] h-8 text-[12px]">
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
            <SelectTrigger className="w-[110px] h-8 text-[12px]">
              <SelectValue placeholder="학년" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체 학년</SelectItem>
              <SelectItem value="1">1학년</SelectItem>
              <SelectItem value="2">2학년</SelectItem>
              <SelectItem value="3">3학년</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.semester || "ALL"} onValueChange={(v) => updateFilter("semester", v)}>
            <SelectTrigger className="w-[110px] h-8 text-[12px]">
              <SelectValue placeholder="학기" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체 학기</SelectItem>
              <SelectItem value="FIRST">1학기</SelectItem>
              <SelectItem value="SECOND">2학기</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {passagesData.passages.length === 0 ? (
        <div className="bg-white rounded-xl border text-center py-20">
          <Folder className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">등록된 지문이 없습니다</p>
          <p className="text-sm text-slate-400 mt-1">
            지문을 등록하여 AI 문제 생성을 시작하세요
          </p>
          <Link href="/director/workbench/passages/create">
            <Button className="mt-4 bg-slate-900 hover:bg-slate-800" size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              첫 지문 등록
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, group]) => {
            const isExpanded = viewMode === "all" || expandedGroups.has(key);
            return (
              <div key={key}>
                {/* Folder header (hidden in "all" mode) */}
                {viewMode !== "all" && (
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center gap-3 px-4 py-3 mb-2 bg-white rounded-xl border hover:bg-slate-50 transition-colors"
                  >
                    {isExpanded ? (
                      <FolderOpen className="w-5 h-5 text-blue-500" />
                    ) : (
                      <Folder className="w-5 h-5 text-slate-400" />
                    )}
                    <span className="text-[14px] font-semibold text-slate-800 flex-1 text-left">
                      {group.label}
                    </span>
                    <span className="text-[12px] text-slate-400 mr-2">
                      {group.passages.length}개 지문
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-300 transition-transform ${
                        isExpanded ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  </button>
                )}

                {/* Card grid */}
                {isExpanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.passages.map((passage) => (
                      <PassageCard key={passage.id} passage={passage} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {passagesData.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={passagesData.page <= 1}
            onClick={() => goToPage(passagesData.page - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-[13px] text-slate-600 px-3">
            {passagesData.page} / {passagesData.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={passagesData.page >= passagesData.totalPages}
            onClick={() => goToPage(passagesData.page + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <PassageImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
