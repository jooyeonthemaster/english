"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen,
  Flame,
  Trophy,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLearnPageData } from "@/actions/learning-session";
import type { LessonItem, SeasonInfo, DailyMissionStatus } from "@/lib/learning-types";
import { LessonPath } from "./_components/lesson-path";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function LearnPage() {
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [mission, setMission] = useState<DailyMissionStatus | null>(null);
  const [streak, setStreak] = useState<{ streak: number; freezeCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLearnPageData()
      .then(({ season: s, mission: m, streak: st, lessons: l }) => {
        setSeason(s);
        setMission(m);
        setStreak(st);
        setLessons(l);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LearnSkeleton />;

  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-5 text-center">
        <BookOpen className="size-16 text-gray-300 mb-4" />
        <h2 className="text-lg font-bold text-gray-700 mb-2">
          진행 중인 학습이 없어요
        </h2>
        <p className="text-sm text-gray-500">
          선생님이 시즌을 설정하면 여기에 학습 레슨이 나타나요
        </p>
      </div>
    );
  }

  const progressPct =
    season.totalLessons > 0
      ? (season.completedLessons / season.totalLessons) * 100
      : 0;

  return (
    <div className="max-w-2xl mx-auto pb-4">
      {/* Season Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-900">
            {season.name}
          </h1>
          {season.dDay !== null && (
            <span className="text-xs font-bold text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full">
              D-{season.dDay}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          {season.completedLessons}/{season.totalLessons} 레슨 완료
        </p>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Streak & Mission Strip */}
      <div className="px-5 mb-3 flex gap-2 flex-wrap">
        {streak && (
          <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full">
            <Flame className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold text-amber-600">
              {streak.streak}
            </span>
          </div>
        )}
        <Link
          href="/student/learn/ranking"
          className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full active:scale-95"
        >
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-medium text-amber-600">랭킹</span>
        </Link>
        <Link
          href="/student/learn/analytics"
          className="flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-full active:scale-95"
        >
          <BarChart3 className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-medium text-blue-600">인바디</span>
        </Link>
        {mission && (
          <MissionBadge mission={mission} />
        )}
      </div>

      {/* S-curve Lesson Path */}
      <div className="px-3">
        <LessonPath lessons={lessons} seasonId={season.id} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mission Badge
// ---------------------------------------------------------------------------
function MissionBadge({ mission }: { mission: DailyMissionStatus }) {
  const label = mission.easy.completed && mission.hard.completed
    ? "미션 완료!"
    : mission.easy.completed
      ? "하드 미션 도전!"
      : "이지 미션 도전!";

  return (
    <>
      <div className="flex items-center gap-1.5 bg-purple-50 px-3 py-1.5 rounded-full">
        <Sparkles className="w-4 h-4 text-purple-500" />
        <span className="text-xs font-medium text-purple-600">
          {label}
        </span>
      </div>
      {mission.activeMultiplier && (
        <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-full">
          <Trophy className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-bold text-amber-600">
            XP x{mission.activeMultiplier}
          </span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function LearnSkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-5 pt-5">
      <div className="h-6 bg-gray-200 rounded w-40 mb-2 animate-shimmer" />
      <div className="h-4 bg-gray-100 rounded w-24 mb-3" />
      <div className="h-2 bg-gray-100 rounded-full mb-8" />
      <div className="flex flex-col items-center gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="size-16 bg-gray-100 rounded-full animate-pulse" />
        ))}
      </div>
    </div>
  );
}
