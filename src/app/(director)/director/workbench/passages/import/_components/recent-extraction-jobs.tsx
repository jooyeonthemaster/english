"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExtractionStore } from "@/lib/extraction/store";
import type { ExtractionMode } from "@/lib/extraction/modes";
import type { ExtractionJobStatus, ExtractionSourceType } from "@/lib/extraction/types";
import { JobCard } from "@/components/workbench/shared/job-card";

interface RecentExtractionJob {
  id: string;
  sourceType: ExtractionSourceType;
  mode: ExtractionMode;
  originalFileName: string | null;
  displayName?: string | null;
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
  firstPageImageUrl?: string | null;
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

function shouldShowJob(job: RecentExtractionJob): boolean {
  if (WORKING.has(job.status)) return true;
  if (TERMINAL_REVIEW.has(job.status) && job.draftResultCount > 0) return true;
  return job.status === "FAILED";
}

function phaseFor(job: RecentExtractionJob) {
  if (TERMINAL_REVIEW.has(job.status)) return "reviewing" as const;
  return "processing" as const;
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

      <div className="mt-3">
        {loading && visibleJobs.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-[12px] text-slate-500">
            <Loader2 className="size-4 animate-spin text-sky-500" />
            작업 목록을 불러오는 중입니다.
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-8 text-center text-[12px] text-slate-500">
            표시할 추출 작업이 없습니다.
          </div>
        ) : (
          <div className="flex min-w-0 items-stretch gap-3 overflow-x-auto pb-1">
            {visibleJobs.map((job) => (
              <JobCard
                key={job.id}
                variant="detailed"
                label={
                  (job.displayName?.trim() && job.displayName) ||
                  job.originalFileName ||
                  `${job.totalPages}장의 이미지`
                }
                count={job.resultCount}
                createdAt={new Date(
                  job.completedAt ?? job.startedAt ?? job.createdAt,
                ).getTime()}
                status={job.status}
                thumbnailUrl={job.firstPageImageUrl ?? null}
                mode={job.mode}
                totalPages={job.totalPages}
                successPages={job.successPages}
                draftResultCount={job.draftResultCount}
                savedResultCount={job.savedResultCount}
                deleting={deletingId === job.id}
                onClick={() => resumeJob(job)}
                onDelete={
                  job.status !== "PROCESSING"
                    ? () => void deleteJob(job)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
