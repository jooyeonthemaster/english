"use client";

// 유형×시험 정오율 히트맵 (유닛 V5) — study-heatmap div-grid 관례 미러.
// 행=유형(byType typeLabel 합집합, 첫 등장 순서), 열=회차(날짜 오름차순),
// 셀=정답률 색농도(blue-100→blue-600), 데이터 없으면 slate-100.
// 셀 툴팁 "유형 · 시험 · n/m". 가로 스크롤 컨테이너 + 유형 컬럼 sticky.

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TrendSitting, TrendTypeStat } from "@/lib/exam-scoring/trend";

/** 정답률 0→1 을 6단 파랑 농도로 — 낮을수록 연하고 높을수록 진하다 */
const BLUE_SCALE = [
  "bg-blue-100",
  "bg-blue-200",
  "bg-blue-300",
  "bg-blue-400",
  "bg-blue-500",
  "bg-blue-600",
];

function blueOf(ratio: number): string {
  const idx = Math.min(BLUE_SCALE.length - 1, Math.floor(ratio * BLUE_SCALE.length));
  return BLUE_SCALE[Math.max(0, idx)];
}

export function TypeHeatmap({ sittings }: { sittings: TrendSitting[] }) {
  const { typeLabels, statMaps } = useMemo(() => {
    const labels: string[] = [];
    const seen = new Set<string>();
    const maps: Map<string, TrendTypeStat>[] = [];
    for (const sitting of sittings) {
      const map = new Map<string, TrendTypeStat>();
      for (const stat of sitting.byType) {
        if (!seen.has(stat.typeLabel)) {
          seen.add(stat.typeLabel);
          labels.push(stat.typeLabel);
        }
        map.set(stat.typeLabel, stat);
      }
      maps.push(map);
    }
    return { typeLabels: labels, statMaps: maps };
  }, [sittings]);

  if (typeLabels.length === 0) {
    return (
      <div className="flex h-24 w-full items-center justify-center text-[12px] text-[#8B95A1]">
        유형별 정오 데이터가 있는 응시가 아직 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-top">
          {/* 헤더 행 — 회차 */}
          <div className="flex">
            <div className="sticky left-0 z-10 w-32 shrink-0 bg-white" />
            {sittings.map((sitting, i) => (
              <div
                key={sitting.refId}
                className="w-9 shrink-0 pb-1 text-center text-[11px] text-[#8B95A1]"
                title={`${i + 1}회 · ${sitting.title} (${sitting.date.slice(0, 10)})`}
              >
                {i + 1}회
              </div>
            ))}
          </div>

          {/* 유형 행 */}
          {typeLabels.map((label) => (
            <div key={label} className="flex items-center">
              <div className="sticky left-0 z-10 w-32 shrink-0 bg-white pr-2">
                <span className="block truncate text-xs text-[#4E5968]" title={label}>
                  {label}
                </span>
              </div>
              {sittings.map((sitting, i) => {
                const stat = statMaps[i].get(label);
                const ratio = stat && stat.total > 0 ? stat.correct / stat.total : null;
                return (
                  <div key={sitting.refId} className="w-9 shrink-0 p-0.5">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-[4px]",
                        ratio == null ? "bg-slate-100" : blueOf(ratio),
                      )}
                      title={
                        stat
                          ? `${label} · ${sitting.title} · ${stat.correct}/${stat.total}`
                          : `${label} · ${sitting.title} · 데이터 없음`
                      }
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8B95A1]">
          <span className="h-3 w-3 rounded-[2px] bg-slate-100" /> 데이터 없음
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-[#8B95A1]">
          정답률 낮음
          {BLUE_SCALE.map((c) => (
            <span key={c} className={cn("h-3 w-3 rounded-[2px]", c)} />
          ))}
          높음
        </span>
      </div>
    </div>
  );
}
