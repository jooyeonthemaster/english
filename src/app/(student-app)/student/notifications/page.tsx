"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Megaphone,
  ClipboardCheck,
  Clock,
  Flame,
  BookOpen,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNotificationsData } from "@/actions/student-app-resources";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type NotifCategory =
  | "notice"
  | "assignment"
  | "exam"
  | "attendance"
  | "study"
  | "streak"
  | "ranking";

interface NotifItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  time: string;
  category: NotifCategory;
  isRead?: boolean;
}

const CATEGORY_COLORS: Record<NotifCategory, string> = {
  notice: "bg-blue-500",
  assignment: "bg-amber-500",
  exam: "bg-emerald-500",
  attendance: "bg-sky-500",
  study: "bg-indigo-500",
  streak: "bg-orange-500",
  ranking: "bg-yellow-500",
};

const CATEGORY_LABELS: Record<NotifCategory, string> = {
  notice: "공지",
  assignment: "숙제",
  exam: "시험",
  attendance: "출석",
  study: "학습",
  streak: "스트릭",
  ranking: "랭킹",
};

type FilterKey = "all" | NotifCategory;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function NotificationsPage() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    getNotificationsData()
      .then(({ dashboard, notices, assignments }) => {
        const notifs: NotifItem[] = [];

        // -- 공지사항 --
        for (const n of notices.slice(0, 10)) {
          notifs.push({
            id: `notice-${n.id}`,
            icon: <Megaphone size={16} className="text-blue-500" />,
            title: n.isPinned ? `[공지] ${n.title}` : n.title,
            body: (n.content ?? "").slice(0, 60) + ((n.content?.length ?? 0) > 60 ? "..." : ""),
            time: relativeTime(n.publishedAt),
            category: "notice",
            isRead: n.isRead,
          });
        }

        // -- 숙제 마감 리마인더 --
        const pending = assignments.filter((a) => !a.submission);
        for (const a of pending) {
          const dDay = Math.ceil(
            (new Date(a.dueDate).getTime() - Date.now()) / 86400000,
          );
          if (dDay <= 3 && dDay >= 0) {
            notifs.push({
              id: `hw-${a.id}`,
              icon: <ClipboardCheck size={16} className="text-amber-500" />,
              title: `숙제 마감 ${dDay === 0 ? "오늘" : `D-${dDay}`}`,
              body: `${a.title} (${a.className})`,
              time: new Date(a.dueDate).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              }),
              category: "assignment",
            });
          }
        }

        // -- 시험 D-day --
        for (const exam of dashboard.upcomingExams) {
          if (!exam.examDate) continue;
          const dDay = Math.ceil(
            (new Date(exam.examDate).getTime() - Date.now()) / 86400000,
          );
          if (dDay <= 7 && dDay >= 0) {
            notifs.push({
              id: `exam-${exam.id}`,
              icon: <Clock size={16} className="text-emerald-500" />,
              title: `시험 ${dDay === 0 ? "D-Day" : `D-${dDay}`}`,
              body: exam.title,
              time: new Date(exam.examDate).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              }),
              category: "exam",
            });
          }
        }

        // -- 출석 --
        if (dashboard.todayAttendance) {
          notifs.push({
            id: "attendance-today",
            icon: <CheckCircle2 size={16} className="text-sky-500" />,
            title: "출석 확인",
            body: `오늘 ${dashboard.todayAttendance.checkIn ?? ""} 출석 완료`,
            time: "오늘",
            category: "attendance",
          });
        }

        // -- 학습 리마인더 --
        const todayDone = dashboard.weekCalendar.days[new Date().getDay()];
        if (!todayDone) {
          notifs.push({
            id: "study-reminder",
            icon: <BookOpen size={16} className="text-indigo-500" />,
            title: "오늘 학습 아직 안 했어요!",
            body: dashboard.todayLesson
              ? `"${dashboard.todayLesson.passageTitle}" 이어서 하기`
              : "3분이면 충분해요",
            time: "오늘",
            category: "study",
          });
        }

        // -- 스트릭 --
        const streak = dashboard.student.streak;
        if (streak > 0 && !todayDone) {
          notifs.push({
            id: "streak-warning",
            icon: <Flame size={16} className="text-orange-500" />,
            title: "스트릭이 끊길 수 있어요!",
            body: `${streak}일 연속 학습을 유지하려면 오늘도 공부하세요`,
            time: "오늘",
            category: "streak",
          });
        }
        if (
          streak > 0 &&
          (streak === 7 || streak === 14 || streak === 30 || streak === 100 || streak % 50 === 0)
        ) {
          notifs.push({
            id: "streak-milestone",
            icon: <Flame size={16} className="text-orange-500" />,
            title: `${streak}일 연속 학습 달성!`,
            body: "대단해요! 계속 이어가세요",
            time: "오늘",
            category: "streak",
          });
        }

        // -- 랭킹 --
        const myRank = dashboard.ranking.find((r) => r.isMe);
        if (myRank && myRank.rank <= 3) {
          notifs.push({
            id: "rank-up",
            icon: <Trophy size={16} className="text-yellow-500" />,
            title: `이번 주 랭킹 ${myRank.rank}위!`,
            body: `${myRank.xp} XP 달성`,
            time: "이번 주",
            category: "ranking",
          });
        }

        setItems(notifs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? items : items.filter((n) => n.category === filter);

  // Determine which filter buttons to show (only categories with items)
  const activeCategories = new Set(items.map((n) => n.category));
  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: "all", label: "전체" },
    ...Object.entries(CATEGORY_LABELS)
      .filter(([key]) => activeCategories.has(key as NotifCategory))
      .map(([key, label]) => ({ key: key as FilterKey, label })),
  ];

  if (loading) {
    return (
      <div className="px-5 pt-3 space-y-2 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-2">
        <Bell size={36} className="text-gray-200" />
        <p className="text-sm text-gray-400">
          새로운 알림이 없습니다
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-5 pt-3 pb-6 gap-4">
      {/* Filter chips */}
      <div className="flex gap-1.5 pb-3 overflow-x-auto hide-scrollbar">
        {filterButtons.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap active:scale-95",
              filter === f.key
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-400",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {filtered.map((n, i) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={cn(
              "flex items-start gap-3 p-3 rounded-2xl relative overflow-hidden",
              n.isRead === false
                ? "bg-blue-50"
                : "bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
            )}
          >
            {/* Category color bar */}
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0 w-1",
                CATEGORY_COLORS[n.category],
              )}
            />
            <div className="mt-0.5 ml-1">{n.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900">
                {n.title}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">
                {n.body}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-[10px] text-gray-400">
                {n.time}
              </span>
              {n.isRead === false && (
                <div className="w-2 h-2 rounded-full bg-blue-500" />
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}
