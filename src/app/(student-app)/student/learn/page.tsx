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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLearnPage } from "@/hooks/use-student-data";
import type { LessonItem, SeasonInfo, DailyQuestStatus, QuestItem } from "@/lib/learning-types";
import { LessonPath } from "./_components/lesson-path";

// ---------------------------------------------------------------------------
// Quick menu items for learn page
// ---------------------------------------------------------------------------
const LEARN_MENUS = [
  { id: "ranking", label: "랭킹", icon: Trophy, href: "/student/learn/ranking" },
  { id: "analytics", label: "학습분석", icon: BarChart3, href: "/student/learn/analytics" },
];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
type LearnMode = "naeshin" | "suneung";

export default function LearnPage() {
  const [mode, setMode] = useState<LearnMode>("naeshin");
  const [questOpen, setQuestOpen] = useState(false);
  const { data, isLoading } = useLearnPage();

  if (isLoading && !data) return <LearnSkeleton />;

  const season = data?.season ?? null;
  const lessons = data?.lessons ?? [];
  const quests = data?.quests ?? null;
  const streak = data?.streak ?? null;

  return (
    <div className="max-w-2xl mx-auto pb-4">
      {/* 퀵메뉴 탭바 — 홈/마이와 동일 스타일 */}
      <div className="px-5 mb-3">
        <div className="flex gap-4 justify-center">
          {LEARN_MENUS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center ">
                  <Icon className="w-5 h-5 text-black" strokeWidth={1.8} />
                </div>
                <span className="text-xs font-medium text-black">{item.label}</span>
              </Link>
            );
          })}
          {/* 미션 버튼 */}
          {quests && (
            <button
              onClick={() => setQuestOpen(true)}
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center ">
                <Target className="w-5 h-5 text-black" strokeWidth={1.8} />
              </div>
              <span className="text-xs font-medium text-black">미션</span>
            </button>
          )}
        </div>
      </div>

      {/* 모드 탭 — pill 토글 */}
      <div className="px-5">
        <div className="flex bg-gray-100 rounded-2xl p-1 mb-4">
          <button
            onClick={() => setMode("naeshin")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-xl transition-all",
              mode === "naeshin" ? "bg-white text-black" : "text-gray-400"
            )}
          >
            <div style={mode === "naeshin" ? { color: "var(--key-color)" } : undefined}>
              <BookOpen className="w-4 h-4" />
            </div>
            내신집중
          </button>
          <button
            onClick={() => setMode("suneung")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold rounded-xl transition-all",
              mode === "suneung" ? "bg-white text-black" : "text-gray-400"
            )}
          >
            <div style={mode === "suneung" ? { color: "var(--key-color)" } : undefined}>
              <GraduationCap className="w-4 h-4" />
            </div>
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
      <h2 className="text-lg font-bold text-black mb-2">
        수능링고 준비 중
      </h2>
      <p className="text-sm text-black">
        수능/모의고사 기출 지문으로 학습하는 기능이 곧 추가됩니다
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Naeshin Mode
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
        <h2 className="text-lg font-bold text-black mb-2">
          진행 중인 학습이 없어요
        </h2>
        <p className="text-sm text-black">
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
      {/* 시즌 카드 */}
      <div className="px-5 mb-4">
        <div className="rounded-3xl bg-white p-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-lg font-bold text-black">
              {season.name}
            </h1>
            {season.dDay !== null && (
              <span className="text-xs font-bold text-black bg-gray-100 px-3 py-1 rounded-full">
                D-{season.dDay}
              </span>
            )}
          </div>
          <p className="text-sm text-black">
            {season.completedLessons}/{season.totalLessons} 레슨 완료
          </p>

          {/* Progress bar */}
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: "var(--key-color)" }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>

          {/* 스트릭 + 멀티플라이어 */}
          <div className="flex items-center gap-3 mt-3">
            {streak && streak.streak > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
              >
                <Flame className="w-4 h-4" style={{ color: "var(--key-color)" }} />
                <span className="text-xs font-bold text-black">{streak.streak}일 연속</span>
              </div>
            )}
            {quests?.activeMultiplier && quests.multiplierExpiresAt && (
              <MultiplierBadge
                multiplier={quests.activeMultiplier}
                expiresAt={quests.multiplierExpiresAt}
              />
            )}
          </div>
        </div>
      </div>

      {/* 미션 바텀시트 */}
      {quests && (
        <QuestBottomSheet
          open={questOpen}
          onClose={() => setQuestOpen(false)}
          quests={quests.quests}
        />
      )}

      {/* 레슨 경로 */}
      <div className="px-3">
        <LessonPath lessons={lessons} seasonId={season.id} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// QuestBottomSheet
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-50"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[70vh] overflow-y-auto"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-5 pb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-black" />
                  <span className="text-base font-bold text-black">오늘의 미션</span>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                미션를 달성하면 10분간 XP 배율 보너스!
              </p>
              <div className="space-y-3">
                {sorted.map((q) => (
                  <QuestRow key={q.id} quest={q} />
                ))}
              </div>
              <div className="mt-4 text-center text-xs text-gray-400">
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

  const rewardLabel =
    quest.rewardType === "MULTIPLIER"
      ? `x${quest.rewardValue}`
      : `+${quest.rewardValue} XP`;

  return (
    <div className="rounded-xl p-2.5 bg-gray-50">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {quest.completed ? (
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--key-color)" }}>
              <Check className="w-3 h-3 text-white" />
            </div>
          ) : (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-gray-200 text-black">
              {difficultyLabel}
            </span>
          )}
          <span className={cn("text-xs font-medium truncate", quest.completed ? "text-gray-400 line-through" : "text-black")}>
            {quest.label}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <Zap className="w-3 h-3" style={{ color: "var(--key-color)" }} />
          <span className="text-xs font-bold text-black">{rewardLabel}</span>
        </div>
      </div>
      {!quest.completed && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percent}%`, backgroundColor: "var(--key-color)" }}
            />
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {quest.progress}/{quest.target}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiplierBadge
// ---------------------------------------------------------------------------
function MultiplierBadge({ multiplier, expiresAt }: { multiplier: number; expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    const calc = () => Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    setTimeLeft(calc());
    const timer = setInterval(() => {
      const remaining = calc();
      if (remaining <= 0) { setTimeLeft(null); clearInterval(timer); }
      else setTimeLeft(remaining);
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
      className="flex items-center gap-1 px-3 py-1.5 rounded-full"
      style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}
    >
      <Zap className="w-4 h-4" style={{ color: "var(--key-color)" }} />
      <span className="text-xs font-bold text-black">x{multiplier}</span>
      <span className="text-xs font-medium text-gray-400">
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
    <div className="max-w-2xl mx-auto px-5 pt-4">
      <div className="flex gap-4 justify-center mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl animate-pulse" />
            <div className="w-8 h-3 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-10 bg-gray-100 rounded-2xl mb-4 animate-pulse" />
      <div className="h-40 bg-gray-100 rounded-3xl mb-4 animate-pulse" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-3xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
