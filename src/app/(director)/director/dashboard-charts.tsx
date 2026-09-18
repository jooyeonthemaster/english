"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StudentTrendPoint, PaymentSummaryItem } from "@/actions/dashboard";

// ============================================================================
// Student Trend Line Chart
// ============================================================================

export function StudentTrendChart({ data }: { data: StudentTrendPoint[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#F3F4F6"
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#9CA3AF" }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#9CA3AF" }}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.07)",
              fontSize: "13px",
              padding: "8px 12px",
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: number) => `${formatNumber(value)}명`) as any}
            labelStyle={{ color: "#6B7280", fontWeight: 500 }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#3B82F6"
            strokeWidth={2.5}
            dot={{
              fill: "#3B82F6",
              stroke: "#fff",
              strokeWidth: 2,
              r: 4,
            }}
            activeDot={{
              fill: "#3B82F6",
              stroke: "#fff",
              strokeWidth: 2,
              r: 6,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================================
// Payment Donut Chart
// ============================================================================

export function PaymentDonutChart({
  data,
  total,
}: {
  data: PaymentSummaryItem[];
  total: number;
}) {
  // Filter out zero-amount items for cleaner chart
  const chartData = data.filter((d) => d.amount > 0);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-[180px] w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData.length > 0 ? chartData : [{ amount: 1, color: "#E5E7EB" }]}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              dataKey="amount"
              paddingAngle={2}
              strokeWidth={0}
            >
              {(chartData.length > 0 ? chartData : [{ color: "#E5E7EB" }]).map(
                (entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                )
              )}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.07)",
                fontSize: "13px",
                padding: "8px 12px",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: number) => formatCurrency(value)) as any}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium text-gray-400">총 청구</span>
          <span className="text-sm font-bold text-gray-900">
            {formatCurrency(total)}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4">
        {data.map((item) => (
          <div key={item.status} className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <div className="text-xs">
              <span className="font-medium text-gray-700">{item.label}</span>
              <span className="ml-1 text-gray-400">
                {formatCurrency(item.amount)} ({item.count}건)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
