"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentAttendance } from "@/actions/student-app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AttendanceData = Awaited<ReturnType<typeof getStudentAttendance>>;

const STATUS_STYLE: Record<string, { label: string; className: string; symbol: string }> = {
  PRESENT: { label: "출석", className: "bg-emerald-500 text-white", symbol: "✓" },
  LATE: { label: "지각", className: "bg-amber-500 text-white", symbol: "▲" },
  ABSENT: { label: "결석", className: "bg-red-500 text-white", symbol: "✕" },
  EARLY_LEAVE: { label: "조퇴", className: "bg-purple-500 text-white", symbol: "◆" },
  MAKEUP: { label: "보충", className: "bg-blue-500 text-white", symbol: "◇" },
};

const DAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AttendanceCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getStudentAttendance(year, month)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  }

  // Calendar grid
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayDate = today.getDate();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const recordMap = new Map(
    data?.records.map((r) => [new Date(r.date).getDate(), r]) ?? [],
  );

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg active:bg-gray-100 transition-colors"
          aria-label="이전 달"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
        <h3 className="text-base font-bold text-gray-800">
          {year}년 {month}월
        </h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg active:bg-gray-100 transition-colors"
          aria-label="다음 달"
        >
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_HEADERS.map((d, i) => (
          <div
            key={d}
            className={cn(
              "text-center text-[10px] font-medium py-1",
              i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-gray-400",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      {loading ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const record = recordMap.get(day);
            const isToday = isCurrentMonth && day === todayDate;
            const isFuture = isCurrentMonth && day > todayDate;
            const style = record ? STATUS_STYLE[record.status] : null;

            return (
              <div
                key={day}
                className={cn(
                  "aspect-square rounded-xl flex flex-col items-center justify-center text-[10px] font-medium transition-colors",
                  style?.className,
                  !style && !isFuture && !isToday && "text-gray-600",
                  isFuture && "text-gray-200",
                  isToday && !style && "ring-2 ring-blue-500/40 text-blue-500 font-bold",
                )}
              >
                <span>{day}</span>
                {style && (
                  <span className="text-[0.5rem] leading-none mt-0.5">{style.symbol}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats summary */}
      {data && data.stats.total > 0 && (
        <div className="flex items-center justify-between px-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <StatBadge color="bg-emerald-500" label="출석" count={data.stats.present} />
            <StatBadge color="bg-amber-500" label="지각" count={data.stats.late} />
            <StatBadge color="bg-red-500" label="결석" count={data.stats.absent} />
          </div>
          <span className="text-sm font-bold text-gray-700">
            {data.stats.rate}%
          </span>
        </div>
      )}

      {data && data.stats.total === 0 && (
        <p className="text-center text-xs text-gray-400 py-5">
          이 달의 출석 기록이 없습니다
        </p>
      )}
    </div>
  );
}

function StatBadge({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn("size-2 rounded-full", color)} />
      <span className="text-[10px] text-gray-500">
        {label} {count}일
      </span>
    </div>
  );
}
