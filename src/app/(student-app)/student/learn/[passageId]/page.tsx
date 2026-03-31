"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Play,
  CheckCircle2,
  Lock,
  BookOpen,
  Brain,
  Languages,
  Target,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getActiveSeason, getLessonList } from "@/actions/learning-session";
import { SESSION_TYPES, type SessionType } from "@/lib/learning-constants";
import type { LessonItem } from "@/lib/learning-types";

// ---------------------------------------------------------------------------
// Session card config
// ---------------------------------------------------------------------------

const SESSION_ICONS: Record<string, typeof Brain> = {
  MIX_1: Sparkles,
  MIX_2: Sparkles,
  STORIES: BookOpen,
  VOCAB_FOCUS: Languages,
  GRAMMAR_FOCUS: Brain,
  WEAKNESS_FOCUS: Target,
};

const SESSION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  MIX_1: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-200" },
  MIX_2: { bg: "bg-indigo-50", text: "text-indigo-600", border: "border-indigo-200" },
  STORIES: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  VOCAB_FOCUS: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  GRAMMAR_FOCUS: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-200" },
  WEAKNESS_FOCUS: { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-200" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LessonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const passageId = params.passageId as string;

  const [lesson, setLesson] = useState<LessonItem | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const season = await getActiveSeason();
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
  }, [passageId, router]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-6" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl mb-3" />
        ))}
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-gray-500">레슨을 찾을 수 없습니다</p>
      </div>
    );
  }

  const sessions: { type: SessionType; done: boolean; locked: boolean }[] = [
    { type: "MIX_1", done: lesson.session1Done, locked: false },
    { type: "MIX_2", done: lesson.session2Done, locked: false },
    { type: "STORIES", done: lesson.storiesDone, locked: !lesson.storiesUnlocked },
    { type: "VOCAB_FOCUS", done: lesson.session3Done, locked: false },
    { type: "GRAMMAR_FOCUS", done: lesson.session4Done, locked: false },
    { type: "WEAKNESS_FOCUS", done: lesson.session5Done, locked: false },
  ];

  return (
    <div className="max-w-lg mx-auto pb-8">
      <div className="px-5 pt-2 pb-5">
        {lesson.masteryScore > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[var(--fs-xs)] text-gray-500">숙달도</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  lesson.masteryScore >= 80
                    ? "bg-emerald-500"
                    : lesson.masteryScore >= 50
                      ? "bg-blue-500"
                      : "bg-amber-500"
                )}
                style={{ width: `${lesson.masteryScore}%` }}
              />
            </div>
            <span className="text-[var(--fs-xs)] font-bold text-gray-600">
              {Math.round(lesson.masteryScore)}%
            </span>
          </div>
        )}
      </div>

      {/* Required Sessions */}
      <div className="px-5 mb-2">
        <p className="text-[var(--fs-xs)] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          필수 세션
        </p>
      </div>
      <div className="px-5 space-y-2.5 mb-6">
        {sessions.slice(0, 3).map((s, i) => (
          <SessionCard
            key={s.type}
            session={s}
            index={i}
            passageId={passageId}
            seasonId={seasonId}
          />
        ))}
      </div>

      {/* Optional Sessions */}
      <div className="px-5 mb-2">
        <p className="text-[var(--fs-xs)] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          선택 세션
        </p>
      </div>
      <div className="px-5 space-y-2.5">
        {sessions.slice(3).map((s, i) => (
          <SessionCard
            key={s.type}
            session={s}
            index={i + 3}
            passageId={passageId}
            seasonId={seasonId}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session Card
// ---------------------------------------------------------------------------

function SessionCard({
  session,
  index,
  passageId,
  seasonId,
}: {
  session: { type: SessionType; done: boolean; locked: boolean };
  index: number;
  passageId: string;
  seasonId: string | null;
}) {
  const router = useRouter();
  const meta = SESSION_TYPES[session.type];
  const Icon = SESSION_ICONS[session.type] ?? Sparkles;
  const colors = SESSION_COLORS[session.type];

  const handleStart = () => {
    if (session.locked) return;
    if (session.type === "STORIES") {
      const params = new URLSearchParams({
        ...(seasonId ? { seasonId } : {}),
      });
      router.push(`/student/learn/${passageId}/stories?${params}`);
      return;
    }
    const params = new URLSearchParams({
      type: session.type,
      ...(seasonId ? { seasonId } : {}),
    });
    router.push(`/student/learn/${passageId}/session?${params}`);
  };

  return (
    <motion.button
      onClick={handleStart}
      disabled={session.locked}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all",
        session.done
          ? "bg-gray-50 border-gray-200"
          : session.locked
            ? "bg-gray-50 border-gray-100 opacity-50"
            : cn(colors.bg, colors.border, "active:scale-[0.98] shadow-sm")
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center",
          session.done ? "bg-emerald-100" : session.locked ? "bg-gray-100" : colors.bg
        )}
      >
        {session.done ? (
          <CheckCircle2 className="size-5 text-emerald-500" />
        ) : session.locked ? (
          <Lock className="size-5 text-gray-400" />
        ) : (
          <Icon className={cn("size-5", colors.text)} />
        )}
      </div>

      {/* Label */}
      <div className="flex-1">
        <p
          className={cn(
            "text-[var(--fs-base)] font-semibold",
            session.done ? "text-gray-500" : session.locked ? "text-gray-400" : "text-gray-900"
          )}
        >
          {meta.label}
        </p>
        <p className="text-[var(--fs-xs)] text-gray-500 mt-0.5">
          {session.done
            ? "완료"
            : session.locked
              ? "필수 세션 완료 후 해제"
              : meta.required
                ? "필수 · ~3분"
                : "선택 · ~3분"}
        </p>
      </div>

      {/* Action */}
      {!session.done && !session.locked && (
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", colors.bg)}>
          <Play className={cn("size-4 ml-0.5", colors.text)} />
        </div>
      )}
    </motion.button>
  );
}
