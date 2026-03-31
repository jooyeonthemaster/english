"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface HeatmapEntry {
  date: string;
  level: number;
}

const GREEN_LEVELS = [
  "bg-gray-100",
  "bg-emerald-200",
  "bg-emerald-400",
  "bg-emerald-600",
];

export function StudyHeatmap({ data }: { data: HeatmapEntry[] }) {
  const weeks = useMemo(() => {
    const today = new Date();
    const dataMap = new Map(data.map((d) => [d.date, d.level]));
    const result: { date: string; level: number; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; level: number; dayOfWeek: number }[] = [];
    let lastWeekIdx = -1;

    for (let i = 90; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay();
      const weekIdx = Math.floor((90 - i + ((today.getDay() + 6) % 7)) / 7);

      if (weekIdx !== lastWeekIdx) {
        if (currentWeek.length) result.push(currentWeek);
        currentWeek = [];
        lastWeekIdx = weekIdx;
      }
      currentWeek.push({ date: dateStr, level: dataMap.get(dateStr) ?? 0, dayOfWeek });
    }
    if (currentWeek.length) result.push(currentWeek);
    return result;
  }, [data]);

  return (
    <div className="bg-white rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <h4 className="text-xs font-bold text-gray-900 mb-2">학습 캘린더</h4>
      <div className="overflow-x-auto hide-scrollbar">
        <div className="flex gap-[3px] min-w-fit">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }).map((_, di) => {
                const cell = week.find((c) => c.dayOfWeek === di);
                if (!cell) return <div key={di} className="size-[clamp(0.5rem,1.2vw,0.75rem)]" />;
                return (
                  <div
                    key={di}
                    className={cn("size-[clamp(0.5rem,1.2vw,0.75rem)] rounded-[2px]", GREEN_LEVELS[cell.level])}
                    title={`${cell.date}: Level ${cell.level}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1.5 justify-end">
          <span className="text-[10px] text-gray-400 mr-0.5">적음</span>
          {GREEN_LEVELS.map((c, i) => (
            <div key={i} className={cn("size-[clamp(0.4rem,1vw,0.5625rem)] rounded-[2px]", c)} />
          ))}
          <span className="text-[10px] text-gray-400 ml-0.5">많음</span>
        </div>
      </div>
    </div>
  );
}
