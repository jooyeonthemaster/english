"use client";

// 기간 컨트롤 — 원가분석 CostPeriodControls 와 동일한 UX(일별/월별/기간선택 +
// 달력 팝오버). URL 대신 onChange 콜백으로 상위(패널)에 선택을 전달한다.

import { useState } from "react";
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
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import type { PromoMonitoringSelection } from "@/actions/admin/credit-promotion-monitoring";
import { FilterChip } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function PromoPeriodControls({
  selection,
  pending,
  onChange,
}: {
  selection: PromoMonitoringSelection;
  pending: boolean;
  onChange: (next: PromoMonitoringSelection) => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const isRange = Boolean(selection.start && selection.end);
  const activeTab: "daily" | "monthly" | "range" = isRange ? "range" : selection.mode;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", pending && "pointer-events-none opacity-60")}>
      <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
        <FilterChip
          label="일별"
          active={activeTab === "daily"}
          onClick={() => onChange({ ...selection, mode: "daily", start: null, end: null })}
        />
        <FilterChip
          label="월별"
          active={activeTab === "monthly"}
          onClick={() => onChange({ ...selection, mode: "monthly", start: null, end: null })}
        />
        {/* FilterChip 은 ref/props 를 넘기지 않아 PopoverTrigger 가 될 수 없어 같은 모양의 Button 을 쓴다. */}
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={activeTab === "range"}
            className={cn(
              "rounded-full px-3 text-[12px] font-medium",
              activeTab === "range"
                ? "bg-gray-900 text-white hover:bg-gray-900 hover:text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900",
            )}
          >
            <CalendarClock className="size-3.5" strokeWidth={2} />
            기간선택
          </Button>
        </PopoverTrigger>

        {activeTab === "range" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...selection, start: null, end: null })}
            className="text-gray-400 hover:text-gray-700"
          >
            초기화
          </Button>
        )}

        <PopoverContent align="end" className="w-auto p-3">
          <RangeCalendar
            mode={selection.mode}
            initialStart={selection.start}
            initialEnd={selection.end}
            onApply={(start, end) => {
              setRangeOpen(false);
              onChange({ ...selection, start, end });
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
  mode: "daily" | "monthly";
  initialStart: string | null;
  initialEnd: string | null;
  onApply: (start: string, end: string) => void;
}) {
  const parsedStart = initialStart ? parseISO(initialStart) : null;
  const parsedEnd = initialEnd ? parseISO(initialEnd) : null;

  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(parsedStart ?? new Date()));
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
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="이전 달"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="text-gray-500"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-[13px] font-semibold text-gray-800">
          {format(viewMonth, "yyyy년 M월")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="다음 달"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="text-gray-500"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* 달력 칸은 위젯 내부 요소라 raw button 을 유지한다(42칸을 Button 으로 감싸면 스타일만 늘어남). */}
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
                inRange(day) && "bg-gray-100 text-gray-700",
                isEndpoint && "bg-gray-900 font-semibold text-white hover:bg-gray-800",
                isToday && !isEndpoint && "ring-1 ring-inset ring-gray-300",
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
        <Button
          type="button"
          size="sm"
          disabled={!canApply}
          onClick={() => {
            if (!start) return;
            onApply(format(start, "yyyy-MM-dd"), format(end ?? start, "yyyy-MM-dd"));
          }}
        >
          적용
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        {mode === "monthly" ? "월별" : "일별"} 집계로 기간 활동을 표시합니다.
      </p>
    </div>
  );
}
