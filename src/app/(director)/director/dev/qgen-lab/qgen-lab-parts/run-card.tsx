"use client";

// 팔 1개 실행 카드 — 외부 스토어(LabRun) 구독: 스트리밍 미리보기(사고 접힘/본문) · 단계 타임라인 ·
// 토큰·비용 · 상태 배지 · 게이트 이슈 · 최종 문항 · 계획 시각화.

import { Info, Square } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ArmConfig } from "@/lib/qgen-lab/types";
import { cn } from "@/lib/utils";
import { armConfigLine, DIFFICULTY_SHORT, fmtChars } from "./format-utils";
import { RunResultView } from "./run-result-view";
import type { LabRun, LiveRunSnapshot } from "./run-store-utils";
import { ClientTimingLine, RunMetrics, RunTimeline, useTicker } from "./run-timeline";
import { IssueList, Mono, StatusBadge } from "./ui-bits";

/** 본문 미리보기는 끝부분만 — 긴 스트림에서 렌더 비용을 고정한다. */
const CONTENT_TAIL = 6_000;
const REASONING_TAIL = 4_000;

function LiveStream({ snap }: { snap: LiveRunSnapshot }) {
  const a = snap.attempts[snap.attempts.length - 1];
  const contentRef = useRef<HTMLPreElement>(null);
  const content = a?.content ?? "";
  useEffect(() => {
    const el = contentRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content.length]);
  if (!a) {
    return (
      <div className="rounded-md border border-dashed border-stone-300 px-3 py-4 text-center text-[0.75rem] text-stone-500">
        {snap.phase === "planning" ? "출제 계획 중(jev)…" : "서버 접수 대기…"}
      </div>
    );
  }
  const writing = a.firstContentMs != null;
  return (
    <div className="space-y-1.5">
      <details className="rounded-md border border-stone-200 bg-white">
        <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-[0.6875rem] text-stone-500">
          <span className={cn("font-semibold", !writing && snap.status === "running" && "text-orange-700")}>사고</span>
          <Mono>{fmtChars(a.reasoning.length)}</Mono>
          <span className="truncate text-stone-400">{a.reasoning.slice(-90).replace(/\s+/g, " ")}</span>
        </summary>
        <pre className="max-h-48 overflow-auto border-t border-stone-200 px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap text-stone-600">
          {a.reasoning.length > REASONING_TAIL ? `…${a.reasoning.slice(-REASONING_TAIL)}` : a.reasoning || "(사고 델타 없음)"}
        </pre>
      </details>
      <pre
        ref={contentRef}
        className={cn(
          "max-h-56 min-h-16 overflow-auto rounded-md border px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed whitespace-pre-wrap",
          writing && snap.status === "running"
            ? "border-orange-300 bg-[#1f1d1a] text-orange-50"
            : "border-stone-300 bg-[#1f1d1a] text-stone-200",
        )}
      >
        {content
          ? content.length > CONTENT_TAIL
            ? `…${content.slice(-CONTENT_TAIL)}`
            : content
          : snap.status === "running"
            ? "본문 대기(사고 중)…"
            : "(본문 없음)"}
      </pre>
    </div>
  );
}

export function RunCard({
  arm,
  armId,
  run,
  passage,
  onDismiss,
  className,
}: {
  arm: ArmConfig | undefined;
  armId: string;
  run: LabRun;
  passage: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const snap = useSyncExternalStore(run.subscribe, run.getSnapshot, run.getSnapshot);
  const running = snap.status === "running";
  const now = useTicker(running);
  const hasPlanner = !!arm && arm.planner.id !== "none";

  return (
    <article
      data-testid={`qgen-run-card-${armId}`}
      data-status={snap.status}
      data-run-id={snap.runId ?? ""}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg border bg-[#fffefa] p-3",
        running ? "border-orange-300 shadow-[0_0_0_3px_rgba(234,88,12,0.08)]" : "border-stone-300",
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {arm && (
              <span className="rounded-[4px] bg-stone-900 px-1 font-mono text-[0.625rem] leading-4 font-bold text-[#fffefa]">
                {DIFFICULTY_SHORT[arm.difficulty]}
              </span>
            )}
            <Mono className="text-[0.8125rem] font-bold text-stone-900">{armId}</Mono>
            <StatusBadge status={snap.status} />
            {arm && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-stone-400 hover:text-stone-700" aria-label="가설">
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-[0.75rem] leading-5">
                  {arm.hypothesis}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="mt-0.5 truncate text-[0.75rem] text-stone-600">{arm?.label ?? "알 수 없는 팔"}</p>
          {arm && <p className="truncate font-mono text-[0.6875rem] text-stone-400">{armConfigLine(arm)}</p>}
        </div>
        {running ? (
          <button
            type="button"
            onClick={() => run.abort()}
            title="클라 수신만 끊는다 — 서버 생성·과금은 계속될 수 있다"
            className="inline-flex h-[26px] items-center gap-1 rounded-md border border-stone-300 bg-white px-2 text-[0.6875rem] font-semibold text-stone-600 hover:border-red-400 hover:text-red-700"
          >
            <Square className="size-3" /> 중단
          </button>
        ) : onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="h-[26px] rounded-md px-2 text-[0.6875rem] font-semibold text-stone-400 hover:text-stone-800"
          >
            닫기
          </button>
        ) : null}
      </header>

      <RunTimeline snap={snap} now={now} hasPlanner={hasPlanner} />
      <RunMetrics snap={snap} />

      {(running || !snap.result) && <LiveStream snap={snap} />}
      {snap.error && !snap.result && <IssueList tone={snap.status === "aborted" ? "muted" : "error"} issues={[snap.error]} />}

      <RunResultView result={snap.result} passage={passage} livePlan={snap.plan} liveVerifies={snap.verifies} />

      {!running && <ClientTimingLine snap={snap} />}
    </article>
  );
}
