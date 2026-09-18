"use client";

// 시계열 차트 — 현재 기간(실선 면적) + 직전 동일 기간(점선). recharts.
// ResponsiveContainer 금지: ≤767px 전역 CSS(globals.css `.recharts-wrapper{max-width:100%}`)가
// ResponsiveContainer 의 0px 내부 div 기준으로 계산돼 차트가 폭 0 으로 접힌다 → 차트 자체 responsive 사용.

import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBucket, fmtInt } from "@/lib/analytics/format";

export interface SeriesPoint {
  key: string;
  current: number;
  previous?: number;
}

function SeriesTooltip({
  active,
  payload,
  label,
  metricLabel,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: SeriesPoint }>;
  label?: string | number;
  metricLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">{label}</p>
      <p className="mt-1 text-[12px] text-gray-500">
        {metricLabel} <span className="font-semibold text-blue-600">{fmtInt(p.current)}</span>
      </p>
      {p.previous !== undefined && (
        <p className="text-[12px] text-gray-400">
          이전 기간 <span className="font-semibold text-gray-600">{fmtInt(p.previous)}</span>
        </p>
      )}
    </div>
  );
}

export function TimeseriesChart({
  data,
  metricLabel,
  height = 260,
  showPrevious = true,
  color = "#2563eb",
}: {
  data: SeriesPoint[];
  metricLabel: string;
  height?: number;
  showPrevious?: boolean;
  color?: string;
}) {
  const interval = Math.max(0, Math.ceil(data.length / 12) - 1);
  const chartData = data.map((d) => ({ ...d, label: fmtBucket(d.key) }));
  return (
    <div className="w-full">
      <ComposedChart
        responsive
        style={{ width: "100%", height }}
        data={chartData}
        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
      >
        <defs>
          <linearGradient id="an-series-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} interval={interval} dy={8} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} width={48} />
        <Tooltip
          content={(props) => (
            <SeriesTooltip
              active={props.active}
              payload={props.payload as ReadonlyArray<{ payload?: SeriesPoint }> | undefined}
              label={props.label as string | number | undefined}
              metricLabel={metricLabel}
            />
          )}
          cursor={{ stroke: "#E5E7EB" }}
        />
        <Area type="monotone" dataKey="current" stroke={color} strokeWidth={2} fill="url(#an-series-fill)" isAnimationActive={false} />
        {showPrevious && (
          <Line type="monotone" dataKey="previous" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </div>
  );
}
