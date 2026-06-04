"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FileSearch, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

import { SimilarExamBlueprintModal } from "./similar-exam-blueprint-modal";
import {
  SimilarExamJobCard,
  type SimilarExamJobCardData,
} from "./similar-exam-job-card";

const COLLAPSED_STORAGE_KEY = "smoat.similarExam.jobsBandCollapsed.v2";

export function SimilarExamJobsPanel({ refreshKey }: { refreshKey: number }) {
  const [jobs, setJobs] = useState<SimilarExamJobCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [blueprintJobId, setBlueprintJobId] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(
      typeof window !== "undefined" &&
        window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true",
    );
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // 보관 실패 무시.
      }
      return next;
    });
  }, []);

  const hasRunningJobs = useMemo(
    () => jobs.some((job) => job.status === "PENDING" || job.status === "PROCESSING"),
    [jobs],
  );

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/similar-exams/jobs?limit=30", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { jobs: SimilarExamJobCardData[] };
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

  const handleDelete = useCallback(
    async (jobId: string) => {
      if (typeof window !== "undefined" && !window.confirm("이 작업을 삭제할까요?")) {
        return;
      }
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      try {
        const res = await fetch(`/api/similar-exams/jobs/${jobId}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error();
      } catch {
        toast.error("작업을 삭제하지 못했습니다.");
        void loadJobs();
      }
    },
    [loadJobs],
  );

  return (
    <section className="flex min-h-0 flex-col overflow-hidden border-t border-slate-200 bg-white">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <FileSearch className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[13px] font-black text-slate-900">생성 작업</h2>
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            · {jobs.length}건
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCcw className="size-3.5" />
            새로고침
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? "작업 목록 펼치기" : "작업 목록 접기"}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
          >
            {collapsed ? (
              <>
                <ChevronUp className="size-3.5" />
                펼치기
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                접기
              </>
            )}
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div className="p-4">
          {loading && jobs.length === 0 ? (
            <div className="flex items-center gap-2 px-1 py-8 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              작업 목록을 불러오는 중
            </div>
          ) : jobs.length === 0 ? (
            <div className="px-1 py-8 text-sm text-slate-500">
              아직 생성 작업이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {jobs.map((job) => (
                <SimilarExamJobCard
                  key={job.id}
                  job={job}
                  onShowAnalysis={setBlueprintJobId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {blueprintJobId && (
        <SimilarExamBlueprintModal
          jobId={blueprintJobId}
          onClose={() => setBlueprintJobId(null)}
        />
      )}
    </section>
  );
}
