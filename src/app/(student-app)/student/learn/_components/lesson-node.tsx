"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Crown, BookOpen, Languages, Brain, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LessonItem } from "@/lib/learning-types";
import { SESSIONS_PER_CATEGORY } from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// 카테고리 설정
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { key: "VOCAB" as const, label: "어휘", color: "emerald", Icon: Languages },
  { key: "INTERPRETATION" as const, label: "해석", color: "blue", Icon: BookOpen },
  { key: "GRAMMAR" as const, label: "문법", color: "purple", Icon: Brain },
  { key: "COMPREHENSION" as const, label: "이해", color: "amber", Icon: Target },
] as const;

const COLOR_MAP: Record<string, { bar: string; barBg: string; text: string }> = {
  emerald: { bar: "bg-emerald-500", barBg: "bg-emerald-100", text: "text-emerald-600" },
  blue: { bar: "bg-blue-500", barBg: "bg-blue-100", text: "text-blue-600" },
  purple: { bar: "bg-purple-500", barBg: "bg-purple-100", text: "text-purple-600" },
  amber: { bar: "bg-amber-500", barBg: "bg-amber-100", text: "text-amber-600" },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LessonNodeProps {
  lesson: LessonItem;
  index: number;
  seasonId: string;
}

// ---------------------------------------------------------------------------
// Component: 지문 카드 (카테고리별 프로그레스)
// ---------------------------------------------------------------------------
export function LessonNode({ lesson, index, seasonId }: LessonNodeProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/student/learn/${lesson.passageId}?seasonId=${seasonId}`);
  };

  return (
    <motion.button
      onClick={handleClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "w-full rounded-3xl border p-5 text-left transition-all active:scale-[0.98]",
        "bg-white border-gray-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[var(--fs-base)] font-semibold text-black truncate flex-1 mr-2">
          {lesson.passageTitle}
        </h3>
        <div className="flex items-center gap-1.5">
          {lesson.masteryPassed && (
            <Crown className="size-4 text-black" />
          )}
          <span className="text-[var(--fs-xs)] text-black">
            {lesson.totalSessionsDone}/21
          </span>
        </div>
      </div>

      {/* Category progress bars */}
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map(({ key, label, color, Icon }) => {
          const done = lesson.categoryProgress[key];
          const pct = (done / SESSIONS_PER_CATEGORY) * 100;
          const colors = COLOR_MAP[color];

          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <Icon className={cn("size-3.5", done > 0 ? colors.text : "text-gray-300")} />
              <div className={cn("w-full h-1.5 rounded-full", colors.barBg)}>
                <div
                  className={cn("h-full rounded-full transition-all", colors.bar)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{done}/{SESSIONS_PER_CATEGORY}</span>
            </div>
          );
        })}
      </div>

      {/* Mastery status */}
      {lesson.masteryUnlocked && !lesson.masteryPassed && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1.5">
          <Crown className="size-3.5 text-black" />
          <span className="text-[var(--fs-xs)] text-black font-medium">
            마스터리 도전 가능
          </span>
        </div>
      )}
    </motion.button>
  );
}
