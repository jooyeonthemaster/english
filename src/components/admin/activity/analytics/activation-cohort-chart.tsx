"use client";

// 가입 코호트 활성화 전환 — 주별 가입(막대) vs 활성화(막대) + 활성화율(선, 우축).
// "어느 시점 이후부터 가입만 하고 활동 안 하는 사람이 줄었다"를 본다.
// 최근 주로 갈수록 활성화율 선이 위로 오르면 = 가입만 하는 학원이 줄어든 것.

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
import type { CohortPoint } from "@/lib/admin-analytics-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as CohortPoint | undefined;
  if (!point) return null;
  const ratePct = Math.round(point.activationRate * 100);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">{point.label}</p>
      <div className="mt-1 space-y-0.5">
        <p className="text-[12px] text-gray-500">
          가입{" "}
          <span className="font-semibold text-slate-600">
            {formatNumber(point.signups)}
          </span>
          곳
        </p>
        <p className="text-[12px] text-gray-500">
          활성화{" "}
          <span className="font-semibold text-blue-600">
            {formatNumber(point.activated)}
          </span>
          곳{" "}
          <span className="font-semibold text-emerald-600">({ratePct}%)</span>
        </p>
        <p className="text-[12px] text-gray-500">
          7일내 활성화{" "}
          <span className="font-semibold text-gray-700">
            {formatNumber(point.activatedWithin7d)}
          </span>
          곳
        </p>
      </div>
    </div>
  );
}

export function ActivationCohortChart({
  cohorts,
  height = 260,
}: {
  cohorts: CohortPoint[];
  height?: number;
}) {
  if (cohorts.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex items-center justify-center text-[12px] text-gray-300"
      >
        데이터 없음
      </div>
    );
  }

  const data = cohorts.map((c) => ({
    ...c,
    ratePct: c.activationRate * 100,
  }));
  const interval = Math.max(0, Math.floor(data.length / 10) - 1);

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
          barGap={2}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#F3F4F6"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            interval={interval}
            dy={8}
          />
          <YAxis
            yAxisId="count"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            width={44}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#10B981" }}
            width={40}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={CustomTooltip as any}
            cursor={{ fill: "rgba(59,130,246,0.06)" }}
          />
          <Bar
            yAxisId="count"
            dataKey="signups"
            name="가입"
            fill="#E2E8F0"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            yAxisId="count"
            dataKey="activated"
            name="활성화"
            fill="#3B82F6"
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="ratePct"
            name="활성화율"
            stroke="#10B981"
            strokeWidth={2.5}
            dot={{ fill: "#10B981", stroke: "#fff", strokeWidth: 1.5, r: 3 }}
            activeDot={{ fill: "#10B981", stroke: "#fff", strokeWidth: 2, r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#E2E8F0]" /> 가입
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#3B82F6]" /> 활성화
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
          <span className="h-0.5 w-3 rounded-full bg-[#10B981]" /> 활성화율
        </span>
      </div>
    </div>
  );
}
