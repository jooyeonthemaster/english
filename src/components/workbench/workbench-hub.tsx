"use client";

import Link from "next/link";
import {
  FileText,
  Database,
  ChevronRight,
  Plus,
  Layers,
  ArrowRight,
  Cpu,
  ClipboardCheck,
  GraduationCap,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

interface WorkbenchStats {
  totalPassages: number;
  totalQuestions: number;
  aiGeneratedCount: number;
  approvedCount: number;
  pendingAnalysisCount: number;
  analyzedPassageCount: number;
  unapprovedCount: number;
  recentPassages: {
    id: string;
    title: string;
    grade: number | null;
    createdAt: Date;
    analysis: { id: string } | null;
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
  pendingPassages: {
    id: string;
    title: string;
    grade: number | null;
    createdAt: Date;
  }[];
  totalLearningQuestions?: number;
}

export function WorkbenchHub({ stats }: { stats: WorkbenchStats }) {
  const hasActions = stats.pendingAnalysisCount > 0 || stats.unapprovedCount > 0;

  return (
    <div className="max-w-[1100px] mx-auto space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            AI 콘텐츠
          </h1>
          <p className="text-[15px] text-slate-500 mt-1">
            지문 등록부터 시험 출제까지, AI 기반 콘텐츠 제작 도구
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/director/workbench/passages/create">
            <button className="h-10 px-5 text-[14px] font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
              <Plus className="w-4 h-4" />
              지문 등록
            </button>
          </Link>
        </div>
      </div>

      {/* Workflow Cards — 2x2 grid */}
      <div className="grid grid-cols-2 gap-5">
        {/* 지문 관리 */}
        <Link href="/director/workbench/passages" className="group">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-md transition-all h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 mt-1.5 transition-colors" />
            </div>
            <h3 className="text-[18px] font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
              지문 관리
            </h3>
            <p className="text-[14px] text-slate-500 mt-1.5 leading-relaxed flex-1">
              영어 지문을 등록하고 AI가 어휘·문법·구조를 자동 분석합니다.
              분석 결과를 검토하고 수정할 수 있습니다.
            </p>
            <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-500">
              지문을 등록하고 AI 분석을 실행하세요
            </p>
          </div>
        </Link>

        {/* 문제 생성 */}
        <Link href="/director/workbench/generate" className="group">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-md transition-all h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Layers className="w-5 h-5 text-indigo-600" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 mt-1.5 transition-colors" />
            </div>
            <h3 className="text-[18px] font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
              문제 생성
            </h3>
            <p className="text-[14px] text-slate-500 mt-1.5 leading-relaxed flex-1">
              분석된 지문을 기반으로 수능·내신·어휘 등 다양한 유형의
              문제를 AI가 자동 생성합니다.
            </p>
            {stats.analyzedPassageCount > 0 ? (
              <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-500">
                분석 완료된 지문 <span className="font-semibold text-slate-700">{stats.analyzedPassageCount}개</span>로 문제 생성 가능
              </p>
            ) : (
              <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-400">
                먼저 지문을 등록하고 AI 분석을 실행하세요
              </p>
            )}
          </div>
        </Link>

        {/* 문제 은행 */}
        <Link href="/director/questions" className="group">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-md transition-all h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center">
                <Database className="w-5 h-5 text-sky-600" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 mt-1.5 transition-colors" />
            </div>
            <h3 className="text-[18px] font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
              문제 은행
            </h3>
            <p className="text-[14px] text-slate-500 mt-1.5 leading-relaxed flex-1">
              생성된 문제를 검수하고 편집합니다.
              컬렉션으로 분류·정리하여 시험 출제에 활용하세요.
            </p>
            {stats.totalQuestions > 0 ? (
              <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-500">
                전체 <span className="font-semibold text-slate-700">{stats.totalQuestions}개</span> 문제
                {stats.unapprovedCount > 0 && (
                  <> · 검수 대기 <span className="font-semibold text-slate-700">{stats.unapprovedCount}개</span></>
                )}
              </p>
            ) : (
              <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-400">
                문제를 생성하면 여기에 쌓입니다
              </p>
            )}
          </div>
        </Link>

        {/* 시험 출제 */}
        <Link href="/director/exams" className="group">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-md transition-all h-full flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-violet-600" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-200 group-hover:text-slate-400 mt-1.5 transition-colors" />
            </div>
            <h3 className="text-[18px] font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
              시험 출제
            </h3>
            <p className="text-[14px] text-slate-500 mt-1.5 leading-relaxed flex-1">
              문제 은행에서 문제를 선택하여 시험지를 구성합니다.
              반별·학생별 시험을 배포하고 결과를 확인하세요.
            </p>
            {stats.approvedCount > 0 ? (
              <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-500">
                검수 완료 문제 <span className="font-semibold text-slate-700">{stats.approvedCount}개</span>로 출제 가능
              </p>
            ) : (
              <p className="mt-4 pt-4 border-t border-slate-100 text-[13px] text-slate-400">
                문제를 검수하면 시험 출제에 활용할 수 있습니다
              </p>
            )}
          </div>
        </Link>
      </div>

      {/* Action Items — only when there's something to do */}
      {hasActions && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
          <span className="text-[15px] font-semibold text-slate-800">처리가 필요한 항목</span>

          {stats.pendingPassages.map((p) => (
            <ActionItem
              key={p.id}
              href={`/director/workbench/passages/${p.id}?autoAnalyze=true`}
              icon={<Cpu className="w-4 h-4 text-blue-500" />}
              title={`"${p.title}" AI 분석 대기`}
              desc={`${formatRelativeTime(p.createdAt)} 등록`}
              actionLabel="분석 실행"
            />
          ))}

          {stats.pendingAnalysisCount > 3 && (
            <Link
              href="/director/workbench/passages"
              className="block text-center text-[13px] text-blue-600 hover:text-blue-700 py-1.5 font-medium"
            >
              외 {stats.pendingAnalysisCount - 3}개 더 보기
            </Link>
          )}

          {stats.unapprovedCount > 0 && (
            <ActionItem
              href="/director/questions?approved=false"
              icon={<ClipboardCheck className="w-4 h-4 text-blue-500" />}
              title={`검수 대기 문제 ${stats.unapprovedCount}개`}
              desc="생성된 문제를 검토하고 승인하세요"
              actionLabel="검수하기"
            />
          )}
        </div>
      )}

      {/* Quick Start Guide (only when brand new) */}
      {stats.totalPassages === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-7">
          <h3 className="text-[16px] font-semibold text-slate-800 mb-5">
            시작 가이드
          </h3>
          <div className="grid grid-cols-2 gap-x-10 gap-y-6">
            {[
              {
                step: "1",
                title: "지문 붙여넣기",
                desc: "교과서나 모의고사 영어 지문을 복사해서 붙여넣으세요. 학교·학년 정보는 나중에 추가해도 됩니다.",
              },
              {
                step: "2",
                title: "AI 자동 분석",
                desc: "어휘, 문법 포인트, 문장 구조를 AI가 즉시 분석합니다. 분석 결과를 직접 수정할 수도 있습니다.",
              },
              {
                step: "3",
                title: "문제 자동 생성",
                desc: "빈칸 추론, 어법 판단, 서술형 등 원하는 유형의 문제를 AI가 자동으로 만들어 줍니다.",
              },
              {
                step: "4",
                title: "시험 출제",
                desc: "검수 완료된 문제를 모아 시험지를 구성하고, 반별로 배포하여 결과를 확인하세요.",
              },
            ].map((g) => (
              <div key={g.step} className="flex gap-3.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[13px] font-bold shrink-0 mt-0.5">
                  {g.step}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-slate-700">{g.title}</p>
                  <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">{g.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Action Item ─────────────────────────────────────────

function ActionItem({
  href,
  icon,
  title,
  desc,
  actionLabel,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  actionLabel: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-[14px] font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
            {title}
          </p>
          <p className="text-[12px] text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
      <span className="text-[13px] text-blue-600 font-medium group-hover:text-blue-700 flex items-center gap-1 shrink-0">
        {actionLabel} <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
