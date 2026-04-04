"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, QrCode } from "lucide-react";
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
};

type AttendanceStats = {
  total: number;
  present: number;
  late: number;
  absent: number;
  earlyLeave: number;
  rate: number;
};

const STATUS_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-100",
  LATE: "bg-amber-100",
  ABSENT: "bg-red-100",
  EARLY_LEAVE: "bg-orange-100",
  MAKEUP: "bg-sky-100",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AttendanceTab() {
  const now = new Date();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [todayStatus, setTodayStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getStudentAttendanceHistory(now.getFullYear(), now.getMonth() + 1);
      setRecords(data.records);
      setStats(data.stats);
      const todayStr = new Date().toISOString().split("T")[0];
      const todayRecord = data.records.find((r) => r.date === todayStr);
      setTodayStatus(todayRecord?.status ?? null);
    } catch {
      setRecords([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const result = await studentCheckIn();
      if (!result.alreadyCheckedIn) {
        setTodayStatus("PRESENT");
        fetchData();
      }
    } catch { /* noop */ }
    finally { setCheckingIn(false); }
  }

  // Calendar grid
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const recordMap = new Map(records.map((r) => [r.date, r]));
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* 출석률 */}
      {stats && (
        <div className="rounded-3xl bg-white p-6">
          <p className="text-sm font-medium text-black mb-1">이번 달 출석률</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black tracking-tight" style={{ color: "var(--key-color)" }}>
              {stats.rate}
            </span>
            <span className="text-lg font-bold text-black">%</span>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4">
            {[
              { label: "출석", value: stats.present, color: "text-emerald-500" },
              { label: "지각", value: stats.late, color: "text-amber-500" },
              { label: "결석", value: stats.absent, color: "text-red-500" },
              { label: "조퇴", value: stats.earlyLeave, color: "text-orange-500" },
            ].map((item) => (
              <div key={item.label} className="text-center py-2 rounded-xl bg-gray-50">
                <p className={cn("text-lg font-bold", item.color)}>{item.value}</p>
                <p className="text-xs text-gray-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 미니 캘린더 */}
      {!loading && (
        <div className="rounded-3xl bg-white p-5">
          <h3 className="text-sm font-bold text-black mb-3">{month}월</h3>
          <div className="grid grid-cols-7 gap-0.5">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const record = recordMap.get(dateStr);
              const isToday = dateStr === todayStr;
              const statusBg = record ? STATUS_COLORS[record.status] ?? "" : "";

              return (
                <div
                  key={day}
                  className={cn(
                    "aspect-square flex items-center justify-center rounded-md text-xs font-medium",
                    statusBg,
                    !record && !isToday && "text-black",
                  )}
                  style={isToday && !record ? { outline: "1.5px solid var(--key-color)", color: "var(--key-color)", fontWeight: 700 } : undefined}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 체크인 */}
      {!todayStatus && (
        <button
          onClick={handleCheckIn}
          disabled={checkingIn}
          className="w-full flex items-center justify-center gap-2 rounded-3xl bg-white p-4 text-sm font-semibold active:scale-[0.98] transition-all"
          style={{ color: "var(--key-color)" }}
        >
          <QrCode className="w-5 h-5" />
          {checkingIn ? "처리 중..." : "출석 체크인"}
        </button>
      )}
    </motion.div>
  );
}
