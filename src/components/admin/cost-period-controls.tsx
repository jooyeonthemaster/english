"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Mode = "daily" | "monthly";

interface CostPeriodControlsProps {
  mode: Mode;
  dateValue: string;
  monthValue: string;
  startValue: string | null;
  endValue: string | null;
  isRange: boolean;
  /** 현재 탭(view)을 URL에 유지 — 기능별 마진에서 기간 변경 시 탭이 풀리지 않게. */
  view?: "dashboard" | "margin";
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function CostPeriodControls({
  mode,
  dateValue,
  monthValue,
  startValue,
  endValue,
  isRange,
  view,
}: CostPeriodControlsProps) {
  const router = useRouter();
  const [rangeOpen, setRangeOpen] = useState(false);

  const activeTab: "daily" | "monthly" | "range" = isRange ? "range" : mode;
  const viewSuffix = view ? `&view=${view}` : "";

  function go(href: string) {
    router.push(href);
  }

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors",
      active
        ? "bg-slate-900 text-white"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
        <div className="inline-flex h-9 w-fit items-center rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            className={tabClass(activeTab === "daily")}
            onClick={() => go(`/admin/costs?mode=daily&date=${dateValue}${viewSuffix}`)}
          >
            <CalendarDays className="size-3.5" />
            일별
          </button>
          <button
            type="button"
            className={tabClass(activeTab === "monthly")}
            onClick={() => go(`/admin/costs?mode=monthly&month=${monthValue}${viewSuffix}`)}
          >
            <CalendarRange className="size-3.5" />
            월별
          </button>
          <PopoverTrigger asChild>
            <button type="button" className={tabClass(activeTab === "range")}>
              <CalendarClock className="size-3.5" />
              기간선택
            </button>
          </PopoverTrigger>
        </div>

        {activeTab === "range" && (
          <button
            type="button"
            onClick={() =>
              go(
                mode === "monthly"
                  ? `/admin/costs?mode=monthly&month=${monthValue}${viewSuffix}`
                  : `/admin/costs?mode=daily&date=${dateValue}${viewSuffix}`,
              )
            }
            className="inline-flex h-9 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            초기화
          </button>
        )}

        <PopoverContent align="end" className="w-auto p-3">
          <RangeCalendar
            mode={mode}
            initialStart={startValue}
            initialEnd={endValue}
            onApply={(start, end) => {
              setRangeOpen(false);
              go(`/admin/costs?mode=${mode}&start=${start}&end=${end}${viewSuffix}`);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RangeCalendar({
  mode,
  initialStart,
  initialEnd,
  onApply,
}: {
  mode: Mode;
  initialStart: string | null;
  initialEnd: string | null;
  onApply: (start: string, end: string) => void;
}) {
  const parsedStart = initialStart ? parseISO(initialStart) : null;
  const parsedEnd = initialEnd ? parseISO(initialEnd) : null;

  const [viewMonth, setViewMonth] = useState<Date>(
    startOfMonth(parsedStart ?? new Date()),
  );
  const [start, setStart] = useState<Date | null>(parsedStart);
  const [end, setEnd] = useState<Date | null>(parsedEnd);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  function handleDayClick(day: Date) {
    if (!start || (start && end)) {
      setStart(day);
      setEnd(null);
      return;
    }
    // start set, end not set
    if (day < start) {
      setEnd(start);
      setStart(day);
    } else {
      setEnd(day);
    }
  }

  function inRange(day: Date) {
    if (!start || !end) return false;
    return day > start && day < end;
  }

  const canApply = Boolean(start);

  return (
    <div className="w-[268px]">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-semibold text-gray-800">
          {format(viewMonth, "yyyy년 M월")}
        </span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="flex h-7 items-center justify-center text-[11px] font-medium text-gray-400"
          >
            {w}
          </div>
        ))}
        {days.map((day) => {
          const isStart = start && isSameDay(day, start);
          const isEnd = end && isSameDay(day, end);
          const isEndpoint = isStart || isEnd;
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isToday = isSameDay(day, new Date());
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => handleDayClick(day)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-[12px] tabular-nums transition-colors",
                !isCurrentMonth && "text-gray-300",
                isCurrentMonth && !isEndpoint && "text-gray-700 hover:bg-gray-100",
                inRange(day) && "bg-slate-100 text-slate-700",
                isEndpoint && "bg-slate-900 font-semibold text-white hover:bg-slate-800",
                isToday && !isEndpoint && "ring-1 ring-inset ring-slate-300",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-[12px] tabular-nums text-gray-500">
          {start ? format(start, "yyyy.MM.dd") : "시작일"}
          {" ~ "}
          {end ? format(end, "yyyy.MM.dd") : start ? format(start, "yyyy.MM.dd") : "종료일"}
        </span>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => {
            if (!start) return;
            const s = format(start, "yyyy-MM-dd");
            const e = format(end ?? start, "yyyy-MM-dd");
            onApply(s, e);
          }}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md px-3 text-[12px] font-semibold transition-colors",
            canApply
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "cursor-not-allowed bg-gray-200 text-gray-400",
          )}
        >
          적용
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        {mode === "monthly" ? "월별" : "일별"} 집계로 기간 손익을 표시합니다.
      </p>
    </div>
  );
}
