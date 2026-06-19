"use client";

// 시간대 × 요일 활동 히트맵 (KST) — 7요일(행) × 24시간(열) CSS 그리드.
// 셀 색은 intensity=count/maxCount 의 블루 스케일(#EFF6FF→#1D4ED8), 0건은 옅은 회색.
// "언제 가장 활발한가"를 한눈에. 좁으면 가로 스크롤.

import { useMemo } from "react";
import { formatNumber } from "@/lib/utils";
import type { HourWeekdayCell } from "@/lib/admin-analytics-types";

// 0=일 .. 6=토 (KST). 행 순서.
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
// 시간 축 라벨을 표시할 시각(가독성 위해 솎아냄).
const HOUR_TICKS = new Set([0, 3, 6, 9, 12, 15, 18, 21, 23]);

const CELL = 16; // 셀 한 변 px
const GAP = 2; // 셀 간격 px
const EMPTY_COLOR = "#F8FAFC"; // 0건 — 옅은 회색

/** 16진수 색 보간: t(0..1) 에서 a→b. */
function lerpHex(a: string, b: string, t: number): string {
  const clamp = Math.min(1, Math.max(0, t));
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * clamp);
  const g = Math.round(ag + (bg - ag) * clamp);
  const bl = Math.round(ab + (bb - ab) * clamp);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

/** count → 셀 배경색. 0이면 회색, 아니면 옅은~진한 블루. */
function cellColor(count: number, maxCount: number): string {
  if (count <= 0) return EMPTY_COLOR;
  const intensity = count / maxCount;
  // 1건이라도 있으면 최소 가시도 확보(0.18 바닥).
  return lerpHex("#EFF6FF", "#1D4ED8", 0.18 + intensity * 0.82);
}

export function HourWeekdayHeatmap({ data }: { data: HourWeekdayCell[] }) {
  const { lookup, maxCount, total } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    let sum = 0;
    for (const cell of data) {
      const key = `${cell.weekday}-${cell.hour}`;
      const c = Math.max(0, cell.count ?? 0);
      map.set(key, (map.get(key) ?? 0) + c);
      sum += c;
    }
    for (const v of map.values()) {
      if (v > max) max = v;
    }
    // divide-by-zero 가드: 최소 1.
    return { lookup: map, maxCount: Math.max(1, max), total: sum };
  }, [data]);

  if (total === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[12px] text-gray-300">
        표시할 활동이 없습니다
      </div>
    );
  }

  // 행 라벨 너비 + (24 × 셀 + 간격)
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(24, ${CELL}px)`,
    gap: `${GAP}px`,
  };

  return (
    <div className="w-full">
      {/* 가로 스크롤 컨테이너 — 좁은 화면에서 셀 찌그러짐 방지 */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-min">
          {/* 시간 축 (상단) */}
          <div className="mb-1 flex items-end" style={{ gap: `${GAP}px` }}>
            <div className="shrink-0" style={{ width: 28 }} aria-hidden />
            <div style={gridStyle}>
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="text-center text-[9px] leading-none text-gray-400 tabular-nums"
                  style={{ width: CELL }}
                  aria-hidden
                >
                  {HOUR_TICKS.has(h) ? h : ""}
                </div>
              ))}
            </div>
          </div>

          {/* 요일 행 × 시간 열 */}
          <div className="flex flex-col" style={{ gap: `${GAP}px` }}>
            {WEEKDAY_LABELS.map((wlabel, weekday) => (
              <div
                key={weekday}
                className="flex items-center"
                style={{ gap: `${GAP}px` }}
              >
                <div
                  className="shrink-0 text-right text-[11px] font-medium text-gray-500"
                  style={{ width: 28 }}
                >
                  {wlabel}
                </div>
                <div style={gridStyle}>
                  {HOURS.map((hour) => {
                    const count = lookup.get(`${weekday}-${hour}`) ?? 0;
                    return (
                      <div
                        key={hour}
                        title={`${wlabel} ${hour}시 · ${formatNumber(count)}건`}
                        className="rounded-[3px]"
                        style={{
                          width: CELL,
                          height: CELL,
                          backgroundColor: cellColor(count, maxCount),
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 그라데이션 범례 (OUTSIDE 그리드) */}
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-[11px] text-gray-400">적음</span>
        <div className="flex" style={{ gap: 1 }} aria-hidden>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span
              key={t}
              className="h-2.5 w-5 first:rounded-l-sm last:rounded-r-sm"
              style={{
                backgroundColor:
                  t === 0
                    ? EMPTY_COLOR
                    : lerpHex("#EFF6FF", "#1D4ED8", 0.18 + t * 0.82),
              }}
            />
          ))}
        </div>
        <span className="text-[11px] text-gray-400">많음</span>
        <span className="ml-1 text-[11px] text-gray-300 tabular-nums">
          최대 {formatNumber(maxCount)}건
        </span>
      </div>
    </div>
  );
}
