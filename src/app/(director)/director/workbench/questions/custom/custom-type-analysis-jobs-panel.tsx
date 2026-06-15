"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

// ── 경계: 자료 추출 작업 큐와 동일한 룩을 위해 공유 JobCard 를 import 차용(무수정). ──
import { JobCard } from "@/components/workbench/shared/job-card";

import { type CustomTypeAnalysisJob } from "./custom-type-utils";
import { CustomTypeReviseModal } from "./custom-type-revise-modal";

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
  const [editingType, setEditingType] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const loadSeq = useRef(0);
  const wasActiveRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await fetch(
      "/api/custom-question-types/analysis-jobs?limit=12",
      {
        credentials: "include",
        cache: "no-store",
      },
    );
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

  const hasActiveJobs = useMemo(
    () => jobs.some((j) => isActive(j.status)),
    [jobs],
  );

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

  // 완료 잡 클릭 → 생성된 유형 상세(✦) 모달. 진행/실패는 안내만.
  const openJob = useCallback((job: CustomTypeAnalysisJob) => {
    if (job.createdTypeId) {
      setEditingType({
        id: job.createdTypeId,
        name: job.suggestedName ?? "커스텀 유형",
      });
    } else if (job.status === "FAILED") {
      toast.error(job.errorMessage ?? "분석에 실패했습니다.");
    } else {
      toast.message("분석이 진행 중입니다. 완료되면 유형 상세를 열 수 있어요.");
    }
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-bold text-slate-900">
            유형 만들기 작업
          </h2>
          {showSpinner ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              <Loader2 className="size-3 animate-spin" />
              진행 중
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <RefreshCcw className="size-3" />
          새로고침
        </button>
      </div>

      <div className="mt-3">
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-8 text-center text-[12px] text-slate-500">
            문항을 크롭하고 분석을 큐에 추가하면 여기에 작업이 표시됩니다.
            완료되면 유형이 자동 생성됩니다.
          </div>
        ) : (
          <div className="flex min-w-0 items-stretch gap-3 overflow-x-auto pb-1">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                variant="detailed"
                label={
                  job.suggestedName?.trim() ||
                  (job.status === "FAILED" ? "분석 실패" : "유형 분석 중")
                }
                count={1}
                createdAt={new Date(job.completedAt ?? job.createdAt).getTime()}
                status={job.status}
                thumbnailUrl={`/api/custom-question-types/analysis-jobs/${job.id}/image`}
                onClick={() => openJob(job)}
              />
            ))}
          </div>
        )}
      </div>

      {editingType ? (
        <CustomTypeReviseModal
          typeId={editingType.id}
          typeName={editingType.name}
          onClose={() => setEditingType(null)}
          onRevised={() => {
            void load();
            onCreated();
          }}
        />
      ) : null}
    </section>
  );
}
