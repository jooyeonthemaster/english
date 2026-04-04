"use client";

import Link from "next/link";
import { ChevronRight, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAY_LABELS, type ScheduleSlot } from "../_constants/home-constants";

interface ScheduleSectionProps {
  weekGrid: ScheduleSlot[][];
  todayIdx: number;
  todayClasses: ScheduleSlot[];
  hasAnyClass: boolean;
  upcomingExams: { id: string; title: string; examDate: string | null }[];
  pendingAssignments: { id: string }[];
}

export default function ScheduleSection({
  weekGrid,
  todayIdx,
  todayClasses,
  hasAnyClass,
  upcomingExams,
  pendingAssignments,
}: ScheduleSectionProps) {
  return (
    <div
      className="rounded-3xl bg-white p-5"
      style={{ boxShadow: "0 2px 12px color-mix(in srgb, var(--key-color) 12%, transparent)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[var(--fs-lg)] font-bold text-black">이번 주 수업</h3>
      </div>

      {/* 주간 캘린더 — 원형 도트 스타일 */}
      <div className="flex justify-between px-1">
        {DAY_LABELS.map((dayLabel, i) => {
          const slots = weekGrid[i];
          const isToday = i === todayIdx;
          const hasClass = slots.length > 0;
          return (
            <div key={dayLabel} className="flex flex-col items-center gap-2">
              <span
                className={cn("text-[var(--fs-xs)] font-bold", !isToday && "text-gray-400")}
                style={isToday ? { color: "var(--key-color)" } : undefined}
              >
                {dayLabel}
              </span>
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                  !isToday && hasClass && "bg-gray-100",
                  !isToday && !hasClass && "bg-gray-50",
                )}
                style={
                  isToday && hasClass
                    ? { backgroundColor: "var(--key-color)", boxShadow: "0 4px 12px color-mix(in srgb, var(--key-color) 30%, transparent)" }
                    : isToday && !hasClass
                      ? { backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)", outline: "2px solid color-mix(in srgb, var(--key-color) 25%, transparent)" }
                      : undefined
                }
              >
                {isToday ? (
                  <span
                    className={cn("text-[var(--fs-xs)] font-black", hasClass && "text-white")}
                    style={!hasClass ? { color: "var(--key-color)" } : undefined}
                  >
                    {new Date().getDate()}
                  </span>
                ) : hasClass ? (
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--key-color)" }} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 오늘 수업 정보 */}
      {todayClasses.length > 0 ? (
        <div
          className="mt-4 rounded-2xl p-4"
          style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 8%, white)" }}
        >
          <p className="text-[var(--fs-xs)] font-bold mb-2" style={{ color: "var(--key-color)" }}>오늘 수업</p>
          <div className="space-y-2">
            {todayClasses.map((cls, ci) => (
              <div key={ci} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 rounded-full" style={{ backgroundColor: "var(--key-color)" }} />
                  <span className="text-[var(--fs-base)] font-semibold text-black">{cls.className}</span>
                </div>
                <span className="text-[var(--fs-xs)] text-black font-medium">{cls.startTime} - {cls.endTime}</span>
              </div>
            ))}
          </div>
        </div>
      ) : hasAnyClass ? (
        <div className="mt-4 bg-gray-50 rounded-2xl p-4 text-center">
          <p className="text-[var(--fs-base)] text-gray-400">오늘은 수업이 없어요</p>
        </div>
      ) : null}

      {/* 시험/숙제 알림 */}
      {(upcomingExams.length > 0 || pendingAssignments.length > 0) && (
        <div className="mt-4 space-y-2">
          {upcomingExams.slice(0, 2).map((exam) => {
            const dDay = exam.examDate
              ? Math.ceil((new Date(exam.examDate).getTime() - Date.now()) / 86400000)
              : null;
            return (
              <div key={exam.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <Clock className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-black shrink-0" />
                <span className="text-[var(--fs-base)] text-black flex-1 truncate">{exam.title}</span>
                <span className="text-[var(--fs-xs)] font-black text-black shrink-0">
                  {dDay === 0 ? "D-Day" : dDay && dDay > 0 ? `D-${dDay}` : ""}
                </span>
              </div>
            );
          })}
          {pendingAssignments.length > 0 && (
            <Link
              href="/student/resources?tab=assignments"
              className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 group"
            >
              <AlertCircle className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-black shrink-0" />
              <span className="text-[var(--fs-base)] text-black flex-1">미제출 숙제 {pendingAssignments.length}건</span>
              <ChevronRight className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-gray-400 group-active:translate-x-0.5 transition-transform" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
