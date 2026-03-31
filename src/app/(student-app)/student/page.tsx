"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FileText, ClipboardList, Pin, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentDashboard } from "@/actions/student-app";
import {
  QUICK_MENU_OPTIONS,
  DAY_MAP,
  getShortcuts,
  getTodayDayIndex,
  type QuickMenuItem,
  type ScheduleSlot,
} from "./_constants/home-constants";
import HomeSkeleton from "./_components/home-skeleton";
import ScoreRankingSection from "./_components/score-ranking-section";
import ScheduleSection from "./_components/schedule-section";
import QuickMenuSection from "./_components/quick-menu-section";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DashboardData = Awaited<ReturnType<typeof getStudentDashboard>>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function StudentHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [shortcuts] = useState(getShortcuts);

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <HomeSkeleton />;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-[var(--fs-base)] text-gray-400">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { student, stats, upcomingExams, pendingAssignments, xp, recentNotices, ranking } = data;
  const todayIdx = getTodayDayIndex();

  const quickMenuItems = shortcuts
    .map((id) => QUICK_MENU_OPTIONS.find((o) => o.id === id))
    .filter(Boolean) as QuickMenuItem[];

  // Build weekly schedule
  const weekGrid: ScheduleSlot[][] = Array.from({ length: 6 }, () => []);
  const hasAnyClass = student.enrolledClasses && student.enrolledClasses.length > 0;
  if (student.enrolledClasses) {
    student.enrolledClasses.forEach((cls, ci) => {
      for (const slot of cls.schedule) {
        const dayIdx = DAY_MAP[slot.day.toUpperCase()];
        if (dayIdx !== undefined && dayIdx < 6) {
          weekGrid[dayIdx].push({
            className: cls.name,
            startTime: slot.startTime,
            endTime: slot.endTime,
            colorIdx: ci,
          });
        }
      }
    });
  }
  const todayClasses = weekGrid[todayIdx] ?? [];

  return (
    <div className="flex flex-col gap-4 px-5 pt-3 pb-8">
      {/* Section 1: 학습 점수 + 랭킹 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <ScoreRankingSection xp={xp} stats={stats} ranking={ranking} />
      </motion.div>

      {/* Section 2: 바로가기 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
      >
        <QuickMenuSection items={quickMenuItems} />
      </motion.div>

      {/* Section 3: 수업 일정 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.16 }}
      >
        <ScheduleSection
          weekGrid={weekGrid}
          todayIdx={todayIdx}
          todayClasses={todayClasses}
          hasAnyClass={!!hasAnyClass}
          upcomingExams={upcomingExams}
          pendingAssignments={pendingAssignments}
        />
      </motion.div>

      {/* Section 4: 공지사항 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.24 }}
      >
        <div className="rounded-3xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[var(--fs-lg)] font-bold text-gray-900">공지사항</h3>
            <Link
              href="/student/resources?tab=notices"
              className="text-[var(--fs-xs)] text-blue-500 font-semibold"
            >
              전체보기
            </Link>
          </div>
          {recentNotices.length > 0 ? (
            <div className="space-y-1">
              {recentNotices.map((notice) => (
                <Link
                  key={notice.id}
                  href={`/student/resources?tab=notices&id=${notice.id}`}
                  className="flex items-center gap-3 py-2.5 group rounded-xl -mx-2 px-2 active:bg-gray-50 transition-colors"
                >
                  {notice.isPinned && (
                    <Pin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className="text-[var(--fs-base)] text-gray-700 truncate flex-1 font-medium">
                    {notice.title}
                  </span>
                  <span className="text-[var(--fs-xs)] text-gray-500 shrink-0">
                    {new Date(notice.publishAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[var(--fs-base)] text-gray-400 text-center py-4">
              새로운 공지사항이 없습니다
            </p>
          )}
        </div>
      </motion.div>

      {/* Section 5: 숙제 */}
      {pendingAssignments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.32 }}
        >
          <div className="rounded-3xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[var(--fs-lg)] font-bold text-gray-900">숙제</h3>
              <Link
                href="/student/resources?tab=assignments"
                className="text-[var(--fs-xs)] text-blue-500 font-semibold"
              >
                전체보기
              </Link>
            </div>
            <div className="space-y-2">
              {pendingAssignments.map((a) => {
                const dueDate = new Date(a.dueDate);
                const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
                return (
                  <div key={a.id} className="flex items-center gap-3 py-2">
                    <span
                      className={cn(
                        "text-[var(--fs-xs)] font-black px-2.5 py-1 rounded-lg shrink-0",
                        daysLeft <= 1
                          ? "bg-red-50 text-red-500"
                          : daysLeft <= 3
                            ? "bg-amber-50 text-amber-500"
                            : "bg-blue-50 text-blue-500",
                      )}
                    >
                      {daysLeft <= 0 ? "오늘" : `D-${daysLeft}`}
                    </span>
                    <span className="text-[var(--fs-base)] text-gray-700 truncate flex-1 font-medium">{a.title}</span>
                    <span className="text-[var(--fs-xs)] text-gray-500 shrink-0">
                      {dueDate.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
