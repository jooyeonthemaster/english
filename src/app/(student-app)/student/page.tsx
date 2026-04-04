"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Pin,
  CheckCircle2,
  RotateCcw,
  BookOpenCheck,
  ClipboardList,
  FolderOpen,
  BarChart3,
  Trophy,
  Flame,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboard } from "@/hooks/use-student-data";
import {
  DAY_MAP,
  getTodayDayIndex,
  type ScheduleSlot,
} from "./_constants/home-constants";
import HomeSkeleton from "./_components/home-skeleton";

// ---------------------------------------------------------------------------
// Quick menu items (고정)
// ---------------------------------------------------------------------------
const QUICK_MENUS = [
  { id: "attendance", label: "출석", icon: CheckCircle2, href: "/student/attendance" },
  { id: "review", label: "오답복습", icon: RotateCcw, href: "/student/learn/analytics" },
  { id: "homework", label: "숙제", icon: ClipboardList, href: "/student/resources?tab=assignments" },
  { id: "resources", label: "자료실", icon: FolderOpen, href: "/student/resources" },
  { id: "grades", label: "성적", icon: BarChart3, href: "/student/mypage?tab=grades" },
  { id: "ranking", label: "랭킹", icon: Trophy, href: "/student/learn/ranking" },
  { id: "analytics", label: "학습분석", icon: TrendingUp, href: "/student/learn/analytics" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function StudentHomePage() {
  const { data, isLoading } = useDashboard();

  if (isLoading && !data) return <HomeSkeleton />;
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-base text-gray-400">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { student, stats, upcomingExams, pendingAssignments, xp, recentNotices } = data;
  const todayIdx = getTodayDayIndex();

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

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* ── 퀵메뉴 (가로 스크롤) ── */}
      <div className="overflow-x-auto hide-scrollbar px-5">
        <div className="flex gap-4 w-max">
          {QUICK_MENUS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex flex-col items-center gap-1.5 min-w-[60px] active:scale-95 transition-transform"
              >
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center ">
                  <Icon className="w-5 h-5 text-black" strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-black">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── XP 카드 (Google One Storage 스타일) ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-5"
      >
        <div className="rounded-3xl bg-white p-6">
          <p className="text-sm font-medium text-black mb-1">이번 주 XP</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black tracking-tight" style={{ color: "var(--key-color)" }}>
              {xp.weekly.toLocaleString()}
            </span>
            <span className="text-lg font-bold text-black">XP</span>
          </div>
          <p className="text-sm text-black mt-1">누적 {xp.total.toLocaleString()} XP</p>

          {/* 스트릭 + 학습 상태 */}
          <div className="flex items-center gap-3 mt-4">
            {stats.streak > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
              >
                <Flame className="w-4 h-4" style={{ color: "var(--key-color)" }} />
                <span className="text-xs font-bold text-black">{stats.streak}일 연속</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full">
              <TrendingUp className="w-4 h-4 text-black" />
              <span className="text-xs font-bold text-black">
                {stats.weekStudyDays > 0 ? "오늘 학습 완료" : "오늘 미학습"}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 수업 일정 (15일 가로 스크롤, 오늘 중앙) ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mx-5"
      >
        <div className="rounded-3xl bg-white p-5">
          <h3 className="text-lg font-bold text-black mb-4">수업 일정</h3>
          <ScheduleStrip
            weekGrid={weekGrid}
            exams={upcomingExams}
            assignments={pendingAssignments}
          />
        </div>
      </motion.div>

      {/* ── 공지사항 ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mx-5"
      >
        <div className="rounded-3xl bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-black">공지사항</h3>
            <Link
              href="/student/resources?tab=notices"
              className="text-xs font-semibold"
              style={{ color: "var(--key-color)" }}
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
                  className="flex items-center gap-3 py-2.5 rounded-xl -mx-2 px-2 active:bg-gray-50 transition-colors"
                >
                  {notice.isPinned && (
                    <Pin className="w-3.5 h-3.5 text-black shrink-0" />
                  )}
                  <span className="text-sm text-black truncate flex-1 font-medium">
                    {notice.title}
                  </span>
                  <span className="text-xs text-black shrink-0">
                    {new Date(notice.publishAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              새로운 공지사항이 없습니다
            </p>
          )}
        </div>
      </motion.div>

      {/* ── 숙제 ── */}
      {pendingAssignments.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mx-5"
        >
          <div className="rounded-3xl bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-black">숙제</h3>
              <Link
                href="/student/resources?tab=assignments"
                className="text-xs font-semibold"
                style={{ color: "var(--key-color)" }}
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
                        "text-xs font-black px-2.5 py-1 rounded-lg shrink-0",
                        daysLeft <= 1
                          ? "bg-gray-900 text-white"
                          : daysLeft <= 3
                            ? "bg-gray-200 text-black"
                            : "bg-gray-100 text-black",
                      )}
                    >
                      {daysLeft <= 0 ? "오늘" : `D-${daysLeft}`}
                    </span>
                    <span className="text-sm text-black truncate flex-1 font-medium">{a.title}</span>
                    <span className="text-xs text-black shrink-0">
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

// ---------------------------------------------------------------------------
// ScheduleStrip — 오늘 중심 15일 가로 스크롤
// ---------------------------------------------------------------------------
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

interface ScheduleStripProps {
  weekGrid: ScheduleSlot[][];
  exams: { id: string; title: string; examDate: string | null }[];
  assignments: { id: string; title: string; dueDate: string }[];
}

function ScheduleStrip({ weekGrid, exams, assignments }: ScheduleStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  // 오늘 기준 -7일 ~ +7일 = 15일 생성
  const days = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + (i - 7));
    return d;
  });

  // 날짜별 시험/숙제 매핑
  const examsByDate = new Map<string, string[]>();
  for (const exam of exams) {
    if (!exam.examDate) continue;
    const key = exam.examDate.split("T")[0];
    const arr = examsByDate.get(key) ?? [];
    arr.push(exam.title);
    examsByDate.set(key, arr);
  }

  const assignmentsByDate = new Map<string, string[]>();
  for (const a of assignments) {
    const key = a.dueDate.split("T")[0];
    const arr = assignmentsByDate.get(key) ?? [];
    arr.push(a.title);
    assignmentsByDate.set(key, arr);
  }

  // 마운트 시 오늘(인덱스 7)을 중앙으로 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      const cardWidth = 80 + 8;
      const containerWidth = scrollRef.current.offsetWidth;
      const scrollTo = (7 * cardWidth) - (containerWidth / 2) + (cardWidth / 2);
      scrollRef.current.scrollLeft = Math.max(0, scrollTo);
    }
  }, []);

  return (
    <div ref={scrollRef} className="overflow-x-auto hide-scrollbar -mx-1">
      <div className="flex gap-2 w-max px-1">
        {days.map((date, i) => {
          const isToday = i === 7;
          const jsDay = date.getDay();
          const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
          const slots = weekGrid[dayIdx] ?? [];
          const dayNum = date.getDate();
          const dayName = DAY_NAMES[jsDay];

          const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
          const dayExams = examsByDate.get(dateKey) ?? [];
          const dayAssignments = assignmentsByDate.get(dateKey) ?? [];
          const hasContent = slots.length > 0 || dayExams.length > 0 || dayAssignments.length > 0;

          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center rounded-2xl p-3 min-w-[80px] transition-all",
                isToday ? "border-2" : "border border-gray-100",
              )}
              style={isToday ? { borderColor: "var(--key-color)" } : undefined}
            >
              <span
                className={cn("text-xs font-medium", !isToday && "text-gray-400")}
                style={isToday ? { color: "var(--key-color)" } : undefined}
              >
                {dayName}
              </span>
              <span
                className={cn("text-xl font-bold", !isToday && "text-black")}
                style={isToday ? { color: "var(--key-color)" } : undefined}
              >
                {dayNum}
              </span>

              {hasContent ? (
                <div className="flex flex-col gap-1 mt-1.5 w-full">
                  {/* 수업 */}
                  {slots.map((cls, ci) => (
                    <div key={`c${ci}`} className="text-center">
                      <p className="text-xs font-medium text-black leading-tight">{cls.startTime}</p>
                      <p className="text-xs text-gray-400 leading-tight">{cls.endTime}</p>
                    </div>
                  ))}
                  {/* 시험 */}
                  {dayExams.map((title, ei) => (
                    <div key={`e${ei}`} className="text-center mt-0.5">
                      <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                        시험
                      </span>
                    </div>
                  ))}
                  {/* 숙제 마감 */}
                  {dayAssignments.map((title, ai) => (
                    <div key={`a${ai}`} className="text-center mt-0.5">
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        마감
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-gray-300 mt-2">없음</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
