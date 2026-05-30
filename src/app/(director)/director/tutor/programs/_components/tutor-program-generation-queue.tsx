"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  MonitorSmartphone,
  Rows3,
  Sparkles,
  Target,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkbenchLoadingCard } from "@/components/workbench/workbench-loading-card";
import {
  labelTutorActivityType,
  labelTutorMode,
} from "@/lib/tutor/activity-labels";
import type {
  TutorGeneratedActivityPreview,
  TutorGeneratedLessonPreview,
  TutorProgramGenerationJobResult,
} from "@/lib/tutor/program-generation";

export interface TutorProgramGenerationJob {
  id: string;
  status: string;
  title: string;
  requestedCount: number;
  successCount: number;
  failedCount: number;
  resultCount: number;
  config: unknown;
  result: TutorProgramGenerationJobResult | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

function isActive(status: string) {
  return status === "PENDING" || status === "PROCESSING";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function getPrompt(payload: Record<string, unknown>) {
  return String(
    payload.prompt ??
      payload.questionText ??
      payload.statement ??
      payload.stem ??
      payload.meaning ??
      payload.targetSentence ??
      "",
  ).trim();
}

function optionText(option: unknown, index: number) {
  if (!option || typeof option !== "object") return String(option ?? "");
  const record = option as Record<string, unknown>;
  const label = String(record.label ?? index + 1);
  const text = String(record.text ?? record.value ?? record.before ?? "");
  const after = String(record.after ?? "");
  return [label, text, after].filter(Boolean).join(" · ");
}

function getAnswer(payload: Record<string, unknown>) {
  const direct = [
    payload.answerText,
    payload.correctAnswer,
    payload.modelAnswer,
    payload.answer,
    payload.expected,
  ].map((value) => String(value ?? "").trim()).find(Boolean);
  if (direct) return direct;

  const options = Array.isArray(payload.options) ? payload.options : [];
  const correctIndex = Number(payload.correctIndex ?? payload.answerIndex);
  if (Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length) {
    return optionText(options[correctIndex], correctIndex);
  }

  const answers = stringList(payload.answers);
  return answers.join(", ");
}

function activitySignature(activity: TutorGeneratedActivityPreview, index: number) {
  const payload = asRecord(activity.payload);
  const prompt = getPrompt(payload);
  return `${index}-${activity.mode}-${activity.type}-${activity.title}-${prompt.slice(0, 60)}`;
}

function getLessonCounts(lessons: TutorGeneratedLessonPreview[]) {
  return lessons.reduce(
    (acc, lesson) => {
      acc.activities += lesson.activityCount;
      acc.exam += lesson.examAlignedCount;
      acc.rule += lesson.ruleBasedCount;
      return acc;
    },
    { activities: 0, exam: 0, rule: 0 },
  );
}

function EmptyQueue() {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
      <Sparkles className="mb-2 size-7 text-slate-300" />
      <p className="text-sm font-bold text-slate-700">아직 생성 중인 프로그램이 없습니다</p>
      <p className="mt-1 text-xs font-medium text-slate-400">
        지문을 선택하고 생성을 시작하면 이곳에서 진행 상황과 결과를 확인합니다.
      </p>
    </div>
  );
}

export function TutorProgramGenerationQueue({
  jobs,
  loading,
  onRefresh,
}: {
  jobs: TutorProgramGenerationJob[];
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const [reviewJob, setReviewJob] = useState<TutorProgramGenerationJob | null>(null);
  const counts = useMemo(
    () => ({
      active: jobs.filter((job) => isActive(job.status)).length,
      completed: jobs.filter((job) => job.status === "COMPLETED").length,
      failed: jobs.filter((job) => job.status === "FAILED").length,
    }),
    [jobs],
  );

  return (
    <section className="bg-[#F0F2F5] px-5 py-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-black text-slate-950">프로그램 생성 현황</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            지문별 학습 활동을 백그라운드에서 만들고, 완료 후 전체 활동을 검토합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="h-7 rounded-md bg-white px-2.5 text-[11px]">
            생성 중 {counts.active}
          </Badge>
          <Badge variant="secondary" className="h-7 rounded-md bg-white px-2.5 text-[11px]">
            완료 {counts.completed}
          </Badge>
          {counts.failed > 0 && (
            <Badge variant="outline" className="h-7 rounded-md border-red-200 bg-red-50 px-2.5 text-[11px] text-red-600">
              실패 {counts.failed}
            </Badge>
          )}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onRefresh}>
            {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Rows3 className="mr-1.5 size-3.5" />}
            새로고침
          </Button>
        </div>
      </div>

      {jobs.length === 0 ? (
        <EmptyQueue />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <GenerationJobCard key={job.id} job={job} onReview={() => setReviewJob(job)} />
          ))}
        </div>
      )}

      <ProgramReviewDialog job={reviewJob} onOpenChange={(open) => !open && setReviewJob(null)} />
    </section>
  );
}

function GenerationJobCard({
  job,
  onReview,
}: {
  job: TutorProgramGenerationJob;
  onReview: () => void;
}) {
  const result = job.result;
  const lessons = result?.lessons ?? [];
  const lessonCounts = getLessonCounts(lessons);
  const completed = result?.completedPassages ?? job.successCount ?? 0;
  const total = result?.totalPassages ?? job.requestedCount ?? lessons.length;
  const preview =
    result?.currentPassageTitle
      ? `${result.currentPassageTitle} 생성 중`
      : lessons.map((lesson) => lesson.title).join(" · ") || job.title;

  if (isActive(job.status)) {
    return (
      <WorkbenchLoadingCard
        title={job.title}
        contentPreview={preview}
        statusLabel={job.status === "PENDING" ? "대기 중" : "생성 중"}
        progressLabel={`${completed}/${total} 지문 · ${result?.activityCount ?? 0}개 활동 준비됨`}
        showCheckbox={false}
        statusIcon={Loader2}
        variant="analyzing"
        fixedHeight
        metaSlot={
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <MiniStat label="지문" value={`${completed}/${total}`} />
            <MiniStat label="활동" value={`${result?.activityCount ?? 0}`} />
            <MiniStat label="예상" value={`${result?.estimatedMin ?? 0}분`} />
          </div>
        }
      />
    );
  }

  if (job.status === "FAILED") {
    return (
      <div className="flex h-[340px] flex-col rounded-xl border border-red-200 bg-red-50/50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-slate-900">{job.title}</h3>
            <p className="mt-1 text-xs font-bold text-red-600">생성 실패</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-6 text-xs font-medium leading-5 text-red-700">
          {job.errorMessage || result?.warnings?.[0] || "프로그램 생성 중 오류가 발생했습니다."}
        </p>
        <div className="mt-auto pt-3 text-[11px] font-medium text-red-500">
          {formatTime(job.completedAt || job.createdAt)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[340px] flex-col rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-black text-slate-950">{job.title}</h3>
          <p className="mt-1 text-[11px] font-bold text-emerald-600">
            {formatTime(job.completedAt || job.createdAt)} 완료
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5">
        <MiniStat label="지문" value={`${lessons.length || total}`} />
        <MiniStat label="활동" value={`${lessonCounts.activities || result?.activityCount || job.resultCount}`} />
        <MiniStat label="내신형" value={`${lessonCounts.exam}`} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {lessons.slice(0, 4).map((lesson) => (
          <span key={lesson.passageId} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
            {lesson.title} · {lesson.activityCount}
          </span>
        ))}
        {lessons.length > 4 && (
          <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-400">
            +{lessons.length - 4}
          </span>
        )}
      </div>

      <div className="mt-auto grid gap-2">
        <Button type="button" className="h-9 rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800" onClick={onReview}>
          <Eye className="mr-1.5 size-3.5" />
          전체 활동 검토
        </Button>
        {result?.programId && (
          <div className="grid grid-cols-2 gap-2">
            <Button asChild type="button" variant="outline" className="h-8 rounded-lg text-xs">
              <Link href={`/director/tutor/programs/${result.programId}/builder`}>
                <FileText className="mr-1.5 size-3.5" />
                빌더
              </Link>
            </Button>
            <Button asChild type="button" variant="outline" className="h-8 rounded-lg text-xs">
              <Link href={`/director/tutor/programs/${result.programId}/emulator`}>
                <MonitorSmartphone className="mr-1.5 size-3.5" />
                에뮬레이터
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-black text-slate-900">{value}</p>
    </div>
  );
}

function cleanLessonWarnings(warnings: string[]) {
  const technicalMarkers = [
    "Rejected candidates",
    "Top codes",
    "Last:",
    "quality/",
    "irrelevant-",
    "lexical overlap",
    "IRRELEVANT",
  ];
  return warnings
    .filter((warning) => warning && !technicalMarkers.some((marker) => warning.includes(marker)))
    .map((warning) =>
      warning.replace("학생용 payload 검증에서 제외됨", "품질 검증에서 제외되었습니다"),
    );
}

function ProgramReviewDialog({
  job,
  onOpenChange,
}: {
  job: TutorProgramGenerationJob | null;
  onOpenChange: (open: boolean) => void;
}) {
  const result = job?.result;
  const lessons = useMemo(() => result?.lessons ?? [], [result?.lessons]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const multi = lessons.length > 1;

  const totals = useMemo(() => {
    const counts = getLessonCounts(lessons);
    return {
      passages: lessons.length,
      activities: result?.activityCount ?? counts.activities,
      exam: counts.exam,
      estimatedMin: result?.estimatedMin ?? 0,
    };
  }, [lessons, result?.activityCount, result?.estimatedMin]);

  const scrollToLesson = (passageId: string) => {
    const el = sectionRefs.current.get(passageId);
    const container = scrollRef.current;
    if (!el || !container) return;
    const top =
      el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12;
    container.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <Dialog open={Boolean(job)} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1600px] flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[1600px]"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 bg-white px-6 py-3.5 text-left">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-[15px] font-black text-slate-900">
                {job?.title ?? "프로그램"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px] font-semibold text-slate-400">
                {totals.passages}개 지문에 생성된 모바일 학습 활동 전체
              </DialogDescription>
            </div>

            <div className="hidden items-center gap-1.5 lg:flex">
              <HeaderStat icon={BookOpen} label="지문" value={totals.passages} />
              <HeaderStat icon={Layers} label="활동" value={totals.activities} />
              <HeaderStat icon={Target} label="내신형" value={totals.exam} tone="rose" />
              <HeaderStat icon={Clock} label="분" value={totals.estimatedMin} />
            </div>

            {result?.programId && (
              <div className="hidden shrink-0 items-center gap-2 md:flex">
                <Button asChild type="button" variant="outline" className="h-9 rounded-lg border-slate-200 text-xs font-bold">
                  <Link href={`/director/tutor/programs/${result.programId}/builder`}>
                    <FileText className="mr-1.5 size-3.5" />
                    빌더
                  </Link>
                </Button>
                <Button asChild type="button" className="h-9 rounded-lg bg-blue-600 text-xs font-bold text-white hover:bg-blue-700">
                  <Link href={`/director/tutor/programs/${result.programId}/emulator`}>
                    <MonitorSmartphone className="mr-1.5 size-3.5" />
                    에뮬레이터
                  </Link>
                </Button>
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="닫기"
            >
              <X className="size-[18px]" aria-hidden="true" />
            </button>
          </div>
        </DialogHeader>

        {/* Quick jump (only when multiple passages) */}
        {multi && (
          <div className="shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50 px-6 py-2">
            <div className="flex items-center gap-1.5">
              {lessons.map((lesson, index) => (
                <button
                  key={lesson.passageId}
                  type="button"
                  onClick={() => scrollToLesson(lesson.passageId)}
                  className="group flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[10px] font-black text-slate-500 transition group-hover:bg-blue-600 group-hover:text-white">
                    {index + 1}
                  </span>
                  <span className="max-w-[180px] truncate text-[11.5px] font-bold text-slate-600 transition group-hover:text-blue-700">
                    {lesson.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body: one continuous scroll showing all passages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-[#F7F9FB] px-6 py-5">
          {lessons.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
              검토할 활동이 없습니다.
            </div>
          ) : (
            <div className="space-y-7">
              {lessons.map((lesson, index) => (
                <section
                  key={lesson.passageId}
                  ref={(el) => {
                    if (el) sectionRefs.current.set(lesson.passageId, el);
                    else sectionRefs.current.delete(lesson.passageId);
                  }}
                >
                  <LessonActivityReview lesson={lesson} index={index} total={lessons.length} />
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeaderStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BookOpen;
  label: string;
  value: number;
  tone?: "blue" | "rose";
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
      <Icon className={`size-3.5 ${tone === "rose" ? "text-rose-500" : "text-blue-500"}`} />
      <span className="text-[13px] font-black leading-none text-slate-900">{value}</span>
      <span className="text-[10px] font-bold text-slate-400">{label}</span>
    </div>
  );
}

function LessonActivityReview({
  lesson,
  index,
  total,
}: {
  lesson: TutorGeneratedLessonPreview;
  index: number;
  total: number;
}) {
  const warnings = cleanLessonWarnings(lesson.warnings);

  return (
    <div>
      {/* Passage header card */}
      <div className="mb-3.5 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[12px] font-black text-white">
                {index + 1}
              </span>
              <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                지문 {index + 1}{total > 1 ? ` / ${total}` : ""}
              </p>
            </div>
            <h3 className="mt-1.5 text-[17px] font-black leading-tight text-slate-950">{lesson.title}</h3>
            {lesson.contentPreview && (
              <p className="mt-1.5 line-clamp-2 max-w-4xl text-[12px] font-medium leading-5 text-slate-500">
                {lesson.contentPreview}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Badge variant="secondary" className="h-7 gap-1 rounded-lg bg-slate-100 px-2.5 text-[11px] font-bold text-slate-600">
              <ListChecks className="size-3.5" />
              규칙 기반 {lesson.ruleBasedCount}
            </Badge>
            <Badge variant="outline" className="h-7 gap-1 rounded-lg border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-600">
              <Target className="size-3.5" />
              내신형 {lesson.examAlignedCount}
            </Badge>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11.5px] font-semibold leading-5 text-slate-500">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
            <span>{warnings.join(" · ")}</span>
          </div>
        )}
      </div>

      {/* Activity grid */}
      {lesson.activities.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center">
          <Layers className="mb-2 size-8 text-slate-300" />
          <p className="text-sm font-bold text-slate-500">아직 생성된 활동이 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {lesson.activities.map((activity, activityIndex) => (
            <ActivityPreviewCard
              key={activitySignature(activity, activityIndex)}
              activity={activity}
              index={activityIndex}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityPreviewCard({
  activity,
  index,
}: {
  activity: TutorGeneratedActivityPreview;
  index: number;
}) {
  const payload = asRecord(activity.payload);
  const prompt = getPrompt(payload);
  const options = Array.isArray(payload.options) ? payload.options : [];
  const chunks = stringList(payload.chunks);
  const leftItems = stringList(payload.leftItems);
  const rightItems = stringList(payload.rightItems);
  const answer = getAnswer(payload);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start gap-2.5 border-b border-slate-100 bg-slate-50/60 px-3.5 py-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-black text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="h-5 rounded-md bg-blue-50 px-1.5 text-[10px] font-bold text-blue-700">
              {labelTutorMode(activity.mode)}
            </Badge>
            <Badge variant="outline" className="h-5 rounded-md border-slate-200 px-1.5 text-[10px] font-bold text-slate-500">
              {labelTutorActivityType(activity.type)}
            </Badge>
            {Boolean(payload.sourceQuestionType) && (
              <Badge variant="outline" className="h-5 rounded-md border-rose-200 bg-rose-50 px-1.5 text-[10px] font-bold text-rose-600">
                {String(payload.sourceQuestionType)}
              </Badge>
            )}
          </div>
          <h4 className="mt-1.5 text-[13.5px] font-black leading-5 text-slate-950">{activity.title}</h4>
          {activity.instructions && (
            <p className="mt-1 text-[11.5px] font-medium leading-5 text-slate-500">{activity.instructions}</p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-3.5 py-3.5">
        {prompt && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5">
            <p className="text-[9.5px] font-black uppercase tracking-wider text-blue-600">문항</p>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] font-semibold leading-6 text-slate-800">{prompt}</p>
          </div>
        )}

        {options.length > 0 && (
          <div className="grid gap-1.5">
            {options.map((option, optionIndex) => (
              <div
                key={`${optionIndex}-${optionText(option, optionIndex)}`}
                className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-[12px] font-semibold leading-5 text-slate-700"
              >
                {optionText(option, optionIndex)}
              </div>
            ))}
          </div>
        )}

        {chunks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chunks.map((chunk, chunkIndex) => (
              <span key={`${chunk}-${chunkIndex}`} className="rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
                {chunk}
              </span>
            ))}
          </div>
        )}

        {(leftItems.length > 0 || rightItems.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            <ListBlock title="왼쪽" items={leftItems} />
            <ListBlock title="오른쪽" items={rightItems} />
          </div>
        )}

        {answer && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider text-emerald-600">
              <Check className="size-3" />
              정답
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[12px] font-bold leading-5 text-emerald-800">{answer}</p>
          </div>
        )}

        {Boolean(payload.explanation) && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">해설</p>
            <p className="mt-1 whitespace-pre-wrap text-[12px] font-medium leading-5 text-slate-600">
              {String(payload.explanation)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
          <Layers className="size-3.5" />
          {activity.itemCount}문항 · {activity.maxScore}점 · {Math.ceil(activity.estimatedSec / 60)}분
        </span>
        <details className="group/details">
          <summary className="cursor-pointer list-none rounded-md px-2 py-0.5 text-[11px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            원본 데이터
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left text-[10px] leading-4 text-slate-600">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      </div>
    </article>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
      <p className="mb-1.5 text-[9.5px] font-black uppercase tracking-wider text-slate-400">{title}</p>
      <div className="grid gap-1">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="text-[11.5px] font-semibold leading-5 text-slate-700">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
