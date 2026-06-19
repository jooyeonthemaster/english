"use client";

// 활성화 퍼널 (가입 → 활성화 → 반복 → 파워).
// 단계마다 가로 막대 — 폭은 첫 단계(가입) 대비 비율로 점점 좁아지고,
// 단계가 깊어질수록 파란색이 진해진다. 각 행: 라벨·막대·건수,
// 그리고 2번째 단계부터 "(전 단계의 P%)" 직전 단계 전환율.
// 하단에 가입→파워 전체 전환율을 별도로 노출. recharts 미사용(순수 div).

import { ChevronDown } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import type { FunnelStage } from "@/lib/admin-analytics-types";

// 단계별 파란색(점점 진해짐). 막대가 좁아질수록 색이 깊어져 깔때기 인상을 강화.
const STAGE_COLORS = ["#93C5FD", "#60A5FA", "#3B82F6", "#2563EB"] as const;

function colorForIndex(index: number): string {
  return STAGE_COLORS[Math.min(index, STAGE_COLORS.length - 1)];
}

export function ActivationFunnel({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[12px] text-gray-300">
        표시할 단계가 없습니다
      </div>
    );
  }

  const topCount = stages[0]?.count ?? 0;
  const lastCount = stages[stages.length - 1]?.count ?? 0;
  // 가입(첫 단계) 대비 파워(마지막 단계) 전체 전환율. 분모 0 가드.
  const overallPct = topCount > 0 ? Math.round((lastCount / topCount) * 100) : 0;

  return (
    <div className="flex w-full flex-col">
      {/* 퍼널 본체 — 단계별 가로 막대 행 */}
      <div className="flex flex-col gap-2">
        {stages.map((stage, index) => {
          // 첫 단계(가입) 대비 폭 비율 — 0 가드. 최소 가시 폭 확보.
          const widthRatio = topCount > 0 ? stage.count / topCount : 0;
          const widthPct = Math.max(widthRatio * 100, stage.count > 0 ? 6 : 0);
          // 직전 단계 대비 전환율(첫 단계 제외). rate는 0..1.
          const prevPct = Math.round((stage.rate ?? 0) * 100);
          const color = colorForIndex(index);
          const isFirst = index === 0;

          return (
            <div key={stage.key} className="flex flex-col gap-1">
              {/* 라벨 행: 단계명(좌) · 건수(우) */}
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="truncate text-[12px] font-medium text-gray-600">
                    {stage.label}
                  </span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                  <span className="text-[13px] font-semibold text-gray-800">
                    {formatNumber(stage.count)}
                  </span>
                  <span className="text-[11px] text-gray-400">곳</span>
                </span>
              </div>

              {/* 막대 트랙 + 좁아지는 막대 */}
              <div className="flex h-7 w-full items-center rounded-md bg-gray-50">
                <div
                  className={cn(
                    "flex h-full items-center rounded-md transition-[width] duration-500",
                    widthPct > 0 ? "min-w-[2px]" : "",
                  )}
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                  role="img"
                  aria-label={`${stage.label} ${formatNumber(stage.count)}곳`}
                >
                  {/* 전 단계 대비 전환율 — 첫 단계는 제외 */}
                  {!isFirst && stage.count > 0 && (
                    <span className="truncate px-2 text-[11px] font-medium text-white">
                      전 단계의 {prevPct}%
                    </span>
                  )}
                </div>
                {/* 막대가 너무 좁아 안에 라벨을 못 넣을 때 바깥 표기 */}
                {!isFirst && stage.count > 0 && widthPct < 22 && (
                  <span className="px-2 text-[11px] font-medium text-gray-500 tabular-nums">
                    전 단계의 {prevPct}%
                  </span>
                )}
              </div>

              {/* 단계 사이 화살표 (마지막 단계 뒤에는 생략) */}
              {index < stages.length - 1 && (
                <div className="flex justify-center text-gray-300">
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 전체 전환율 요약 — 고정 높이 영역 밖(하단 형제) */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
        <span className="text-[12px] text-gray-600">
          {stages[0]?.label ?? "가입"} → {stages[stages.length - 1]?.label ?? "파워"} 전환율
        </span>
        <span className="flex items-baseline gap-1.5 tabular-nums">
          <span className="text-[15px] font-bold text-blue-700">
            {overallPct}%
          </span>
          <span className="text-[11px] text-gray-400">
            ({formatNumber(lastCount)} / {formatNumber(topCount)}곳)
          </span>
        </span>
      </div>
    </div>
  );
}
