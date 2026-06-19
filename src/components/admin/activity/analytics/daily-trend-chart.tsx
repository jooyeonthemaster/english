"use client";

// 일별 활동 추이 — 활동 건수(막대, 좌축) + 활동 학원 수(선, 우축) 콤보.
// "일별로 각 학원이 얼마나 쓰는가"의 거시 추세.

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import type { DailyPoint } from "@/lib/admin-analytics-types";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as DailyPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">
        {shortDate(label)}
      </p>
      <div className="mt-1 space-y-0.5">
        <p className="text-[12px] text-gray-500">
          활동 학원{" "}
          <span className="font-semibold text-blue-600">
            {formatNumber(point.activeAcademies)}
          </span>
          곳
        </p>
        <p className="text-[12px] text-gray-500">
          활동 건수{" "}
          <span className="font-semibold text-gray-700">
            {formatNumber(point.events)}
          </span>
          건
        </p>
      </div>
    </div>
  );
}

export function DailyTrendChart({
  data,
  height = 260,
}: {
  data: DailyPoint[];
  height?: number;
}) {
  const interval = Math.max(0, Math.floor(data.length / 10) - 1);
  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            tickFormatter={shortDate}
            interval={interval}
            dy={8}
          />
          <YAxis
            yAxisId="events"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            width={44}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="academies"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#3B82F6" }}
            width={32}
            allowDecimals={false}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={CustomTooltip as any}
            cursor={{ fill: "rgba(59,130,246,0.06)" }}
          />
          <Bar
            yAxisId="events"
            dataKey="events"
            name="활동 건수"
            fill="#BFDBFE"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            yAxisId="academies"
            type="monotone"
            dataKey="activeAcademies"
            name="활동 학원"
            stroke="#3B82F6"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ fill: "#3B82F6", stroke: "#fff", strokeWidth: 2, r: 5 }}
          />
        </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#BFDBFE]" /> 활동 건수
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-0.5 w-3 rounded-full bg-[#3B82F6]" /> 활동 학원 수
        </span>
      </div>
    </div>
  );
}
