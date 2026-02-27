"use client";

import { motion } from "framer-motion";
import { BookCheck, BarChart3, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface StudyStatsProps {
  totalTests: number;
  avgScore: number;
  streakDays: number;
}

// ---------------------------------------------------------------------------
// Animated Number Display
// ---------------------------------------------------------------------------
function AnimatedValue({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <motion.span
      className={cn("tabular-nums", className)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        {value}
      </motion.span>
      {suffix && (
        <span className="text-[14px] font-semibold opacity-70">{suffix}</span>
      )}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({
  icon,
  gradientFrom,
  gradientTo,
  value,
  suffix,
  label,
  tintBg,
  index,
}: {
  icon: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  value: number;
  suffix?: string;
  label: string;
  tintBg: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 24,
        delay: index * 0.08,
      }}
      className={cn(
        "flex flex-col items-center gap-2.5 rounded-2xl py-5 px-2 shadow-card transition-shadow hover:shadow-card-hover",
        tintBg
      )}
    >
      {/* Icon with gradient background */}
      <div
        className="flex size-10 items-center justify-center rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
        }}
      >
        {icon}
      </div>

      {/* Value */}
      <AnimatedValue
        value={value}
        suffix={suffix}
        className="text-[22px] font-extrabold tracking-tight text-[#1A1F16]"
      />

      {/* Label */}
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9CA396]">
        {label}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function StudyStats({
  totalTests,
  avgScore,
  streakDays,
}: StudyStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard
        icon={<BookCheck className="size-5 text-white" />}
        gradientFrom="#7CB342"
        gradientTo="#689F38"
        value={totalTests}
        label="테스트 횟수"
        tintBg="bg-[#FAFBF8]"
        index={0}
      />
      <StatCard
        icon={<BarChart3 className="size-5 text-white" />}
        gradientFrom="#4CAF50"
        gradientTo="#388E3C"
        value={Math.round(avgScore)}
        suffix="점"
        label="평균 점수"
        tintBg="bg-[#F9FBF5]"
        index={1}
      />
      <StatCard
        icon={<Flame className="size-5 text-white" />}
        gradientFrom="#FFA726"
        gradientTo="#F57C00"
        value={streakDays}
        suffix="일"
        label="연속 학습"
        tintBg="bg-[#FFFDF7]"
        index={2}
      />
    </div>
  );
}
