"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Flame,
  Trophy,
  Target,
  BarChart3,
  Zap,
  Check,
  X,
  GraduationCap,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getLearnPageData } from "@/actions/learning-session";
import { getDailyQuests } from "@/actions/learning-gamification";
import type { LessonItem, SeasonInfo, DailyQuestStatus, QuestItem } from "@/lib/learning-types";
import { LessonPath } from "./_components/lesson-path";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
type LearnMode = "naeshin" | "suneung";

export default function LearnPage() {
  const [mode, setMode] = useState<LearnMode>("naeshin");
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [lessons, setLessons] = useState<LessonItem[]>([]);
  const [quests, setQuests] = useState<DailyQuestStatus | null>(null);
  const [streak, setStreak] = useState<{ streak: number; freezeCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [questOpen, setQuestOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      getLearnPageData(),
      getDailyQuests(),
    ])
      .then(([pageData, questData]) => {
        setSeason(pageData.season);
        setStreak(pageData.streak);
        setLessons(pageData.lessons);
        setQuests(questData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LearnSkeleton />;

  return (
    <div className="max-w-2xl mx-auto pb-4">
      {/* Mode Tabs */}
      <div className="px-[var(--sp-3)] pt-[var(--sp-2)]">
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-[var(--sp-2)]">
          <button
            onClick={() => setMode("naeshin")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[var(--fs-xs)] font-semibold rounded-xl transition-all",
              mode === "naeshin" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
            )}
          >
            <BookOpen className="w-4 h-4" />
            내신집중
          </button>
          <button
            onClick={() => setMode("suneung")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[var(--fs-xs)] font-semibold rounded-xl transition-all",
              mode === "suneung" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400"
            )}
          >
            <GraduationCap className="w-4 h-4" />
            수능링고
          </button>
        </div>
      </div>

      {mode === "suneung" ? (
        <SuneungMode />
      ) : (
        <NaeshinMode
          season={season}
          lessons={lessons}
          quests={quests}
          streak={streak}
          questOpen={questOpen}
          setQuestOpen={setQuestOpen}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suneung Mode (준비 중)
// ---------------------------------------------------------------------------
function SuneungMode() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-5 text-center">
      <GraduationCap className="size-16 text-gray-400 mb-4" />
      <h2 className="text-lg font-bold text-gray-700 mb-2">
        수능링고 준비 중
      </h2>
      <p className="text-sm text-gray-500">
        수능/모의고사 기출 지문으로 학습하는 기능이 곧 추가됩니다
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Naeshin Mode (기존 내신집중)
// ---------------------------------------------------------------------------
function NaeshinMode({
  season,
  lessons,
  quests,
  streak,
  questOpen,
  setQuestOpen,
}: {
  season: SeasonInfo | null;
  lessons: LessonItem[];
  quests: DailyQuestStatus | null;
  streak: { streak: number; freezeCount: number } | null;
  questOpen: boolean;
  setQuestOpen: (open: boolean) => void;
}) {
  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] px-5 text-center">
        <BookOpen className="size-16 text-gray-400 mb-4" />
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
    <>
      {/* Season Header */}
      <div className="px-[var(--sp-3)] pt-[var(--sp-3)] pb-[var(--sp-2)]">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[var(--fs-lg)] font-bold text-gray-900">
            {season.name}
          </h1>
          {season.dDay !== null && (
            <span className="text-[var(--fs-caption)] font-bold text-rose-500 bg-rose-50 px-[var(--sp-1)] py-1 rounded-full">
              D-{season.dDay}
            </span>
          )}
        </div>
        <p className="text-[var(--fs-xs)] text-gray-500">
          {season.completedLessons}/{season.totalLessons} 레슨 완료
        </p>

        {/* Progress bar */}
        <div className="mt-[var(--sp-1)] h-[clamp(0.375rem,1vw,0.5rem)] bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Streak & Links Strip */}
      <div className="px-[var(--sp-3)] mb-[var(--sp-2)] flex gap-[var(--sp-1)] flex-wrap justify-center">
        {streak && (
          <div className="flex items-center gap-1 bg-amber-50 px-[var(--sp-1)] py-[clamp(0.25rem,0.8vw,0.5rem)] rounded-full">
            <Flame className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-amber-500" />
            <span className="text-[var(--fs-xs)] font-bold text-amber-600">
              {streak.streak}
            </span>
          </div>
        )}
        <Link
          href="/student/learn/ranking"
          className="flex items-center gap-1 bg-amber-50 px-[var(--sp-1)] py-[clamp(0.25rem,0.8vw,0.5rem)] rounded-full active:scale-95"
        >
          <Trophy className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-amber-500" />
          <span className="text-[var(--fs-caption)] font-medium text-amber-600">랭킹</span>
        </Link>
        <Link
          href="/student/learn/analytics"
          className="flex items-center gap-1 bg-blue-50 px-[var(--sp-1)] py-[clamp(0.25rem,0.8vw,0.5rem)] rounded-full active:scale-95"
        >
          <BarChart3 className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-blue-500" />
          <span className="text-[var(--fs-caption)] font-medium text-blue-600">학습 분석</span>
        </Link>
        {/* 미션 버튼 */}
        {quests && (
          <button
            onClick={() => setQuestOpen(true)}
            className="flex items-center gap-1 bg-purple-50 px-[var(--sp-1)] py-[clamp(0.25rem,0.8vw,0.5rem)] rounded-full active:scale-95"
          >
            <Target className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-purple-500" />
            <span className="text-[var(--fs-caption)] font-medium text-purple-600">
              미션 {quests.quests.filter((q) => q.completed).length}/{quests.quests.length}
            </span>
          </button>
        )}
        {/* 배율 활성 표시 + 카운트다운 */}
        {quests?.activeMultiplier && quests.multiplierExpiresAt && (
          <MultiplierBadge
            multiplier={quests.activeMultiplier}
            expiresAt={quests.multiplierExpiresAt}
          />
        )}
      </div>

      {/* 미션 바텀시트 */}
      {quests && (
        <QuestBottomSheet
          open={questOpen}
          onClose={() => setQuestOpen(false)}
          quests={quests.quests}
        />
      )}

      {/* S-curve Lesson Path */}
      <div className="px-3">
        <LessonPath lessons={lessons} seasonId={season.id} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// QuestBottomSheet — 바텀시트로 미션 표시
// ---------------------------------------------------------------------------
function QuestBottomSheet({
  open,
  onClose,
  quests,
}: {
  open: boolean;
  onClose: () => void;
  quests: QuestItem[];
}) {
  const completedCount = quests.filter((q) => q.completed).length;
  const difficultyOrder: Record<string, number> = { EASY: 0, HARD: 1 };
  const sorted = [...quests].sort(
    (a, b) => (difficultyOrder[a.difficulty] ?? 0) - (difficultyOrder[b.difficulty] ?? 0)
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-50"
          />
          {/* 시트 */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[70vh] overflow-y-auto"
          >
            {/* 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-5 pb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-500" />
                  <span className="text-base font-bold text-gray-900">오늘의 미션</span>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">
                미션를 달성하면 10분간 XP 배율 보너스!
              </p>
              <div className="space-y-3">
                {sorted.map((q) => (
                  <QuestRow key={q.id} quest={q} />
                ))}
              </div>
              <div className="mt-4 text-center text-xs text-gray-500">
                {completedCount}/{quests.length} 달성
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function QuestRow({ quest }: { quest: QuestItem }) {
  const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));

  const difficultyLabel = { EASY: "쉬움", MEDIUM: "보통", HARD: "어려움" }[quest.difficulty];
  const difficultyColor = {
    EASY: "text-emerald-500 bg-emerald-50",
    MEDIUM: "text-blue-500 bg-blue-50",
    HARD: "text-purple-500 bg-purple-50",
  }[quest.difficulty];

  const barColor = quest.completed
    ? "bg-emerald-400"
    : { EASY: "bg-emerald-400", MEDIUM: "bg-blue-400", HARD: "bg-purple-400" }[quest.difficulty];

  const rewardLabel =
    quest.rewardType === "MULTIPLIER"
      ? `x${quest.rewardValue}`
      : `+${quest.rewardValue} XP`;

  return (
    <div className={cn("rounded-xl p-2.5", quest.completed ? "bg-emerald-50/50" : "bg-gray-50")}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {quest.completed ? (
            <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center flex-shrink-0">
              <Check className="w-3 h-3 text-white" />
            </div>
          ) : (
            <span className={cn("text-[var(--fs-caption)] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0", difficultyColor)}>
              {difficultyLabel}
            </span>
          )}
          <span className={cn("text-xs font-medium truncate", quest.completed ? "text-gray-400 line-through" : "text-gray-700")}>
            {quest.label}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <Zap className="w-3 h-3 text-amber-500" />
          <span className="text-[var(--fs-caption)] font-bold text-amber-600">{rewardLabel}</span>
        </div>
      </div>
      {!quest.completed && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[var(--fs-caption)] text-gray-500 flex-shrink-0">
            {quest.progress}/{quest.target}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiplierBadge — 배율 카운트다운 타이머
// ---------------------------------------------------------------------------
function MultiplierBadge({ multiplier, expiresAt }: { multiplier: number; expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    const calc = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      return remaining;
    };

    setTimeLeft(calc());

    const timer = setInterval(() => {
      const remaining = calc();
      if (remaining <= 0) {
        setTimeLeft(null);
        clearInterval(timer);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (timeLeft === null || timeLeft <= 0) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex items-center gap-1 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 px-[var(--sp-1)] py-[clamp(0.25rem,0.8vw,0.5rem)] rounded-full"
    >
      <Zap className="w-[var(--icon-xs)] h-[var(--icon-xs)] text-amber-500" />
      <span className="text-[var(--fs-caption)] font-bold text-amber-600">
        x{multiplier}
      </span>
      <span className="text-[var(--fs-caption)] font-medium text-amber-500">
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
    </motion.div>
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
