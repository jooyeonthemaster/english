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
  HelpCircle,
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
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
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
          title={sanitizeAiModelDisclosureText(passage.title)}
          content={passage.content}
          showPassage={showPassage}
          onToggle={() => setShowPassage((value) => !value)}
        />

        <section className="space-y-1.5">
          <p className="text-[10px] font-bold tracking-wide text-blue-600">해야 할 일</p>
          <p className="text-[13px] font-bold leading-6 text-slate-900">{displayInstructions}</p>
          {hint && (
            <p className="border-l-2 border-blue-200 pl-2 text-[12px] font-medium leading-6 text-blue-700">
              {hint}
            </p>
          )}
        </section>

        <section className="space-y-3">
          {multipleChoiceTypes.has(activity.type) && options.length > 0 ? (
            <ChoiceQuestion
              activityType={activity.type}
              prompt={prompt}
              payload={payload}
              options={options}
              selected={selected}
              feedback={Boolean(feedback)}
              onSelect={(index) => !feedback && setSelected(index)}
            />
          ) : activity.type === "sentence_order" ? (
            <OrderQuestion
              orderItems={orderItems}
              selectedOrder={selectedOrder}
              onToggle={toggleOrder}
            />
          ) : activity.type === "vocab_match" ? (
            <VocabMatchQuestion
              leftItems={leftItems}
              rightItems={rightItems}
              matches={matches}
              feedback={Boolean(feedback)}
              onMatch={(left, right) =>
                !feedback && setMatches((current) => ({ ...current, [left]: right }))
              }
            />
          ) : activity.type === "sentence_rebuild" || activity.type === "chunk_rebuild" ? (
            <ChunkQuestion
              chunks={chunks}
              selectedChunkIds={selectedChunkIds}
              selectedChunkText={selectedChunkText}
              onToggle={toggleChunk}
            />
          ) : (
            <FreeFormQuestion
              activityType={activity.type}
              prompt={prompt}
              answer={answer}
              setAnswer={setAnswer}
              disabled={Boolean(feedback)}
            />
          )}
        </section>

        {submitError && (
          <p className="border-l-2 border-rose-400 pl-2 text-[12px] font-bold text-rose-600">
            {submitError}
          </p>
        )}

        {feedback && (
          <section
            ref={feedbackRef}
            className={cn(
              "space-y-2 border-l-2 pl-3",
              feedback.isCorrect ? "border-blue-500" : "border-rose-400",
            )}
          >
            <div className="flex items-center gap-1.5">
              {feedback.isCorrect ? (
                <CheckCircle2 className="size-4 text-blue-600" />
              ) : (
                <XCircle className="size-4 text-rose-500" />
              )}
              <p
                className={cn(
                  "text-[13px] font-bold",
                  feedback.isCorrect ? "text-blue-700" : "text-rose-600",
                )}
              >
                {feedback.isCorrect ? "정답입니다" : "다시 점검해요"} · {feedback.scoreEarned}/
                {feedback.scoreMax}점
              </p>
            </div>
            <p className="whitespace-pre-wrap text-[12.5px] font-medium leading-6 text-slate-700">
              {feedback.explanation}
            </p>
          </section>
        )}
      </div>

      <footer className="sticky bottom-[78px] z-20 border-t border-slate-100 bg-white/95 px-3 py-2.5 backdrop-blur md:bottom-[102px]">
        {feedback ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button
              variant="outline"
              onClick={resetLocalAnswer}
              className="h-11 rounded-xl px-3"
              aria-label="현재 활동 다시 풀기"
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              onClick={goNext}
              className="h-11 rounded-xl bg-blue-600 text-[13px] font-bold hover:bg-blue-700"
            >
              {nextActivityId ? "다음 활동" : "학습 랩으로"}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        ) : (
          <Button
            data-testid="tutor-activity-submit"
            onClick={submit}
            disabled={isPending || !canSubmit}
            className="h-11 w-full rounded-xl bg-blue-600 text-[13px] font-bold hover:bg-blue-700"
          >
            {isPending ? "채점 중" : "채점하기"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function PassageStrip({
  title,
  content,
  showPassage,
  onToggle,
}: {
  title: string;
  content: string;
  showPassage: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wide text-slate-400">PASSAGE</p>
          <p className="line-clamp-1 text-[12.5px] font-bold text-slate-900">{title}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-bold text-slate-600 active:bg-slate-200"
        >
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

function ChoiceQuestion({
  activityType,
  prompt,
  payload,
  options,
  selected,
  feedback,
  onSelect,
}: {
  activityType: string;
  prompt: string;
  payload: ActivityPayload;
  options: unknown[];
  selected: number | null;
  feedback: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <QuestionPrompt activityType={activityType} prompt={prompt} payload={payload} />
      <div className="grid gap-1.5">
        {options.map((option, index) => {
          const detail = optionDetail(option);
          const active = selected === index;
          return (
            <button
              key={`${optionLabel(option, index)}-${index}`}
              type="button"
              data-testid="tutor-choice-option"
              disabled={feedback}
              onClick={() => onSelect(index)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-[13px] font-bold leading-5 transition",
                active
                  ? "border-blue-500 bg-blue-50/60 text-blue-800"
                  : "border-slate-100 bg-white text-slate-700 active:border-blue-200",
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

function OrderQuestion({
  orderItems,
  selectedOrder,
  onToggle,
}: {
  orderItems: Array<{ index: number; text: string }>;
  selectedOrder: number[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-bold tracking-wide text-blue-600">내가 만든 순서</p>
        <div className="flex flex-wrap gap-1.5 border-l-2 border-blue-200 pl-2.5">
          {selectedOrder.length === 0 ? (
            <span className="text-[12px] font-medium text-slate-400">
              아래 문장을 순서대로 누르세요.
            </span>
          ) : (
            selectedOrder.map((index, orderIndex) => (
              <button
                key={`${index}-${orderIndex}`}
                type="button"
                onClick={() => onToggle(index)}
                className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700"
              >
                {orderIndex + 1}. 문장 {index + 1}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="grid gap-1.5">
        {orderItems.map((item) => {
          const pickedIndex = selectedOrder.indexOf(item.index);
          const active = pickedIndex >= 0;
          return (
            <button
              key={item.index}
              type="button"
              onClick={() => onToggle(item.index)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                active
                  ? "border-blue-300 bg-blue-50/60"
                  : "border-slate-100 bg-white active:border-blue-200",
              )}
            >
              <span className="block text-[10px] font-bold text-slate-400">
                {active ? `${pickedIndex + 1}번째 선택` : "순서에 추가"}
              </span>
              <span className="mt-0.5 block font-mono text-[12.5px] font-medium leading-6 text-slate-800">
                {item.text}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VocabMatchQuestion({
  leftItems,
  rightItems,
  matches,
  feedback,
  onMatch,
}: {
  leftItems: string[];
  rightItems: string[];
  matches: Record<string, string>;
  feedback: boolean;
  onMatch: (left: string, right: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] font-medium text-slate-500">영단어와 한국어 뜻을 하나씩 연결하세요.</p>
      <div className="space-y-3">
        {leftItems.map((left) => (
          <div key={left} className="border-l-2 border-slate-100 pl-3">
            <p className="mb-1.5 font-mono text-[13.5px] font-bold text-slate-900">{left}</p>
            <div className="flex flex-wrap gap-1.5">
              {rightItems.map((right) => (
                <button
                  key={`${left}-${right}`}
                  type="button"
                  disabled={feedback}
                  onClick={() => onMatch(left, right)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-bold transition",
                    matches[left] === right
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-100 bg-white text-slate-600 active:border-blue-200",
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
  );
}

function ChunkQuestion({
  chunks,
  selectedChunkIds,
  selectedChunkText,
  onToggle,
}: {
  chunks: string[];
  selectedChunkIds: number[];
  selectedChunkText: string[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-[10px] font-bold tracking-wide text-blue-600">완성한 문장</p>
        <div className="flex flex-wrap gap-1.5 border-l-2 border-blue-200 pl-2.5">
          {selectedChunkIds.length === 0 ? (
            <span className="text-[12px] font-medium text-slate-400">
              아래 조각을 원문 순서대로 누르세요.
            </span>
          ) : (
            selectedChunkText.map((chunk, index) => (
              <button
                key={`${chunk}-${index}`}
                type="button"
                onClick={() => onToggle(selectedChunkIds[index])}
                className="rounded-md bg-blue-600 px-2 py-1 font-mono text-[11px] font-bold text-white"
              >
                {chunk}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chunks.map((chunk, index) => {
          const picked = selectedChunkIds.includes(index);
          return (
            <button
              key={`${chunk}-${index}`}
              type="button"
              disabled={picked}
              onClick={() => onToggle(index)}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-[12px] font-bold transition",
                picked
                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                  : "border-slate-200 bg-white text-slate-700 active:border-blue-300 active:bg-blue-50",
              )}
            >
              {chunk}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FreeFormQuestion({
  activityType,
  prompt,
  answer,
  setAnswer,
  disabled,
}: {
  activityType: string;
  prompt: string;
  answer: string;
  setAnswer: (value: string) => void;
  disabled: boolean;
}) {
  const isTextarea = activityType === "sentence_translate" || activityType === "structure_transform";
  return (
    <div className="space-y-2.5">
      <p className="break-words border-l-2 border-slate-200 pl-3 font-mono text-[13.5px] font-bold leading-7 text-slate-900">
        {prompt}
      </p>
      {isTextarea ? (
        <Textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="답을 입력하세요."
          className="min-h-24 rounded-xl border-slate-200 bg-white text-[13.5px] leading-6"
          disabled={disabled}
        />
      ) : (
        <Input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="답 입력"
          className="h-11 rounded-xl border-slate-200 text-[13.5px]"
          disabled={disabled}
        />
      )}
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
  if (
    activityType === "vocab_choice" ||
    activityType === "contextual_meaning" ||
    activityType === "collocation_select"
  ) {
    return (
      <div className="border-l-2 border-slate-200 pl-3">
        <p className="font-mono text-xl font-bold leading-7 text-slate-900">
          {String(payload.stem ?? prompt)}
        </p>
        {payload.sentenceIndex !== undefined && (
          <p className="mt-1 text-[10px] font-bold text-slate-400">
            문장 {Number(payload.sentenceIndex) + 1} 기반
          </p>
        )}
      </div>
    );
  }
  if (activityType === "insertion_point") {
    return (
      <div className="border-l-2 border-blue-300 pl-3">
        <p className="mb-1 text-[10px] font-bold text-blue-600">제시문</p>
        <p className="font-mono text-[13.5px] font-bold leading-7 text-slate-900">
          {String(payload.targetSentence ?? prompt)}
        </p>
      </div>
    );
  }
  return (
    <p className="break-words border-l-2 border-slate-200 pl-3 font-mono text-[13.5px] font-bold leading-7 text-slate-900">
      {prompt}
    </p>
  );
}
