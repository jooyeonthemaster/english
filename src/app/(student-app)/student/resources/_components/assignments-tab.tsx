"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentAssignmentList } from "@/actions/student-app-resources";

type Assignment = Awaited<ReturnType<typeof getStudentAssignmentList>>[number];

type FilterStatus = "all" | "pending" | "submitted" | "graded";

const FILTERS: { key: FilterStatus; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pending", label: "미제출" },
  { key: "submitted", label: "제출완료" },
  { key: "graded", label: "채점완료" },
];

export function AssignmentsTab() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    getStudentAssignmentList()
      .then(setAssignments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = assignments.filter((a) => {
    if (filter === "all") return true;
    if (filter === "pending") return !a.submission;
    if (filter === "submitted") return a.submission?.status === "SUBMITTED";
    if (filter === "graded") return a.submission?.status === "GRADED";
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex gap-1.5 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-full text-[var(--fs-caption)] font-medium transition-colors",
              filter === f.key
                ? "bg-blue-500 text-white"
                : "bg-gray-50 text-gray-400",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Assignment list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-[var(--fs-base)]">
            {filter === "pending" ? "미제출 숙제가 없습니다" : "숙제가 없습니다"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a, i) => (
            <AssignmentCard key={a.id} assignment={a} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ assignment: a, index }: { assignment: Assignment; index: number }) {
  const dueDate = new Date(a.dueDate);
  const dDay = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
  const isPending = !a.submission;
  const isGraded = a.submission?.status === "GRADED";

  let statusIcon = <FileText size={16} className="text-gray-400" />;
  let statusLabel = "미정";
  let statusColor = "text-gray-400";

  if (isGraded) {
    statusIcon = <CheckCircle2 size={16} className="text-emerald-500" />;
    statusLabel = `${a.submission!.score ?? 0}/${a.maxScore}점`;
    statusColor = "text-emerald-500";
  } else if (a.submission) {
    statusIcon = <CheckCircle2 size={16} className="text-blue-500" />;
    statusLabel = "제출완료";
    statusColor = "text-blue-500";
  } else if (a.isOverdue) {
    statusIcon = <AlertTriangle size={16} className="text-red-500" />;
    statusLabel = "기한초과";
    statusColor = "text-red-500";
  } else {
    statusIcon = <Clock size={16} className="text-amber-500" />;
    statusLabel = dDay <= 0 ? "오늘 마감" : `D-${dDay}`;
    statusColor = dDay <= 1 ? "text-red-500" : "text-amber-500";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "rounded-2xl border bg-white p-3",
        isPending && !a.isOverdue ? "border-amber-500/30" : "border-gray-100",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[var(--fs-base)] font-semibold text-gray-900 truncate">
            {a.title}
          </p>
          <p className="text-[var(--fs-caption)] text-gray-500 mt-0.5">
            {a.className} · 마감 {dueDate.toLocaleDateString("ko-KR")}
          </p>
          {a.description && (
            <p className="text-[var(--fs-caption)] text-gray-500 mt-1 line-clamp-2">
              {a.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {statusIcon}
          <span className={cn("text-[var(--fs-caption)] font-semibold", statusColor)}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Feedback */}
      {a.submission?.feedback && (
        <div className="mt-2 px-2 py-1.5 rounded-xl bg-emerald-50">
          <p className="text-[var(--fs-caption)] text-emerald-500">
            강사 피드백: {a.submission.feedback}
          </p>
        </div>
      )}
    </motion.div>
  );
}
