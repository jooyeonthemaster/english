"use client";

import Link from "next/link";
import {
  FileText,
  Database,
  ArrowRight,
  ChevronRight,
  Plus,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { formatRelativeTime, truncate } from "@/lib/utils";

interface WorkbenchStats {
  totalPassages: number;
  totalQuestions: number;
  aiGeneratedCount: number;
  approvedCount: number;
  recentPassages: {
    id: string;
    title: string;
    grade: number | null;
    createdAt: Date;
    _count: { questions: number };
  }[];
  recentQuestions: {
    id: string;
    type: string;
    subType: string | null;
    difficulty: string;
    questionText: string;
    aiGenerated: boolean;
    approved: boolean;
    createdAt: Date;
  }[];
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  FILL_BLANK: "빈칸",
  ORDERING: "순서배열",
  VOCAB: "어휘",
  ESSAY: "서술형",
};

const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/20" },
  INTERMEDIATE: { label: "중급", className: "bg-sky-400/15 text-sky-300 border-sky-400/20" },
  KILLER: { label: "킬러", className: "bg-rose-400/15 text-rose-300 border-rose-400/20" },
};

const DIFFICULTY_CONFIG_LIGHT: Record<string, { label: string; className: string }> = {
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-600" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-600" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-600" },
};

export function WorkbenchHub({ stats }: { stats: WorkbenchStats }) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ─── Hero Section ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-8">
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI 워크벤치</h1>
              <p className="text-blue-200/80 text-sm mt-1">
                지문 등록 → AI 분석 → 문제 생성 → 문제 은행
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/director/workbench/passages/create">
                <button className="h-9 px-4 text-[13px] font-medium rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 transition-all flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  지문 등록
                </button>
              </Link>
              <Link href="/director/workbench/generate">
                <button className="h-9 px-4 text-[13px] font-medium rounded-xl bg-white text-blue-700 hover:bg-blue-50 transition-all flex items-center gap-1.5 shadow-lg shadow-blue-900/20">
                  <Layers className="w-3.5 h-3.5" />
                  문제 생성
                </button>
              </Link>
            </div>
          </div>

          {/* Glass Stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "등록 지문", value: stats.totalPassages, icon: FileText },
              { label: "총 문제", value: stats.totalQuestions, icon: Database },
              { label: "AI 생성", value: stats.aiGeneratedCount, icon: Layers },
              { label: "검수 완료", value: stats.approvedCount, icon: CheckCircle2 },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl px-4 py-3 border border-white/15"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-blue-200/70">{s.label}</span>
                  <s.icon className="w-3.5 h-3.5 text-blue-300/50" />
                </div>
                <span className="text-2xl font-bold text-white mt-1 block">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="grid grid-cols-3 gap-4">
        <QuickActionCard
          href="/director/workbench/passages"
          icon={FileText}
          title="지문 관리"
          description="영어 지문 등록 및 AI 분석"
          count={stats.totalPassages}
          countLabel="지문"
          accent="blue"
        />
        <QuickActionCard
          href="/director/workbench/generate"
          icon={Layers}
          title="문제 생성"
          description="유형별 AI 문제 자동 생성"
          count={stats.aiGeneratedCount}
          countLabel="AI 생성"
          accent="indigo"
        />
        <QuickActionCard
          href="/director/questions"
          icon={Database}
          title="문제 은행"
          description="문제 검수 및 시험 출제"
          count={stats.totalQuestions}
          countLabel="문제"
          accent="sky"
        />
      </div>

      {/* ─── Recent Activity ─── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Passages */}
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="text-[13px] font-semibold text-slate-800">최근 지문</span>
            <Link href="/director/workbench/passages" className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 font-medium">
              전체 보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="px-3 pb-3 space-y-0.5">
            {stats.recentPassages.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-10">
                등록된 지문이 없습니다
              </div>
            ) : (
              stats.recentPassages.map((p) => (
                <Link
                  key={p.id}
                  href={`/director/workbench/passages/${p.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                        {p.title}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {p.grade ? `${p.grade}학년` : ""}
                        {p.grade && p._count.questions > 0 ? " · " : ""}
                        {p._count.questions > 0 ? `문제 ${p._count.questions}개` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-300 shrink-0">
                    {formatRelativeTime(p.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Questions */}
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="text-[13px] font-semibold text-slate-800">최근 문제</span>
            <Link href="/director/questions" className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 font-medium">
              전체 보기 <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="px-3 pb-3 space-y-0.5">
            {stats.recentQuestions.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-10">
                생성된 문제가 없습니다
              </div>
            ) : (
              stats.recentQuestions.map((q) => (
                <Link
                  key={q.id}
                  href={`/director/questions/${q.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-blue-50/50 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex gap-1 shrink-0">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                        {QUESTION_TYPE_LABELS[q.type] || q.type}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                        DIFFICULTY_CONFIG_LIGHT[q.difficulty]?.className || "bg-slate-100 text-slate-500"
                      }`}>
                        {DIFFICULTY_CONFIG_LIGHT[q.difficulty]?.label || q.difficulty}
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-600 truncate min-w-0 group-hover:text-blue-600 transition-colors">
                      {truncate(q.questionText, 30)}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-300 shrink-0">
                    {formatRelativeTime(q.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ACCENT_STYLES = {
  blue: {
    iconBg: "bg-blue-50 group-hover:bg-blue-100",
    iconText: "text-blue-500",
    border: "hover:border-blue-200",
    countText: "text-blue-600",
  },
  indigo: {
    iconBg: "bg-indigo-50 group-hover:bg-indigo-100",
    iconText: "text-indigo-500",
    border: "hover:border-indigo-200",
    countText: "text-indigo-600",
  },
  sky: {
    iconBg: "bg-sky-50 group-hover:bg-sky-100",
    iconText: "text-sky-500",
    border: "hover:border-sky-200",
    countText: "text-sky-600",
  },
};

function QuickActionCard({
  href,
  icon: Icon,
  title,
  description,
  count,
  countLabel,
  accent,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  count: number;
  countLabel: string;
  accent: keyof typeof ACCENT_STYLES;
}) {
  const style = ACCENT_STYLES[accent];
  return (
    <Link href={href}>
      <div className={`bg-white rounded-2xl border border-slate-200/80 px-5 py-5 ${style.border} hover:shadow-md transition-all cursor-pointer group`}>
        <div className="flex items-start justify-between">
          <div className={`w-10 h-10 rounded-xl ${style.iconBg} flex items-center justify-center transition-colors`}>
            <Icon className={`w-5 h-5 ${style.iconText}`} />
          </div>
          <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 mt-1 transition-colors" />
        </div>
        <h3 className="text-[15px] font-semibold text-slate-800 mt-3 group-hover:text-blue-600 transition-colors">
          {title}
        </h3>
        <p className="text-[12px] text-slate-400 mt-0.5">{description}</p>
        <div className="flex items-baseline gap-1.5 mt-4 pt-3 border-t border-slate-100">
          <span className={`text-xl font-bold ${style.countText}`}>{count}</span>
          <span className="text-[11px] text-slate-400">{countLabel}</span>
        </div>
      </div>
    </Link>
  );
}
