// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  FileText,
  BookOpen,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PassageItem {
  id: string;
  title: string;
  content: string;
  source: string | null;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  order: number;
  createdAt: Date;
  school: { id: string; name: string } | null;
  hasAnalysis: boolean;
  questionCount: number;
  noteCount: number;
}

interface Props {
  passages: PassageItem[];
  academyId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  BASIC: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INTERMEDIATE: "bg-blue-50 text-blue-700 border-blue-200",
  KILLER: "bg-red-50 text-red-700 border-red-200",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminPassagesClient({ passages, academyId }: Props) {
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("ALL");
  const [gradeFilter, setGradeFilter] = useState("ALL");

  const filtered = useMemo(() => {
    return passages.filter((p) => {
      if (
        search &&
        !(p.title || "").toLowerCase().includes(search.toLowerCase()) &&
        !p.content.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (difficultyFilter !== "ALL" && p.difficulty !== difficultyFilter)
        return false;
      if (gradeFilter !== "ALL" && String(p.grade) !== gradeFilter)
        return false;
      return true;
    });
  }, [passages, search, difficultyFilter, gradeFilter]);

  // Collect grades for filter
  const grades = useMemo(() => {
    const set = new Set<number>();
    passages.forEach((p) => {
      if (p.grade) set.add(p.grade);
    });
    return [...set].sort();
  }, [passages]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
        <Link
          href={`/admin/academies/${academyId}`}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <BookOpen className="w-4.5 h-4.5 text-blue-600 shrink-0" />
        <h1 className="text-[15px] font-bold text-slate-900">지문 관리</h1>
        <span className="text-[12px] text-slate-400">
          {passages.length}개
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
            <input
              placeholder="검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 h-8 pl-8 pr-3 text-[12px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          {grades.length > 0 && (
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
            >
              <option value="ALL">전체 학년</option>
              {grades.map((g) => (
                <option key={g} value={String(g)}>
                  {g}학년
                </option>
              ))}
            </select>
          )}

          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
          >
            <option value="ALL">전체 난이도</option>
            <option value="BASIC">기본</option>
            <option value="INTERMEDIATE">중급</option>
            <option value="KILLER">킬러</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 py-4">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {passages.length === 0
                ? "등록된 지문이 없습니다"
                : "조건에 맞는 지문이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/admin/academies/${academyId}/passages/${p.id}`}
                className="group flex items-center gap-4 px-5 py-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                      {p.title || p.content.slice(0, 60) + "..."}
                    </h3>
                    {p.hasAnalysis && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
                    {p.grade && <span>{p.grade}학년</span>}
                    {p.semester && (
                      <span>
                        {p.semester === "FIRST" ? "1학기" : "2학기"}
                      </span>
                    )}
                    {p.unit && <span>{p.unit}</span>}
                    {p.publisher && <span>{p.publisher}</span>}
                    {p.school && (
                      <span className="text-slate-500">{p.school.name}</span>
                    )}
                    {p.difficulty && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[9px] py-0",
                          DIFFICULTY_COLORS[p.difficulty],
                        )}
                      >
                        {DIFFICULTY_LABELS[p.difficulty] || p.difficulty}
                      </Badge>
                    )}
                    <span>문제 {p.questionCount}개</span>
                    {p.noteCount > 0 && <span>노트 {p.noteCount}개</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1 font-mono">
                    {p.content}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-slate-400">
                    {formatDate(p.createdAt)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
