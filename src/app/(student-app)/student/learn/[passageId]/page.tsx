"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Play,
  CheckCircle2,
  Lock,
  BookOpen,
  Brain,
  Languages,
  Target,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveSeason, getLessonList } from "@/actions/learning-session";
import { SESSION_TYPES, SESSIONS_PER_CATEGORY, type SessionType } from "@/lib/learning-constants";
import type { LessonItem } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// 카테고리 설정
// ---------------------------------------------------------------------------
const CATEGORY_CONFIG: {
  type: SessionType;
  Icon: typeof Brain;
  color: { bg: string; text: string; border: string; iconBg: string; barColor: string };
}[] = [
  {
    type: "VOCAB",
    Icon: Languages,
    color: { bg: "bg-white", text: "text-emerald-600", border: "border-gray-200", iconBg: "bg-emerald-50", barColor: "bg-emerald-500" },
  },
  {
    type: "INTERPRETATION",
    Icon: BookOpen,
    color: { bg: "bg-white", text: "text-blue-600", border: "border-gray-200", iconBg: "bg-blue-50", barColor: "bg-blue-500" },
  },
  {
    type: "GRAMMAR",
    Icon: Brain,
    color: { bg: "bg-white", text: "text-purple-600", border: "border-gray-200", iconBg: "bg-purple-50", barColor: "bg-purple-500" },
  },
  {
    type: "COMPREHENSION",
    Icon: Target,
    color: { bg: "bg-white", text: "text-amber-600", border: "border-gray-200", iconBg: "bg-amber-50", barColor: "bg-amber-500" },
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LessonDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const passageId = params.passageId as string;
  const seasonIdParam = searchParams.get("seasonId");

  const [lesson, setLesson] = useState<LessonItem | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(seasonIdParam);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const season = seasonIdParam
          ? { id: seasonIdParam }
          : await getActiveSeason();
        if (!season) {
          router.push("/student/learn");
          return;
        }
        setSeasonId(season.id);
        const lessons = await getLessonList(season.id);
        const found = lessons.find((l) => l.passageId === passageId);
        setLesson(found ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [passageId, router, seasonIdParam]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-6" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl mb-3" />
        ))}
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-black">레슨을 찾을 수 없습니다</p>
      </div>
    );
  }

  const catFieldMap: Record<string, keyof typeof lesson.categoryProgress> = {
    VOCAB: "VOCAB",
    INTERPRETATION: "INTERPRETATION",
    GRAMMAR: "GRAMMAR",
    COMPREHENSION: "COMPREHENSION",
  };

  return (
    <div className="max-w-lg mx-auto pb-8">
      {/* Header */}
      <div className="px-5 pt-2 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-[var(--fs-xs)] text-black">
            진행률 {lesson.totalSessionsDone}/21
          </span>
          {lesson.masteryPassed && (
            <span className="flex items-center gap-1 text-[var(--fs-xs)] text-black font-semibold">
              <Crown className="size-4" /> 마스터리 달성
            </span>
          )}
        </div>
        {/* Overall progress bar */}
        <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(lesson.totalSessionsDone / 21) * 100}%`, backgroundColor: "var(--key-color)" }}
          />
        </div>
      </div>

      {/* Category tracks */}
      <div className="px-5 space-y-3 mb-6">
        {CATEGORY_CONFIG.map(({ type, Icon, color }, ci) => {
          const done = lesson.categoryProgress[catFieldMap[type]];
          const meta = SESSION_TYPES[type];

          return (
            <CategoryTrack
              key={type}
              type={type}
              label={meta.label}
              Icon={Icon}
              color={color}
              done={done}
              total={SESSIONS_PER_CATEGORY}
              passageId={passageId}
              seasonId={seasonId}
              index={ci}
            />
          );
        })}
      </div>

      {/* Mastery track */}
      <div className="px-5">
        <MasteryTrack
          lesson={lesson}
          passageId={passageId}
          seasonId={seasonId}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category Track
// ---------------------------------------------------------------------------
function CategoryTrack({
  type,
  label,
  Icon,
  color,
  done,
  total,
  passageId,
  seasonId,
  index,
}: {
  type: SessionType;
  label: string;
  Icon: typeof Brain;
  color: { bg: string; text: string; border: string; iconBg: string; barColor: string };
  done: number;
  total: number;
  passageId: string;
  seasonId: string | null;
  index: number;
}) {
  const router = useRouter();
  const nextSeq = Math.min(done + 1, total);
  const allDone = done >= total;

  const handleStart = () => {
    if (allDone) return;
    const params = new URLSearchParams({
      type,
      seq: String(nextSeq),
      ...(seasonId ? { seasonId } : {}),
    });
    router.push(`/student/learn/${passageId}/session?${params}`);
  };

  return (
    <motion.button
      onClick={handleStart}
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className={cn(
        "w-full flex items-center gap-3 rounded-3xl border p-5 text-left transition-all",
        allDone
          ? "bg-gray-50 border-gray-200"
          : cn(color.bg, color.border, "active:scale-[0.98] ")
      )}
    >
      {/* Icon */}
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", allDone ? "bg-emerald-100" : color.iconBg)}>
        {allDone ? (
          <CheckCircle2 className="size-5 text-emerald-500" />
        ) : (
          <Icon className={cn("size-5", color.text)} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-[var(--fs-base)] font-semibold", allDone ? "text-black" : "text-gray-900")}>
          {label}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", allDone ? "bg-emerald-500" : color.barColor)}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <span className="text-[var(--fs-xs)] text-black whitespace-nowrap">{done}/{total}</span>
        </div>
      </div>

      {/* Play button */}
      {!allDone && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}>
          <Play className="size-4 ml-0.5" style={{ color: "var(--key-color)" }} />
        </div>
      )}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Mastery Track
// ---------------------------------------------------------------------------
function MasteryTrack({
  lesson,
  passageId,
  seasonId,
}: {
  lesson: LessonItem;
  passageId: string;
  seasonId: string | null;
}) {
  const router = useRouter();
  const { masteryUnlocked, masteryPassed, masteryAttempts, masteryScore } = lesson;

  const handleStart = () => {
    if (!masteryUnlocked || masteryPassed) return;
    const params = new URLSearchParams({
      type: "MASTERY",
      seq: "1",
      ...(seasonId ? { seasonId } : {}),
    });
    router.push(`/student/learn/${passageId}/session?${params}`);
  };

  return (
    <motion.button
      onClick={handleStart}
      disabled={!masteryUnlocked || masteryPassed}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className={cn(
        "w-full flex items-center gap-3 rounded-3xl border p-5 text-left transition-all",
        masteryPassed
          ? "bg-white border-gray-200"
          : masteryUnlocked
            ? "bg-white border-gray-200 active:scale-[0.98] "
            : "bg-gray-50 border-gray-100 opacity-50"
      )}
    >
      {/* Icon */}
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center",
        masteryPassed ? "bg-gray-100" : masteryUnlocked ? "bg-gray-100" : "bg-gray-100"
      )}>
        {masteryPassed ? (
          <Crown className="size-5 text-black" />
        ) : masteryUnlocked ? (
          <Crown className="size-5 text-black" />
        ) : (
          <Lock className="size-5 text-gray-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1">
        <p className={cn(
          "text-[var(--fs-base)] font-semibold",
          masteryPassed ? "text-black" : masteryUnlocked ? "text-black" : "text-gray-400"
        )}>
          마스터리 챌린지
        </p>
        <p className="text-[var(--fs-xs)] text-black mt-0.5">
          {masteryPassed
            ? `달성! (${Math.round(masteryScore)}점, ${masteryAttempts}회 시도)`
            : !masteryUnlocked
              ? "각 카테고리 1세션 이상 완료 필요"
              : masteryAttempts > 0
                ? `${masteryAttempts}회 시도 · 힌트 없음 · 5개 이상 틀리면 실패`
                : "힌트 없음 · 5개 이상 틀리면 실패"}
        </p>
      </div>

      {/* Play */}
      {masteryUnlocked && !masteryPassed && (
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--key-color) 10%, white)" }}>
          <Play className="size-4 ml-0.5" style={{ color: "var(--key-color)" }} />
        </div>
      )}
    </motion.button>
  );
}
