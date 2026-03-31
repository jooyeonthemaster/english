"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentDashboard } from "@/actions/student-app";

type ExamItem = {
  id: string;
  title: string;
  type: string;
  examDate: string | null;
};

export function ExamsTab() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentDashboard()
      .then((d) => setExams(d.upcomingExams))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (exams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Calendar size={32} className="mb-2" />
        <p className="text-[var(--fs-base)]">예정된 시험이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {exams.map((exam, i) => {
        const dDay = exam.examDate
          ? Math.ceil((new Date(exam.examDate).getTime() - Date.now()) / 86400000)
          : null;

        return (
          <motion.div
            key={exam.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-3xl bg-white shadow-card p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[var(--fs-base)] font-semibold text-gray-900 truncate">
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
                        : "bg-gray-100 text-gray-500",
                  )}
                >
                  {dDay === 0 ? "D-Day" : dDay > 0 ? `D-${dDay}` : `D+${Math.abs(dDay)}`}
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
