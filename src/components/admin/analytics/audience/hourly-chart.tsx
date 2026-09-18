"use client";

// 시간대별 방문 분포 (KST, 기간 합산) — 24개 막대, 가장 붐비는 시간은 진하게.
// ResponsiveContainer 대신 차트 자체 responsive: 모바일(≤767px) 전역 CSS
// `body.smoat-large-ui .recharts-wrapper{max-width:100%}` 가 ResponsiveContainer 의 폭 0 내부 래퍼에 걸려 차트가 0 폭이 된다.

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { fmtInt } from "@/lib/analytics/format";
import { ReportEmpty } from "../shared/report-states";

type Row = AudienceReport["hourly"][number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HourTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Row | undefined;
  if (!row) return null;
  const share = total > 0 ? Math.round((row.sessions / total) * 1000) / 10 : 0;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">
        {row.hour}시 · {fmtInt(row.sessions)}방문
      </p>
      <p className="mt-0.5 text-[12px] text-gray-400">기간 전체의 {share}%</p>
    </div>
  );
}

export function HourlyChart({ hourly, height = 220 }: { hourly: AudienceReport["hourly"]; height?: number }) {
  const total = hourly.reduce((s, r) => s + r.sessions, 0);
  if (total === 0) return <ReportEmpty message="이 기간에 방문이 없습니다" />;
  const max = Math.max(...hourly.map((r) => r.sessions));

  return (
    <div className="w-full">
      <BarChart responsive data={hourly} style={{ width: "100%", height }} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
        <XAxis
          dataKey="hour"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickFormatter={(h: number) => `${h}시`}
          interval={2}
          dy={6}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} allowDecimals={false} width={44} />
        <Tooltip content={<HourTooltip total={total} />} cursor={{ fill: "#EFF6FF" }} />
        <Bar dataKey="sessions" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {hourly.map((r) => (
            <Cell key={r.hour} fill={r.sessions === max ? "#1D4ED8" : "#93C5FD"} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
}
