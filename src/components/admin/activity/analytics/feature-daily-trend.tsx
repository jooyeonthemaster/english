"use client";

// 세부 기능별 일별 추이 — 12개 기능 멀티라인. 범례 칩 클릭으로 표시/숨김 토글.
// 데이터 없는 기능은 자동 제외. "어떤 기능이 일별로 어떻게 쓰이는가".

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn, formatNumber } from "@/lib/utils";
import {
  FEATURE_COLORS,
  FEATURE_LABELS,
  FEATURE_ORDER,
  type ActivityFeature,
  type FeatureDailyPoint,
} from "@/lib/admin-analytics-types";

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function makeTooltip(features: ActivityFeature[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = payload[0]?.payload as Record<string, any> | undefined;
    if (!row) return null;
    const rows = features
      .map((f) => ({ f, v: Number(row[f] ?? 0) }))
      .filter((r) => r.v > 0)
      .sort((a, b) => b.v - a.v);
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg max-w-[220px]">
        <p className="text-[12px] font-semibold text-gray-700">
          {shortDate(label)}
        </p>
        {rows.length === 0 ? (
          <p className="mt-1 text-[12px] text-gray-400">활동 없음</p>
        ) : (
          <div className="mt-1 space-y-0.5">
            {rows.map((r) => (
              <div
                key={r.f}
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span className="inline-flex items-center gap-1.5 text-gray-500">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: FEATURE_COLORS[r.f] }}
                  />
                  {FEATURE_LABELS[r.f]}
                </span>
                <span className="font-semibold text-gray-700 tabular-nums">
                  {formatNumber(r.v)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
}

export function FeatureDailyTrend({
  data,
  height = 280,
}: {
  data: FeatureDailyPoint[];
  height?: number;
}) {
  const rows = useMemo(
    () => data.map((p) => ({ date: p.date, ...p.byFeature })),
    [data],
  );

  // 윈도우 내 합계>0 인 기능만 표시 대상.
  const present = useMemo(() => {
    const totals = new Map<ActivityFeature, number>();
    for (const p of data) {
      for (const f of FEATURE_ORDER) {
        totals.set(f, (totals.get(f) ?? 0) + (p.byFeature[f] ?? 0));
      }
    }
    return FEATURE_ORDER.filter((f) => (totals.get(f) ?? 0) > 0);
  }, [data]);

  const [hidden, setHidden] = useState<Set<ActivityFeature>>(new Set());
  const visible = useMemo(
    () => present.filter((f) => !hidden.has(f)),
    [present, hidden],
  );
  const interval = Math.max(0, Math.floor(rows.length / 10) - 1);
  const Tip = useMemo(() => makeTooltip(visible), [visible]);

  function toggle(f: ActivityFeature) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  return (
    <div className="w-full">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={Tip as any}
              cursor={{ stroke: "#E5E7EB", strokeWidth: 1 }}
            />
            {visible.map((f) => (
              <Line
                key={f}
                type="monotone"
                dataKey={f}
                name={FEATURE_LABELS[f]}
                stroke={FEATURE_COLORS[f]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 토글 가능한 범례 칩 */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        {present.map((f) => {
          const on = !hidden.has(f);
          return (
            <button
              key={f}
              type="button"
              onClick={() => toggle(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                on
                  ? "border-gray-200 text-gray-600"
                  : "border-gray-100 text-gray-300",
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: on ? FEATURE_COLORS[f] : "#E5E7EB",
                }}
              />
              {FEATURE_LABELS[f]}
            </button>
          );
        })}
      </div>
      {present.length === 0 && (
        <p className="mt-2 text-center text-[12px] text-gray-300">
          표시할 활동이 없습니다
        </p>
      )}
    </div>
  );
}
