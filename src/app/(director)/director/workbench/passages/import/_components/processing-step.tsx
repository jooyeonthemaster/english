"use client";

import { useMemo } from "react";
import {
  CheckCircle2,
  Loader2,
  Clock,
  RefreshCw,
  XCircle,
  Ban,
  FileText,
  ListChecks,
  NotebookPen,
  FilePlus2,
  type LucideIcon,
} from "lucide-react";
import { useExtractionStore, type PageRuntime } from "@/lib/extraction/store";
import type { ExtractionPageStatus } from "@/lib/extraction/types";
import { getErrorUserMessage } from "@/lib/extraction/error-classifier";
import { MODES, type ModeIcon } from "@/lib/extraction/modes";

const MODE_ICON_MAP: Record<ModeIcon, LucideIcon> = {
  FileText,
  ListChecks,
  NotebookPen,
  FilePlus2,
};

const STATUS_LABEL: Record<ExtractionPageStatus, string> = {
  PENDING: "대기",
  PROCESSING: "처리 중",
  SUCCESS: "성공",
  FAILED: "재시도 중",
  DEAD: "실패",
  SKIPPED: "건너뜀",
};

// FAILED = "retry in progress" (recoverable), DEAD = "gave up" (rose). We
// intentionally use sky (brand primary) for FAILED because amber/orange are
// banned by the project palette rules — sky also reads as "still working"
// rather than "terminal failure", which matches the semantics better.
const STATUS_STYLE: Record<ExtractionPageStatus, { ring: string; bg: string; text: string }> = {
  PENDING:    { ring: "ring-slate-200",    bg: "bg-slate-50",    text: "text-slate-500" },
  PROCESSING: { ring: "ring-sky-400",      bg: "bg-sky-50",      text: "text-sky-700" },
  SUCCESS:    { ring: "ring-emerald-300",  bg: "bg-emerald-50",  text: "text-emerald-700" },
  FAILED:     { ring: "ring-sky-300",      bg: "bg-sky-50/60",   text: "text-sky-700" },
  DEAD:       { ring: "ring-rose-300",     bg: "bg-rose-50",     text: "text-rose-700" },
  SKIPPED:    { ring: "ring-slate-200",    bg: "bg-slate-50",    text: "text-slate-400" },
};

export function ProcessingStep() {
  const job = useExtractionStore((s) => s.job);
  const pages = useExtractionStore((s) => s.pages);
  const slots = useExtractionStore((s) => s.slots);
  const uploadProgress = useExtractionStore((s) => s.uploadProgress);
  const phase = useExtractionStore((s) => s.phase);
  const mode = useExtractionStore((s) => s.mode);
  const modeConfig = mode ? MODES[mode] : null;

  const pageList = useMemo<PageRuntime[]>(() => {
    if (!job) {
      // Before SSE hydration — fall back to slots as PENDING placeholders
      return slots.map((s) => ({
        pageIndex: s.pageIndex,
        status: "PENDING",
        attemptCount: 0,
        extractedText: null,
        errorCode: null,
        errorMessage: null,
        latencyMs: null,
        imageUrl: s.previewUrl,
      }));
    }
    return Array.from(pages.values()).sort((a, b) => a.pageIndex - b.pageIndex);
  }, [job, pages, slots]);

  const overall = {
    total: job?.totalPages ?? slots.length,
    success: job?.successPages ?? 0,
    failed: job?.failedPages ?? 0,
    pending: job?.pendingPages ?? slots.length,
  };
  const completed = overall.success + overall.failed;
  const progress = overall.total > 0 ? (completed / overall.total) * 100 : 0;

  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      <div className="border-b border-slate-200/60 bg-white/50 px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {modeConfig ? <ModeBadge icon={modeConfig.icon} label={modeConfig.label} shortLabel={modeConfig.shortLabel} /> : null}
            <div>
              <div className="text-[13px] font-semibold text-slate-700">
                {phase === "uploading"
                  ? `파일 업로드 중…`
                  : phase === "starting"
                    ? "작업 시작 중…"
                    : "페이지별 추출 중…"}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                페이지 1장당 AI 호출 1회. 실패한 페이지는 개별적으로 재시도할 수 있습니다.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Stat label="성공" value={overall.success} tone="emerald" />
            <Stat label="실패" value={overall.failed} tone="rose" />
            <Stat label="대기" value={overall.pending} tone="slate" />
            <Stat label="총" value={overall.total} tone="sky" />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-3">
            {(() => {
              const percent =
                phase === "uploading" && uploadProgress && uploadProgress.total > 0
                  ? Math.round((uploadProgress.uploaded / uploadProgress.total) * 100)
                  : Math.round(progress);
              return (
                <>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label={
                      phase === "uploading" ? "업로드 진행률" : "추출 진행률"
                    }
                    className="flex-1 overflow-hidden rounded-full bg-slate-200/80"
                  >
                    <div
                      // Sky→emerald gradient is intentional: the success-tinted
                      // endpoint communicates "more done = more green" without
                      // veering into amber/orange, which are palette-banned.
                      className="h-1.5 rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-[width] duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="w-14 text-right text-[11px] font-semibold tabular-nums text-slate-600">
                    {percent}%
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
          {pageList.map((p) => (
            <PageCard key={p.pageIndex} page={p} slotUrl={slots[p.pageIndex]?.previewUrl ?? null} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PageCard({
  page,
  slotUrl,
}: {
  page: PageRuntime;
  slotUrl: string | null;
}) {
  const style = STATUS_STYLE[page.status];
  const jobId = useExtractionStore((s) => s.jobId);

  const retry = async () => {
    if (!jobId) return;
    await fetch(
      `/api/extraction/jobs/${jobId}/pages/${page.pageIndex}/retry`,
      { method: "POST" },
    );
    // SSE will emit an update soon; no optimistic state here.
  };

  return (
    <div
      className={
        "group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 transition-all " +
        style.ring
      }
    >
      <div className={"relative aspect-[3/4] " + style.bg}>
        {slotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slotUrl}
            alt={`페이지 ${page.pageIndex + 1}`}
            className="h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
          <StatusIcon status={page.status} />
        </div>
        <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
          {page.pageIndex + 1}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className={"text-[11px] font-semibold " + style.text}>
          {STATUS_LABEL[page.status]}
          {page.attemptCount > 1 && page.status !== "SUCCESS" ? (
            <span className="ml-1 text-[10px] font-normal text-slate-400">
              · 시도 {page.attemptCount}
            </span>
          ) : null}
        </span>
        {page.latencyMs ? (
          <span className="text-[10px] tabular-nums text-slate-400">
            {(page.latencyMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>

      {page.errorCode && (page.status === "DEAD" || page.status === "FAILED") ? (
        <div className="border-t border-rose-100 bg-rose-50/60 px-3 py-2 text-[10px] leading-snug text-rose-700">
          {getErrorUserMessage(page.errorCode)}
          {page.status === "DEAD" ? (
            <button
              type="button"
              onClick={retry}
              aria-label={`페이지 ${page.pageIndex + 1} 다시 시도`}
              className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              <RefreshCw className="size-3" aria-hidden="true" />
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: ExtractionPageStatus }) {
  switch (status) {
    case "PENDING":
      return <Clock className="size-7 text-slate-400" strokeWidth={1.5} aria-hidden="true" />;
    case "PROCESSING":
      return <Loader2 className="size-7 animate-spin text-sky-500" strokeWidth={1.8} aria-hidden="true" />;
    case "SUCCESS":
      return <CheckCircle2 className="size-7 text-emerald-500" strokeWidth={1.8} aria-hidden="true" />;
    case "FAILED":
      // Retry in progress — use a sky-toned spinner to stay inside the
      // approved palette (no amber/orange) and communicate "still working".
      return <RefreshCw className="size-7 animate-spin text-sky-500" strokeWidth={1.8} aria-hidden="true" />;
    case "DEAD":
      return <XCircle className="size-7 text-rose-500" strokeWidth={1.8} aria-hidden="true" />;
    case "SKIPPED":
      return <Ban className="size-7 text-slate-400" strokeWidth={1.5} aria-hidden="true" />;
  }
}

function ModeBadge({
  icon,
  label,
  shortLabel,
}: {
  icon: ModeIcon;
  label: string;
  shortLabel: string;
}) {
  const Icon = MODE_ICON_MAP[icon];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1.5">
      <div className="flex size-7 items-center justify-center rounded-md bg-sky-500/10 text-sky-600">
        <Icon className="size-4" strokeWidth={1.8} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[12px] font-semibold text-slate-800">
          {label}
        </span>
        <span className="rounded-md border border-sky-200 bg-white px-1 py-0 text-[9px] font-bold tracking-wider text-sky-700">
          {shortLabel}
        </span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "rose" | "slate" | "sky";
}) {
  const toneStyle: Record<typeof tone, string> = {
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    slate: "text-slate-500",
    sky: "text-sky-600",
  };
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className={"text-[16px] font-bold tabular-nums " + toneStyle[tone]}>
        {value.toLocaleString("ko-KR")}
      </span>
    </div>
  );
}
