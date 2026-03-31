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
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <BookOpen size={32} className="mb-2" />
        <p className="text-sm">수강 중인 반이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
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
        "rounded-2xl bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)]",
        muted && "opacity-60",
      )}
    >
      <p className="text-sm font-semibold text-gray-900">
        {e.className}
      </p>

      <div className="mt-1.5 space-y-1">
        {e.teacherName && (
          <div className="flex items-center gap-1.5">
            <User size={12} className="text-gray-400" />
            <span className="text-xs text-gray-500">
              {e.teacherName} 선생님
            </span>
          </div>
        )}
        {schedule && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-gray-400" />
            <span className="text-xs text-gray-500">
              {schedule}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-1.5">
        수강 시작: {new Date(e.enrolledAt).toLocaleDateString("ko-KR")}
        {e.status !== "ENROLLED" && (
          <span className="ml-2 text-amber-500">
            {e.status === "COMPLETED" ? "수료" : e.status === "DROPPED" ? "중단" : e.status}
          </span>
        )}
      </p>
    </motion.div>
  );
}
