"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCcw } from "lucide-react";

import { cn } from "@/lib/utils";

import { type CustomTypeAnalysisJob, formatTime } from "./custom-type-utils";

const POLL_INTERVAL_MS = 3000;

function isActive(status: CustomTypeAnalysisJob["status"]): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

export function CustomTypeAnalysisJobsPanel({
  refreshKey,
  running,
  onCreated,
}: {
  refreshKey: number;
  running: boolean;
  onCreated: () => void;
}) {
  const [jobs, setJobs] = useState<CustomTypeAnalysisJob[]>([]);
  const loadSeq = useRef(0);
  const wasActiveRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await fetch("/api/custom-question-types/analysis-jobs?limit=12", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    const json = (await res.json()) as { jobs: CustomTypeAnalysisJob[] };
    if (seq !== loadSeq.current) return;
    setJobs(json.jobs ?? []);
  }, []);

  useEffect(() => {
    // 마운트/refreshKey 변경 시 1회 로드(데이터 페치) — set-state-in-effect 는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  const hasActiveJobs = useMemo(() => jobs.some((j) => isActive(j.status)), [jobs]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJobs, load]);

  // active→비active 전이(막 분석 완료) → 유형 목록 갱신(생성 탭 픽커에 새 유형 반영).
  useEffect(() => {
    const justFinished = wasActiveRef.current && !hasActiveJobs;
    wasActiveRef.current = hasActiveJobs;
    if (justFinished) onCreated();
  }, [hasActiveJobs, onCreated]);

  const showSpinner = hasActiveJobs || running;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
          유형 만들기 작업
        </h3>
        {showSpinner ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
            <Loader2 className="size-3 animate-spin" />
            진행 중
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
        >
          <RefreshCcw className="size-3.5" />
          새로고침
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-slate-400">
          문항을 크롭하고 분석을 큐에 추가하면 여기에 작업이 표시됩니다. 완료되면 유형이 자동 생성됩니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <AnalysisJobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </section>
  );
}

function AnalysisJobCard({ job }: { job: CustomTypeAnalysisJob }) {
  const tone =
    job.status === "FAILED"
      ? "border-rose-200 bg-rose-50/60"
      : job.status === "COMPLETED"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-blue-200 bg-blue-50/50";

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-3", tone)}>
      <div className="flex items-center gap-1.5">
        {job.status === "PENDING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
            <Clock className="size-3" /> 대기 중
          </span>
        ) : job.status === "PROCESSING" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10.5px] font-bold text-blue-700">
            <Loader2 className="size-3 animate-spin" /> 분석 중
          </span>
        ) : job.status === "COMPLETED" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
            <CheckCircle2 className="size-3" /> 완료
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10.5px] font-bold text-rose-700">
            <AlertCircle className="size-3" /> 실패
          </span>
        )}
        {job.gradeInfo ? (
          <span className="shrink-0 rounded-md bg-white/70 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">
            {job.gradeInfo}
          </span>
        ) : null}
        <span className="ml-auto text-[10.5px] text-slate-400 tabular-nums">
          {formatTime(job.createdAt)}
        </span>
      </div>

      {job.status === "COMPLETED" ? (
        <p className="text-[11.5px] font-medium text-emerald-700">
          유형 생성됨{job.suggestedName ? `: ${job.suggestedName}` : ""}
        </p>
      ) : job.status === "FAILED" ? (
        <p
          className="text-[11px] leading-relaxed text-rose-600 line-clamp-3"
          title={job.errorMessage ?? undefined}
        >
          {job.errorMessage ?? "분석에 실패했습니다."}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-blue-600">
          <Loader2 className="size-3 animate-spin" /> 원본 문항 분석 → 유형 정의 컴파일 중…
        </p>
      )}
    </div>
  );
}
