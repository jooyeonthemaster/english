"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCcw,
} from "lucide-react";

import { SimilarExamBlueprintModal } from "./similar-exam-blueprint-modal";

interface SimilarExamCallSummary {
  analysis?: {
    provider: string;
    pages: number;
    chunks: number;
    llmCalls: number;
    llmAttempts: number;
    reusedBlueprint: boolean;
  };
  generation?: {
    totalSlots: number;
    eligibleSlots: number;
    generatedSlots: number;
    skippedSlots: number;
    groupCount: number;
    llmCalls: number;
    llmAttempts: number;
    relaxedFallbackGroups: number;
    maxGeneratedQuestions: number;
  };
  llmCallsTotal?: number;
  llmAttemptsTotal?: number;
}

interface SimilarExamJob {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  stage: string;
  title: string;
  originalFileName: string | null;
  totalPages: number;
  generatedExamId: string | null;
  errorMessage: string | null;
  result: {
    questionCount?: number;
    patternQuestionCount?: number;
    selectedPassageIds?: string[];
    callSummary?: SimilarExamCallSummary;
  } | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  UPLOADING: "업로드 대기",
  OCR: "텍스트 추출 중",
  ANALYZING_PATTERN: "시험지 패턴 분석 중",
  ASSIGNING_PASSAGES: "선택 지문 배정 중",
  GENERATING_QUESTIONS: "문항 생성 중",
  SAVING: "시험지 저장 중",
  COMPLETED: "완료",
  FAILED: "실패",
};

const STATUS_STYLES: Record<SimilarExamJob["status"], string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  PROCESSING: "border-blue-200 bg-blue-50 text-blue-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-200 bg-slate-50 text-slate-500",
};

function stageLabel(stage: string) {
  const apMatch = stage.match(/^ANALYZING_PATTERN_(\d+)_OF_(\d+)$/);
  if (apMatch) return `시험지 패턴 분석 중 ${apMatch[1]}/${apMatch[2]}`;
  return STAGE_LABELS[stage] ?? stage;
}

function stagePercent(job: SimilarExamJob) {
  if (job.status === "COMPLETED" || job.status === "FAILED") return 100;
  const apMatch = job.stage.match(/^ANALYZING_PATTERN_(\d+)_OF_(\d+)$/);
  if (apMatch) {
    const current = Number(apMatch[1]);
    const total = Number(apMatch[2]);
    return 15 + Math.round((Math.min(current, total) / Math.max(total, 1)) * 30);
  }
  switch (job.stage) {
    case "UPLOADING":
      return 5;
    case "OCR":
      return 18;
    case "ANALYZING_PATTERN":
      return 45;
    case "ASSIGNING_PASSAGES":
      return 58;
    case "GENERATING_QUESTIONS":
      return 82;
    case "SAVING":
      return 94;
    default:
      return job.status === "PROCESSING" ? 24 : 8;
  }
}

function statusIcon(status: SimilarExamJob["status"]) {
  if (status === "COMPLETED") return <CheckCircle2 className="size-4" />;
  if (status === "FAILED" || status === "CANCELLED") return <AlertCircle className="size-4" />;
  if (status === "PROCESSING") return <Loader2 className="size-4 animate-spin" />;
  return <Clock3 className="size-4" />;
}

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function callSummaryBadges(summary: SimilarExamCallSummary | undefined) {
  if (!summary) return [];
  const badges: string[] = [];
  if (summary.analysis) {
    if (summary.analysis.reusedBlueprint) {
      badges.push("패턴 재사용");
    } else {
      badges.push(`분석 ${summary.analysis.pages}p`);
      if (summary.analysis.chunks > 1) {
        badges.push(`분석 ${summary.analysis.chunks}분할`);
      }
    }
  }
  if (typeof summary.llmCallsTotal === "number") {
    badges.push(`LLM ${summary.llmCallsTotal}회`);
  }
  if (summary.generation) {
    badges.push(`생성 ${summary.generation.generatedSlots}/${summary.generation.eligibleSlots}문항`);
    if (summary.generation.skippedSlots > 0) {
      badges.push(`제외 ${summary.generation.skippedSlots}문항`);
    }
    if (summary.generation.relaxedFallbackGroups > 0) {
      badges.push(`완화 ${summary.generation.relaxedFallbackGroups}`);
    }
  }
  return badges;
}

export function SimilarExamJobsPanel({ refreshKey }: { refreshKey: number }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<SimilarExamJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [blueprintJobId, setBlueprintJobId] = useState<string | null>(null);

  const hasRunningJobs = useMemo(
    () => jobs.some((job) => job.status === "PENDING" || job.status === "PROCESSING"),
    [jobs],
  );

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/similar-exams/jobs?limit=20", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { jobs: SimilarExamJob[] };
    setJobs(data.jobs);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadJobs();
  }, [loadJobs, refreshKey]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadJobs(), hasRunningJobs ? 3000 : 8000);
    return () => window.clearInterval(timer);
  }, [hasRunningJobs, loadJobs]);

  return (
    <section className="min-h-[360px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">생성 작업</h2>
          <p className="mt-1 text-sm text-slate-500">
            시험지 패턴 분석과 생성 진행 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCcw className="size-4" />
          새로고침
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {loading && jobs.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            작업 목록을 불러오는 중
          </div>
        ) : jobs.length === 0 ? (
          <div className="px-5 py-8 text-sm text-slate-500">
            아직 생성 작업이 없습니다.
          </div>
        ) : (
          jobs.map((job) => {
            const percent = stagePercent(job);
            const summaryBadges = callSummaryBadges(job.result?.callSummary);
            return (
              <div key={job.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold ${STATUS_STYLES[job.status]}`}
                      >
                        {statusIcon(job.status)}
                        {job.status}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {stageLabel(job.stage)}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-slate-800">
                      {job.originalFileName || job.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {job.totalPages}페이지 · 시작 {formatTime(job.startedAt || job.createdAt)}
                      {job.completedAt ? ` · 완료 ${formatTime(job.completedAt)}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {(job.status === "COMPLETED" || job.status === "FAILED") && (
                      <button
                        type="button"
                        onClick={() => setBlueprintJobId(job.id)}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <FileSearch className="size-4" />
                        생성 근거
                      </button>
                    )}
                    {job.generatedExamId && (
                      <button
                        type="button"
                        onClick={() => router.push(`/director/exams/${job.generatedExamId}`)}
                        className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        시험지 열기
                        <ExternalLink className="size-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{percent}%</span>
                    {typeof job.result?.questionCount === "number" && (
                      <span>생성 {job.result.questionCount}문항</span>
                    )}
                    {typeof job.result?.patternQuestionCount === "number" && (
                      <span>패턴 {job.result.patternQuestionCount}문항</span>
                    )}
                    {Array.isArray(job.result?.selectedPassageIds) && (
                      <span>지문 {job.result.selectedPassageIds.length}개</span>
                    )}
                    {summaryBadges.map((badge) => (
                      <span key={badge}>{badge}</span>
                    ))}
                  </div>
                </div>

                {job.errorMessage && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {job.errorMessage}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {blueprintJobId && (
        <SimilarExamBlueprintModal
          jobId={blueprintJobId}
          onClose={() => setBlueprintJobId(null)}
        />
      )}
    </section>
  );
}
