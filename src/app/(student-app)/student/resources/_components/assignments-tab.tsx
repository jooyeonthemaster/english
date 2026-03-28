"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStudentAssignmentList } from "@/actions/student-app";

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
          <div key={i} className="h-20 bg-[var(--erp-border-light)] rounded-[var(--radius-md)] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-[var(--sp-2)]">
      {/* Filter chips */}
      <div className="flex gap-1.5 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-full text-[var(--fs-caption)] font-medium transition-colors",
              filter === f.key
                ? "bg-[var(--erp-primary)] text-white"
                : "bg-[var(--erp-bg)] text-[var(--erp-text-muted)]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Assignment list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--erp-text-muted)]">
          <p className="text-[var(--fs-sm)]">
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

  let statusIcon = <FileText size={16} className="text-[var(--erp-text-muted)]" />;
  let statusLabel = "미정";
  let statusColor = "text-[var(--erp-text-muted)]";

  if (isGraded) {
    statusIcon = <CheckCircle2 size={16} className="text-[var(--erp-success)]" />;
    statusLabel = `${a.submission!.score ?? 0}/${a.maxScore}점`;
    statusColor = "text-[var(--erp-success)]";
  } else if (a.submission) {
    statusIcon = <CheckCircle2 size={16} className="text-[var(--erp-primary)]" />;
    statusLabel = "제출완료";
    statusColor = "text-[var(--erp-primary)]";
  } else if (a.isOverdue) {
    statusIcon = <AlertTriangle size={16} className="text-[var(--erp-error)]" />;
    statusLabel = "기한초과";
    statusColor = "text-[var(--erp-error)]";
  } else {
    statusIcon = <Clock size={16} className="text-[var(--erp-warning)]" />;
    statusLabel = dDay <= 0 ? "오늘 마감" : `D-${dDay}`;
    statusColor = dDay <= 1 ? "text-[var(--erp-error)]" : "text-[var(--erp-warning)]";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--erp-surface)] p-3",
        isPending && !a.isOverdue ? "border-[var(--erp-warning)]/30" : "border-[var(--erp-border)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)] truncate">
            {a.title}
          </p>
          <p className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] mt-0.5">
            {a.className} · 마감 {dueDate.toLocaleDateString("ko-KR")}
          </p>
          {a.description && (
            <p className="text-[var(--fs-caption)] text-[var(--erp-text-secondary)] mt-1 line-clamp-2">
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
        <div className="mt-2 px-2 py-1.5 rounded-[var(--radius-sm)] bg-[var(--erp-success-subtle)]">
          <p className="text-[var(--fs-caption)] text-[var(--erp-success)]">
            강사 피드백: {a.submission.feedback}
          </p>
        </div>
      )}
    </motion.div>
  );
}
