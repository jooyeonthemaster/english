"use client";

import type { LiveRun } from "./use-md-lab-generation";

// 진행 중 실행 1개의 실시간 카드 — 사고/출력 타이머 + 사고 스트림 + 마크다운 스트림.
export function LiveRunCard({
  run,
  now,
  modelLabel,
  onDismiss,
}: {
  run: LiveRun;
  now: number;
  modelLabel: string;
  onDismiss: () => void;
}) {
  const thinkSec = ((run.tFirstContent ?? now) - run.t0) / 1000;
  const genSec = run.tFirstContent ? (now - run.tFirstContent) / 1000 : 0;
  const fmt = (v: number) => Math.max(0, v).toFixed(1);

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-800">
          {run.qtype === "blank" ? "빈칸" : "어법"}
        </span>
        <span className="text-sm text-slate-600">{modelLabel}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
          사고 {run.effort}
        </span>
        {run.error ? (
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
            실패 — {run.error.slice(0, 120)}
          </span>
        ) : (
          <>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                run.phase === "thinking"
                  ? "animate-pulse bg-violet-100 text-violet-700"
                  : "bg-violet-50 text-violet-600"
              }`}
            >
              사고 {fmt(thinkSec)}s
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                run.phase === "generating"
                  ? "animate-pulse bg-emerald-100 text-emerald-700"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              출력 {fmt(genSec)}s
            </span>
          </>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto text-xs font-medium text-slate-400 hover:text-red-500"
        >
          {run.error ? "닫기" : "중단"}
        </button>
      </div>

      {!run.error && (
        <>
          <details open={run.phase === "thinking"}>
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">
              사고 과정{" "}
              {run.reasoningText
                ? `(${run.reasoningText.length.toLocaleString()}자)`
                : "(이 모델은 사고 내용을 스트리밍하지 않을 수 있음)"}
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-violet-950/95 p-3 text-[11px] leading-relaxed text-violet-200">
              {run.reasoningText || "…"}
            </pre>
          </details>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-relaxed text-slate-200">
            {run.raw || "…"}
          </pre>
        </>
      )}
    </div>
  );
}
