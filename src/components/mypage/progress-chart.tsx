"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ProgressChartProps {
  data: Array<{ date: string; score: number }>;
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-[#E5E8EB] bg-white px-3 py-2 shadow-sm">
      <p className="text-[11px] text-[#8B95A1]">{label}</p>
      <p className="text-[13px] font-semibold text-[#191F28]">
        {payload[0].value}점
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date formatter: "YYYY-MM-DD" -> "MM/dd"
// ---------------------------------------------------------------------------
function formatDateShort(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const month = parts[1].replace(/^0/, "");
  const day = parts[2].replace(/^0/, "");
  return `${month}/${day}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ProgressChart({ data }: ProgressChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatDateShort(d.date),
  }));

  return (
    <div className="rounded-2xl border border-[#E5E8EB] p-4">
      {/* Title */}
      <p className="mb-3 text-[15px] font-semibold text-[#191F28]">
        최근 테스트 점수
      </p>

      {data.length === 0 ? (
        <div className="flex h-[200px] items-center justify-center">
          <p className="text-[13px] text-[#8B95A1]">
            아직 테스트 기록이 없습니다
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#F2F3F6"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#8B95A1" }}
              tickLine={false}
              axisLine={{ stroke: "#E5E8EB" }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#8B95A1" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "#F7F8FA" }}
            />
            <Bar
              dataKey="score"
              fill="#7CB342"
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
