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
      className="bg-white px-5 pt-5 pb-7"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-[var(--fs-lg)] font-bold text-black">성적 분석</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/student/mypage/settings")}
            className="p-1.5 rounded-xl hover:bg-gray-100 transition-colors"
            aria-label="설정"
          >
            <Settings className="w-[var(--icon-sm)] h-[var(--icon-sm)] text-gray-500" />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 text-gray-400 hover:text-black text-[var(--fs-caption)]"
          >
            <LogOut className="size-3" />
            로그아웃
          </button>
        </div>
      </div>

      {/* Student info */}
      <div className="flex items-center gap-3">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-[var(--fs-lg)] font-bold text-white border-2"
          style={{
            backgroundColor: "var(--key-color)",
            borderColor: "color-mix(in srgb, var(--key-color) 30%, transparent)",
          }}
        >
          {student.name.charAt(0)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[var(--fs-lg)] font-bold text-black">{student.name}</h2>
            <span className="px-1.5 py-0.5 bg-gray-100 rounded-full text-[var(--fs-caption)] font-medium text-black">
              Lv.{student.level} {getLevelTitle(student.level)}
            </span>
          </div>
          <p className="text-[var(--fs-xs)] text-gray-500 mt-0.5">
            {student.schoolName ? `${student.schoolName} ` : ""}
            {student.grade}학년
          </p>
          {/* XP Bar */}
          <div className="mt-1.5">
            <div className="flex justify-between text-[var(--fs-caption)] text-gray-500 mb-0.5">
              <span>XP</span>
              <span>{student.xp}/{student.xpForNextLevel}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: "var(--key-color)" }}
                initial={{ width: 0 }}
                animate={{ width: `${xpPercent}%` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Streak + Grade badge */}
      <div className="flex items-center gap-2 mt-3">
        <div
          className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 flex-1"
          style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
        >
          <Flame className="w-[var(--icon-sm)] h-[var(--icon-sm)]" style={{ color: "var(--key-color)" }} />
          <span className="text-[var(--fs-xs)] font-medium text-black">{student.streak}일 연속</span>
        </div>
        <div className={cn("px-3 py-1.5 rounded-xl text-[var(--fs-base)] font-bold text-white", gradeColor)}>
          {analyticsLevel}등급
        </div>
      </div>
    </motion.div>
  );
}
