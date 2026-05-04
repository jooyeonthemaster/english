// @ts-nocheck
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  ClipboardList,
  Calendar,
  Users,
  GraduationCap,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExamItem {
  id: string;
  title: string;
  type: string;
  status: string;
  grade: number | null;
  semester: string | null;
  examDate: string | Date | null;
  totalPoints: number;
  createdAt: Date;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  _count: { questions: number; submissions: number };
}

interface Props {
  exams: ExamItem[];
  academyId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  OFFLINE: "오프라인",
  ONLINE: "온라인",
  VOCAB: "단어",
  MOCK: "모의",
};

const TYPE_COLORS: Record<string, string> = {
  OFFLINE: "bg-slate-100 text-slate-600",
  ONLINE: "bg-blue-100 text-blue-600",
  VOCAB: "bg-violet-100 text-violet-600",
  MOCK: "bg-teal-100 text-teal-600",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "초안",
  PUBLISHED: "배포됨",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  ARCHIVED: "보관",
};

const STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-slate-400",
  PUBLISHED: "bg-blue-500",
  IN_PROGRESS: "bg-emerald-500",
  COMPLETED: "bg-emerald-600",
  ARCHIVED: "bg-slate-300",
};

// ---------------------------------------------------------------------------
// Exam card (readonly)
// ---------------------------------------------------------------------------

function ReadonlyExamCard({ exam }: { exam: ExamItem }) {
  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-semibold text-slate-800 truncate">
            {exam.title}
          </h4>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                STATUS_DOT[exam.status] || "bg-slate-400",
              )}
            />
            <span className="text-[10px] font-medium text-slate-500">
              {STATUS_LABELS[exam.status] || exam.status}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
            TYPE_COLORS[exam.type] || "bg-slate-100 text-slate-600",
          )}
        >
          {TYPE_LABELS[exam.type] || exam.type}
        </span>
      </div>

      {/* Info row */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <ClipboardList className="w-3 h-3 text-slate-400" />
          {exam._count.questions}문제
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          <Users className="w-3 h-3 text-slate-400" />
          {exam._count.submissions}명 응시
        </span>
        {exam.examDate && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Calendar className="w-3 h-3 text-slate-400" />
            {formatDate(exam.examDate)}
          </span>
        )}
        <span className="text-[11px] text-slate-400">
          {exam.totalPoints}점 만점
        </span>
      </div>

      {/* Tags */}
      {(exam.class || exam.school) && (
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {exam.class && (
            <span className="inline-flex items-center text-[9px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
              {exam.class.name}
            </span>
          )}
          {exam.school && (
            <span className="inline-flex items-center text-[9px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
              {exam.school.name}
            </span>
          )}
        </div>
      )}

      {/* Date */}
      <div className="text-[10px] text-slate-400 mt-2">
        {formatDate(exam.createdAt)} 생성
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdminExamsClient({ exams, academyId }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    return exams.filter((e) => {
      if (search && !e.title.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (typeFilter !== "ALL" && e.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
      return true;
    });
  }, [exams, search, typeFilter, statusFilter]);

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
        <GraduationCap className="w-4.5 h-4.5 text-blue-600 shrink-0" />
        <h1 className="text-[15px] font-bold text-slate-900">시험 관리</h1>
        <span className="text-[12px] text-slate-400">{exams.length}개</span>

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

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
          >
            <option value="ALL">전체 유형</option>
            <option value="OFFLINE">오프라인</option>
            <option value="ONLINE">온라인</option>
            <option value="VOCAB">단어</option>
            <option value="MOCK">모의</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400"
          >
            <option value="ALL">전체 상태</option>
            <option value="DRAFT">초안</option>
            <option value="PUBLISHED">배포됨</option>
            <option value="IN_PROGRESS">진행중</option>
            <option value="COMPLETED">완료</option>
            <option value="ARCHIVED">보관</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-[#F4F6F9] px-6 py-4">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border text-center py-20">
            <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {exams.length === 0
                ? "등록된 시험이 없습니다"
                : "조건에 맞는 시험이 없습니다"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((exam) => (
              <ReadonlyExamCard key={exam.id} exam={exam} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
