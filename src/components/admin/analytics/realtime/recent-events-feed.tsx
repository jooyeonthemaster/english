"use client";

// 실시간 — 최근 30분 이벤트 피드(페이지뷰·커스텀 이벤트, 최대 40, 최신순).

import type { RealtimeReport } from "@/lib/analytics/reports/realtime";
import { CHANNEL_COLORS, channelLabel, deviceLabel, isChannel, sourceLabel } from "@/lib/analytics/channels";
import { fmtAgo, fmtTime } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty } from "../shared/report-states";

type RecentEvent = RealtimeReport["recentEvents"][number];

/** 자동·전환 이벤트 표시명(스펙 §3.1·§6.3). 그 외 이름은 원문. */
const EVENT_LABELS: Record<string, string> = {
  cta_click: "CTA 클릭",
  outbound: "외부 링크 클릭",
  download: "파일 다운로드",
  signup_complete: "가입 완료",
  purchase_complete: "결제 완료",
};

function eventLabel(ev: RecentEvent): string {
  if (ev.type === "pageview") return "페이지뷰";
  if (!ev.name) return "이벤트";
  return EVENT_LABELS[ev.name] ?? ev.name;
}

/**
 * 이벤트 행에는 국가가 없다(리포트 계약: recentEvents 에 country 없음).
 * 국가를 모르면 시·도 코드를 한국 시·도명으로 읽어선 안 된다 — JP-27(오사카)·JP-11 등이 KR 코드와 충돌해
 * 「대구」·「서울」로 둔갑한다(같은 화면의 활성 세션 표는 JP-27 이라 서로 모순됐다).
 * 그래서 코드 원문만 보여준다.
 */
function eventRegion(region: string | null): string | null {
  return region || null;
}

export function RecentEventsFeed({ events, nowMs }: { events: RecentEvent[]; nowMs: number }) {
  if (events.length === 0) return <ReportEmpty message="최근 30분 동안 수집된 이벤트가 없습니다" />;

  return (
    <ol className="max-h-[560px] divide-y divide-gray-50 overflow-y-auto overscroll-contain pr-1">
      {events.map((ev) => {
        const isPv = ev.type === "pageview";
        const isConversion = ev.name === "signup_complete" || ev.name === "purchase_complete";
        const meta = [sourceLabel(ev.source), deviceLabel(ev.deviceType)].filter(Boolean).join(" · ");
        const region = eventRegion(ev.region);
        return (
          <li key={ev.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-[62px] shrink-0 pt-0.5 text-right tabular-nums">
              <div className="text-[12px] font-medium text-gray-700">{fmtTime(ev.createdAt)}</div>
              <div className="text-[10.5px] text-gray-400">{fmtAgo(ev.createdAt, nowMs)}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold",
                    isConversion
                      ? "bg-emerald-50 text-emerald-700"
                      : isPv
                        ? "bg-blue-50 text-blue-700"
                        : "bg-amber-50 text-amber-700",
                  )}
                >
                  {eventLabel(ev)}
                </span>
                <span className="min-w-0 truncate font-mono text-[12px] text-gray-800" title={ev.path}>
                  {ev.path}
                </span>
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-gray-400">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ background: isChannel(ev.channel) ? CHANNEL_COLORS[ev.channel] : "#94a3b8" }}
                  aria-hidden
                />
                <span className="shrink-0">{channelLabel(ev.channel)}</span>
                {meta && <span className="truncate">· {meta}</span>}
                {region && (
                  <span className="shrink-0" title="국가 정보가 없어 지역 코드만 표시합니다 — 국가는 활성 세션 표에서 확인하세요">
                    · 지역코드 {region}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
