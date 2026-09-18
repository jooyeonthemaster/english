"use client";

// 채널 구성 가로 스택 바 + 범례. 지표 토글(방문·가입·매출). 조각/범례 클릭 = 채널 필터.

import { useState } from "react";
import type { AcquisitionChannelRow } from "@/lib/analytics/reports/acquisition";
import { channelLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtKrw, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { ReportEmpty } from "../shared/report-states";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { channelColor, ratio } from "./acquisition-bits";

type ShareMetric = "sessions" | "signups" | "revenue";

const METRIC_LABELS: Record<ShareMetric, string> = { sessions: "방문", signups: "가입", revenue: "매출" };
const EMPTY_MESSAGES: Record<ShareMetric, string> = {
  sessions: "이 기간에 방문이 없습니다",
  signups: "유입이 추적된 가입이 없습니다",
  revenue: "유입이 추적된 가입 학원의 매출이 없습니다",
};

export function ChannelShare({ channels }: { channels: AcquisitionChannelRow[] }) {
  const { setFilter } = useAnalyticsParams();
  const [metric, setMetric] = useState<ShareMetric>("sessions");
  const [hovered, setHovered] = useState<string | null>(null);

  const rows = channels
    .map((c) => ({ channel: c.channel, value: c[metric] }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const fmtValue = (v: number) => (metric === "revenue" ? fmtKrw(v) : fmtInt(v));
  const active = rows.find((r) => r.channel === hovered) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-h-[18px] text-[12px] tabular-nums text-gray-500">
          {active ? (
            <>
              <span className="font-semibold text-gray-800">{channelLabel(active.channel)}</span> · {fmtValue(active.value)} (
              {fmtPct(ratio(active.value, total))})
            </>
          ) : (
            <>
              {METRIC_LABELS[metric]} 합계 <span className="font-semibold text-gray-800">{fmtValue(total)}</span>
            </>
          )}
        </p>
        <div className="inline-flex rounded-lg border border-gray-100 p-0.5" role="group" aria-label="비중 기준">
          {(Object.keys(METRIC_LABELS) as ShareMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              aria-pressed={metric === m}
              className={cn(
                "h-7 rounded-md px-2.5 text-[12px] font-semibold",
                metric === m ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900",
              )}
            >
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <ReportEmpty message={EMPTY_MESSAGES[metric]} className="py-6" />
      ) : (
        <>
          <div className="flex h-7 w-full gap-[2px]" onMouseLeave={() => setHovered(null)}>
            {rows.map((r) => (
              <button
                key={r.channel}
                type="button"
                onMouseEnter={() => setHovered(r.channel)}
                onFocus={() => setHovered(r.channel)}
                onBlur={() => setHovered(null)}
                onClick={() => setFilter("channel", r.channel)}
                className={cn(
                  "h-full min-w-[4px] transition-opacity first:rounded-l-md last:rounded-r-md",
                  hovered && hovered !== r.channel && "opacity-40",
                )}
                style={{ flexGrow: r.value, flexBasis: 0, background: channelColor(r.channel) }}
                aria-label={`${channelLabel(r.channel)} ${fmtValue(r.value)}, 클릭하면 이 채널로 필터`}
              />
            ))}
          </div>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <li key={r.channel}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(r.channel)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setFilter("channel", r.channel)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] hover:bg-gray-50",
                    hovered === r.channel && "bg-gray-50",
                  )}
                  title="클릭하면 이 채널로 필터"
                >
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: channelColor(r.channel) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-700">{channelLabel(r.channel)}</span>
                  <span className="tabular-nums text-gray-500">{fmtValue(r.value)}</span>
                  <span className="w-12 text-right tabular-nums text-gray-400">{fmtPct(ratio(r.value, total))}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
