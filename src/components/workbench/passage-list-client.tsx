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
  Cpu,
  CheckCircle2,
  Clock,
  Upload,
  Layers,
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
  };
  vocabulary?: Array<{ word: string }>;
  grammar?: Array<{ pattern: string }>;
  sentences?: Array<{ index: number }>;
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
  ADVANCED: { label: "고급", className: "bg-slate-100 text-slate-700 border-slate-300" },
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

// ─── Status-aware Passage Card ─────────────────────────
function PassageCard({ passage }: { passage: PassageItem }) {
  const analysisData = parseAnalysisData(passage.analysis);
  const isAnalyzed = !!passage.analysis;
  const vocabCount = analysisData?.vocabulary?.length ?? 0;
  const grammarCount = analysisData?.grammar?.length ?? 0;
  const sentenceCount = analysisData?.sentences?.length ?? 0;
  const mainIdea = analysisData?.structure?.mainIdea;
  const questionCount = passage._count.questions;

  // Determine passage status
  const status = !isAnalyzed
    ? "pending"
    : questionCount === 0
    ? "analyzed"
    : "active";

  const statusConfig = {
    pending: {
      label: "분석 대기",
      icon: Clock,
      className: "text-slate-500 bg-slate-50 border-slate-200",
      dotClass: "bg-slate-400",
    },
    analyzed: {
      label: "분석 완료",
      icon: CheckCircle2,
      className: "text-blue-600 bg-blue-50 border-blue-200",
      dotClass: "bg-blue-400",
    },
    active: {
      label: `문제 ${questionCount}개`,
      icon: Layers,
      className: "text-emerald-600 bg-emerald-50 border-emerald-200",
      dotClass: "bg-emerald-400",
    },
  };

  const sc = statusConfig[status];

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all group">
      <Link href={`/director/workbench/passages/${passage.id}`} className="block p-4">
        {/* Top: Status + Metadata */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
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
            {passage.difficulty && DIFFICULTY_LABELS[passage.difficulty] && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${DIFFICULTY_LABELS[passage.difficulty].className}`}>
                {DIFFICULTY_LABELS[passage.difficulty].label}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 flex items-center gap-1 ${sc.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dotClass}`} />
            {sc.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-[14px] font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors leading-tight mb-2">
          {passage.title}
        </h3>

        {/* Content preview */}
        <p className="text-[11px] text-slate-500 font-mono leading-relaxed line-clamp-2 mb-3">
          {passage.content}
        </p>

        {/* Analysis summary (if analyzed) */}
        {analysisData && (
          <div className="space-y-1.5">
            {mainIdea && (
              <p className="text-[11px] text-slate-600 truncate leading-tight">
                <span className="font-medium text-slate-500">주제</span>{" "}
                {mainIdea}
              </p>
            )}
            <p className="text-[10px] text-slate-400">
              어휘 {vocabCount}개 · 문법 {grammarCount}개 · 문장 {sentenceCount}개
            </p>
          </div>
        )}
      </Link>

      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">
          {formatDate(passage.createdAt)}
        </span>
        <div className="flex items-center gap-1.5">
          {!isAnalyzed && (
            <Link href={`/director/workbench/passages/${passage.id}?autoAnalyze=true`}>
              <button className="text-[11px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
                <Cpu className="w-3 h-3" />
                분석 실행
              </button>
            </Link>
          )}
          {isAnalyzed && questionCount === 0 && (
            <Link href={`/director/workbench/generate?passageId=${passage.id}`}>
              <button className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors">
                <Layers className="w-3 h-3" />
                문제 생성
              </button>
            </Link>
          )}
          {questionCount > 0 && (
            <Link href={`/director/workbench/passages/${passage.id}`}>
              <button className="text-[11px] font-medium text-slate-500 hover:text-slate-700 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-50 transition-colors">
                상세 보기
                <ChevronRight className="w-3 h-3" />
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main List Component ────────────────────────────────
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

  // Stats for the summary bar
  const totalCount = passagesData.total;
  const analyzedCount = passagesData.passages.filter((p) => p.analysis).length;
  const pendingCount = passagesData.passages.filter((p) => !p.analysis).length;

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
              지문 등록, AI 분석, 문제 생성까지 관리합니다
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
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            일괄 등록
          </Button>
          <Link href="/director/workbench/passages/create">
            <Button size="sm" className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              지문 등록
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="flex items-center gap-4 px-4 py-3 bg-white rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-slate-500">전체</span>
          <span className="text-[14px] font-bold text-slate-800">{totalCount}</span>
        </div>
        <div className="w-px h-4 bg-slate-200" />
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-[12px] text-slate-500">분석 완료</span>
          <span className="text-[12px] font-semibold text-slate-700">{analyzedCount}</span>
        </div>
        {pendingCount > 0 && (
          <>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              <span className="text-[12px] text-slate-500">분석 대기</span>
              <span className="text-[12px] font-semibold text-slate-600">{pendingCount}</span>
            </div>
          </>
        )}
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
          <div className="flex items-center justify-center gap-2 mt-4">
            <Link href="/director/workbench/passages/create">
              <Button className="bg-blue-600 hover:bg-blue-700" size="sm">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                지문 등록
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              일괄 등록
            </Button>
          </div>
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
