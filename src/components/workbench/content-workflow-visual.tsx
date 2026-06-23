import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  ClipboardCheck,
  FileCheck2,
  Layers3,
  ScanSearch,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

interface ContentWorkflowStats {
  totalPassages: number;
  totalQuestions: number;
  aiGeneratedCount: number;
  approvedCount: number;
  pendingAnalysisCount: number;
  analyzedPassageCount: number;
  unapprovedCount: number;
  totalLearningQuestions?: number;
}

interface WorkflowStage {
  title: string;
  value: number;
  helper: string;
  href: string;
  icon: LucideIcon;
  tone: "blue" | "cyan" | "emerald" | "amber" | "violet";
  progress?: number;
  progressLabel?: string;
}

const TONE_STYLES: Record<
  WorkflowStage["tone"],
  {
    icon: string;
    bar: string;
    border: string;
    hover: string;
    text: string;
  }
> = {
  blue: {
    icon: "bg-blue-50 text-blue-600",
    bar: "bg-blue-500",
    border: "border-blue-100",
    hover: "hover:border-blue-200",
    text: "text-blue-700",
  },
  cyan: {
    icon: "bg-cyan-50 text-cyan-600",
    bar: "bg-cyan-500",
    border: "border-cyan-100",
    hover: "hover:border-cyan-200",
    text: "text-cyan-700",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    bar: "bg-emerald-500",
    border: "border-emerald-100",
    hover: "hover:border-emerald-200",
    text: "text-emerald-700",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    bar: "bg-amber-500",
    border: "border-amber-100",
    hover: "hover:border-amber-200",
    text: "text-amber-700",
  },
  violet: {
    icon: "bg-violet-50 text-violet-600",
    bar: "bg-violet-500",
    border: "border-violet-100",
    hover: "hover:border-violet-200",
    text: "text-violet-700",
  },
};

function ratio(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function buildFocus(stats: ContentWorkflowStats) {
  if (stats.totalPassages === 0) {
    return {
      label: "시작 지점",
      title: "첫 지문을 등록하면 전체 흐름이 열립니다",
      href: "/director/workbench/passages/create",
      action: "지문 등록",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (stats.pendingAnalysisCount > 0) {
    return {
      label: "우선 처리",
      title: `분석 대기 지문 ${formatNumber(stats.pendingAnalysisCount)}개가 있습니다`,
      href: "/director/workbench/passages",
      action: "분석하기",
      tone: "border-cyan-200 bg-cyan-50 text-cyan-700",
    };
  }

  if (stats.totalQuestions === 0 && stats.analyzedPassageCount > 0) {
    return {
      label: "다음 단계",
      title: "분석된 지문으로 문제를 만들 차례입니다",
      href: "/director/workbench/generate",
      action: "문제 생성",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (stats.unapprovedCount > 0) {
    return {
      label: "출제 전 점검",
      title: `검수 대기 문제 ${formatNumber(stats.unapprovedCount)}개를 확인하세요`,
      href: "/director/questions?approved=false",
      action: "검수하기",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (stats.approvedCount > 0) {
    return {
      label: "준비 완료",
      title: `검수 완료 문제 ${formatNumber(stats.approvedCount)}개로 시험을 구성할 수 있습니다`,
      href: "/director/exams",
      action: "시험 출제",
      tone: "border-violet-200 bg-violet-50 text-violet-700",
    };
  }

  return {
    label: "다음 단계",
    title: "지문 분석이 끝났습니다. 문제 생성을 시작하세요",
    href: "/director/workbench/generate",
    action: "문제 생성",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
}

function MetricBar({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: WorkflowStage["tone"];
}) {
  const toneStyle = TONE_STYLES[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-slate-600">
          {label}
        </span>
        <span className={cn("text-[13px] font-bold", toneStyle.text)}>
          {value}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full", toneStyle.bar)}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
        {detail}
      </p>
    </div>
  );
}

function StageCard({
  stage,
  index,
}: {
  stage: WorkflowStage;
  index: number;
}) {
  const toneStyle = TONE_STYLES[stage.tone];
  const Icon = stage.icon;

  return (
    <Link
      href={stage.href}
      className={cn(
        "group flex min-h-[168px] flex-col rounded-lg border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        toneStyle.border,
        toneStyle.hover,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            toneStyle.icon,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="text-[12px] font-bold text-slate-300">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <div className="mt-4 min-w-0 flex-1">
        <h3 className="text-[14px] font-bold text-slate-800">
          {stage.title}
        </h3>
        <p className="mt-2 text-2xl font-black text-slate-950">
          {formatNumber(stage.value)}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          {stage.helper}
        </p>
      </div>

      {typeof stage.progress === "number" ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400">
            <span>{stage.progressLabel}</span>
            <span>{stage.progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-full rounded-full", toneStyle.bar)}
              style={{ width: `${stage.progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </Link>
  );
}

export function ContentWorkflowVisual({
  stats,
}: {
  stats: ContentWorkflowStats;
}) {
  const analysisRate = ratio(stats.analyzedPassageCount, stats.totalPassages);
  const reviewRate = ratio(stats.approvedCount, stats.totalQuestions);
  const aiRate = ratio(stats.aiGeneratedCount, stats.totalQuestions);
  const focus = buildFocus(stats);

  const stages: WorkflowStage[] = [
    {
      title: "지문 등록",
      value: stats.totalPassages,
      helper:
        stats.totalPassages > 0
          ? "학습지와 시험 출제의 원천 자료"
          : "교과서·모의고사 지문을 먼저 담으세요",
      href: "/director/workbench/passages",
      icon: BookOpenCheck,
      tone: "blue",
    },
    {
      title: "AI 분석",
      value: stats.analyzedPassageCount,
      helper:
        stats.totalPassages === 0
          ? "등록된 지문이 없습니다"
          : stats.pendingAnalysisCount > 0
          ? `${formatNumber(stats.pendingAnalysisCount)}개 분석 대기`
          : "모든 등록 지문 분석 완료",
      href: "/director/workbench/passages",
      icon: ScanSearch,
      tone: "cyan",
      progress: analysisRate,
      progressLabel: "분석률",
    },
    {
      title: "문제 생성",
      value: stats.totalQuestions,
      helper:
        stats.totalQuestions > 0
          ? `${formatNumber(stats.aiGeneratedCount)}개 AI 생성`
          : "분석된 지문에서 유형별 문제 생성",
      href: "/director/workbench/generate",
      icon: Layers3,
      tone: "emerald",
      progress: aiRate,
      progressLabel: "AI 생성 비중",
    },
    {
      title: "문제 검수",
      value: stats.approvedCount,
      helper:
        stats.totalQuestions === 0
          ? "생성된 문제가 없습니다"
          : stats.unapprovedCount > 0
          ? `${formatNumber(stats.unapprovedCount)}개 검수 대기`
          : "출제 가능한 문제로 정리됨",
      href: "/director/questions?approved=false",
      icon: ClipboardCheck,
      tone: "amber",
      progress: reviewRate,
      progressLabel: "검수율",
    },
    {
      title: "시험 준비",
      value: stats.approvedCount,
      helper:
        stats.approvedCount > 0
          ? "검수 완료 문제로 시험 구성 가능"
          : "검수 완료 후 시험 출제로 연결",
      href: "/director/exams",
      icon: FileCheck2,
      tone: "violet",
    },
  ];

  return (
    <section aria-labelledby="content-workflow-title" className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-blue-600">
            <Sparkles className="size-4" aria-hidden="true" />
            콘텐츠 제작 흐름
          </div>
          <h2
            id="content-workflow-title"
            className="mt-1 text-[20px] font-bold text-slate-950"
          >
            지금 어디까지 왔는지 한눈에 보기
          </h2>
        </div>

        <Link
          href={focus.href}
          className={cn(
            "flex min-h-12 items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm font-bold transition-colors hover:bg-white",
            focus.tone,
          )}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold opacity-75">
              {focus.label}
            </span>
            <span className="block truncate">{focus.title}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            {focus.action}
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((stage, index) => (
          <li key={stage.title}>
            <StageCard stage={stage} index={index} />
          </li>
        ))}
      </ol>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricBar
          label="지문 분석 준비도"
          value={analysisRate}
          detail={`${formatNumber(stats.analyzedPassageCount)}개 분석 완료 / ${formatNumber(stats.totalPassages)}개 등록`}
          tone="cyan"
        />
        <MetricBar
          label="문제 검수 준비도"
          value={reviewRate}
          detail={`${formatNumber(stats.approvedCount)}개 검수 완료 / ${formatNumber(stats.totalQuestions)}개 문제`}
          tone="amber"
        />
        <MetricBar
          label="AI 생성 비중"
          value={aiRate}
          detail={`${formatNumber(stats.aiGeneratedCount)}개 AI 생성 / ${formatNumber(stats.totalQuestions)}개 문제`}
          tone="emerald"
        />
      </div>
    </section>
  );
}
