"use client";

// 일별 회원가입 추이 — 신규 가입(막대, 좌축) + 누적 가입(선, 우축) 콤보.
// "일별 회원가입 추이"의 거시 추세.

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
import type { SignupPoint } from "@/lib/admin-analytics-types";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as SignupPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">
        {shortDate(label)}
      </p>
      <div className="mt-1 space-y-0.5">
        <p className="text-[12px] text-gray-500">
          신규{" "}
          <span className="font-semibold text-blue-600">
            {formatNumber(point.signups)}
          </span>
          곳
        </p>
        <p className="text-[12px] text-gray-500">
          누적{" "}
          <span className="font-semibold text-emerald-600">
            {formatNumber(point.cumulative)}
          </span>
          곳
        </p>
      </div>
    </div>
  );
}

export function SignupsTrend({
  data,
  height = 260,
}: {
  data: SignupPoint[];
  height?: number;
}) {
  const interval = Math.max(0, Math.floor(data.length / 10) - 1);

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex w-full items-center justify-center text-[12px] text-gray-300"
      >
        표시할 가입 데이터가 없습니다
      </div>
    );
  }

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#F3F4F6"
            />
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
              yAxisId="signups"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#3B82F6" }}
              width={40}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="cumulative"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#10B981" }}
              width={44}
              allowDecimals={false}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={CustomTooltip as any}
              cursor={{ fill: "rgba(59,130,246,0.06)" }}
            />
            <Bar
              yAxisId="signups"
              dataKey="signups"
              name="신규 가입"
              fill="#3B82F6"
              radius={[3, 3, 0, 0]}
              maxBarSize={22}
            />
            <Line
              yAxisId="cumulative"
              type="monotone"
              dataKey="cumulative"
              name="누적"
              stroke="#10B981"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ fill: "#10B981", stroke: "#fff", strokeWidth: 2, r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#3B82F6]" /> 신규 가입
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-0.5 w-3 rounded-full bg-[#10B981]" /> 누적
        </span>
      </div>
    </div>
  );
}
