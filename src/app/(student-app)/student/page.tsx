"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  ClipboardCheck,
  FileX2,
  BarChart3,
  Flame,
  Calendar,
  ChevronRight,
  Zap,
  Trophy,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentDashboard } from "@/actions/student-app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DashboardData {
  student: {
    name: string;
    grade: number;
    level: number;
    xp: number;
    xpForNextLevel: number;
    streak: number;
    schoolName: string | null;
  };
  stats: {
    streak: number;
    weekStudyDays: number;
    weekVocabTests: number;
  };
  upcomingExams: {
    id: string;
    title: string;
    type: string;
    examDate: string | null;
  }[];
  pendingAssignments: {
    id: string;
    title: string;
    dueDate: string;
  }[];
  recentActivity: {
    id: string;
    type: "VOCAB_TEST";
    title: string;
    score: number;
    total: number;
    percent: number;
    date: string;
    scoreColor: string;
  }[];
}

// ---------------------------------------------------------------------------
// Quick Action Cards
// ---------------------------------------------------------------------------
const quickActions = [
  {
    label: "단어 시험",
    href: "/student/vocab",
    icon: BookOpen,
    color: "bg-blue-500",
    lightColor: "bg-blue-50",
    textColor: "text-blue-600",
  },
  {
    label: "시험 보기",
    href: "/student/exams",
    icon: ClipboardCheck,
    color: "bg-emerald-500",
    lightColor: "bg-emerald-50",
    textColor: "text-emerald-600",
  },
  {
    label: "오답 노트",
    href: "/student/wrong-answers",
    icon: FileX2,
    color: "bg-amber-500",
    lightColor: "bg-amber-50",
    textColor: "text-amber-600",
  },
  {
    label: "내 성적",
    href: "/student/mypage",
    icon: BarChart3,
    color: "bg-purple-500",
    lightColor: "bg-purple-50",
    textColor: "text-purple-600",
  },
];

// ---------------------------------------------------------------------------
// Level title mapping
// ---------------------------------------------------------------------------
function getLevelTitle(level: number): string {
  if (level >= 30) return "Master";
  if (level >= 20) return "Advanced";
  if (level >= 15) return "Intermediate";
  if (level >= 10) return "Pre-Intermediate";
  if (level >= 5) return "Elementary";
  return "Beginner";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function StudentHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <StudentHomeSkeleton />;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-gray-400">데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  const { student, stats, upcomingExams, pendingAssignments, recentActivity } = data;
  const xpPercent = Math.min(100, (student.xp / student.xpForNextLevel) * 100);

  return (
    <div className="px-5 pt-6 pb-4 space-y-6">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              안녕하세요, {student.name}님!
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {student.schoolName
                ? `${student.schoolName} ${student.grade}학년`
                : `${student.grade}학년`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 rounded-full">
              <Zap className="size-3.5 text-blue-500" />
              <span className="text-xs font-bold text-blue-600">
                Lv.{student.level}
              </span>
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-gray-400 font-medium">
              {getLevelTitle(student.level)}
            </span>
            <span className="text-[11px] text-gray-400">
              {student.xp}/{student.xpForNextLevel} XP
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${xpPercent}%` }}
              transition={{ duration: 0.8, delay: 0.2 }}
            />
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="grid grid-cols-2 gap-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl p-4 border border-orange-100/50">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="size-4 text-orange-500" />
            <span className="text-xs font-medium text-orange-600">연속 출석</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats.streak}
            <span className="text-sm font-normal text-gray-500 ml-1">일</span>
          </p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100/50">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="size-4 text-blue-500" />
            <span className="text-xs font-medium text-blue-600">이번 주 학습</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats.weekVocabTests}
            <span className="text-sm font-normal text-gray-500 ml-1">회</span>
          </p>
        </div>
      </motion.div>

      {/* Today's Tasks */}
      {(upcomingExams.length > 0 || pendingAssignments.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            할 일
          </h2>
          <div className="space-y-2">
            {upcomingExams.map((exam) => (
              <Link
                key={exam.id}
                href={`/student/exams/${exam.id}`}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-card press-scale"
              >
                <div className="size-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <ClipboardCheck className="size-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {exam.title}
                  </p>
                  {exam.examDate && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(exam.examDate).toLocaleDateString("ko-KR")}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 text-gray-300" />
              </Link>
            ))}
            {pendingAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-card"
              >
                <div className="size-9 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="size-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {assignment.title}
                  </p>
                  <p className="text-xs text-amber-500 mt-0.5">
                    마감: {new Date(assignment.dueDate).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <h2 className="text-sm font-semibold text-gray-700 mb-3">바로가기</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-card press-scale transition-shadow hover:shadow-card-hover"
              >
                <div
                  className={cn(
                    "size-10 rounded-xl flex items-center justify-center",
                    action.lightColor
                  )}
                >
                  <Icon className={cn("size-5", action.textColor)} />
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  {action.label}
                </span>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <h2 className="text-sm font-semibold text-gray-700 mb-3">최근 활동</h2>
          <div className="space-y-2">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100"
              >
                <div className="size-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Trophy className="size-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {activity.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(activity.date).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      activity.scoreColor === "emerald" && "text-emerald-500",
                      activity.scoreColor === "blue" && "text-blue-500",
                      activity.scoreColor === "amber" && "text-amber-500",
                      activity.scoreColor === "red" && "text-red-500"
                    )}
                  >
                    {activity.score}/{activity.total}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {Math.round(activity.percent)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function StudentHomeSkeleton() {
  return (
    <div className="px-5 pt-6 pb-4 space-y-6 animate-pulse">
      <div>
        <div className="h-6 w-48 bg-gray-100 rounded" />
        <div className="h-4 w-32 bg-gray-100 rounded mt-2" />
        <div className="h-2 w-full bg-gray-100 rounded-full mt-4" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="h-24 bg-gray-100 rounded-2xl" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
