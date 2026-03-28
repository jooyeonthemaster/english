"use client";

import { motion } from "framer-motion";
import { Flame, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface ProfileHeaderProps {
  student: {
    name: string;
    grade: number;
    level: number;
    xp: number;
    xpForNextLevel: number;
    streak: number;
    schoolName: string | null;
  };
  analyticsLevel: string;
  onLogout: () => void;
}

const levelColors: Record<string, string> = {
  S: "bg-gradient-to-br from-yellow-400 to-amber-500",
  A: "bg-gradient-to-br from-blue-400 to-blue-600",
  B: "bg-gradient-to-br from-emerald-400 to-emerald-600",
  C: "bg-gradient-to-br from-amber-400 to-amber-500",
  D: "bg-gradient-to-br from-gray-300 to-gray-400",
};

function getLevelTitle(level: number): string {
  if (level >= 30) return "Master";
  if (level >= 20) return "Advanced";
  if (level >= 15) return "Intermediate";
  if (level >= 10) return "Pre-Intermediate";
  if (level >= 5) return "Elementary";
  return "Beginner";
}

export function ProfileHeader({ student, analyticsLevel, onLogout }: ProfileHeaderProps) {
  const router = useRouter();
  const xpPercent = Math.min(100, (student.xp / student.xpForNextLevel) * 100);
  const gradeColor = levelColors[analyticsLevel] ?? levelColors.D;

  return (
    <motion.div
      className="bg-gradient-to-br from-[var(--student-primary)] via-blue-600 to-[var(--student-secondary)] px-[var(--space-md)] pt-[var(--space-md)] pb-7 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-[var(--space-sm)]">
        <h1 className="text-[var(--text-base)] font-bold">영어 인바디</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/student/mypage/settings")}
            className="p-1.5 rounded-[var(--card-radius-sm)] hover:bg-white/10 transition-colors"
            aria-label="설정"
          >
            <Settings className="size-[var(--icon-sm)] text-white/70" />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 text-white/60 hover:text-white text-[var(--text-2xs)]"
          >
            <LogOut className="size-3" />
            로그아웃
          </button>
        </div>
      </div>

      {/* Student info */}
      <div className="flex items-center gap-3">
        <div className="size-[var(--avatar-lg)] rounded-full bg-white/20 flex items-center justify-center text-[var(--text-lg)] font-bold backdrop-blur-sm border-2 border-white/30">
          {student.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[var(--text-base)] font-bold">{student.name}</h2>
            <span className="px-1.5 py-0.5 bg-white/20 rounded-full text-[var(--text-2xs)] font-medium">
              Lv.{student.level} {getLevelTitle(student.level)}
            </span>
          </div>
          <p className="text-[var(--text-xs)] text-white/70 mt-0.5">
            {student.schoolName ? `${student.schoolName} ` : ""}
            {student.grade}학년
          </p>
          {/* XP Bar */}
          <div className="mt-1.5">
            <div className="flex justify-between text-[var(--text-2xs)] text-white/50 mb-0.5">
              <span>XP</span>
              <span>{student.xp}/{student.xpForNextLevel}</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${xpPercent}%` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Streak + Grade badge */}
      <div className="flex items-center gap-2 mt-[var(--space-sm)]">
        <div className="flex items-center gap-1.5 bg-white/10 rounded-[var(--card-radius-sm)] px-2.5 py-1.5 flex-1">
          <Flame className="size-[var(--icon-sm)] text-orange-300" />
          <span className="text-[var(--text-xs)] font-medium">{student.streak}일 연속</span>
        </div>
        <div className={cn("px-3 py-1.5 rounded-[var(--card-radius-sm)] text-[var(--text-sm)] font-bold text-white", gradeColor)}>
          {analyticsLevel}등급
        </div>
      </div>
    </motion.div>
  );
}
