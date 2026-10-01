"use client";

// 배치 탭 부품 — 진행 막대(Aside 계기 qgen-batch-progress) · 서버 기록 상세(이 세션에서 돌리지 않은 실행).

import { useEffect, useState } from "react";

import type { RunResult } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { fetchRunResult } from "./api-utils";
import type { BatchCounts } from "./batch-runner-utils";
import { STATUS_FILL, STATUS_LABEL } from "./format-utils";
import { RunResultView } from "./run-result-view";
import type { LiveRunSnapshot } from "./run-store-utils";
import { RunMetrics, RunTimeline } from "./run-timeline";

const SEGMENTS: (keyof BatchCounts & ("ok" | "gate_fail" | "error" | "skipped" | "running"))[] = [
  "ok",
  "gate_fail",
  "error",
  "skipped",
  "running",
];

export function ProgressStrip({ counts, state }: { counts: BatchCounts; state: string }) {
  return (
    <div
      data-testid="qgen-batch-progress"
      data-state={state}
      data-total={counts.total}
      data-done={counts.done}
      data-running={counts.running}
      data-failed={counts.error}
      className="space-y-1"
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
        {SEGMENTS.map((k) =>
          counts[k] > 0 ? (
            <span
              key={k}
              title={`${STATUS_LABEL[k]} ${counts[k]}`}
              className={cn("h-full", STATUS_FILL[k], k === "running" && "animate-pulse")}
              style={{ width: `${(counts[k] / Math.max(1, counts.total)) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <p className="flex flex-wrap gap-x-3 font-mono text-[0.6875rem] text-stone-600 tabular-nums">
        <span className="font-semibold text-stone-900">
          {counts.done}/{counts.total}
        </span>
        <span>통과 {counts.ok}</span>
        <span>반려 {counts.gate_fail}</span>
        <span className={counts.error ? "text-red-700" : ""}>오류 {counts.error}</span>
        <span>기록 {counts.skipped}</span>
        <span className={counts.running ? "text-orange-700" : ""}>실행 {counts.running}</span>
        <span>대기 {counts.queued}</span>
      </p>
    </div>
  );
}

/** 이 세션에서 돌리지 않은 서버 기록 — GET /runs?batchId=&runId= 로 전체 RunResult 를 받아 그린다. */
export function StoredRunDetail({
  batchId,
  runId,
  passage,
  clientMs,
  className,
}: {
  className?: string;
  batchId: string;
  runId: string;
  passage: string;
  clientMs: number | null;
}) {
  const [state, setState] = useState<{ runId: string; result: RunResult | null; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRunResult(batchId, runId)
      .then((result) => alive && setState({ runId, result, error: null }))
      .catch((e: unknown) => alive && setState({ runId, result: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [batchId, runId]);
  if (!state || state.runId !== runId) return <p className="text-[0.75rem] text-stone-500">서버 기록 불러오는 중…</p>;
  if (state.error || !state.result) return <p className="text-[0.75rem] text-red-700">{state.error ?? "기록 없음"}</p>;
  const r = state.result;
  // 타임라인 계기는 스냅숏 모양을 받는다 — 서버 기록으로 완료 스냅숏을 합성.
  const snap: LiveRunSnapshot = {
    key: r.runId,
    armId: r.armId,
    passageId: r.passageId,
    rep: r.rep,
    batchId: r.batchId,
    status: r.status,
    phase: "done",
    runId: r.runId,
    seed: r.seed,
    plan: r.plan,
    verifies: r.verify ? [r.verify] : [],
    attempts: [],
    retries: [],
    result: r,
    error: r.failReason,
    timing: { metaMs: null, firstReasoningMs: null, firstContentMs: null, doneMs: clientMs },
    t0: 0,
  };
  return (
    <div className={cn("space-y-2.5", className)}>
      <p className="font-mono text-[0.6875rem] text-stone-500">서버 기록 {runId}</p>
      <RunTimeline snap={snap} now={0} hasPlanner={!!r.plan} />
      <RunMetrics snap={snap} />
      <RunResultView result={r} passage={passage} />
    </div>
  );
}
