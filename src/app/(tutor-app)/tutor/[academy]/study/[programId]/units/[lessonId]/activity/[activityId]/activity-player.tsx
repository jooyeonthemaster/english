"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  MessageCircleQuestion,
  RotateCcw,
  XCircle,
} from "lucide-react";
import type { Passage } from "@prisma/client";
import { submitTutorActivityAction } from "@/actions/tutor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  labelTutorActivityType,
  labelTutorMode,
  studentActivityInstruction,
  studentActivityTitle,
} from "@/lib/tutor/activity-labels";
import { cn } from "@/lib/utils";

type SubmitFeedback = {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
};

type ActivityPayload = Record<string, unknown>;

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

export function ActivityPlayer({
  academy,
  programId,
  activity,
  passage,
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
    payload: ActivityPayload;
  };
  passage: Passage;
  nextActivityId?: string;
}) {
  const router = useRouter();
  const payload = activity.payload;
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<number[]>([]);
  const [selectedChunkIds, setSelectedChunkIds] = useState<number[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<SubmitFeedback | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [showPassage, setShowPassage] = useState(activity.mode !== "memorize");
  const [isPending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo(() => (Array.isArray(payload.options) ? payload.options : []), [payload.options]);
  const orderItems = useMemo(
    () =>
      recordArray(payload.shuffled)
        .map((item) => ({ index: Number(item.index), text: String(item.text ?? "") }))
        .filter((item) => Number.isFinite(item.index) && item.text),
    [payload.shuffled],
  );
  const chunks = useMemo(() => stringArray(payload.chunks), [payload.chunks]);
  const selectedChunkText = selectedChunkIds.map((id) => chunks[id]).filter(Boolean);
  const leftItems = useMemo(() => stringArray(payload.leftItems), [payload.leftItems]);
  const rightItems = useMemo(() => stringArray(payload.rightItems), [payload.rightItems]);
  const modeLabel = labelTutorMode(activity.mode);
  const typeLabel = labelTutorActivityType(activity.type);
  const displayTitle = studentActivityTitle(activity.type, activity.title, payload);
  const displayInstructions = studentActivityInstruction(activity.type, activity.instructions, payload);
  const prompt = String(
    payload.prompt ??
      payload.statement ??
      payload.stem ??
      payload.meaning ??
      payload.targetSentence ??
      "답을 입력하세요.",
  );
  const hint = String(payload.koreanHint ?? payload.hint ?? "");
  const canSubmit =
    activity.type === "sentence_order"
      ? selectedOrder.length === orderItems.length && orderItems.length > 0
      : activity.type === "vocab_match"
        ? leftItems.length > 0 && leftItems.every((item) => matches[item])
        : activity.type === "sentence_rebuild" || activity.type === "chunk_rebuild"
          ? selectedChunkIds.length === chunks.length && chunks.length > 0
          : multipleChoiceTypes.has(activity.type) && options.length > 0
            ? selected !== null
            : Boolean(answer.trim());

  useEffect(() => {
    if (!feedback) return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [feedback]);

  function toggleOrder(index: number) {
    if (feedback) return;
    setSelectedOrder((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  function toggleChunk(index: number) {
    if (feedback) return;
    setSelectedChunkIds((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  function resetLocalAnswer() {
    setAnswer("");
    setSelected(null);
    setSelectedOrder([]);
    setSelectedChunkIds([]);
    setMatches({});
    setFeedback(null);
    setSubmitError("");
  }

  function buildResponse() {
    if (activity.type === "sentence_order") return { order: selectedOrder };
    if (activity.type === "vocab_match") return { matches };
    if (activity.type === "sentence_rebuild" || activity.type === "chunk_rebuild") {
      return { answer: selectedChunkText.join(" ") };
    }
    if (multipleChoiceTypes.has(activity.type) && options.length > 0) return { selectedIndex: selected };
    return { answer };
  }

  function submit() {
    if (!canSubmit || isPending || feedback) return;
    setSubmitError("");
    startTransition(async () => {
      const res = await submitTutorActivityAction(activity.id, buildResponse(), programId);
      if (res.ok) {
        setFeedback(res.feedback ?? null);
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
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/tutor/${academy}/study/${programId}/units/${activity.lessonId}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-600"
            aria-label="학습 랩으로 돌아가기"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-blue-600">
              {modeLabel} · {typeLabel}
            </p>
            <h1 className="mt-0.5 line-clamp-1 text-lg font-black text-slate-950">{displayTitle}</h1>
          </div>
          <Link
            href={`/tutor/${academy}/study/${programId}/units/${activity.lessonId}/ask`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700"
          >
            <MessageCircleQuestion className="size-4" />
            질문
          </Link>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-48 pt-5 sm:px-6 md:px-8 md:pb-56">
        <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase text-slate-500">Passage</p>
              <p className="mt-1 line-clamp-1 text-sm font-black text-slate-950">{passage.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPassage((value) => !value)}
              className="inline-flex h-9 items-center gap-1.5 rounded-2xl bg-white px-3 text-xs font-black text-slate-700 ring-1 ring-slate-200"
            >
              {showPassage ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {showPassage ? "가리기" : "원문 보기"}
            </button>
          </div>
          {showPassage ? (
            <p className="mt-3 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm font-medium leading-7 text-slate-700 ring-1 ring-slate-100">
              {passage.content}
            </p>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-bold text-slate-500">
              원문을 가리고 기억으로 풀어보는 모드입니다.
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-blue-100 bg-blue-50 p-4 shadow-sm sm:p-5">
          <p className="text-xs font-black text-blue-700">해야 할 일</p>
          <p className="mt-2 text-base font-black leading-7 text-slate-950">
            {displayInstructions}
          </p>
          {hint && <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-blue-800 shadow-sm">{hint}</p>}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          {multipleChoiceTypes.has(activity.type) && options.length > 0 ? (
            <div className="space-y-4">
              <QuestionPrompt activityType={activity.type} prompt={prompt} payload={payload} />
              <div className="grid gap-2">
                {options.map((option, index) => {
                  const detail = optionDetail(option);
                  return (
                    <button
                      key={`${optionLabel(option, index)}-${index}`}
                      type="button"
                      data-testid="tutor-choice-option"
                      onClick={() => !feedback && setSelected(index)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-bold leading-6 transition",
                        selected === index
                          ? "border-blue-500 bg-blue-50 text-blue-800 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/50",
                      )}
                    >
                      <span className="block">{optionLabel(option, index)}</span>
                      {detail && (
                        <span className="mt-2 block space-y-1 text-xs font-medium text-slate-500">
                          <span className="block">앞: {detail.before}</span>
                          <span className="block">뒤: {detail.after}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activity.type === "sentence_order" ? (
            <div className="space-y-4">
              <div className="min-h-24 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                <p className="text-xs font-black text-blue-700">내가 만든 순서</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedOrder.map((index, orderIndex) => (
                    <button
                      key={`${index}-${orderIndex}`}
                      type="button"
                      onClick={() => toggleOrder(index)}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100"
                    >
                      {orderIndex + 1}. 문장 {index + 1}
                    </button>
                  ))}
                  {selectedOrder.length === 0 && <span className="text-sm font-bold text-blue-600">아래 문장을 순서대로 누르세요.</span>}
                </div>
              </div>
              <div className="grid gap-2">
                {orderItems.map((item) => {
                  const pickedIndex = selectedOrder.indexOf(item.index);
                  return (
                    <button
                      key={item.index}
                      type="button"
                      onClick={() => toggleOrder(item.index)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left text-sm font-semibold leading-6 transition",
                        pickedIndex >= 0
                          ? "border-blue-200 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-blue-200",
                      )}
                    >
                      <span className="mb-1 block text-xs font-black text-slate-400">
                        {pickedIndex >= 0 ? `${pickedIndex + 1}번째 선택` : "순서에 추가"}
                      </span>
                      {item.text}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : activity.type === "vocab_match" ? (
            <div className="space-y-4">
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-black text-slate-900">영단어와 한국어 뜻을 하나씩 연결하세요.</p>
              <div className="space-y-3">
                {leftItems.map((left) => (
                  <div key={left} className="rounded-2xl border border-slate-200 p-3">
                    <p className="mb-2 text-base font-black text-slate-950">{left}</p>
                    <div className="flex flex-wrap gap-2">
                      {rightItems.map((right) => (
                        <button
                          key={`${left}-${right}`}
                          type="button"
                          onClick={() => !feedback && setMatches((current) => ({ ...current, [left]: right }))}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-xs font-black transition",
                            matches[left] === right
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-200",
                          )}
                        >
                          {right}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activity.type === "sentence_rebuild" || activity.type === "chunk_rebuild" ? (
            <div className="space-y-4">
              <div className="min-h-24 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-3">
                <p className="mb-2 text-xs font-black text-blue-700">완성한 문장</p>
                <div className="flex flex-wrap gap-2">
                  {selectedChunkIds.length === 0 ? (
                    <span className="text-sm font-bold text-blue-600">아래 조각을 원문 순서대로 누르세요.</span>
                  ) : (
                    selectedChunkText.map((chunk, index) => (
                      <button
                        key={`${chunk}-${index}`}
                        type="button"
                        onClick={() => toggleChunk(selectedChunkIds[index])}
                        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white"
                      >
                        {chunk}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {chunks.map((chunk, index) => (
                  <button
                    key={`${chunk}-${index}`}
                    type="button"
                    disabled={selectedChunkIds.includes(index)}
                    onClick={() => toggleChunk(index)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm font-black transition",
                      selectedChunkIds.includes(index)
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                    )}
                  >
                    {chunk}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="break-words rounded-2xl bg-slate-50 p-4 text-base font-black leading-7 text-slate-900">{prompt}</p>
              {activity.type === "sentence_translate" || activity.type === "structure_transform" ? (
                <Textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="답을 입력하세요."
                  className="min-h-28 rounded-2xl border-slate-200 bg-white text-base"
                  disabled={Boolean(feedback)}
                />
              ) : (
                <Input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="답 입력"
                  className="h-12 rounded-2xl border-slate-200 text-base"
                  disabled={Boolean(feedback)}
                />
              )}
            </div>
          )}
        </section>

        {submitError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600">{submitError}</div>}

        {feedback && (
          <div
            ref={feedbackRef}
            className={cn(
              "rounded-[28px] border px-4 py-4 shadow-sm",
              feedback.isCorrect ? "border-blue-100 bg-blue-50 text-blue-900" : "border-amber-100 bg-amber-50 text-amber-950",
            )}
          >
            <div className="flex items-center gap-2">
              {feedback.isCorrect ? <CheckCircle2 className="size-6 text-blue-600" /> : <XCircle className="size-6 text-amber-600" />}
              <p className="text-base font-black">
                {feedback.isCorrect ? "정답입니다" : "다시 점검해요"} · {feedback.scoreEarned}/{feedback.scoreMax}점
              </p>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6">{feedback.explanation}</p>
          </div>
        )}
      </div>

      <footer className="sticky bottom-[86px] z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 md:bottom-[120px] md:px-8">
        {feedback ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" onClick={resetLocalAnswer} className="h-12 rounded-2xl px-4" aria-label="현재 활동 다시 풀기">
              <RotateCcw className="size-4" />
            </Button>
            <Button onClick={goNext} className="h-12 rounded-2xl bg-blue-600 text-base font-black hover:bg-blue-700">
              {nextActivityId ? "다음 활동" : "학습 랩으로"}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        ) : (
          <Button
            data-testid="tutor-activity-submit"
            onClick={submit}
            disabled={isPending || !canSubmit}
            className="h-12 w-full rounded-2xl bg-blue-600 text-base font-black hover:bg-blue-700"
          >
            {isPending ? "채점 중" : "채점하기"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function QuestionPrompt({
  activityType,
  prompt,
  payload,
}: {
  activityType: string;
  prompt: string;
  payload: ActivityPayload;
}) {
  if (activityType === "vocab_choice" || activityType === "contextual_meaning" || activityType === "collocation_select") {
    return (
      <div className="rounded-2xl bg-slate-50 p-5 text-center">
        <p className="text-2xl font-black text-slate-950">{String(payload.stem ?? prompt)}</p>
        {payload.sentenceIndex !== undefined && (
          <p className="mt-2 text-xs font-black text-slate-400">문장 {Number(payload.sentenceIndex) + 1} 기반</p>
        )}
      </div>
    );
  }
  if (activityType === "insertion_point") {
    return (
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <p className="mb-1 text-xs font-black text-blue-700">제시문</p>
        <p className="text-sm font-black leading-7 text-slate-950">{String(payload.targetSentence ?? prompt)}</p>
      </div>
    );
  }
  return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-black leading-7 text-slate-950">{prompt}</p>;
}
