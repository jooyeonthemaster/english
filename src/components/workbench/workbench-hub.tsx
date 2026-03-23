"use client";

import Link from "next/link";
import {
  Sparkles,
  FileText,
  Cpu,
  Database,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  BASIC: { label: "기본", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INTERMEDIATE: { label: "중급", className: "bg-blue-50 text-blue-700 border-blue-200" },
  KILLER: { label: "킬러", className: "bg-red-50 text-red-700 border-red-200" },
};

export function WorkbenchHub({ stats }: { stats: WorkbenchStats }) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 p-8 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTM2IDE4YzEuNjU2IDAgMy0xLjM0NCAzLTNzLTEuMzQ0LTMtMy0zLTMgMS4zNDQtMyAzIDEuMzQ0IDMgMyAzem0wIDZjMS42NTYgMCAzLTEuMzQ0IDMtM3MtMS4zNDQtMy0zLTMtMyAxLjM0NC0zIDMgMS4zNDQgMyAzIDN6Ii8+PC9nPjwvZz48L3N2Zz4=')] opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/20 backdrop-blur">
              <Sparkles className="w-5 h-5 text-blue-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">AI 콘텐츠 워크벤치</h1>
          </div>
          <p className="text-slate-300 text-sm max-w-xl mb-6">
            지문을 등록하고, AI가 자동으로 분석한 후, 고품질 내신 문제를 생성합니다.
            생성된 문제는 검수 후 문제 은행에 저장됩니다.
          </p>

          {/* Workflow diagram */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-blue-300" />
              <span>지문 등록</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
              <Cpu className="w-4 h-4 text-amber-300" />
              <span>AI 분석</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
              <Sparkles className="w-4 h-4 text-emerald-300" />
              <span>문제 생성</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-lg px-3 py-2">
              <Database className="w-4 h-4 text-purple-300" />
              <span>문제 은행</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<FileText className="w-5 h-5" />}
          label="총 지문"
          value={stats.totalPassages}
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
        />
        <StatCard
          icon={<Database className="w-5 h-5" />}
          label="총 문제"
          value={stats.totalQuestions}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <StatCard
          icon={<Sparkles className="w-5 h-5" />}
          label="AI 생성"
          value={stats.aiGeneratedCount}
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
        />
        <StatCard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="검수 완료"
          value={stats.approvedCount}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
        />
      </div>

      {/* Three Main Cards */}
      <div className="grid grid-cols-3 gap-6">
        <MainActionCard
          href="/director/workbench/passages"
          icon={<FileText className="w-6 h-6" />}
          title="지문 관리"
          description="영어 지문을 등록, 관리하고 AI 분석을 실행합니다."
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
          borderColor="hover:border-blue-300"
          count={stats.totalPassages}
          countLabel="개 지문"
        />
        <MainActionCard
          href="/director/workbench/passages"
          icon={<Sparkles className="w-6 h-6" />}
          title="AI 문제 생성"
          description="지문을 선택하고 출제 탭에서 유형별로 문제를 생성합니다."
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
          borderColor="hover:border-amber-300"
          count={stats.aiGeneratedCount}
          countLabel="개 AI 생성"
        />
        <MainActionCard
          href="/director/questions"
          icon={<Database className="w-6 h-6" />}
          title="문제 은행"
          description="생성된 문제를 검수하고 관리합니다. 시험 출제에 활용할 수 있습니다."
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
          borderColor="hover:border-emerald-300"
          count={stats.totalQuestions}
          countLabel="개 문제"
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Passages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              최근 등록 지문
            </CardTitle>
            <Link href="/director/workbench/passages">
              <Button variant="ghost" size="sm" className="text-xs text-slate-500">
                전체 보기
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentPassages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                등록된 지문이 없습니다
              </p>
            ) : (
              stats.recentPassages.map((p) => (
                <Link
                  key={p.id}
                  href={`/director/workbench/passages/${p.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                        {p.title}
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.grade ? `${p.grade}학년` : ""} · 문제 {p._count.questions}개
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {formatRelativeTime(p.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              최근 생성 문제
            </CardTitle>
            <Link href="/director/questions">
              <Button variant="ghost" size="sm" className="text-xs text-slate-500">
                전체 보기
                <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentQuestions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                생성된 문제가 없습니다
              </p>
            ) : (
              stats.recentQuestions.map((q) => (
                <Link
                  key={q.id}
                  href={`/director/questions/${q.id}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {QUESTION_TYPE_LABELS[q.type] || q.type}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 ${
                          DIFFICULTY_CONFIG[q.difficulty]?.className || ""
                        }`}
                      >
                        {DIFFICULTY_CONFIG[q.difficulty]?.label || q.difficulty}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 truncate min-w-0">
                      {truncate(q.questionText, 40)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {q.aiGenerated && (
                      <Sparkles className="w-3 h-3 text-amber-500" />
                    )}
                    {q.approved ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  iconColor,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconColor: string;
  bgColor: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-xl ${bgColor}`}
        >
          <div className={iconColor}>{icon}</div>
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MainActionCard({
  href,
  icon,
  title,
  description,
  iconColor,
  bgColor,
  borderColor,
  count,
  countLabel,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  count: number;
  countLabel: string;
}) {
  return (
    <Link href={href}>
      <Card
        className={`h-full border-2 border-transparent ${borderColor} transition-all hover:shadow-lg cursor-pointer group`}
      >
        <CardContent className="p-6 space-y-4">
          <div
            className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${bgColor} group-hover:scale-110 transition-transform`}
          >
            <div className={iconColor}>{icon}</div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
              {title}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
          <div className="pt-2 flex items-center gap-2">
            <span className="text-xl font-bold text-slate-700">{count}</span>
            <span className="text-xs text-slate-400">{countLabel}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
