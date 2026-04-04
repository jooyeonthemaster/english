"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  QrCode,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStudentAttendanceHistory,
  studentCheckIn,
} from "@/actions/student-app-resources";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AttendanceRecord = {
  id: string;
  date: string;
  status: string;
  checkInTime: string | null;
  checkOutTime: string | null;
};

type AttendanceStats = {
  total: number;
  present: number;
  late: number;
  absent: number;
  earlyLeave: number;
  rate: number;
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string; size?: number }>; color: string; bg: string }> = {
  PRESENT: { label: "출석", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
  LATE: { label: "지각", icon: Clock, color: "text-amber-500", bg: "bg-amber-50" },
  ABSENT: { label: "결석", icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
  EARLY_LEAVE: { label: "조퇴", icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-50" },
  MAKEUP: { label: "보강", icon: CheckCircle2, color: "text-sky-500", bg: "bg-sky-50" },
};

const DAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AttendancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; message: string } | null>(null);
  const [todayStatus, setTodayStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStudentAttendanceHistory(year, month);
      setRecords(data.records);
      setStats(data.stats);

      // Check today's status
      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = data.records.find((r) => r.date === todayStr);
      setTodayStatus(todayRecord?.status ?? null);
    } catch {
      setRecords([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const result = await studentCheckIn();
      if (result.alreadyCheckedIn) {
        setCheckInResult({ success: false, message: "이미 출석 완료되었습니다" });
      } else {
        setCheckInResult({ success: true, message: "출석 완료!" });
        setTodayStatus("PRESENT");
        fetchData();
      }
    } catch {
      setCheckInResult({ success: false, message: "출석 처리에 실패했습니다" });
    } finally {
      setCheckingIn(false);
      setTimeout(() => setCheckInResult(null), 3000);
    }
  }

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  // Calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const recordMap = new Map(records.map((r) => [r.date, r]));
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="flex flex-col px-5 pt-3 pb-6 gap-5">
      {/* Check-in card */}
      <div
        className="rounded-3xl bg-white p-5 text-center"
      >
        {todayStatus ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-500" />
            </div>
            <p className="text-[var(--fs-lg)] font-bold text-black">출석 완료</p>
            <p className="text-[var(--fs-xs)] text-gray-500">
              {records.find((r) => r.date === todayStr)?.checkInTime ?? ""}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
            >
              <QrCode size={28} style={{ color: "var(--key-color)" }} />
            </div>
            <p className="text-[var(--fs-lg)] font-bold text-black">
              오늘 출석을 해주세요
            </p>
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className={cn(
                "px-6 py-2.5 rounded-2xl text-[var(--fs-sm)] font-semibold text-white transition-all active:scale-95",
                checkingIn && "opacity-60",
              )}
              style={{ backgroundColor: "var(--key-color)" }}
            >
              {checkingIn ? "처리 중..." : "출석하기"}
            </button>
          </div>
        )}

        {/* Result toast */}
        <AnimatePresence>
          {checkInResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                "mt-3 px-3 py-2 rounded-2xl text-[var(--fs-xs)] font-medium",
                checkInResult.success
                  ? "bg-emerald-50 text-emerald-500"
                  : "bg-amber-50 text-amber-500",
              )}
            >
              {checkInResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Calendar */}
      <div
        className="rounded-3xl bg-white p-5"
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1.5 rounded-md active:bg-black/5 transition-colors">
            <ChevronLeft size={18} className="text-gray-500" />
          </button>
          <h3 className="text-[var(--fs-lg)] font-bold text-black">
            {year}년 {month}월
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-md active:bg-black/5 transition-colors">
            <ChevronRight size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="text-center text-[var(--fs-caption)] font-medium py-1 text-gray-400"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const record = recordMap.get(dateStr);
              const isToday = dateStr === todayStr;
              const statusCfg = record ? STATUS_CONFIG[record.status] : null;

              return (
                <div
                  key={day}
                  className={cn(
                    "aspect-square flex flex-col items-center justify-center rounded-md text-[var(--fs-xs)] relative",
                    statusCfg?.bg,
                  )}
                  style={isToday && !statusCfg ? { outline: "1.5px solid var(--key-color)" } : undefined}
                >
                  <span
                    className={cn(
                      "font-medium",
                      statusCfg ? statusCfg.color : "text-gray-500",
                    )}
                    style={isToday && !statusCfg ? { color: "var(--key-color)", fontWeight: 700 } : undefined}
                  >
                    {day}
                  </span>
                  {statusCfg && (
                    <span className={cn("text-[8px] font-semibold mt-0.5", statusCfg.color)}>
                      {statusCfg.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div
          className="rounded-3xl bg-white p-5"
          >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[var(--fs-md)] font-semibold text-black">출석 현황</h3>
            <span className="text-[var(--fs-xl)] font-black" style={{ color: "var(--key-color)" }}>
              {stats.rate}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "출석", value: stats.present, color: "text-emerald-500" },
              { label: "지각", value: stats.late, color: "text-amber-500" },
              { label: "결석", value: stats.absent, color: "text-red-500" },
              { label: "조퇴", value: stats.earlyLeave, color: "text-orange-500" },
            ].map((item) => (
              <div key={item.label} className="text-center py-2 rounded-xl bg-gray-50">
                <p className={cn("text-[var(--fs-lg)] font-bold", item.color)}>{item.value}</p>
                <p className="text-[var(--fs-caption)] text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
