"use client";

// 점수율 추이 라인차트 (유닛 V5) — x=회차(시험명 툴팁), y=scorePct 0~100.
// Toss 블루(#3182F6) 단일 라인. 점수율 미확정(null) 회차는 점을 찍지 않고
// connectNulls 로 라인만 잇는다(0점 왜곡 금지).

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendSitting } from "@/lib/exam-scoring/trend";

interface ChartPoint {
  label: string;
  scorePct: number | null;
  title: string;
  date: string;
  sourceLabel: string;
}

function toPoints(sittings: TrendSitting[]): ChartPoint[] {
  return sittings.map((sitting, i) => ({
    label: `${i + 1}회`,
    scorePct: sitting.scorePct,
    title: sitting.title,
    date: sitting.date.slice(0, 10),
    sourceLabel:
      sitting.source === "INTERNAL"
        ? "자체 시험지"
        : `외부 시험${sitting.examTypeLabel ? ` · ${sitting.examTypeLabel}` : ""}`,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScoreTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-[#191F28]">
        {label} · {point.title}
      </p>
      <p className="mt-0.5 text-[11px] text-[#8B95A1]">
        {point.date} · {point.sourceLabel}
      </p>
      <p className="mt-1 text-[12px] text-[#4E5968]">
        점수율{" "}
        <span className="font-semibold text-[#3182F6]">
          {point.scorePct == null ? "미확정" : `${point.scorePct}%`}
        </span>
      </p>
    </div>
  );
}

export function ScoreTrendChart({
  sittings,
  height = 240,
}: {
  sittings: TrendSitting[];
  height?: number;
}) {
  const points = toPoints(sittings);
  const hasScore = points.some((p) => p.scorePct != null);

  if (!hasScore) {
    return (
      <div
        style={{ height }}
        className="flex w-full items-center justify-center text-[12px] text-[#8B95A1]"
      >
        점수율이 확정된 응시가 아직 없습니다.
      </div>
    );
  }

  const interval = Math.max(0, Math.floor(points.length / 12) - 1);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F2F4F6" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#8B95A1" }}
            interval={interval}
            dy={8}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#8B95A1" }}
            width={40}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={ScoreTooltip as any}
            cursor={{ stroke: "#3182F6", strokeOpacity: 0.2 }}
          />
          <Line
            type="monotone"
            dataKey="scorePct"
            name="점수율"
            stroke="#3182F6"
            strokeWidth={2.5}
            connectNulls
            dot={{ fill: "#3182F6", stroke: "#fff", strokeWidth: 1.5, r: 3.5 }}
            activeDot={{ fill: "#3182F6", stroke: "#fff", strokeWidth: 2, r: 5.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
