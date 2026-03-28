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
} from "@/actions/student-app";

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
  PRESENT: { label: "출석", icon: CheckCircle2, color: "text-[var(--erp-success)]", bg: "bg-[var(--erp-success-subtle)]" },
  LATE: { label: "지각", icon: Clock, color: "text-[var(--erp-warning)]", bg: "bg-[var(--erp-warning-subtle)]" },
  ABSENT: { label: "결석", icon: XCircle, color: "text-[var(--erp-error)]", bg: "bg-[var(--erp-error-subtle)]" },
  EARLY_LEAVE: { label: "조퇴", icon: AlertTriangle, color: "text-[var(--learn-xp)]", bg: "bg-[var(--learn-xp-light)]" },
  MAKEUP: { label: "보강", icon: CheckCircle2, color: "text-[var(--erp-info)]", bg: "bg-[var(--erp-info-light)]" },
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
    <div className="flex flex-col px-[var(--sp-3)] pt-[var(--pt-page)] pb-[var(--pb-page)] gap-[var(--gap-section)]">
      {/* ═══ Check-in card ═══ */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-surface)] p-[var(--sp-4)] text-center">
        {todayStatus ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-[var(--erp-success-subtle)] flex items-center justify-center">
              <CheckCircle2 size={28} className="text-[var(--erp-success)]" />
            </div>
            <p className="text-[var(--fs-md)] font-bold text-[var(--erp-text)]">출석 완료</p>
            <p className="text-[var(--fs-xs)] text-[var(--erp-text-muted)]">
              {records.find((r) => r.date === todayStr)?.checkInTime ?? ""}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[var(--erp-primary-subtle)] flex items-center justify-center">
              <QrCode size={28} className="text-[var(--erp-primary)]" />
            </div>
            <p className="text-[var(--fs-md)] font-bold text-[var(--erp-text)]">
              오늘 출석을 해주세요
            </p>
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className={cn(
                "px-6 py-2.5 rounded-[var(--radius-md)] text-[var(--fs-sm)] font-semibold text-white transition-all",
                "bg-[var(--erp-primary)] active:bg-[var(--erp-primary-hover)]",
                checkingIn && "opacity-60",
              )}
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
                "mt-3 px-3 py-2 rounded-[var(--radius-md)] text-[var(--fs-xs)] font-medium",
                checkInResult.success
                  ? "bg-[var(--erp-success-subtle)] text-[var(--erp-success)]"
                  : "bg-[var(--erp-warning-subtle)] text-[var(--erp-warning)]",
              )}
            >
              {checkInResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ Calendar ═══ */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-surface)] p-[var(--sp-3)]">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-[var(--sp-3)]">
          <button onClick={prevMonth} className="p-1.5 rounded-md active:bg-[var(--erp-bg)] transition-colors">
            <ChevronLeft size={18} className="text-[var(--erp-text-secondary)]" />
          </button>
          <h3 className="text-[var(--fs-base)] font-bold text-[var(--erp-text)]">
            {year}년 {month}월
          </h3>
          <button onClick={nextMonth} className="p-1.5 rounded-md active:bg-[var(--erp-bg)] transition-colors">
            <ChevronRight size={18} className="text-[var(--erp-text-secondary)]" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={cn(
                "text-center text-[var(--fs-caption)] font-medium py-1",
                i === 0 ? "text-[var(--erp-error)]" : i === 6 ? "text-[var(--erp-primary)]" : "text-[var(--erp-text-muted)]",
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-md bg-[var(--erp-border-light)] animate-pulse" />
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
                    isToday && "ring-1.5 ring-[var(--erp-primary)]",
                    statusCfg?.bg,
                  )}
                >
                  <span
                    className={cn(
                      "font-medium",
                      statusCfg ? statusCfg.color : "text-[var(--erp-text-secondary)]",
                      isToday && !statusCfg && "text-[var(--erp-primary)] font-bold",
                    )}
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

      {/* ═══ Stats ═══ */}
      {stats && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-surface)] p-[var(--sp-3)]">
          <div className="flex items-center justify-between mb-[var(--sp-2)]">
            <h3 className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)]">출석 현황</h3>
            <span className="text-[var(--fs-xl)] font-black text-[var(--erp-primary)]">
              {stats.rate}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "출석", value: stats.present, color: "text-[var(--erp-success)]" },
              { label: "지각", value: stats.late, color: "text-[var(--erp-warning)]" },
              { label: "결석", value: stats.absent, color: "text-[var(--erp-error)]" },
              { label: "조퇴", value: stats.earlyLeave, color: "text-[var(--learn-xp)]" },
            ].map((item) => (
              <div key={item.label} className="text-center py-2 rounded-[var(--radius-sm)] bg-[var(--erp-bg)]">
                <p className={cn("text-[var(--fs-lg)] font-bold", item.color)}>{item.value}</p>
                <p className="text-[var(--fs-caption)] text-[var(--erp-text-muted)]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
