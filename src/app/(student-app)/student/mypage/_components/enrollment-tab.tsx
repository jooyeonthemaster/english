"use client";

import { motion } from "framer-motion";
import { Clock, User, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Enrollment {
  id: string;
  classId: string;
  className: string;
  teacherName: string | null;
  schedule: unknown;
  status: string;
  enrolledAt: string;
}

interface EnrollmentTabProps {
  enrollments: Enrollment[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseSchedule(schedule: unknown): string {
  try {
    const s = typeof schedule === "string" ? JSON.parse(schedule) : schedule;
    if (Array.isArray(s)) {
      return s
        .map(
          (slot: { day?: string; startTime?: string; endTime?: string }) =>
            `${slot.day ?? ""} ${slot.startTime ?? ""}-${slot.endTime ?? ""}`.trim(),
        )
        .join(", ");
    }
  } catch {
    /* noop */
  }
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function EnrollmentTab({ enrollments }: EnrollmentTabProps) {
  const active = enrollments.filter((e) => e.status === "ENROLLED");
  const past = enrollments.filter((e) => e.status !== "ENROLLED");

  if (enrollments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[var(--erp-text-muted)]">
        <BookOpen size={32} className="mb-2" />
        <p className="text-[var(--fs-sm)]">수강 중인 반이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-[var(--sp-3)]">
      {/* 수강 중 */}
      {active.length > 0 && (
        <Section title="수강 중">
          {active.map((e, i) => (
            <EnrollmentCard key={e.id} enrollment={e} index={i} />
          ))}
        </Section>
      )}

      {/* 수강 이력 */}
      {past.length > 0 && (
        <Section title="수강 이력">
          {past.map((e, i) => (
            <EnrollmentCard key={e.id} enrollment={e} index={i} muted />
          ))}
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[var(--fs-xs)] font-semibold text-[var(--erp-text-secondary)] mb-[var(--sp-1)]">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EnrollmentCard({
  enrollment: e,
  index,
  muted,
}: {
  enrollment: Enrollment;
  index: number;
  muted?: boolean;
}) {
  const schedule = parseSchedule(e.schedule);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        "rounded-[var(--radius-md)] border bg-[var(--erp-surface)] p-3",
        muted ? "border-[var(--erp-border)] opacity-60" : "border-[var(--erp-border)]",
      )}
    >
      <p className="text-[var(--fs-sm)] font-semibold text-[var(--erp-text)]">
        {e.className}
      </p>

      <div className="mt-1.5 space-y-1">
        {e.teacherName && (
          <div className="flex items-center gap-1.5">
            <User size={12} className="text-[var(--erp-text-muted)]" />
            <span className="text-[var(--fs-caption)] text-[var(--erp-text-secondary)]">
              {e.teacherName} 선생님
            </span>
          </div>
        )}
        {schedule && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-[var(--erp-text-muted)]" />
            <span className="text-[var(--fs-caption)] text-[var(--erp-text-secondary)]">
              {schedule}
            </span>
          </div>
        )}
      </div>

      <p className="text-[var(--fs-caption)] text-[var(--erp-text-muted)] mt-1.5">
        수강 시작: {new Date(e.enrolledAt).toLocaleDateString("ko-KR")}
        {e.status !== "ENROLLED" && (
          <span className="ml-2 text-[var(--erp-warning)]">
            {e.status === "COMPLETED" ? "수료" : e.status === "DROPPED" ? "중단" : e.status}
          </span>
        )}
      </p>
    </motion.div>
  );
}
