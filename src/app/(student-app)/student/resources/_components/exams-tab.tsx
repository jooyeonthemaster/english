"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, Award, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentExamResults } from "@/actions/student-app-resources";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type UpcomingExam = {
  id: string;
  title: string;
  type: string;
  examDate: string | null;
};

type GradedExam = {
  id: string;
  examId: string;
  title: string;
  type: string;
  score: number;
  maxScore: number;
  percent: number;
  gradedAt: string | null;
  examDate: string | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ExamsTab() {
  const [upcoming, setUpcoming] = useState<UpcomingExam[]>([]);
  const [graded, setGraded] = useState<GradedExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "graded">("upcoming");

  useEffect(() => {
    getStudentExamResults()
      .then((d) => {
        setUpcoming(d.upcoming);
        setGraded(d.graded);
        // 예정 시험 없고 채점 결과만 있으면 자동 전환
        if (d.upcoming.length === 0 && d.graded.length > 0) setTab("graded");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 bg-gray-100 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  const isEmpty = upcoming.length === 0 && graded.length === 0;
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Calendar size={32} className="mb-2" />
        <p className="text-[var(--fs-base)]">시험 내역이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 탭 전환 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("upcoming")}
          className={cn(
            "flex-1 py-2 rounded-2xl text-[var(--fs-sm)] font-medium transition-colors",
            tab === "upcoming"
              ? "bg-[var(--key-color)] text-white"
              : "bg-gray-100 text-gray-500"
          )}
        >
          예정 ({upcoming.length})
        </button>
        <button
          onClick={() => setTab("graded")}
          className={cn(
            "flex-1 py-2 rounded-2xl text-[var(--fs-sm)] font-medium transition-colors",
            tab === "graded"
              ? "bg-[var(--key-color)] text-white"
              : "bg-gray-100 text-gray-500"
          )}
        >
          결과 ({graded.length})
        </button>
      </div>

      {/* 예정된 시험 */}
      {tab === "upcoming" && (
        <div className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-[var(--fs-sm)]">
              예정된 시험이 없습니다
            </p>
          ) : (
            upcoming.map((exam, i) => (
              <UpcomingCard key={exam.id} exam={exam} index={i} />
            ))
          )}
        </div>
      )}

      {/* 채점 결과 */}
      {tab === "graded" && (
        <div className="space-y-2">
          {graded.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-[var(--fs-sm)]">
              채점된 시험이 없습니다
            </p>
          ) : (
            graded.map((exam, i) => (
              <GradedCard key={exam.id} exam={exam} index={i} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UpcomingCard({ exam, index }: { exam: UpcomingExam; index: number }) {
  const dDay = exam.examDate
    ? Math.ceil(
        (new Date(exam.examDate).getTime() - Date.now()) / 86400000
      )
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-3xl bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[var(--fs-base)] font-semibold text-black truncate">
            {exam.title}
          </p>
          {exam.examDate && (
            <div className="flex items-center gap-1 mt-1">
              <Clock size={12} className="text-gray-400" />
              <p className="text-[var(--fs-caption)] text-gray-500">
                {new Date(exam.examDate).toLocaleDateString("ko-KR", {
                  month: "long",
                  day: "numeric",
                  weekday: "short",
                })}
              </p>
            </div>
          )}
        </div>
        {dDay !== null && (
          <span
            className={cn(
              "text-[var(--fs-xs)] font-bold px-2 py-1 rounded-xl",
              dDay <= 3
                ? "bg-red-50 text-red-500"
                : dDay <= 7
                  ? "bg-amber-50 text-amber-500"
                  : "bg-gray-100 text-gray-500"
            )}
          >
            {dDay === 0
              ? "D-Day"
              : dDay > 0
                ? `D-${dDay}`
                : `D+${Math.abs(dDay)}`}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function GradedCard({ exam, index }: { exam: GradedExam; index: number }) {
  const pct = Math.round(exam.percent);
  const color =
    pct >= 90
      ? "text-emerald-600 bg-emerald-50"
      : pct >= 70
        ? "text-amber-600 bg-amber-50"
        : "text-red-600 bg-red-50";
  const barColor =
    pct >= 90 ? "bg-emerald-400" : pct >= 70 ? "bg-amber-400" : "bg-red-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-3xl bg-white p-5"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[var(--fs-base)] font-semibold text-black truncate">
            {exam.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {exam.examDate && (
              <span className="text-[var(--fs-caption)] text-gray-400">
                {new Date(exam.examDate).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            <span className="text-[var(--fs-caption)] text-gray-300">|</span>
            <span className="text-[var(--fs-caption)] text-gray-500">
              {exam.score}/{exam.maxScore}점
            </span>
          </div>
        </div>
        <span
          className={cn(
            "text-[var(--fs-sm)] font-bold px-3 py-1 rounded-xl",
            color
          )}
        >
          {pct}점
        </span>
      </div>
      {/* 점수 바 */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: index * 0.04 + 0.2, duration: 0.5 }}
          className={cn("h-full rounded-full", barColor)}
        />
      </div>
    </motion.div>
  );
}
