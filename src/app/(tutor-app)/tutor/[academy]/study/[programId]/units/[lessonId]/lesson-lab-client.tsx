"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  CheckCircle2,
  Circle,
  HelpCircle,
  MessageCircleQuestion,
  Play,
  Target,
} from "lucide-react";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  labelTutorActivityType,
  studentActivityInstruction,
  studentActivityTitle,
  tutorModeLabels,
} from "@/lib/tutor/activity-labels";
import { tutorPath } from "@/lib/tutor/routes";
import { cn } from "@/lib/utils";
import { LessonReader } from "./lesson-reader";

type CoverageDimension = "interpret" | "memorize" | "order" | "vocab" | "grammar" | "transfer";

type CoverageRef = {
  sentenceIndex: number;
  dimension: CoverageDimension;
  weight?: number;
};

type LessonLabActivity = {
  id: string;
  mode: string;
  type: string;
  title: string;
  instructions: string | null;
  payload: Record<string, unknown>;
  maxScore: number;
  estimatedSec: number;
  coverageRefs: CoverageRef[];
  answered: boolean;
  isCorrect: boolean | null;
  scoreEarned: number;
  scoreMax: number;
};

type SentenceRow = {
  index: number;
  english: string;
  korean: string;
};

type LabMode = "passage" | "coach" | "training";

const MODES: Array<{ key: LabMode; label: string; Icon: typeof BookOpen }> = [
  { key: "passage", label: "본문", Icon: BookOpen },
  { key: "coach", label: "AI 코칭룸", Icon: MessageCircleQuestion },
  { key: "training", label: "훈련", Icon: Target },
];

export function LessonLabClient({
  academy,
  programId,
  lessonId,
  title,
  passage,
  sentences,
  analysisData,
  activities,
}: {
  academy: string;
  programId: string;
  lessonId: string;
  title: string;
  passage: string;
  sentences: SentenceRow[];
  analysisData: PassageAnalysisData | null;
  activities: LessonLabActivity[];
}) {
  const [mode, setMode] = useState<LabMode>("passage");
  const router = useRouter();

  const answeredCount = activities.filter((activity) => activity.answered).length;
  const correctCount = activities.filter((activity) => activity.isCorrect).length;
  const completion = activities.length ? Math.round((answeredCount / activities.length) * 100) : 0;
  const firstTodo = activities.find((activity) => !activity.answered) ?? activities[0];
  const programHref = tutorPath(academy, `/study/${programId}`);
  const askHref = tutorPath(academy, `/study/${programId}/units/${lessonId}/ask`);
  const firstTodoHref = firstTodo
    ? tutorPath(academy, `/study/${programId}/units/${lessonId}/activity/${firstTodo.id}`)
    : "";

  const wordCount = useMemo(
    () => passage.trim().split(/\s+/).filter(Boolean).length,
    [passage],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <Link
            href={programHref}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100"
            aria-label="프로그램으로 돌아가기"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-blue-600">지문 학습</p>
            <h1 className="line-clamp-1 text-[13px] font-bold text-slate-900">{title}</h1>
          </div>
          <Link
            href={askHref}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 active:bg-blue-100"
            aria-label="AI 코칭룸"
          >
            <HelpCircle className="size-4.5" />
          </Link>
        </div>
        <div className="flex border-t border-slate-100">
          {MODES.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (key === "coach") {
                  router.push(askHref);
                  return;
                }
                setMode(key);
              }}
              className={cn(
                "inline-flex h-11 flex-1 items-center justify-center gap-1.5 border-b-2 text-xs font-bold transition",
                mode === key && key !== "coach"
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-400 active:text-slate-700",
              )}
              aria-pressed={mode === key && key !== "coach"}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1">
        {mode === "passage" && (
          <PassageMode
            sentences={sentences}
            wordCount={wordCount}
            completion={completion}
            correctCount={correctCount}
            totalActivities={activities.length}
            analysisData={analysisData}
          />
        )}
        {mode === "training" && (
          <TrainingMode
            academy={academy}
            programId={programId}
            lessonId={lessonId}
            askHref={askHref}
            activities={activities}
            completion={completion}
            answeredCount={answeredCount}
            correctCount={correctCount}
          />
        )}
      </main>

      {mode !== "training" && firstTodo && (
        <div className="sticky bottom-0 z-20 border-t border-slate-100 bg-white/95 px-3 py-2.5 backdrop-blur">
          <Link
            href={firstTodoHref}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[13px] font-bold text-white active:bg-blue-700"
          >
            <Play className="size-4" />
            {firstTodo.answered ? "다시 훈련하기" : "이어서 훈련하기"}
            <span className="ml-2 inline-flex h-5 items-center rounded-full bg-blue-500/60 px-2 text-[10px] font-bold">
              {answeredCount}/{activities.length}
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function PassageMode({
  sentences,
  wordCount,
  completion,
  correctCount,
  totalActivities,
  analysisData,
}: {
  sentences: SentenceRow[];
  wordCount: number;
  completion: number;
  correctCount: number;
  totalActivities: number;
  analysisData: PassageAnalysisData | null;
}) {
  const [showKo, setShowKo] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  return (
    <div className="px-4 pb-6 pt-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
          <span>{sentences.length}문장</span>
          <span className="text-slate-200">·</span>
          <span>{wordCount} words</span>
          {totalActivities > 0 && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-blue-600">진도 {completion}%</span>
              <span className="text-slate-200">·</span>
              <span className="text-slate-500">정답 {correctCount}/{totalActivities}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowKo((value) => !value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition",
              showKo
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500 active:bg-slate-200",
            )}
          >
            해석 {showKo ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => setShowAnalysis((value) => !value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition",
              showAnalysis
                ? "bg-blue-600 text-white"
                : "bg-blue-50 text-blue-700 ring-1 ring-blue-100 active:bg-blue-100",
            )}
          >
            <BookOpen className="size-3.5" />
            {showAnalysis ? "본문 보기" : "분석 보기"}
          </button>
        </div>
      </div>

      {showAnalysis ? (
        <LessonReader sentences={sentences} analysisData={analysisData} />
      ) : (
        <div className="space-y-3.5">
          {sentences.map((sentence) => (
            <div key={sentence.index}>
              <div className="flex gap-2">
                <span className="w-5 shrink-0 pt-[3px] text-right text-[10px] font-bold text-slate-300">
                  {sentence.index + 1}
                </span>
                <p className="flex-1 font-mono text-[14.5px] font-medium leading-7 text-slate-900">
                  {sentence.english}
                </p>
              </div>
              {showKo && sentence.korean && (
                <p className="ml-7 mt-1 text-[12px] font-medium leading-6 text-slate-500">
                  {sentence.korean}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrainingMode({
  academy,
  programId,
  lessonId,
  askHref,
  activities,
  completion,
  answeredCount,
  correctCount,
}: {
  academy: string;
  programId: string;
  lessonId: string;
  askHref: string;
  activities: LessonLabActivity[];
  completion: number;
  answeredCount: number;
  correctCount: number;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, LessonLabActivity[]>();
    for (const activity of activities) {
      const list = map.get(activity.mode) ?? [];
      list.push(activity);
      map.set(activity.mode, list);
    }
    return Array.from(map.entries());
  }, [activities]);

  return (
    <div className="px-4 pb-8 pt-3">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400">전체 진도</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">
            {completion}
            <span className="ml-0.5 text-base font-bold text-slate-400">%</span>
          </p>
        </div>
        <div className="flex gap-2 text-center">
          <Stat label="푼 활동" value={`${answeredCount}/${activities.length}`} />
          <Stat label="정답" value={`${correctCount}`} tone="blue" />
        </div>
      </div>

      <Link
        href={askHref}
        className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 active:bg-blue-100"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Bot className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-black text-blue-900">AI 코칭룸</span>
          <span className="mt-0.5 block text-[11px] font-semibold leading-5 text-blue-700">
            지문 질문, 채팅 퀴즈, 즉시 채점, 약점 분석을 한 화면에서 진행합니다.
          </span>
        </span>
        <MessageCircleQuestion className="size-5 shrink-0 text-blue-600" />
      </Link>

      <div className="space-y-5">
        {grouped.map(([mode, modeActivities]) => {
          const done = modeActivities.filter((activity) => activity.answered).length;
          return (
            <section key={mode}>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[13px] font-bold text-slate-900">
                  {tutorModeLabels[mode] ?? mode}
                </p>
                <span className="text-[11px] font-bold text-slate-400">
                  {done}/{modeActivities.length}
                </span>
              </div>
              <div className="space-y-2">
                {modeActivities.map((activity) => (
                  <Link
                    key={activity.id}
                    href={tutorPath(academy, `/study/${programId}/units/${lessonId}/activity/${activity.id}`)}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 active:bg-slate-50"
                  >
                    {activity.isCorrect ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-600" />
                    ) : activity.answered ? (
                      <Circle className="mt-0.5 size-4 shrink-0 fill-slate-300 text-slate-300" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-blue-600">
                        {labelTutorActivityType(activity.type)}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-5 text-slate-900">
                        {studentActivityTitle(activity.type, activity.title, activity.payload)}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] font-medium text-slate-400">
                        {studentActivityInstruction(activity.type, activity.instructions, activity.payload)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-[10px] font-bold text-slate-400">
                      <p>{Math.max(1, Math.ceil(activity.estimatedSec / 60))}분</p>
                      <p className="mt-0.5 text-blue-600">{activity.maxScore}점</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "blue" }) {
  return (
    <div className="rounded-xl bg-white px-3 py-1.5">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p
        className={cn(
          "text-[13px] font-bold",
          tone === "blue" ? "text-blue-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}
