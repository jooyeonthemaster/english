"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, HelpCircle, RotateCcw } from "lucide-react";
import { submitTutorActivityAction } from "@/actions/tutor";
import { ActivityRenderer, FeedbackPanel, PassageStrip, type ActivityFeedback } from "@/components/tutor/activity-kit";
import { Button } from "@/components/ui/button";
import { labelTutorActivityType, labelTutorMode, studentActivityInstruction, studentActivityTitle } from "@/lib/tutor/activity-labels";
import type { StudentPayload } from "@/lib/tutor/student-payload";
import type { ViewablePassage } from "@/lib/tutor/visibility";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";

export function ActivityPlayer({
  academy,
  programId,
  activity,
  passageTitle,
  viewable,
  nextActivityId,
}: {
  academy: string;
  programId: string;
  activity: {
    id: string;
    lessonId: string;
    mode: string;
    type: string;
    title: string;
    instructions: string | null;
    studentPayload: StudentPayload | null;
  };
  passageTitle: string;
  viewable: ViewablePassage;
  nextActivityId?: string;
}) {
  const router = useRouter();
  const payload = activity.studentPayload;
  const [response, setResponse] = useState<unknown>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [feedback, setFeedback] = useState<ActivityFeedback | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [hintUsedCount, setHintUsedCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const modeLabel = labelTutorMode(activity.mode);
  const typeLabel = labelTutorActivityType(activity.type);
  const payloadRecord = (payload ?? {}) as Record<string, unknown>;
  const displayTitle = studentActivityTitle(activity.type, activity.title, payloadRecord);
  const displayInstructions = studentActivityInstruction(activity.type, activity.instructions, payloadRecord);

  useEffect(() => {
    if (!feedback) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [feedback]);

  function resetLocalAnswer() {
    setResponse(null);
    setCanSubmit(false);
    setFeedback(null);
    setSubmitError("");
  }

  function submit() {
    if (!canSubmit || isPending || feedback) return;
    setSubmitError("");
    startTransition(async () => {
      const res = await submitTutorActivityAction(activity.id, response, programId, { hintUsedCount });
      if (res.ok) {
        setFeedback((res.feedback as ActivityFeedback) ?? null);
      } else {
        setSubmitError(res.error);
      }
    });
  }

  function goNext() {
    if (nextActivityId) {
      router.push(`/tutor/${academy}/study/${programId}/units/${activity.lessonId}/activity/${nextActivityId}`);
    } else {
      router.push(`/tutor/${academy}/study/${programId}/units/${activity.lessonId}`);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex h-12 items-center gap-2 px-3">
          <Link
            href={`/tutor/${academy}/study/${programId}/units/${activity.lessonId}`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100"
            aria-label="학습 랩으로 돌아가기"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-blue-600">
              {modeLabel} · {typeLabel}
            </p>
            <h1 className="line-clamp-1 text-[13px] font-bold text-slate-900">{displayTitle}</h1>
          </div>
          <Link
            href={`/tutor/${academy}/study/${programId}/units/${activity.lessonId}/ask`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 active:bg-blue-100"
            aria-label="질문하기"
          >
            <HelpCircle className="size-4.5" />
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-5 px-4 pb-44 pt-4 md:pb-48">
        <PassageStrip
          title={sanitizeAiModelDisclosureText(passageTitle)}
          viewable={viewable}
          onReveal={() => setHintUsedCount((count) => count + 1)}
        />

        <section className="space-y-1.5">
          <p className="text-[10px] font-bold tracking-wide text-blue-600">해야 할 일</p>
          <p className="text-[13px] font-bold leading-6 text-slate-900">{displayInstructions}</p>
        </section>

        <section className="space-y-3">
          {payload ? (
            <ActivityRenderer
              payload={payload}
              disabled={Boolean(feedback)}
              onResponse={(nextResponse, nextCanSubmit) => {
                if (feedback) return;
                setResponse(nextResponse);
                setCanSubmit(nextCanSubmit);
              }}
            />
          ) : (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[12.5px] font-medium text-slate-500">
              이 활동은 형식이 오래되어 다시 생성이 필요해요. 선생님께 알려 주세요.
            </p>
          )}
        </section>

        {submitError && (
          <p className="border-l-2 border-rose-400 pl-2 text-[12px] font-bold text-rose-600">{submitError}</p>
        )}

        {feedback && (
          <div ref={feedbackRef}>
            <FeedbackPanel feedback={feedback} />
          </div>
        )}
      </div>

      <footer className="sticky bottom-[78px] z-20 border-t border-slate-100 bg-white/95 px-3 py-2.5 backdrop-blur md:bottom-[102px]">
        {feedback ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" onClick={resetLocalAnswer} className="h-11 rounded-xl px-3" aria-label="현재 활동 다시 풀기">
              <RotateCcw className="size-4" />
            </Button>
            <Button onClick={goNext} className="h-11 rounded-xl bg-blue-600 text-[13px] font-bold hover:bg-blue-700">
              {nextActivityId ? "다음 활동" : "학습 랩으로"}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        ) : (
          <Button
            data-testid="tutor-activity-submit"
            onClick={submit}
            disabled={isPending || !canSubmit || !payload}
            className="h-11 w-full rounded-xl bg-blue-600 text-[13px] font-bold hover:bg-blue-700"
          >
            {isPending ? "채점 중" : "채점하기"}
          </Button>
        )}
      </footer>
    </div>
  );
}
