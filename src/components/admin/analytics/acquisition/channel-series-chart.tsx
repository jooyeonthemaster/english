"use client";

// 채널별 방문(세션) 추이 — 누적 영역. 방문이 많은 채널을 바닥에 깐다.
// ResponsiveContainer 대신 차트 자체 responsive 를 쓴다: 전역 모바일 CSS(globals.css `.recharts-wrapper{max-width:100%}`)가
// ResponsiveContainer 의 0px 내부 div 기준으로 차트를 0 폭으로 접어 767px 이하에서 빈 칸이 되기 때문.

import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { ChannelSeriesPoint } from "@/lib/analytics/reports/acquisition";
import { channelLabel } from "@/lib/analytics/channels";
import { fmtBucket, fmtInt } from "@/lib/analytics/format";
import { ReportEmpty } from "../shared/report-states";
import { channelColor } from "./acquisition-bits";

interface TooltipEntry {
  dataKey?: unknown;
  value?: unknown;
}

function SeriesTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .map((p) => ({ channel: String(p.dataKey), value: Number(p.value) || 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">{label}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px] text-gray-400">방문 없음</p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {rows.map((r) => (
            <div key={r.channel} className="flex items-center justify-between gap-4 text-[12px]">
              <span className="inline-flex items-center gap-1.5 text-gray-500">
                <span className="size-2.5 rounded-sm" style={{ background: channelColor(r.channel) }} aria-hidden />
                {channelLabel(r.channel)}
              </span>
              <span className="font-semibold tabular-nums text-gray-700">{fmtInt(r.value)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-gray-100 pt-1.5 text-[12px]">
        <span className="text-gray-400">합계</span>
        <span className="font-semibold tabular-nums text-gray-900">{fmtInt(total)}</span>
      </div>
    </div>
  );
}

export function ChannelSeriesChart({
  data,
  channels,
  height = 260,
}: {
  data: ChannelSeriesPoint[];
  /** 스택 순서(첫 항목이 바닥) */
  channels: string[];
  height?: number;
}) {
  if (channels.length === 0 || data.length === 0) return <ReportEmpty message="이 기간에 방문이 없습니다" />;
  const interval = Math.max(0, Math.ceil(data.length / 12) - 1);
  const chartData = data.map((d) => ({ ...d, label: fmtBucket(d.key) }));
  return (
    <div className="w-full">
      <AreaChart responsive style={{ width: "100%", height }} data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval={interval} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} width={48} />
        <Tooltip content={<SeriesTooltip />} cursor={{ stroke: "#E5E7EB" }} />
        {channels.map((ch) => (
          <Area
            key={ch}
            type="monotone"
            dataKey={ch}
            stackId="channels"
            stroke="#ffffff"
            strokeWidth={1.5}
            fill={channelColor(ch)}
            fillOpacity={0.85}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </div>
  );
}
