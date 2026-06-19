"use client";

// 플랜 분포 · 학원 상태 분포 — 도넛 2개 나란히.
// 각 도넛: recharts PieChart(도넛형) + 중앙 총합 오버레이 + 아래 콤팩트 범례 리스트.
// 차트는 고정 높이 박스 안의 ResponsiveContainer 100%, 범례는 그 박스 바깥(아래 형제)로
// 빼서 잘리지 않게 한다. 빈 배열은 "데이터 없음"으로 가드.

import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatNumber } from "@/lib/utils";
import type { DistributionItem } from "@/lib/admin-analytics-types";

const DONUT_BOX = 160; // 중앙 오버레이를 얹는 relative 박스 한 변(px)

function makeTooltip(total: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function DonutTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload as DistributionItem | undefined;
    if (!item) return null;
    const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </p>
        <p className="mt-0.5 text-[12px] text-gray-500 tabular-nums">
          <span className="font-semibold text-gray-700">
            {formatNumber(item.count)}
          </span>
          곳 · {pct}%
        </p>
      </div>
    );
  };
}

function Donut({
  title,
  items,
}: {
  title: string;
  items: DistributionItem[];
}) {
  // count>0 인 항목만 도넛 슬라이스로 (0짜리 조각/스트로크 방지).
  const slices = useMemo(() => items.filter((i) => i.count > 0), [items]);
  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.count, 0),
    [items],
  );
  const Tip = useMemo(() => makeTooltip(total), [total]);
  const hasData = slices.length > 0 && total > 0;

  return (
    <div className="flex flex-col">
      <p className="mb-2 text-[12px] font-medium text-gray-400">{title}</p>

      {/* 도넛 + 중앙 오버레이 (고정 높이 박스) */}
      <div className="flex items-center justify-center">
        <div
          className="relative"
          style={{ width: DONUT_BOX, height: DONUT_BOX }}
        >
          {hasData ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {slices.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    content={Tip as any}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* 중앙 합계 오버레이 */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-bold leading-none text-gray-800 tabular-nums">
                  {formatNumber(total)}
                </span>
                <span className="mt-1 text-[11px] text-gray-400">학원</span>
              </div>
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-gray-200 text-[12px] text-gray-300">
              데이터 없음
            </div>
          )}
        </div>
      </div>

      {/* 범례 리스트 — 고정 높이 박스 바깥 (잘리지 않게) */}
      <ul className="mt-3 space-y-1.5">
        {items.map((i) => {
          const ratio = total > 0 ? (i.count / total) * 100 : 0;
          return (
            <li key={i.key} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: i.color }}
                  aria-hidden
                />
                <span className="truncate text-[12px] text-gray-600">
                  {i.label}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                <span className="text-[13px] font-semibold text-gray-800">
                  {formatNumber(i.count)}
                </span>
                <span className="text-[11px] text-gray-400">
                  {Math.round(ratio)}%
                </span>
              </span>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="py-2 text-center text-[12px] text-gray-300">
            데이터 없음
          </li>
        )}
      </ul>
    </div>
  );
}

export function DistributionDonuts({
  plan,
  status,
}: {
  plan: DistributionItem[];
  status: DistributionItem[];
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Donut title="플랜 분포" items={plan} />
      <Donut title="학원 상태" items={status} />
    </div>
  );
}
