"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, RefreshCw, Trash2 } from "lucide-react";

import { TERMINAL } from "./constants";
import { formatDate } from "./format";
import { JobStatusBadge } from "./job-status-badge";
import { QueueFilter } from "./queue-filter";
import type { QueueJob } from "./types";

export function QueuePanel({
  activeJobId,
  refreshKey,
  onDeleteActiveJob,
  onOpenJob,
}: {
  activeJobId: string | null;
  refreshKey: number;
  onDeleteActiveJob: () => void;
  onOpenJob: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "running" | "done" | "waiting">("all");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/extraction/jobs?limit=50", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: QueueJob[] };
      setJobs(data.jobs.filter((job) => job.mode === "PASSAGE_ONLY"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 10000);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs, refreshKey]);

  const filtered = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "running") return job.status === "PROCESSING";
    if (filter === "waiting") return job.status === "PENDING";
    return TERMINAL.has(job.status);
  });
  const runningCount = jobs.filter((job) => job.status === "PROCESSING").length;

  const deleteJob = useCallback(
    async (job: QueueJob) => {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("이 추출 작업과 결과를 삭제할까요?");
      if (!ok) return;

      const res = await fetch("/api/extraction/jobs/" + job.id, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return;
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (job.id === activeJobId) onDeleteActiveJob();
    },
    [activeJobId, onDeleteActiveJob],
  );

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">작업 목록</h2>
          <p className="mt-1 text-xs text-slate-500">
            백그라운드 추출 상태를 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runningCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700">
              진행 {runningCount}
            </span>
          ) : null}
          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700">
            {jobs.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            <QueueFilter active={filter === "all"} onClick={() => setFilter("all")}>
              전체
            </QueueFilter>
            <QueueFilter active={filter === "running"} onClick={() => setFilter("running")}>
              진행중
            </QueueFilter>
            <QueueFilter active={filter === "done"} onClick={() => setFilter("done")}>
              완료
            </QueueFilter>
            <QueueFilter active={filter === "waiting"} onClick={() => setFilter("waiting")}>
              대기중
            </QueueFilter>
          </div>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="cursor-pointer rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="작업 목록 새로고침"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="flex min-h-[150px] flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
              <Clock3 className="mb-2 size-6 text-slate-300" aria-hidden="true" />
              표시할 작업이 없습니다.
            </div>
          ) : (
            filtered.map((job) => (
              <div
                key={job.id}
                className={
                  "w-full rounded-md border px-3 py-2 text-left transition-colors " +
                  (job.id === activeJobId
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-sky-200")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenJob(job.id)}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {job.originalFileName ?? job.totalPages + "페이지 이미지"}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {job.m1DraftPipelineError ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                        저장 실패
                      </span>
                    ) : null}
                    <JobStatusBadge status={job.status} />
                    {TERMINAL.has(job.status) ? (
                      <button
                        type="button"
                        onClick={() => void deleteJob(job)}
                        className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        aria-label="추출 작업 삭제"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className="mt-1 flex w-full cursor-pointer items-center justify-between text-left text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span>
                    {job.m1DraftPipelineError
                      ? "결과 저장 실패 · 재추출 필요"
                      : job.successPages +
                        "/" +
                        job.totalPages +
                        "페이지 · 결과 " +
                        job.resultCount}
                  </span>
                  <span>{formatDate(job.createdAt)}</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
