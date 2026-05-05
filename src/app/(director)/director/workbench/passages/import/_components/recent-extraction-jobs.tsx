"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtractionStore } from "@/lib/extraction/store";
import { MODES, type ExtractionMode } from "@/lib/extraction/modes";
import type { ExtractionJobStatus, ExtractionSourceType } from "@/lib/extraction/types";

interface RecentExtractionJob {
  id: string;
  sourceType: ExtractionSourceType;
  mode: ExtractionMode;
  originalFileName: string | null;
  status: ExtractionJobStatus;
  totalPages: number;
  successPages: number;
  failedPages: number;
  pendingPages: number;
  creditsConsumed: number;
  draftResultCount: number;
  savedResultCount: number;
  resultCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface RecentExtractionJobsProps {
  maxItems?: number;
  fetchLimit?: number;
  filter?: "actionable" | "all";
  showViewAll?: boolean;
  showEmptyState?: boolean;
  className?: string;
  title?: string;
  description?: string;
}

const TERMINAL_REVIEW = new Set<ExtractionJobStatus>(["COMPLETED", "PARTIAL"]);
const WORKING = new Set<ExtractionJobStatus>(["PENDING", "PROCESSING"]);

const STATUS_LABEL: Record<ExtractionJobStatus, string> = {
  PENDING: "대기 중",
  PROCESSING: "처리 중",
  COMPLETED: "검토 대기",
  PARTIAL: "부분 완료",
  FAILED: "실패",
  CANCELLED: "취소됨",
};

function statusLabelFor(job: RecentExtractionJob): string {
  if (
    TERMINAL_REVIEW.has(job.status) &&
    job.draftResultCount === 0 &&
    job.savedResultCount > 0
  ) {
    return "저장 완료";
  }
  return STATUS_LABEL[job.status];
}

function resultLabelFor(job: RecentExtractionJob): string {
  const parts = [`${job.successPages}/${job.totalPages}장`];
  if (job.draftResultCount > 0) parts.push(`검토 ${job.draftResultCount}`);
  if (job.savedResultCount > 0) parts.push(`저장 ${job.savedResultCount}`);
  return parts.join(" · ");
}

function shouldShowJob(job: RecentExtractionJob): boolean {
  if (WORKING.has(job.status)) return true;
  if (TERMINAL_REVIEW.has(job.status) && job.draftResultCount > 0) return true;
  return job.status === "FAILED";
}

function phaseFor(job: RecentExtractionJob) {
  if (TERMINAL_REVIEW.has(job.status)) return "reviewing" as const;
  return "processing" as const;
}

function formatTime(value: string | null): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

export function RecentExtractionJobs({
  maxItems = 4,
  fetchLimit = 50,
  filter = "actionable",
  showViewAll = true,
  showEmptyState = true,
  className = "mx-6 mt-4",
  title = "이어 할 추출 작업",
  description = "처리 중이거나 저장 전 검토가 남은 작업을 다시 엽니다.",
}: RecentExtractionJobsProps) {
  const router = useRouter();
  const setMode = useExtractionStore((s) => s.setMode);
  const setJobId = useExtractionStore((s) => s.setJobId);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const [jobs, setJobs] = useState<RecentExtractionJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/extraction/jobs?limit=${fetchLimit}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs?: RecentExtractionJob[] };
      const nextJobs = data.jobs ?? [];
      setJobs(filter === "actionable" ? nextJobs.filter(shouldShowJob) : nextJobs);
    } finally {
      setLoading(false);
    }
  }, [fetchLimit, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleJobs = useMemo(
    () => (maxItems > 0 ? jobs.slice(0, maxItems) : jobs),
    [jobs, maxItems],
  );
  const canViewAll = showViewAll && jobs.length > 0;

  const resumeJob = useCallback(
    (job: RecentExtractionJob) => {
      setMode(job.mode);
      setJobId(job.id);
      setPhase(phaseFor(job));
      router.replace(`/director/workbench/passages/import?jobId=${job.id}`, {
        scroll: false,
      });
    },
    [router, setJobId, setMode, setPhase],
  );

  const deleteJob = useCallback(
    async (job: RecentExtractionJob) => {
      if (job.status === "PROCESSING") return;
      const ok = window.confirm(
        "이 추출 작업과 임시 결과를 삭제할까요? 저장된 지문은 삭제되지 않습니다.",
      );
      if (!ok) return;
      setDeletingId(job.id);
      try {
        const res = await fetch(`/api/extraction/jobs/${job.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          window.alert(body?.error ?? "작업 삭제에 실패했습니다.");
          return;
        }
        setJobs((prev) => prev.filter((item) => item.id !== job.id));
        const currentJobId = useExtractionStore.getState().jobId;
        if (currentJobId === job.id) {
          setJobId(null);
          setPhase("idle");
          router.replace("/director/workbench/passages/import", {
            scroll: false,
          });
        }
      } finally {
        setDeletingId(null);
      }
    },
    [router, setJobId, setPhase],
  );

  if (!loading && visibleJobs.length === 0 && !showEmptyState) return null;

  return (
    <section className={`${className} rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {canViewAll ? (
            <Link
              href="/director/workbench/passages/import/jobs"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700"
            >
              전체 보기
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} />
            새로고침
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-4">
        {loading && visibleJobs.length === 0 ? (
          <div className="col-span-full flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
            <Loader2 className="size-4 animate-spin text-sky-500" />
            작업 목록을 불러오는 중입니다.
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="col-span-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-8 text-center text-[12px] text-slate-500">
            표시할 추출 작업이 없습니다.
          </div>
        ) : (
          visibleJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              deleting={deletingId === job.id}
              onOpen={resumeJob}
              onDelete={deleteJob}
            />
          ))
        )}
      </div>
    </section>
  );
}

function JobCard({
  job,
  deleting,
  onOpen,
  onDelete,
}: {
  job: RecentExtractionJob;
  deleting: boolean;
  onOpen: (job: RecentExtractionJob) => void;
  onDelete: (job: RecentExtractionJob) => void;
}) {
  return (
    <div className="group relative flex min-h-[86px] flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/60">
      <button
        type="button"
        onClick={() => onOpen(job)}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        aria-label="추출 작업 열기"
      />
      <div className="pointer-events-none flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <StatusIcon status={job.status} />
            <span className="text-[11px] font-bold text-slate-700">
              {statusLabelFor(job)}
            </span>
            <span className="rounded border border-sky-200 bg-white px-1 py-0 text-[9px] font-bold text-sky-700">
              {MODES[job.mode]?.shortLabel ?? job.mode}
            </span>
          </div>
          <div className="mt-1 truncate text-[12px] font-semibold text-slate-900">
            {job.originalFileName || `${job.totalPages}장의 이미지`}
          </div>
        </div>
        <div className="pointer-events-auto z-10 flex items-center gap-1">
          {job.status !== "PROCESSING" ? (
            <button
              type="button"
              onClick={() => onDelete(job)}
              disabled={deleting}
              className="inline-flex size-7 items-center justify-center rounded-md border border-transparent text-slate-300 transition-colors hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
              aria-label="추출 작업 삭제"
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </button>
          ) : null}
          <ArrowRight className="size-4 text-slate-300 transition-colors group-hover:text-sky-500" />
        </div>
      </div>
      <div className="pointer-events-none mt-2 flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
        <span className="min-w-0 truncate">{resultLabelFor(job)}</span>
        <span className="tabular-nums">
          {formatTime(job.completedAt ?? job.startedAt ?? job.createdAt)}
        </span>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ExtractionJobStatus }) {
  if (status === "COMPLETED" || status === "PARTIAL") {
    return <CheckCircle2 className="size-3.5 text-emerald-500" />;
  }
  if (status === "FAILED" || status === "CANCELLED") {
    return <AlertCircle className="size-3.5 text-rose-500" />;
  }
  if (status === "PROCESSING") {
    return <Loader2 className="size-3.5 animate-spin text-sky-500" />;
  }
  return <Clock3 className="size-3.5 text-slate-400" />;
}
