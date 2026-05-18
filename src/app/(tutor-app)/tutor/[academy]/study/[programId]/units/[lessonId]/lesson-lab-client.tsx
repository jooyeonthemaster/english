"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  Grid3X3,
  ListChecks,
  MessageCircleQuestion,
  Play,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  labelTutorActivityType,
  studentActivityInstruction,
  studentActivityTitle,
  tutorDimensionLabels,
  tutorModeDescriptions,
  tutorModeLabels,
} from "@/lib/tutor/activity-labels";
import { cn } from "@/lib/utils";

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

type AnalysisSummary = {
  mainIdea: string;
  purpose: string;
  keyPoints: string[];
  flow: Array<{ role: string; summary: string; sentenceIndices: number[] }>;
  vocabCount: number;
  grammarCount: number;
};

const dimensions: CoverageDimension[] = ["interpret", "memorize", "order", "vocab", "grammar", "transfer"];
const tabs = [
  { key: "overview", label: "분석" },
  { key: "activities", label: "훈련" },
  { key: "coverage", label: "커버리지" },
] as const;

export function LessonLabClient({
  academy,
  programId,
  lessonId,
  title,
  passage,
  sentences,
  analysis,
  activities,
}: {
  academy: string;
  programId: string;
  lessonId: string;
  title: string;
  passage: string;
  sentences: SentenceRow[];
  analysis: AnalysisSummary;
  activities: LessonLabActivity[];
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("overview");
  const answeredCount = activities.filter((activity) => activity.answered).length;
  const correctCount = activities.filter((activity) => activity.isCorrect).length;
  const completion = activities.length ? Math.round((answeredCount / activities.length) * 100) : 0;
  const earnedScore = activities.reduce((sum, activity) => sum + activity.scoreEarned, 0);
  const maxScore = activities.reduce((sum, activity) => sum + activity.scoreMax, 0);
  const firstTodo = activities.find((activity) => !activity.answered) ?? activities[0];

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
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/tutor/${academy}/study/${programId}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-600"
            aria-label="프로그램으로 돌아가기"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-blue-600">지문 학습 랩</p>
            <h1 className="mt-0.5 line-clamp-1 text-lg font-black text-slate-950">{title}</h1>
          </div>
          <Link
            href={`/tutor/${academy}/study/${programId}/units/${lessonId}/ask`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700"
          >
            <MessageCircleQuestion className="size-4" />
            질문
          </Link>
        </div>
      </header>

      <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="rounded-[28px] bg-slate-950 p-5 text-white shadow-xl shadow-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase text-blue-200">Current Passage</p>
                <h2 className="mt-2 text-2xl font-black leading-8">{title}</h2>
              </div>
              <Badge className="rounded-full bg-white text-slate-950 hover:bg-white">{sentences.length}문장</Badge>
            </div>
            <p className="mt-4 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white/10 p-4 text-sm font-medium leading-7 text-slate-100">
              {passage}
            </p>
          </div>

          <div className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black text-blue-700">나의 진행률</p>
                <p className="mt-1 text-4xl font-black text-slate-950">{completion}%</p>
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                <p className="text-[11px] font-bold text-slate-500">정답</p>
                <p className="text-lg font-black text-blue-700">{correctCount}개</p>
              </div>
            </div>
            <Progress value={completion} className="mt-4 h-2.5" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniMetric label="푼 활동" value={`${answeredCount}/${activities.length}`} />
              <MiniMetric label="점수" value={`${earnedScore}/${maxScore || 0}`} />
            </div>
            {firstTodo && (
              <Button asChild className="mt-4 h-12 w-full rounded-2xl bg-blue-600 text-sm font-black hover:bg-blue-700">
                <Link href={`/tutor/${academy}/study/${programId}/units/${lessonId}/activity/${firstTodo.id}`}>
                  <Play className="mr-2 size-4" />
                  {firstTodo.answered ? "다시 훈련하기" : "이어서 훈련하기"}
                </Link>
              </Button>
            )}
          </div>
        </section>

        <div className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "h-11 rounded-xl text-sm font-black transition",
                activeTab === tab.key ? "bg-white text-blue-700 shadow-sm" : "text-slate-500",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="space-y-4">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Target className="size-5 text-blue-600" />
                  <p className="text-base font-black text-slate-950">핵심 분석</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoBlock label="주제" value={analysis.mainIdea || "지문의 중심 생각을 먼저 확인하세요."} />
                  <InfoBlock label="목적" value={analysis.purpose || "글쓴이가 왜 이 흐름으로 말하는지 확인하세요."} />
                </div>
                {analysis.keyPoints.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black text-slate-500">암기할 핵심 포인트</p>
                    <div className="mt-3 space-y-2">
                      {analysis.keyPoints.slice(0, 4).map((point, index) => (
                        <div key={`${point}-${index}`} className="flex gap-2 text-sm font-semibold leading-6 text-slate-700">
                          <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">
                            {index + 1}
                          </span>
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <ListChecks className="size-5 text-blue-600" />
                  <p className="text-base font-black text-slate-950">문장별 직독직해</p>
                </div>
                <div className="space-y-3">
                  {sentences.map((sentence) => (
                    <div key={sentence.index} className="rounded-2xl bg-slate-50 p-4">
                      <p className="mb-2 text-[11px] font-black text-blue-600">Sentence {sentence.index + 1}</p>
                      <p className="text-sm font-bold leading-7 text-slate-950">{sentence.english}</p>
                      {sentence.korean && <p className="mt-2 border-l-2 border-blue-500 pl-3 text-sm font-semibold leading-6 text-slate-600">{sentence.korean}</p>}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="size-5 text-blue-600" />
                <p className="text-base font-black text-slate-950">논리 흐름</p>
              </div>
              {analysis.flow.length > 0 ? (
                <div className="space-y-3">
                  {analysis.flow.map((item, index) => (
                    <div key={`${item.role}-${index}`} className="relative rounded-2xl bg-blue-50 p-4">
                      <p className="text-xs font-black text-blue-700">{item.role}</p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{item.summary}</p>
                      <p className="mt-2 text-[11px] font-bold text-slate-500">
                        {item.sentenceIndices.map((sentenceIndex) => `문장 ${sentenceIndex + 1}`).join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">
                  분석 흐름이 아직 충분하지 않습니다. 훈련을 먼저 진행해도 됩니다.
                </p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniMetric label="어휘 포인트" value={`${analysis.vocabCount}개`} />
                <MiniMetric label="어법 포인트" value={`${analysis.grammarCount}개`} />
              </div>
            </section>
          </div>
        )}

        {activeTab === "activities" && (
          <div className="space-y-4">
            {grouped.map(([mode, modeActivities]) => {
              const done = modeActivities.filter((activity) => activity.answered).length;
              const pct = modeActivities.length ? Math.round((done / modeActivities.length) * 100) : 0;
              return (
                <section key={mode} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-black text-slate-950">{tutorModeLabels[mode] ?? mode}</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">{tutorModeDescriptions[mode] ?? "지문 기반 반복 훈련"}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-blue-100 bg-blue-50 text-blue-700">
                      {done}/{modeActivities.length}
                    </Badge>
                  </div>
                  <Progress value={pct} className="mb-3 h-2" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {modeActivities.map((activity) => (
                      <Link
                        key={activity.id}
                        href={`/tutor/${academy}/study/${programId}/units/${lessonId}/activity/${activity.id}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black text-blue-600">{labelTutorActivityType(activity.type)}</p>
                            <p className="mt-1 line-clamp-2 text-sm font-black leading-6 text-slate-950">
                              {studentActivityTitle(activity.type, activity.title, activity.payload)}
                            </p>
                          </div>
                          {activity.isCorrect ? <CheckCircle2 className="size-5 shrink-0 text-blue-600" /> : <Circle className="size-5 shrink-0 text-slate-300" />}
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-slate-500">
                          {studentActivityInstruction(activity.type, activity.instructions, activity.payload)}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-500">
                          <span>{Math.ceil(activity.estimatedSec / 60)}분</span>
                          <span>{activity.maxScore}점</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {activeTab === "coverage" && (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2">
                <Grid3X3 className="size-5 text-blue-600" />
                <p className="text-base font-black text-slate-950">학습 커버리지</p>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500">문장별로 어떤 유형의 훈련이 준비되어 있고 완료됐는지 확인합니다.</p>
            </div>
            <div className="overflow-x-auto p-3 sm:p-4">
              <div className="grid min-w-[720px] gap-1" style={{ gridTemplateColumns: "82px repeat(6, 1fr)" }}>
                <div />
                {dimensions.map((dimension) => (
                  <div key={dimension} className="rounded-xl bg-slate-50 px-2 py-2 text-center text-xs font-black text-slate-500">
                    {tutorDimensionLabels[dimension]}
                  </div>
                ))}
                {sentences.map((sentence) => (
                  <CoverageRow key={sentence.index} sentence={sentence} activities={activities} />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="mb-1 text-xs font-black text-slate-400">{label}</p>
      <p className="text-sm font-bold leading-6 text-slate-800">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-100">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function CoverageRow({
  sentence,
  activities,
}: {
  sentence: SentenceRow;
  activities: LessonLabActivity[];
}) {
  return (
    <>
      <div className="rounded-xl bg-slate-50 px-2 py-3 text-xs font-black text-slate-600">문장 {sentence.index + 1}</div>
      {dimensions.map((dimension) => {
        const linked = activities.filter((activity) =>
          activity.coverageRefs.some((ref) => ref.sentenceIndex === sentence.index && ref.dimension === dimension),
        );
        const pct = Math.min(
          100,
          Math.round(
            linked.reduce((sum, activity) => {
              return (
                sum +
                activity.coverageRefs
                  .filter((ref) => ref.sentenceIndex === sentence.index && ref.dimension === dimension)
                  .reduce((refSum, ref) => refSum + (ref.weight ?? 0.5), 0)
              );
            }, 0) * 100,
          ),
        );
        const completed = linked.length > 0 && linked.every((activity) => activity.answered);
        return (
          <div key={`${sentence.index}-${dimension}`} className="rounded-xl bg-slate-50 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">{linked.length}개</span>
              {completed && <CheckCircle2 className="size-3.5 text-blue-600" />}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div className={cn("h-full rounded-full", completed ? "bg-blue-600" : "bg-blue-200")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </>
  );
}
