"use client";

// 세션 이벤트 타임라인(세로) — 페이지뷰: 경로·제목·체류·스크롤 / 커스텀 이벤트: 이름·props.

import { FileText, MousePointerClick } from "lucide-react";
import type { SessionEventRow } from "@/lib/analytics/reports/sessions";
import { fmtDuration, fmtInt, fmtTime } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty } from "../shared/report-states";

/** 수집기가 자동/서버 판정으로 남기는 이벤트 이름(§3.1, §6.3) */
const EVENT_LABELS: Record<string, string> = {
  outbound: "외부 링크 클릭",
  download: "파일 다운로드",
  cta_click: "버튼 클릭",
  signup_complete: "가입 완료",
  purchase_complete: "결제 완료",
};

const CONVERSION_EVENTS = new Set(["signup_complete", "purchase_complete"]);

function propEntries(props: unknown): Array<[string, string]> {
  if (props === null || props === undefined) return [];
  if (typeof props !== "object" || Array.isArray(props)) return [["값", JSON.stringify(props)]];
  return Object.entries(props as Record<string, unknown>).map(([k, v]) => [
    k,
    typeof v === "string" ? v : v === null || v === undefined ? "-" : JSON.stringify(v),
  ]);
}

export function SessionTimeline({
  events,
  startedAt,
  truncatedAt,
}: {
  events: SessionEventRow[];
  startedAt: string;
  /** 이 개수에 도달하면 잘렸다고 안내 */
  truncatedAt: number;
}) {
  if (events.length === 0) return <ReportEmpty message="기록된 이벤트가 없습니다" />;
  const start = new Date(startedAt).getTime();

  return (
    <div>
      <ol className="relative">
        {events.map((ev, i) => {
          const isPv = ev.type === "pageview";
          const isConversion = !isPv && !!ev.name && CONVERSION_EVENTS.has(ev.name);
          const offset = new Date(ev.createdAt).getTime() - start;
          const last = i === events.length - 1;
          const props = isPv ? [] : propEntries(ev.props);
          return (
            <li key={ev.id} className="relative flex gap-3 pb-3 last:pb-0">
              {!last && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-gray-100" aria-hidden />}
              <span
                className={cn(
                  "relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                  isPv
                    ? "border-blue-100 bg-blue-50 text-blue-600"
                    : isConversion
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                      : "border-amber-100 bg-amber-50 text-amber-600",
                )}
                aria-hidden
              >
                {isPv ? <FileText className="size-3" /> : <MousePointerClick className="size-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-gray-400">
                  <span>{fmtTime(ev.createdAt)}</span>
                  {offset > 0 && <span>+{fmtDuration(offset)}</span>}
                  {isPv ? <span>페이지뷰</span> : <span className={cn("font-semibold", isConversion ? "text-emerald-600" : "text-amber-600")}>이벤트</span>}
                </div>

                {isPv ? (
                  <>
                    <div className="mt-0.5 font-mono text-[12.5px] font-semibold break-all text-gray-900">{ev.path}</div>
                    {ev.title && <div className="mt-0.5 text-[12px] break-words text-gray-500">{ev.title}</div>}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] tabular-nums text-gray-500">
                      <span>체류 {ev.engagedMs === null ? "-" : fmtDuration(ev.engagedMs)}</span>
                      <span>스크롤 {ev.scrollPct === null ? "-" : `${fmtInt(ev.scrollPct)}%`}</span>
                      {ev.prevPath && (
                        <span className="min-w-0 break-all">
                          이전 <span className="font-mono">{ev.prevPath}</span>
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-0.5 text-[12.5px] font-semibold text-gray-900">
                      {ev.name ? (EVENT_LABELS[ev.name] ?? ev.name) : "(이름 없음)"}
                      {ev.name && EVENT_LABELS[ev.name] && <span className="ml-1.5 font-mono text-[11px] font-normal text-gray-400">{ev.name}</span>}
                    </div>
                    <div className="mt-0.5 font-mono text-[11.5px] break-all text-gray-500">{ev.path}</div>
                    {props.length > 0 && (
                      <dl className="mt-1 space-y-0.5 rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11.5px]">
                        {props.map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="shrink-0 font-mono text-gray-400">{k}</dt>
                            <dd className="min-w-0 flex-1 break-all text-gray-700">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {events.length >= truncatedAt && (
        <p className="mt-3 text-[11.5px] text-amber-600">이벤트가 많아 처음 {fmtInt(truncatedAt)}개만 표시합니다</p>
      )}
    </div>
  );
}
