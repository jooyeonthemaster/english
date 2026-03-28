"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Lock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { LessonItem } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LessonNodeProps {
  lesson: LessonItem;
  index: number;
  seasonId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LessonNode({ lesson, index, seasonId }: LessonNodeProps) {
  const router = useRouter();
  const { crownLevel, isLocked, isCurrent, passageTitle, passageId } = lesson;

  const completedSessions = [
    lesson.session1Done,
    lesson.session2Done,
    lesson.storiesDone,
    lesson.session3Done,
    lesson.session4Done,
    lesson.session5Done,
  ].filter(Boolean).length;

  function handleClick() {
    if (isLocked) {
      toast("이전 레슨을 먼저 완료하세요!", { icon: "🔒" });
      return;
    }
    router.push(`/student/learn/${passageId}`);
  }

  // Node style by crown level
  const nodeStyle = {
    0: {
      bg: "bg-[var(--student-locked)]",
      text: "text-gray-400",
      ring: "",
      icon: <Lock className="size-[var(--icon-md)] text-gray-400" />,
    },
    1: {
      bg: "bg-[var(--student-primary)]",
      text: "text-white",
      ring: "ring-4 ring-[var(--student-primary)]/20",
      icon: <Star className="size-[var(--icon-md)] text-white" />,
    },
    2: {
      bg: "bg-[var(--student-primary)]",
      text: "text-white",
      ring: "",
      icon: (
        <span className="text-[var(--text-sm)] font-bold text-white">
          {completedSessions}/6
        </span>
      ),
    },
    3: {
      bg: "bg-[var(--student-success)]",
      text: "text-white",
      ring: "ring-4 ring-[var(--student-success)]/20",
      icon: <Check className="size-[var(--icon-md)] text-white" strokeWidth={3} />,
    },
  }[crownLevel];

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 200, damping: 20 }}
    >
      {/* Node circle */}
      <button
        onClick={handleClick}
        disabled={false}
        className={cn(
          "relative size-[var(--node-size)] rounded-full flex items-center justify-center transition-all duration-200",
          nodeStyle.bg,
          nodeStyle.ring,
          isLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-95",
          isCurrent && "animate-pulse-ring",
        )}
        aria-label={isLocked ? `${passageTitle} (잠김)` : passageTitle}
      >
        {nodeStyle.icon}

        {/* Crown badge for mastered */}
        {crownLevel === 3 && (
          <span className="absolute -top-1 -right-1 text-[var(--text-sm)]">👑</span>
        )}
      </button>

      {/* Label */}
      <span
        className={cn(
          "text-[var(--text-2xs)] font-medium text-center max-w-[5rem] truncate leading-tight",
          isLocked ? "text-gray-300" : "text-gray-600",
        )}
      >
        {passageTitle}
      </span>

      {/* Session dots for in-progress */}
      {crownLevel === 2 && (
        <div className="flex items-center gap-1">
          {[
            lesson.session1Done,
            lesson.session2Done,
            lesson.storiesDone,
            lesson.session3Done,
            lesson.session4Done,
            lesson.session5Done,
          ].map((done, di) => (
            <div
              key={di}
              className={cn(
                "size-1.5 rounded-full",
                done ? "bg-[var(--student-success)]" : "bg-gray-200",
              )}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
