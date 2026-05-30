"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BatteryFull,
  BookOpen,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  HelpCircle,
  Home,
  MessageCircleQuestion,
  MonitorSmartphone,
  Play,
  RotateCcw,
  Send,
  Smartphone,
  Tablet,
  Target,
  User,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  labelTutorActivityType,
  labelTutorMode,
  studentActivityInstruction,
  studentActivityTitle,
  tutorModeLabels,
} from "@/lib/tutor/activity-labels";
import { formatTutorStatus } from "@/lib/tutor/ui-copy";
import {
  ActivityRenderer,
  FeedbackPanel,
  PassageStrip as KitPassageStrip,
  type ActivityFeedback,
} from "@/components/tutor/activity-kit";
import { toStudentPayload } from "@/lib/tutor/student-payload";
import { buildViewablePassage, resolvePassagePolicy } from "@/lib/tutor/visibility";
import { TutorActivityPayloadSchema } from "@/lib/tutor/activity-payload-schema";
import { gradeRule } from "@/lib/tutor/grading/grade-rule";
import { cn } from "@/lib/utils";

type DeviceMode = "mobile" | "tablet";
type ScreenMode = "home" | "program" | "lesson" | "activity";
type LabMode = "passage" | "coach" | "training";

type EmulatorProgram = {
  id: string;
  title: string;
  status: string;
  lessons: Array<{
    id: string;
    orderNum: number;
    title: string;
    passageTitle: string;
    passageContent: string;
    schoolName?: string | null;
    grade?: number | null;
    unit?: string | null;
    analysisData?: any | null;
    sentences: Array<{ index: number; english: string; korean: string }>;
    activities: Array<{
      id: string;
      lessonId: string;
      mode: string;
      type: string;
      title: string;
      instructions: string | null;
      payload: Record<string, unknown>;
      maxScore: number;
      estimatedSec: number;
    }>;
  }>;
};

const multipleChoiceTypes = new Set([
  "vocab_choice",
  "gist_select",
  "paraphrase_mc",
  "contextual_meaning",
  "collocation_select",
  "grammar_binary",
  "insertion_point",
  "irrelevant_sentence",
  "mastery_test",
]);

export function TutorProgramEmulatorClient({
  academyName,
  academySlug,
  studentName,
  program,
}: {
  academyName: string;
  academySlug: string;
  studentName: string;
  program: EmulatorProgram;
}) {
  const [device, setDevice] = useState<DeviceMode>("mobile");
  const [screen, setScreen] = useState<ScreenMode>("home");
  const [selectedLessonId, setSelectedLessonId] = useState(program.lessons[0]?.id ?? "");
  const selectedLesson = program.lessons.find((lesson) => lesson.id === selectedLessonId) ?? program.lessons[0] ?? null;
  const [selectedActivityId, setSelectedActivityId] = useState(selectedLesson?.activities[0]?.id ?? "");
  const selectedActivity =
    selectedLesson?.activities.find((activity) => activity.id === selectedActivityId) ??
    selectedLesson?.activities[0] ??
    null;

  function openLesson(lessonId: string) {
    const lesson = program.lessons.find((item) => item.id === lessonId);
    setSelectedLessonId(lessonId);
    setSelectedActivityId(lesson?.activities[0]?.id ?? "");
    setScreen("lesson");
  }

  function openActivity(lessonId: string, activityId: string) {
    setSelectedLessonId(lessonId);
    setSelectedActivityId(activityId);
    setScreen("activity");
  }

  return (
    <div className="grid gap-5 px-5 py-5 lg:px-8 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="size-5 text-blue-600" />
            <p className="text-sm font-black text-slate-950">에뮬레이터 제어</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <DeviceButton active={device === "mobile"} icon={Smartphone} label="모바일" onClick={() => setDevice("mobile")} />
            <DeviceButton active={device === "tablet"} icon={Tablet} label="태블릿" onClick={() => setDevice("tablet")} />
          </div>

          <div className="mt-4 space-y-2">
            <Label text="학생 화면" />
            <select
              value={screen}
              onChange={(event) => setScreen(event.target.value as ScreenMode)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="home">학습 홈</option>
              <option value="program">프로그램 상세</option>
              <option value="lesson">지문 랩</option>
              <option value="activity">활동 풀이</option>
            </select>
          </div>

          <div className="mt-3 space-y-2">
            <Label text="지문" />
            <select
              value={selectedLesson?.id ?? ""}
              onChange={(event) => {
                const lesson = program.lessons.find((item) => item.id === event.target.value);
                setSelectedLessonId(event.target.value);
                setSelectedActivityId(lesson?.activities[0]?.id ?? "");
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
            >
              {program.lessons.map((lesson, index) => (
                <option key={lesson.id} value={lesson.id}>
                  {index + 1}. {lesson.title}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 space-y-2">
            <Label text="활동" />
            <select
              value={selectedActivity?.id ?? ""}
              onChange={(event) => setSelectedActivityId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-100"
            >
              {selectedLesson?.activities.map((activity, index) => (
                <option key={activity.id} value={activity.id}>
                  {index + 1}. {labelTutorActivityType(activity.type)}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-black text-slate-950">프로그램 구성</p>
          <div className="mt-3 space-y-2">
            {program.lessons.map((lesson, index) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => openLesson(lesson.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
                  selectedLesson?.id === lesson.id ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-white hover:bg-slate-50",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-black text-blue-700 shadow-sm">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-xs font-black text-slate-900">{lesson.title}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                    {lesson.activities.length}개 활동 · {lesson.sentences.length}문장
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-blue-600">{device === "mobile" ? "390 x 760" : "820 x 1080"} viewport</p>
            <p className="mt-0.5 text-sm font-black text-slate-950">학생 앱 실제 렌더링 미리보기</p>
          </div>
          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
            {academyName}
          </Badge>
        </div>

        <div className="flex justify-center">
          <DeviceFrame device={device}>
            {screen === "home" && (
              <HomeScreen
                academySlug={academySlug}
                studentName={studentName}
                program={program}
                onOpenProgram={() => setScreen("program")}
              />
            )}
            {screen === "program" && (
              <ProgramScreen
                academySlug={academySlug}
                program={program}
                onBack={() => setScreen("home")}
                onOpenLesson={openLesson}
              />
            )}
            {screen === "lesson" && selectedLesson && (
              <LessonScreen
                lesson={selectedLesson}
                onBack={() => setScreen("program")}
                onOpenActivity={(activityId) => openActivity(selectedLesson.id, activityId)}
              />
            )}
            {screen === "activity" && selectedLesson && selectedActivity && (
              <ActivityScreen
                lesson={selectedLesson}
                activity={selectedActivity}
                onBack={() => setScreen("lesson")}
                onNext={(nextId) => {
                  if (nextId) openActivity(selectedLesson.id, nextId);
                  else setScreen("lesson");
                }}
              />
            )}
          </DeviceFrame>
        </div>
      </main>
    </div>
  );
}

function DeviceFrame({ device, children }: { device: DeviceMode; children: React.ReactNode }) {
  const width = device === "mobile" ? 390 : 820;
  const height = device === "mobile" ? 760 : 1080;

  return (
    <div
      className="overflow-hidden rounded-[34px] border-[10px] border-slate-950 bg-slate-950 shadow-2xl shadow-slate-300"
      style={{ width, maxWidth: "100%", height, maxHeight: "calc(100vh - 220px)" }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[24px] bg-white">
        <div className="flex h-8 shrink-0 items-center justify-between bg-white px-5 text-[11px] font-black text-slate-950">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Wifi className="size-3.5" />
            <BatteryFull className="size-4" />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#e0f2fe_0,#f8fafc_34%,#f1f5f9_100%)]">
          {children}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({
  academySlug,
  studentName,
  program,
  onOpenProgram,
}: {
  academySlug: string;
  studentName: string;
  program: EmulatorProgram;
  onOpenProgram: () => void;
}) {
  const totalLessons = program.lessons.length;

  return (
    <StudentShell academySlug={academySlug} active="study">
      <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
        <section className="overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-xl shadow-slate-200">
          <div className="relative px-5 py-6 sm:px-7">
            <div className="absolute right-4 top-4 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black text-blue-100">
              Tutor Lab
            </div>
            <p className="text-sm font-bold text-blue-200">{studentName} 학생</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">오늘의 학습</h1>
            <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-slate-300">
              선생님이 배포한 지문을 순서대로 풀면 해석, 암기, 어법, 문맥 흐름이 한 번에 누적됩니다.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <HeroMetric label="배포" value="1" />
              <HeroMetric label="지문" value={`${totalLessons}`} />
              <HeroMetric label="완료" value="0" />
            </div>

            <button onClick={onOpenProgram} className="mt-5 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left text-slate-950 shadow-lg">
              <span className="min-w-0">
                <span className="text-[11px] font-black text-blue-600">바로 이어서</span>
                <span className="mt-0.5 block truncate text-sm font-black">{program.title}</span>
              </span>
              <ChevronRight className="size-5 text-blue-600" />
            </button>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2 sm:gap-3">
          <QuickLink icon={Target} label="오답 복습" sub="틀린 것만" />
          <QuickLink icon={MessageCircleQuestion} label="질문 기록" sub="해설 모음" />
          <QuickLink icon={User} label="MY 리포트" sub="성장 확인" />
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase text-blue-600">Assignments</p>
              <h2 className="text-xl font-black text-slate-950">학습 프로그램</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">1개</span>
          </div>

          <button onClick={onOpenProgram} className="block w-full text-left">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <span className="mb-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                    {formatTutorStatus(program.status)}
                  </span>
                  <p className="line-clamp-2 text-base font-black leading-6 text-slate-950">{program.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{program.lessons.length}개 지문 · 0개 완료</p>
                </div>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-blue-600 ring-1 ring-slate-100">
                  <BookOpenCheck className="size-6" />
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500">
                  <span>진행률</span>
                  <span>0%</span>
                </div>
                <Progress value={0} className="h-2" />
              </div>
            </div>
          </button>
        </section>
      </div>
    </StudentShell>
  );
}

function ProgramScreen({
  academySlug,
  program,
  onBack,
  onOpenLesson,
}: {
  academySlug: string;
  program: EmulatorProgram;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
}) {
  return (
    <StudentShell academySlug={academySlug} active="study">
      <div className="space-y-5 px-4 py-5 sm:px-6 md:px-8">
        <header className="flex items-start gap-3">
          <IconButton onClick={onBack} label="학습 홈으로 돌아가기">
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase text-blue-600">Program</p>
            <h1 className="mt-1 text-2xl font-black leading-8 text-slate-950">{program.title}</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
              지문을 하나씩 열고, 분석 → 훈련 → 질문까지 한 흐름으로 마무리하세요.
            </p>
          </div>
        </header>

        <section className="rounded-[28px] border border-blue-100 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black text-blue-700">전체 진도</p>
              <p className="mt-1 text-3xl font-black text-slate-950">0%</p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
              <p className="text-xs font-bold text-slate-500">완료 지문</p>
              <p className="mt-1 text-lg font-black text-blue-700">0/{program.lessons.length}</p>
            </div>
          </div>
          <Progress value={0} className="mt-4 h-2.5" />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-950">지문 로드맵</h2>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white text-slate-500">
              {program.lessons.length} lessons
            </Badge>
          </div>

          {program.lessons.map((lesson, index) => (
            <div key={lesson.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <button onClick={() => onOpenLesson(lesson.id)} className="block w-full p-4 text-left sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 font-black text-slate-500">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="line-clamp-1 text-base font-black text-slate-950">{lesson.title}</p>
                      <ChevronRight className="size-4 shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{lesson.passageContent}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                        {formatTutorStatus("NOT_STARTED")}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                        <Target className="size-3.5" />
                        {lesson.activities.length}개 훈련
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
                        <BookOpen className="size-3.5" />
                        {index + 1}번째 지문
                      </span>
                    </div>
                  </div>
                </div>
              </button>
              <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 text-sm font-black text-blue-700">
                  <MessageCircleQuestion className="size-4" />
                  이 지문 질문하기
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </StudentShell>
  );
}

function LessonScreen({
  lesson,
  onBack,
  onOpenActivity,
}: {
  lesson: EmulatorProgram["lessons"][number];
  onBack: () => void;
  onOpenActivity: (activityId: string) => void;
}) {
  const [mode, setMode] = useState<LabMode>("passage");
  const [showKo, setShowKo] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const wordCount = useMemo(() => lesson.passageContent.trim().split(/\s+/).filter(Boolean).length, [lesson.passageContent]);

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <IconButton onClick={onBack} label="프로그램으로 돌아가기" compact>
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-blue-600">지문 학습</p>
            <h1 className="line-clamp-1 text-[13px] font-bold text-slate-900">{lesson.title}</h1>
          </div>
          <button
            onClick={() => setMode("coach")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 active:bg-blue-100"
            aria-label="AI 코칭룸"
          >
            <HelpCircle className="size-4.5" />
          </button>
        </div>
        <div className="flex border-t border-slate-100">
          {[
            { key: "passage", label: "본문", Icon: BookOpen },
            { key: "coach", label: "AI 코칭룸", Icon: MessageCircleQuestion },
            { key: "training", label: "훈련", Icon: Target },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key as LabMode)}
              className={cn(
                "inline-flex h-11 flex-1 items-center justify-center gap-1.5 border-b-2 text-xs font-bold transition",
                mode === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-400 active:text-slate-700",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1">
        {mode === "passage" && (
          <div className="px-4 pb-6 pt-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                <span>{lesson.sentences.length}문장</span>
                <span className="text-slate-200">·</span>
                <span>{wordCount} words</span>
                <span className="text-slate-200">·</span>
                <span className="text-blue-600">진도 0%</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowKo((value) => !value)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition",
                    showKo ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 active:bg-slate-200",
                  )}
                >
                  해석 {showKo ? "ON" : "OFF"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAnalysis((value) => !value)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition",
                    showAnalysis ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 ring-1 ring-blue-100 active:bg-blue-100",
                  )}
                >
                  <BookOpen className="size-3.5" />
                  {showAnalysis ? "본문 보기" : "분석 보기"}
                </button>
              </div>
            </div>

            {showAnalysis ? <AnalysisPreview analysisData={lesson.analysisData} /> : <PassageSentences sentences={lesson.sentences} showKo={showKo} />}
          </div>
        )}

        {mode === "coach" && <CoachPreview lesson={lesson} />}
        {mode === "training" && <TrainingPreview lesson={lesson} onOpenActivity={onOpenActivity} />}
      </main>

      {mode !== "training" && lesson.activities[0] && (
        <div className="sticky bottom-0 z-20 border-t border-slate-100 bg-white/95 px-3 py-2.5 backdrop-blur">
          <button
            onClick={() => onOpenActivity(lesson.activities[0].id)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-[13px] font-bold text-white active:bg-blue-700"
          >
            <Play className="size-4" />
            이어서 훈련하기
            <span className="ml-2 inline-flex h-5 items-center rounded-full bg-blue-500/60 px-2 text-[10px] font-bold">
              0/{lesson.activities.length}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function TrainingPreview({
  lesson,
  onOpenActivity,
}: {
  lesson: EmulatorProgram["lessons"][number];
  onOpenActivity: (activityId: string) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof lesson.activities>();
    for (const activity of lesson.activities) {
      const list = map.get(activity.mode) ?? [];
      list.push(activity);
      map.set(activity.mode, list);
    }
    return Array.from(map.entries());
  }, [lesson]);

  return (
    <div className="px-4 pb-8 pt-3">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <div>
          <p className="text-[10px] font-bold text-slate-400">전체 진도</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">
            0<span className="ml-0.5 text-base font-bold text-slate-400">%</span>
          </p>
        </div>
        <div className="flex gap-2 text-center">
          <Stat label="푼 활동" value={`0/${lesson.activities.length}`} />
          <Stat label="정답" value="0" tone="blue" />
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
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
      </div>

      <div className="space-y-5">
        {grouped.map(([mode, activities]) => (
          <section key={mode}>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[13px] font-bold text-slate-900">{tutorModeLabels[mode] ?? mode}</p>
              <span className="text-[11px] font-bold text-slate-400">0/{activities.length}</span>
            </div>
            <div className="space-y-2">
              {activities.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => onOpenActivity(activity.id)}
                  className="flex w-full items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left active:bg-slate-50"
                >
                  <Circle className="mt-0.5 size-4 shrink-0 text-slate-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold text-blue-600">{labelTutorActivityType(activity.type)}</p>
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
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ActivityScreen({
  lesson,
  activity,
  onBack,
  onNext,
}: {
  lesson: EmulatorProgram["lessons"][number];
  activity: EmulatorProgram["lessons"][number]["activities"][number];
  onBack: () => void;
  onNext: (nextActivityId?: string) => void;
}) {
  // v2 payload 파싱 → 학생 화면과 동일한 키트로 렌더 + 실제 rule 채점 재현(포크 제거).
  const parsed = TutorActivityPayloadSchema.safeParse(activity.payload);
  const ground = parsed.success ? parsed.data : null;
  const studentPayload = ground ? toStudentPayload(ground) : null;
  const policy = ground ? resolvePassagePolicy(activity.type, ground.passagePolicy, true) : "visible";
  const viewable = buildViewablePassage(policy, lesson.passageContent);
  const isAiGraded = ground?.form === "TEXT" && (ground.gradeMode === "ai" || ground.gradeMode === "hybrid");
  const payloadRecord = (studentPayload ?? {}) as Record<string, unknown>;

  const [response, setResponse] = useState<unknown>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [feedback, setFeedback] = useState<ActivityFeedback | null>(null);

  const activities = lesson.activities;
  const currentIndex = activities.findIndex((item) => item.id === activity.id);
  const next = activities[currentIndex + 1];

  function resetLocalAnswer() {
    setResponse(null);
    setCanSubmit(false);
    setFeedback(null);
  }

  function gradePreview() {
    if (!ground) return;
    if (isAiGraded) {
      setFeedback({
        isCorrect: false,
        scoreEarned: 0,
        scoreMax: activity.maxScore,
        explanation: "AI 채점 대상(서술형)이에요. 학생 화면에서는 Gemini가 의미·조건을 채점합니다. 아래 모범답안/조건으로 검수하세요.",
        degraded: true,
      });
      return;
    }
    const result = gradeRule(ground, response, activity.maxScore);
    setFeedback({
      isCorrect: result.isCorrect,
      scoreEarned: result.scoreEarned,
      scoreMax: result.scoreMax,
      explanation: result.explanation,
    });
  }

  const groundText =
    ground?.form === "TEXT"
      ? { modelAnswer: ground.modelAnswer, conditions: ground.conditions, acceptedAnswers: ground.acceptedAnswers }
      : null;

  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <IconButton onClick={onBack} label="학습 랩으로 돌아가기" compact>
            <ArrowLeft className="size-5" />
          </IconButton>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-blue-600">
              {labelTutorMode(activity.mode)} · {labelTutorActivityType(activity.type)}
            </p>
            <h1 className="line-clamp-1 text-[13px] font-bold text-slate-900">
              {studentActivityTitle(activity.type, activity.title, payloadRecord)}
            </h1>
          </div>
          <button className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 active:bg-blue-100" aria-label="질문하기">
            <HelpCircle className="size-4.5" />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-5 px-4 pb-36 pt-4 md:pb-40">
        <KitPassageStrip title={lesson.passageTitle} viewable={viewable} />

        <section className="space-y-1.5">
          <p className="text-[10px] font-bold tracking-wide text-blue-600">해야 할 일</p>
          <p className="text-[13px] font-bold leading-6 text-slate-900">
            {studentActivityInstruction(activity.type, activity.instructions, payloadRecord)}
          </p>
        </section>

        <section className="space-y-3">
          {studentPayload ? (
            <ActivityRenderer
              payload={studentPayload}
              disabled={Boolean(feedback)}
              onResponse={(nextResponse, nextCanSubmit) => {
                if (feedback) return;
                setResponse(nextResponse);
                setCanSubmit(nextCanSubmit);
              }}
            />
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[12.5px] font-medium text-slate-500">
              이 활동은 형식이 오래되어 다시 생성이 필요해요.
            </p>
          )}
        </section>

        {groundText && (groundText.modelAnswer || groundText.conditions?.length) && (
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold tracking-wide text-slate-500">검수용 · 학생에게는 안 보임</p>
            {groundText.conditions?.length ? (
              <div className="mt-1.5">
                <p className="text-[11px] font-bold text-slate-600">조건</p>
                <ul className="mt-0.5 space-y-0.5">
                  {groundText.conditions.map((cond, index) => (
                    <li key={index} className="text-[12px] font-medium leading-5 text-slate-700">
                      {index + 1}. {cond}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {groundText.modelAnswer ? (
              <p className="mt-1.5 text-[12px] font-medium leading-5 text-slate-700">
                <span className="font-bold text-slate-600">모범답안: </span>
                {groundText.modelAnswer}
              </p>
            ) : null}
          </section>
        )}

        {feedback && <FeedbackPanel feedback={feedback} />}
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-slate-100 bg-white/95 px-3 py-2.5 backdrop-blur">
        {feedback ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" onClick={resetLocalAnswer} className="h-11 rounded-xl px-3" aria-label="현재 활동 다시 풀기">
              <RotateCcw className="size-4" />
            </Button>
            <Button onClick={() => onNext(next?.id)} className="h-11 rounded-xl bg-blue-600 text-[13px] font-bold hover:bg-blue-700">
              {next ? "다음 활동" : "학습 랩으로"}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        ) : (
          <Button
            onClick={gradePreview}
            disabled={!studentPayload || (!canSubmit && !isAiGraded)}
            className="h-11 w-full rounded-xl bg-blue-600 text-[13px] font-bold hover:bg-blue-700"
          >
            채점하기
          </Button>
        )}
      </footer>
    </div>
  );
}

function StudentShell({ academySlug, active, children }: { academySlug: string; active: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[1040px] bg-white/95 pb-[78px] shadow-sm backdrop-blur">
      {children}
      <nav className="sticky bottom-0 z-40 grid h-[78px] grid-cols-4 border-t border-slate-200 bg-white/95 px-3 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] backdrop-blur md:px-8">
        {[
          { key: "study", icon: Home, label: "홈" },
          { key: "review", icon: BookOpen, label: "복습" },
          { key: "question-history", icon: MessageCircleQuestion, label: "질문" },
          { key: "report", icon: User, label: "MY" },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={`${academySlug}-${item.key}`}
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-1 border-t-2 text-[11px] font-black transition",
                isActive ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-slate-500",
              )}
            >
              <Icon className="size-5" strokeWidth={isActive ? 2.8 : 2.2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function AnalysisPreview({ analysisData }: { analysisData: any | null }) {
  if (!analysisData) {
    return (
      <div className="rounded-xl bg-slate-50 px-4 py-8 text-center text-[13px] font-medium text-slate-500">
        분석 데이터가 아직 준비되지 않았습니다.
      </div>
    );
  }

  const vocab = analysisData.vocabulary ?? [];
  const grammar = analysisData.grammarPoints ?? [];
  const flow = analysisData.structure?.logicFlow ?? [];

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
        <p className="text-[10px] font-black text-blue-700">주제·핵심</p>
        <p className="mt-1 text-[13px] font-bold leading-6 text-slate-900">
          {analysisData.structure?.mainIdea ?? analysisData.summary ?? "지문 핵심 분석"}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="어휘" value={`${vocab.length}`} />
        <Stat label="어법" value={`${grammar.length}`} tone="blue" />
        <Stat label="흐름" value={`${flow.length}`} />
      </div>
      <div className="space-y-2">
        {vocab.slice(0, 6).map((item: any, index: number) => (
          <div key={`${item.word}-${index}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
            <p className="font-mono text-[13px] font-black text-slate-900">{item.word ?? item.expression}</p>
            <p className="mt-0.5 text-[11px] font-medium leading-5 text-slate-500">{item.meaning ?? item.definition ?? item.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PassageSentences({ sentences, showKo }: { sentences: Array<{ index: number; english: string; korean: string }>; showKo: boolean }) {
  return (
    <div className="space-y-3.5">
      {sentences.map((sentence) => (
        <div key={sentence.index}>
          <div className="flex gap-2">
            <span className="w-5 shrink-0 pt-[3px] text-right text-[10px] font-bold text-slate-300">{sentence.index + 1}</span>
            <p className="flex-1 font-mono text-[14.5px] font-medium leading-7 text-slate-900">{sentence.english}</p>
          </div>
          {showKo && sentence.korean && <p className="ml-7 mt-1 text-[12px] font-medium leading-6 text-slate-500">{sentence.korean}</p>}
        </div>
      ))}
    </div>
  );
}

function CoachPreview({ lesson }: { lesson: EmulatorProgram["lessons"][number] }) {
  return (
    <div className="space-y-4 px-4 pb-8 pt-4">
      <div className="rounded-3xl bg-slate-950 px-4 py-5 text-white">
        <p className="text-xs font-black text-blue-200">AI 코칭룸</p>
        <h2 className="mt-1 text-xl font-black">{lesson.title}</h2>
        <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
          지문 질문, 채팅 퀴즈, 즉시 해설을 한 화면에서 이어갑니다.
        </p>
      </div>
      <div className="space-y-3">
        <ChatBubble role="assistant" text="어느 문장이 가장 헷갈렸나요? 문장 번호를 말해주면 구조부터 같이 풀어볼게요." />
        <ChatBubble role="student" text="3번 문장의 that이 뭔지 모르겠어요." />
        <ChatBubble role="assistant" text="좋아요. 여기서 that은 앞 절 전체를 받는 지시어가 아니라, 뒤 절을 이끄는 접속사 역할입니다." />
      </div>
      <div className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex items-center gap-2">
          <Input value="" readOnly placeholder="질문을 입력하세요" className="h-10 rounded-xl border-slate-100 text-[13px]" />
          <Button className="size-10 rounded-xl bg-blue-600 p-0 hover:bg-blue-700" aria-label="질문 보내기">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PassageStrip({ title, content, showPassage, onToggle }: { title: string; content: string; showPassage: boolean; onToggle: () => void }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wide text-slate-400">PASSAGE</p>
          <p className="line-clamp-1 text-[12.5px] font-bold text-slate-900">{title}</p>
        </div>
        <button type="button" onClick={onToggle} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-bold text-slate-600 active:bg-slate-200">
          {showPassage ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showPassage ? "가리기" : "원문 보기"}
        </button>
      </div>
      {showPassage ? (
        <p className="max-h-44 overflow-y-auto whitespace-pre-wrap border-l-2 border-slate-100 pl-3 font-mono text-[12.5px] font-medium leading-6 text-slate-700">
          {content}
        </p>
      ) : (
        <p className="border-l-2 border-dashed border-slate-200 pl-3 text-[11.5px] font-medium leading-6 text-slate-400">
          원문을 가리고 기억으로 풀어보는 모드입니다.
        </p>
      )}
    </section>
  );
}

function ChoiceQuestion({ activityType, prompt, payload, options, selected, feedback, onSelect }: any) {
  return (
    <div className="space-y-3">
      <QuestionPrompt activityType={activityType} prompt={prompt} payload={payload} />
      <div className="grid gap-1.5">
        {options.map((option: unknown, index: number) => {
          const detail = optionDetail(option);
          const active = selected === index;
          return (
            <button
              key={`${optionLabel(option, index)}-${index}`}
              type="button"
              disabled={feedback}
              onClick={() => onSelect(index)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-[13px] font-bold leading-5 transition",
                active ? "border-blue-500 bg-blue-50/60 text-blue-800" : "border-slate-100 bg-white text-slate-700 active:border-blue-200",
              )}
            >
              <span className="block">{optionLabel(option, index)}</span>
              {detail && (
                <span className="mt-1 block text-[11px] font-medium leading-5 text-slate-500">
                  <span className="block">앞: {detail.before}</span>
                  <span className="block">뒤: {detail.after}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrderQuestion({ orderItems, selectedOrder, onToggle }: any) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-bold tracking-wide text-blue-600">내가 만든 순서</p>
        <div className="flex flex-wrap gap-1.5 border-l-2 border-blue-200 pl-2.5">
          {selectedOrder.length === 0 ? (
            <span className="text-[12px] font-medium text-slate-400">아래 문장을 순서대로 누르세요.</span>
          ) : (
            selectedOrder.map((index: number, orderIndex: number) => (
              <button key={`${index}-${orderIndex}`} type="button" onClick={() => onToggle(index)} className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                {orderIndex + 1}. 문장 {index + 1}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="grid gap-1.5">
        {orderItems.map((item: any) => {
          const pickedIndex = selectedOrder.indexOf(item.index);
          const active = pickedIndex >= 0;
          return (
            <button key={item.index} type="button" onClick={() => onToggle(item.index)} className={cn("rounded-xl border px-3 py-2.5 text-left transition", active ? "border-blue-300 bg-blue-50/60" : "border-slate-100 bg-white active:border-blue-200")}>
              <span className="block text-[10px] font-bold text-slate-400">{active ? `${pickedIndex + 1}번째 선택` : "순서에 추가"}</span>
              <span className="mt-0.5 block font-mono text-[12.5px] font-medium leading-6 text-slate-800">{item.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VocabMatchQuestion({ leftItems, rightItems, matches, feedback, onMatch }: any) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] font-medium text-slate-500">영단어와 한국어 뜻을 하나씩 연결하세요.</p>
      <div className="space-y-3">
        {leftItems.map((left: string) => (
          <div key={left} className="border-l-2 border-slate-100 pl-3">
            <p className="mb-1.5 font-mono text-[13.5px] font-bold text-slate-900">{left}</p>
            <div className="flex flex-wrap gap-1.5">
              {rightItems.map((right: string) => (
                <button key={`${left}-${right}`} type="button" disabled={feedback} onClick={() => onMatch(left, right)} className={cn("rounded-md border px-2 py-1 text-[11px] font-bold transition", matches[left] === right ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-100 bg-white text-slate-600 active:border-blue-200")}>
                  {right}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChunkQuestion({ chunks, selectedChunkIds, selectedChunkText, onToggle }: any) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-bold tracking-wide text-blue-600">완성한 문장</p>
        <div className="flex flex-wrap gap-1.5 border-l-2 border-blue-200 pl-2.5">
          {selectedChunkIds.length === 0 ? (
            <span className="text-[12px] font-medium text-slate-400">아래 조각을 원문 순서대로 누르세요.</span>
          ) : (
            selectedChunkText.map((chunk: string, index: number) => (
              <button key={`${chunk}-${index}`} type="button" onClick={() => onToggle(selectedChunkIds[index])} className="rounded-md bg-blue-600 px-2 py-1 font-mono text-[11px] font-bold text-white">
                {chunk}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chunks.map((chunk: string, index: number) => {
          const picked = selectedChunkIds.includes(index);
          return (
            <button key={`${chunk}-${index}`} type="button" disabled={picked} onClick={() => onToggle(index)} className={cn("rounded-md border px-2 py-1 font-mono text-[12px] font-bold transition", picked ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300" : "border-slate-200 bg-white text-slate-700 active:border-blue-300 active:bg-blue-50")}>
              {chunk}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FreeFormQuestion({ activityType, prompt, answer, setAnswer, disabled }: any) {
  const isTextarea = activityType === "sentence_translate" || activityType === "structure_transform";
  return (
    <div className="space-y-2.5">
      <p className="break-words border-l-2 border-slate-200 pl-3 font-mono text-[13.5px] font-bold leading-7 text-slate-900">{prompt}</p>
      {isTextarea ? (
        <Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="답을 입력하세요." className="min-h-24 rounded-xl border-slate-200 bg-white text-[13.5px] leading-6" disabled={disabled} />
      ) : (
        <Input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="답 입력" className="h-11 rounded-xl border-slate-200 text-[13.5px]" disabled={disabled} />
      )}
    </div>
  );
}

function QuestionPrompt({ activityType, prompt, payload }: any) {
  if (activityType === "vocab_choice" || activityType === "contextual_meaning" || activityType === "collocation_select") {
    return (
      <div className="border-l-2 border-slate-200 pl-3">
        <p className="font-mono text-xl font-bold leading-7 text-slate-900">{String(payload.stem ?? prompt)}</p>
        {payload.sentenceIndex !== undefined && <p className="mt-1 text-[10px] font-bold text-slate-400">문장 {Number(payload.sentenceIndex) + 1} 기반</p>}
      </div>
    );
  }
  if (activityType === "insertion_point") {
    return (
      <div className="border-l-2 border-blue-300 pl-3">
        <p className="mb-1 text-[10px] font-bold text-blue-600">제시문</p>
        <p className="font-mono text-[13.5px] font-bold leading-7 text-slate-900">{String(payload.targetSentence ?? prompt)}</p>
      </div>
    );
  }
  return <p className="break-words border-l-2 border-slate-200 pl-3 font-mono text-[13.5px] font-bold leading-7 text-slate-900">{prompt}</p>;
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
      <p className="text-[10px] font-black text-blue-200">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function QuickLink({ icon: Icon, label, sub }: { icon: typeof Target; label: string; sub: string }) {
  return (
    <button className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm">
      <Icon className="size-5 text-blue-600" />
      <p className="mt-2 text-xs font-black text-slate-950">{label}</p>
      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{sub}</p>
    </button>
  );
}

function DeviceButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Smartphone; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-sm font-black transition",
        active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function IconButton({ onClick, label, compact, children }: { onClick: () => void; label: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm", compact ? "size-9" : "mt-1 size-10")}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "blue" }) {
  return (
    <div className="rounded-xl bg-white px-3 py-1.5">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className={cn("text-[13px] font-bold", tone === "blue" ? "text-blue-600" : "text-slate-900")}>{value}</p>
    </div>
  );
}

function ChatBubble({ role, text }: { role: "assistant" | "student"; text: string }) {
  return (
    <div className={cn("flex", role === "student" ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[82%] rounded-2xl px-3 py-2 text-[13px] font-medium leading-6", role === "student" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800")}>
        {text}
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <p className="text-[11px] font-black uppercase text-slate-400">{text}</p>;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function recordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : {}))
    : [];
}

function optionLabel(option: unknown, index: number) {
  if (!option || typeof option !== "object") return String(option ?? "");
  const record = option as Record<string, unknown>;
  return String(record.label ?? `${index + 1}번 위치`);
}

function optionDetail(option: unknown) {
  if (!option || typeof option !== "object") return null;
  const record = option as Record<string, unknown>;
  const before = String(record.before ?? "");
  const after = String(record.after ?? "");
  if (!before && !after) return null;
  return { before, after };
}
