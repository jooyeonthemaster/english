"use client";

// 카테고리 구성 추이 — 6개 활동 카테고리가 일별로 어떻게 쌓이는지(누적 영역).
// "생산 작업(추출·AI 생성)"을 아래에 깔아 구성 변화를 한눈에 본다.

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import type { DailyPoint, ActivityCategory } from "@/lib/admin-analytics-types";
import { CATEGORY_COLORS } from "@/lib/admin-analytics-types";
import { ACTIVITY_CATEGORY_LABELS } from "@/lib/admin-activity-types";

// 아래→위 스택 순서: 생산 작업을 바닥에 둔다.
const STACK_ORDER: ActivityCategory[] = [
  "EXTRACTION",
  "AI_GENERATION",
  "CONTENT",
  "EXPORT",
  "PAGE_VIEW",
  "AUTH",
];

interface CategoryRow {
  date: string;
  EXTRACTION: number;
  AI_GENERATION: number;
  CONTENT: number;
  EXPORT: number;
  PAGE_VIEW: number;
  AUTH: number;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function toRow(point: DailyPoint): CategoryRow {
  const c = point.byCategory;
  return {
    date: point.date,
    EXTRACTION: c.EXTRACTION ?? 0,
    AI_GENERATION: c.AI_GENERATION ?? 0,
    CONTENT: c.CONTENT ?? 0,
    EXPORT: c.EXPORT ?? 0,
    PAGE_VIEW: c.PAGE_VIEW ?? 0,
    AUTH: c.AUTH ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CategoryRow | undefined;
  if (!row) return null;

  const rows = STACK_ORDER.map((cat) => ({
    cat,
    value: row[cat],
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = STACK_ORDER.reduce((sum, cat) => sum + row[cat], 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">
        {shortDate(label)}
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 text-[12px] text-gray-400">활동 없음</p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {rows.map((r) => (
            <div
              key={r.cat}
              className="flex items-center justify-between gap-3 text-[12px]"
            >
              <span className="inline-flex items-center gap-1.5 text-gray-500">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[r.cat] }}
                  aria-hidden
                />
                {ACTIVITY_CATEGORY_LABELS[r.cat]}
              </span>
              <span className="font-semibold text-gray-700 tabular-nums">
                {formatNumber(r.value)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-gray-100 pt-1.5 text-[12px]">
        <span className="text-gray-400">합계</span>
        <span className="font-semibold text-gray-900 tabular-nums">
          {formatNumber(total)}
        </span>
      </div>
    </div>
  );
}

export function CategoryTrendChart({
  data,
  height = 260,
}: {
  data: DailyPoint[];
  height?: number;
}) {
  const rows = data.map(toRow);
  const interval = Math.max(0, Math.floor(data.length / 10) - 1);

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            width={44}
            allowDecimals={false}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content={CustomTooltip as any}
            cursor={{ stroke: "#E5E7EB", strokeWidth: 1 }}
          />
          {STACK_ORDER.map((cat) => (
            <Area
              key={cat}
              type="monotone"
              dataKey={cat}
              name={ACTIVITY_CATEGORY_LABELS[cat]}
              stackId="1"
              stroke={CATEGORY_COLORS[cat]}
              strokeWidth={1.5}
              fill={CATEGORY_COLORS[cat]}
              fillOpacity={0.7}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {STACK_ORDER.map((cat) => (
          <span
            key={cat}
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-400"
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: CATEGORY_COLORS[cat] }}
              aria-hidden
            />
            {ACTIVITY_CATEGORY_LABELS[cat]}
          </span>
        ))}
      </div>
    </div>
  );
}
