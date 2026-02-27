"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CalendarHeatmapProps {
  data: Array<{ date: string; count: number }>;
}

interface CellData {
  date: Date;
  dateStr: string;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY_LABELS = ["월", "", "수", "", "금", "", ""] as const;

function getCellColor(count: number): string {
  if (count === 0) return "#F3F4F0";
  if (count <= 2) return "#C5E1A5";
  if (count <= 4) return "#AED581";
  return "#7CB342";
}

function getMonthLabel(date: Date): string {
  const month = date.getMonth() + 1;
  return `${month}월`;
}

function formatCellDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}월 ${d}일`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CalendarHeatmap({ data }: CalendarHeatmapProps) {
  const [selectedCell, setSelectedCell] = useState<CellData | null>(null);

  const { weeks, monthLabels } = useMemo(() => {
    // Build a map of date -> count for fast lookup
    const countMap = new Map<string, number>();
    for (const d of data) {
      countMap.set(d.date, d.count);
    }

    // Calculate 12 weeks (84 days) ending today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find the Monday of the week 11 weeks ago
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - mondayOffset);

    const startDate = new Date(thisMonday);
    startDate.setDate(thisMonday.getDate() - 11 * 7);

    // Build weeks grid: 12 weeks x 7 days
    const weeksArr: Array<Array<CellData>> = [];
    const monthLabelsArr: Array<{ label: string; colIndex: number }> = [];
    let lastMonth = -1;

    for (let w = 0; w < 12; w++) {
      const week: CellData[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + w * 7 + d);

        const dateStr = cellDate.toISOString().split("T")[0];
        const count = countMap.get(dateStr) ?? 0;
        const isToday = cellDate.getTime() === today.getTime();
        const isFuture = cellDate.getTime() > today.getTime();

        week.push({ date: cellDate, dateStr, count, isToday, isFuture });

        // Track month changes (only check first day of each week)
        if (d === 0) {
          const month = cellDate.getMonth();
          if (month !== lastMonth) {
            monthLabelsArr.push({
              label: getMonthLabel(cellDate),
              colIndex: w,
            });
            lastMonth = month;
          }
        }
      }
      weeksArr.push(week);
    }

    return { weeks: weeksArr, monthLabels: monthLabelsArr };
  }, [data]);

  const handleCellTap = useCallback(
    (cell: CellData) => {
      if (cell.isFuture) return;
      setSelectedCell((prev) =>
        prev?.dateStr === cell.dateStr ? null : cell
      );
    },
    []
  );

  const cellSize = 14;
  const gap = 3;
  const labelWidth = 22;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="rounded-2xl bg-white p-5 shadow-card"
    >
      {/* Title */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#7CB342] to-[#689F38]">
          <Activity className="size-3.5 text-white" />
        </div>
        <p className="text-[15px] font-bold tracking-tight text-[#1A1F16]">
          학습 활동
        </p>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {selectedCell && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mb-3 flex items-center gap-2 rounded-lg bg-[#1B2E1B] px-3 py-2"
          >
            <span className="text-[12px] font-medium text-white/80">
              {formatCellDate(selectedCell.date)}
            </span>
            <span className="text-[12px] font-bold text-white">
              {selectedCell.count}회 학습
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overflow-x-auto hide-scrollbar">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels row */}
          <div
            className="flex items-center"
            style={{ paddingLeft: labelWidth + gap }}
          >
            {weeks.map((_, colIdx) => {
              const monthLabel = monthLabels.find(
                (m) => m.colIndex === colIdx
              );
              return (
                <div
                  key={colIdx}
                  style={{ width: cellSize + gap, minWidth: cellSize + gap }}
                  className="text-[10px] font-medium text-[#9CA396]"
                >
                  {monthLabel?.label ?? ""}
                </div>
              );
            })}
          </div>

          {/* Grid: 7 rows (Mon-Sun) x 12 cols (weeks) */}
          {Array.from({ length: 7 }).map((_, rowIdx) => (
            <div key={rowIdx} className="flex items-center">
              {/* Day label */}
              <div
                style={{ width: labelWidth }}
                className="text-[10px] font-medium text-[#9CA396]"
              >
                {DAY_LABELS[rowIdx]}
              </div>

              {/* Cells */}
              {weeks.map((week, colIdx) => {
                const cell = week[rowIdx];
                if (!cell) return null;

                const isSelected = selectedCell?.dateStr === cell.dateStr;

                return (
                  <div
                    key={colIdx}
                    onClick={() => handleCellTap(cell)}
                    role="button"
                    aria-label={`${cell.dateStr}: ${cell.count}회`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      marginRight: gap,
                      backgroundColor: cell.isFuture
                        ? "transparent"
                        : getCellColor(cell.count),
                      borderRadius: 3,
                    }}
                    className={cn(
                      "cursor-pointer transition-all duration-150",
                      cell.isToday && "animate-pulse-ring",
                      isSelected &&
                        "ring-2 ring-[#7CB342] ring-offset-1 scale-125"
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-[10px] font-medium text-[#9CA396]">적음</span>
        <div className="flex gap-1">
          {[0, 1, 3, 5].map((count) => (
            <div
              key={count}
              style={{
                width: 12,
                height: 12,
                backgroundColor: getCellColor(count),
                borderRadius: 3,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] font-medium text-[#9CA396]">많음</span>
      </div>
    </motion.div>
  );
}
