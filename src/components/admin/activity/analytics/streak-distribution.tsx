"use client";

// 연속 활동일 히스토그램 + 인게이지먼트 세그먼트 구성.
// 좌: 현재 연속 출석일 분포(막대, 3일+ 충성 사용자 강조).
// 우: 파워/꾸준/라이트/신규/휴면/가입만 100% 비율 막대 + 범례 리스트.

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatNumber } from "@/lib/utils";
import { SEGMENT_COLORS } from "@/lib/admin-analytics-types";
import type {
  SegmentCount,
  StreakBucket,
} from "@/lib/admin-analytics-types";

const LOYAL = "#4F46E5"; // indigo-600 — 연속 3일+ 충성 사용자
const CASUAL = "#CBD5E1"; // slate-300 — 그 외

/** 라벨 기준 3일+ 충성 버킷 여부. */
function isLoyalBucket(b: StreakBucket): boolean {
  return b.min >= 3 || b.label === "3일" || b.label === "4~6일" || b.label === "7일+";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StreakTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as StreakBucket | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-gray-700">{point.label}</p>
      <p className="mt-0.5 text-[12px] text-gray-500">
        <span
          className="font-semibold"
          style={{ color: isLoyalBucket(point) ? LOYAL : "#64748B" }}
        >
          {formatNumber(point.count)}
        </span>
        곳
      </p>
    </div>
  );
}

export function StreakDistribution({
  streakBuckets,
  segments,
}: {
  streakBuckets: StreakBucket[];
  segments: SegmentCount[];
}) {
  const segTotal = segments.reduce((sum, s) => sum + s.count, 0);
  const nonZeroSegments = segments.filter((s) => s.count > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* (A) 연속 출석일 분포 — 히스토그램 */}
      <div>
        <p className="mb-2 text-[12px] font-medium text-gray-400">
          연속 출석일 분포
        </p>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={streakBuckets}
              margin={{ top: 18, right: 8, left: -16, bottom: 0 }}
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
                dy={6}
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
                content={StreakTooltip as any}
                cursor={{ fill: "rgba(79,70,229,0.06)" }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {streakBuckets.map((b) => (
                  <Cell
                    key={b.label}
                    fill={isLoyalBucket(b) ? LOYAL : CASUAL}
                  />
                ))}
                <LabelList
                  dataKey="count"
                  position="top"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: number) => formatNumber(v)) as any}
                  style={{ fontSize: 11, fill: "#6B7280", fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center justify-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: LOYAL }}
            />
            연속 3일+ (충성)
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: CASUAL }}
            />
            2일 이하
          </span>
        </div>
      </div>

      {/* (B) 인게이지먼트 세그먼트 — 100% 비율 막대 + 범례 */}
      <div className="flex flex-col">
        <p className="mb-2 text-[12px] font-medium text-gray-400">
          인게이지먼트 세그먼트
        </p>
        {/* 100% 누적 비율 막대 */}
        <div
          role="img"
          aria-label={`인게이지먼트 세그먼트 구성: ${nonZeroSegments
            .map((s) => `${s.label} ${s.count}곳`)
            .join(", ")}`}
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-gray-100"
        >
          {segTotal > 0 &&
            nonZeroSegments.map((s) => (
              <div
                key={s.segment}
                className="h-full"
                style={{
                  width: `${(s.count / segTotal) * 100}%`,
                  backgroundColor: SEGMENT_COLORS[s.segment],
                }}
                title={`${s.label} ${formatNumber(s.count)}곳`}
                aria-hidden
              />
            ))}
        </div>

        {/* 범례/리스트 */}
        <ul className="mt-3 space-y-1.5">
          {segments.map((s) => {
            const ratio = segTotal > 0 ? (s.count / segTotal) * 100 : 0;
            return (
              <li
                key={s.segment}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEGMENT_COLORS[s.segment] }}
                    aria-hidden
                  />
                  <span className="truncate text-[12px] text-gray-600">
                    {s.label}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  <span className="text-[13px] font-semibold text-gray-800">
                    {formatNumber(s.count)}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {Math.round(ratio)}%
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
