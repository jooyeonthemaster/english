"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers3,
  ListChecks,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trophy,
  Wand2,
  XCircle,
} from "lucide-react";
import { submitTutorActivityAction } from "@/actions/tutor";
import { useTutorModalLock } from "@/app/(tutor-app)/tutor/[academy]/_components/tutor-modal-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArtifactInlineCard,
  ArtifactPendingCard,
  ArtifactsPanel,
  deriveSvgTitle,
  extractSvgBlock,
  sanitizeSvg,
  useArtifactStore,
  type TutorArtifact,
} from "./tutor-ask-artifacts";
import {
  labelTutorActivityType,
  studentActivityInstruction,
  studentActivityTitle,
} from "@/lib/tutor/activity-labels";
import { tutorPath } from "@/lib/tutor/routes";
import { cn } from "@/lib/utils";

type TutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type QuizActivity = {
  id: string;
  mode: string;
  type: string;
  title: string;
  instructions: string | null;
  payload: Record<string, unknown>;
  maxScore: number;
  estimatedSec: number;
};

type QuizFeedback = {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
};

type QuizResult = {
  id: string;
  title: string;
  type: string;
  mode: string;
  isCorrect: boolean;
  score: string;
  explanation: string;
};

type ChatEntry =
  | TutorMessage
  | {
      id: string;
      role: "quiz";
      activity: QuizActivity;
    };

type MissionId = "flow" | "vocab" | "grammar" | "sentence" | "exam" | "weakness";

const missions: Array<{
  id: MissionId;
  label: string;
  hint: string;
  Icon: typeof Target;
}> = [
  {
    id: "flow",
    label: "흐름 압박",
    hint: "한 문장씩 근거를 확인하고 핵심 흐름을 잡습니다.",
    Icon: ListChecks,
  },
  {
    id: "vocab",
    label: "단어 러시",
    hint: "지문에서 뽑힌 어휘를 뜻, 문맥, 철자까지 반복합니다.",
    Icon: Sparkles,
  },
  {
    id: "grammar",
    label: "어법 함정",
    hint: "문법 포인트와 흔한 오답 함정을 짧게 점검합니다.",
    Icon: Target,
  },
  {
    id: "sentence",
    label: "문장 복원",
    hint: "해석, 빈칸, 배열로 문장 단위 정확도를 올립니다.",
    Icon: BookOpen,
  },
  {
    id: "exam",
    label: "실전 변형",
    hint: "내용 파악, 빈칸, 순서, 삽입형 감각을 훈련합니다.",
    Icon: Wand2,
  },
  {
    id: "weakness",
    label: "약점 분석",
    hint: "방금 틀린 것과 누적 기록으로 다음 훈련을 정합니다.",
    Icon: Trophy,
  },
];

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

const textAnswerTypes = new Set([
  "sentence_translate",
  "progressive_cloze",
  "first_letter_recall",
  "vocab_spell",
  "grammar_find",
  "grammar_correct",
  "structure_transform",
]);

const arrangeTypes = new Set(["sentence_rebuild", "chunk_rebuild", "sentence_order"]);

function isChatQuizSupported(activity: QuizActivity) {
  return multipleChoiceTypes.has(activity.type) || textAnswerTypes.has(activity.type) || arrangeTypes.has(activity.type);
}

function textOf(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.text ?? record.label ?? record.value ?? record.word ?? record.meaning ?? JSON.stringify(value));
  }
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeOptions(value: unknown) {
  return Array.isArray(value) ? value.map((item, index) => ({ id: String(index), raw: item, label: textOf(item) })) : [];
}

function quizPrompt(activity: QuizActivity) {
  const payload = activity.payload;
  return String(
    payload.prompt ??
      payload.statement ??
      payload.stem ??
      payload.meaning ??
      payload.targetSentence ??
      payload.source ??
      activity.instructions ??
      activity.title,
  );
}

function missionMatchesActivity(activity: QuizActivity, mission: MissionId) {
  if (mission === "vocab") return activity.mode === "vocab" || activity.type.includes("vocab") || activity.type.includes("collocation");
  if (mission === "grammar") return activity.mode === "grammar" || activity.type.includes("grammar") || activity.type.includes("structure");
  if (mission === "sentence") return activity.mode === "memorize" || activity.type.includes("rebuild") || activity.type.includes("translate");
  if (mission === "flow") return activity.mode === "interpret" || activity.mode === "order" || activity.type.includes("gist") || activity.type.includes("order");
  if (mission === "exam") return activity.type.includes("insertion") || activity.type.includes("irrelevant") || activity.type.includes("paraphrase") || activity.type.includes("mastery");
  return true;
}

function cleanProseAroundSvg(text: string) {
  return text
    .replace(/```\s*svg[\s\S]*?(?:```|$)/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/```/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function missionPrompt(mission: MissionId) {
  switch (mission) {
    case "vocab":
      return "이 지문의 핵심 어휘를 하나씩 물어봐줘. 내가 틀리면 정답과 본문 속 쓰임을 바로 알려주고 비슷한 단어로 다시 물어봐.";
    case "grammar":
      return "내가 놓치기 쉬운 어법 함정을 질문으로 확인해줘. 한 번에 하나만 묻고, 내가 답하면 바로 근거 문장으로 채점해줘.";
    case "sentence":
      return "본문 문장을 한 문장씩 복원 훈련시켜줘. 해석, 빈칸, 어순 배열을 섞되 한 번에 하나만 물어봐.";
    case "exam":
      return "이 지문을 시험 변형 문제처럼 훈련시켜줘. 내용 파악, 빈칸 추론, 순서, 삽입 중 하나를 골라 한 문제만 내줘.";
    case "weakness":
      return "내 약점 분석하기. 최근 대화와 퀴즈 오답을 바탕으로 약점 3개, 바로 풀 다음 미션 1개를 아주 구체적으로 정해줘.";
    case "flow":
    default:
      return "이 지문을 한 문장씩 확인 질문으로 몰아쳐줘. 한 번에 하나만 묻고 내가 틀리면 바로 정답 근거를 알려줘.";
  }
}

export function TutorLessonAskClient({
  academy,
  programId,
  lessonId,
  title,
  passage,
  activities,
  initialMessages,
}: {
  academy: string;
  programId: string;
  lessonId: string;
  title: string;
  passage: string;
  activities: QuizActivity[];
  initialMessages: TutorMessage[];
}) {
  const [messages, setMessages] = useState<ChatEntry[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [activeMission, setActiveMission] = useState<MissionId>("flow");
  const [passageExpanded, setPassageExpanded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [forceNewConversation, setForceNewConversation] = useState(false);
  const answerIdRef = useRef(0);
  const quizIdRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const trimmed = useMemo(() => input.trim(), [input]);
  const quizPool = useMemo(() => activities.filter(isChatQuizSupported), [activities]);
  const solvedQuizIds = useMemo(() => new Set(quizResults.map((item) => item.id)), [quizResults]);
  const backHref = tutorPath(academy, `/study/${programId}/units/${lessonId}`);

  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const artifactStore = useArtifactStore();
  const questionForAnswerRef = useRef<Map<string, string>>(new Map());

  useTutorModalLock(true);

  useEffect(() => {
    setPortalTarget(document.body);
    const { body, documentElement: html } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousBodyOverflow;
      html.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isStreaming]);

  async function submitQuestion(event?: FormEvent<HTMLFormElement>, preset?: string) {
    event?.preventDefault();
    const question = (preset ?? trimmed).trim();
    if (!question || isStreaming) return;

    setError("");
    setInput("");
    const userMessage: TutorMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: question,
    };
    const answerId = `local-answer-${Date.now()}-${answerIdRef.current++}`;
    questionForAnswerRef.current.set(answerId, question);
    setMessages((current) => [...current, userMessage, { id: answerId, role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/tutor/conversations/${lessonId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          programId,
          conversationId,
          forceNewConversation,
          missionId: activeMission,
          clientContext: {
            activeMission,
            recentQuizResults: quizResults.slice(-10),
            lastQuiz: quizResults.at(-1) ?? null,
          },
        }),
      });
      const nextConversationId = res.headers.get("x-conversation-id");
      if (nextConversationId) {
        setConversationId(nextConversationId);
        setForceNewConversation(false);
      }
      if (!res.ok || !res.body) throw new Error("답변을 불러오지 못했습니다.");
      const isVisualizationMode = res.headers.get("x-response-mode") === "visualization";

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setMessages((current) =>
          current.map((message) =>
            message.id === answerId && message.role === "assistant"
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        );
      }

      if (isVisualizationMode) {
        const extracted = extractSvgBlock(accumulated);
        if (extracted.svg) {
          const sanitized = sanitizeSvg(extracted.svg);
          if (sanitized) {
            const title = deriveSvgTitle(sanitized, question);
            const userQuestion = questionForAnswerRef.current.get(answerId) ?? question;
            const artifact: TutorArtifact = {
              id: answerId,
              title,
              svg: sanitized,
              question: userQuestion,
              createdAt: Date.now(),
            };
            artifactStore.upsertArtifact(artifact);
          }
        }
      }
    } catch {
      setError("잠시 후 다시 질문해 주세요.");
      setMessages((current) =>
        current.map((message) =>
          message.id === answerId && message.role === "assistant" && !message.content
            ? { ...message, content: "답변을 이어오지 못했어요. 다시 시도해 주세요." }
            : message,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function startQuiz(preferredMission: MissionId = activeMission) {
    if (quizPool.length === 0) {
      void submitQuestion(undefined, missionPrompt(preferredMission));
      return;
    }
    const candidates = quizPool.filter((activity) => missionMatchesActivity(activity, preferredMission));
    if (candidates.length === 0) {
      void submitQuestion(undefined, missionPrompt(preferredMission));
      return;
    }
    const fresh = candidates.filter((activity) => !solvedQuizIds.has(activity.id));
    const source = fresh.length > 0 ? fresh : candidates;
    const activity = source[Math.floor(Math.random() * source.length)];
    setMessages((current) => [
      ...current,
      {
        id: `quiz-${Date.now()}-${quizIdRef.current++}`,
        role: "quiz",
        activity,
      },
    ]);
  }

  function runMission(id: MissionId) {
    setActiveMission(id);
    if (id === "weakness" || id === "flow") {
      void submitQuestion(undefined, missionPrompt(id));
      return;
    }
    startQuiz(id);
  }

  function createNewChat() {
    setMessages([]);
    setInput("");
    setError("");
    setQuizResults([]);
    setConversationId(null);
    setForceNewConversation(true);
    setActiveMission("flow");
    artifactStore.resetAll();
    questionForAnswerRef.current.clear();
  }

  function completeQuiz(activity: QuizActivity, feedback: QuizFeedback) {
    const result: QuizResult = {
      id: activity.id,
      title: activity.title,
      type: labelTutorActivityType(activity.type),
      mode: activity.mode,
      isCorrect: feedback.isCorrect,
      score: `${feedback.scoreEarned}/${feedback.scoreMax}`,
      explanation: feedback.explanation,
    };
    setQuizResults((current) => [...current, result]);
    setMessages((current) => [
      ...current,
      {
        id: `quiz-feedback-${Date.now()}`,
        role: "assistant",
        content: feedback.isCorrect
          ? `좋아, 정답이야. ${feedback.explanation} 다음은 같은 지문에서 난도를 조금 올려볼게.`
          : `오답이야. 정답 근거는 이것부터 잡아야 해: ${feedback.explanation} 다시 풀거나 같은 약점으로 한 문제 더 받을 수 있어.`,
      },
    ]);
  }

  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-white">
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-100 bg-white px-4 py-2 sm:px-6 md:px-8 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={backHref}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                aria-label="학습 랩으로 돌아가기"
              >
                <ArrowLeft className="size-4" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[11px] font-black text-blue-600 uppercase tracking-wider">
                  <MessageCircleQuestion className="size-3.5" />
                  AI 코칭룸
                </div>
                <h1 className="line-clamp-1 text-base font-black text-slate-950 leading-tight">{title}</h1>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => artifactStore.setOpen(true)}
              className={cn(
                "relative inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[10px] font-black transition",
                artifactStore.artifacts.length > 0
                  ? "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
              aria-label="시각 자료 모음 열기"
            >
              <Layers3 className="size-3.5" />
              시각 자료
              {artifactStore.artifacts.length > 0 && (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black text-white">
                  {artifactStore.artifacts.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={createNewChat}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 text-[10px] font-black text-blue-700 hover:bg-blue-100/50 active:bg-blue-100 transition"
            >
              <Plus className="size-3" />
              새 채팅
            </button>
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="size-3.5 shrink-0 text-blue-600" />
              <p className="truncate text-[11px] font-bold text-blue-700">지문 기반 질문 · 퀴즈 · 약점 분석</p>
              {quizResults.length > 0 && (
                <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-black text-blue-700 border border-blue-100">
                  퀴즈 {quizResults.filter((item) => item.isCorrect).length}/{quizResults.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPassageExpanded((value) => !value)}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-white px-2 text-[10px] font-black text-blue-700 ring-1 ring-blue-100 transition hover:bg-slate-50"
            >
              {passageExpanded ? "본문 접기" : "본문 보기"}
              <ChevronDown className={cn("size-3 transition", passageExpanded && "rotate-180")} />
            </button>
          </div>
          {passageExpanded && (
            <div className="mt-1.5 rounded-lg border border-slate-100 bg-white p-2 text-xs font-semibold leading-5 text-slate-700 max-h-24 overflow-y-auto scrollbar-thin">
              {passage}
            </div>
          )}
        </div>

        <div className="mt-2">
          <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
            {missions.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => runMission(id)}
                disabled={isStreaming}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-black transition",
                  activeMission === id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  isStreaming && "opacity-60",
                )}
              >
                <Icon className="size-3" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 pb-20 pt-4 sm:px-6 md:px-8">
        {messages.length === 0 && (
          <div className="rounded-3xl border border-dashed border-blue-100 bg-white px-4 py-8 text-center">
            <Wand2 className="mx-auto size-6 text-blue-500" />
            <p className="mt-2 text-sm font-black text-slate-800">미션을 고르면 바로 훈련이 시작돼요.</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              단어, 어법, 문장 복원, 실전 변형, 약점 분석을 한 채팅 안에서 이어갑니다.
            </p>
          </div>
        )}
        {messages.map((message) => {
          if (message.role === "quiz") {
            return (
              <ChatQuizCard
                key={message.id}
                activity={message.activity}
                programId={programId}
                onComplete={(feedback) => completeQuiz(message.activity, feedback)}
              />
            );
          }

          if (message.role === "assistant") {
            const artifact = artifactStore.artifacts.find((item) => item.id === message.id);
            const extracted = artifact ? null : extractSvgBlock(message.content);
            const inlineText = artifact
              ? cleanProseAroundSvg(message.content)
              : extracted?.svg
                ? cleanProseAroundSvg(`${extracted.before}\n${extracted.after}`)
                : message.content;
            const showPending = !artifact && (extracted?.isPartial ?? false);
            return (
              <div key={message.id} className="flex justify-start">
                <div className="max-w-[88%] break-words rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-700 shadow-sm">
                  <p className="mb-1 text-[10px] font-black uppercase text-blue-600">Tutor</p>
                  {inlineText && (
                    <span className="whitespace-pre-wrap">{inlineText}</span>
                  )}
                  {showPending && <ArtifactPendingCard />}
                  {artifact && (
                    <ArtifactInlineCard artifact={artifact} onOpen={artifactStore.openWith} />
                  )}
                  {!inlineText && !showPending && !artifact && isStreaming && <TutorTypingIndicator />}
                </div>
              </div>
            );
          }

          return (
            <div key={message.id} className="flex justify-end">
              <div className="max-w-[84%] break-words rounded-3xl bg-blue-600 px-4 py-3 text-sm font-bold leading-6 text-white shadow-sm">
                <span className="whitespace-pre-wrap">{message.content}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[1040px] -translate-x-1/2 border-t border-slate-100 bg-white px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-1.5 sm:px-6 md:px-8">
        <form onSubmit={(event) => void submitQuestion(event)} className="flex items-center gap-2">
          <Textarea
            data-testid="tutor-ask-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="질문하거나, 끝에 '시각화 해줘'를 붙여 도식으로 받아보세요."
            className="min-h-10 h-10 py-2.5 resize-none rounded-xl border-slate-200 bg-slate-50 text-xs sm:text-sm focus-visible:ring-1 focus-visible:ring-blue-500 transition"
            disabled={isStreaming}
          />
          <Button
            data-testid="tutor-ask-submit"
            type="submit"
            className="h-10 w-10 shrink-0 rounded-xl bg-blue-600 p-0 hover:bg-blue-700 transition"
            disabled={!trimmed || isStreaming}
          >
            <Send className="size-3.5" />
          </Button>
        </form>
        {error && <p className="mt-1 text-xs font-bold text-red-500">{error}</p>}
      </div>
      <ArtifactsPanel
        open={artifactStore.open}
        onClose={() => artifactStore.setOpen(false)}
        artifacts={artifactStore.artifacts}
        selectedId={artifactStore.selectedId}
        onSelect={artifactStore.setSelectedId}
        onDelete={artifactStore.deleteArtifact}
      />
    </div>,
    portalTarget,
  );
}

function TutorTypingIndicator() {
  return (
    <span
      className="inline-flex items-center gap-1.5 py-1 align-middle"
      role="status"
      aria-label="AI가 답변을 작성하는 중"
    >
      <span className="block size-1.5 rounded-full bg-blue-500/80 animate-bounce [animation-delay:-0.32s]" />
      <span className="block size-1.5 rounded-full bg-blue-500/80 animate-bounce [animation-delay:-0.16s]" />
      <span className="block size-1.5 rounded-full bg-blue-500/80 animate-bounce" />
    </span>
  );
}

function ChatQuizCard({
  activity,
  programId,
  onComplete,
}: {
  activity: QuizActivity;
  programId: string;
  onComplete: (feedback: QuizFeedback) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [picked, setPicked] = useState<Array<{ key: string; value: unknown; label: string }>>([]);
  const [feedback, setFeedback] = useState<QuizFeedback | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const payload = activity.payload;
  const options = normalizeOptions(payload.options);
  const shuffled = Array.isArray(payload.shuffled)
    ? payload.shuffled.map((item, index) => {
        const record = asRecord(item);
        return {
          key: String(record.index ?? index),
          value: record.index ?? index,
          label: String(record.text ?? record.sentence ?? record.label ?? textOf(item)),
        };
      })
    : [];
  const chunks = Array.isArray(payload.chunks)
    ? payload.chunks.map((chunk, index) => ({ key: `${index}-${textOf(chunk)}`, value: textOf(chunk), label: textOf(chunk) }))
    : [];
  const isOrder = activity.type === "sentence_order";
  const isArrange = activity.type === "sentence_rebuild" || activity.type === "chunk_rebuild";
  const prompt = quizPrompt(activity);
  const canSubmit =
    !isPending &&
    !feedback &&
    ((multipleChoiceTypes.has(activity.type) && selectedIndex !== null) ||
      (textAnswerTypes.has(activity.type) && textAnswer.trim().length > 0) ||
      (isOrder && picked.length === shuffled.length && shuffled.length > 0) ||
      (isArrange && picked.length > 0));

  function resetArrange() {
    setPicked([]);
  }

  function retry() {
    setSelectedIndex(null);
    setTextAnswer("");
    setPicked([]);
    setFeedback(null);
    setMessage("");
  }

  function submit() {
    if (!canSubmit) return;
    setMessage("");
    const response = (() => {
      if (multipleChoiceTypes.has(activity.type)) return { selectedIndex };
      if (isOrder) return { order: picked.map((item) => item.value) };
      if (isArrange) return { answer: picked.map((item) => item.label).join(" ") };
      return { answer: textAnswer };
    })();

    startTransition(async () => {
      const result = await submitTutorActivityAction(activity.id, response, programId);
      if (!result.ok || !result.feedback) {
        setMessage(result.ok ? "채점 결과를 받지 못했어요." : result.error);
        return;
      }
      setFeedback(result.feedback);
      onComplete(result.feedback);
    });
  }

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[94%] rounded-3xl border border-blue-100 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase text-blue-600">Mission Quiz</p>
            <h2 className="mt-1 text-sm font-black leading-5 text-slate-950">
              {studentActivityTitle(activity.type, activity.title, payload)}
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {studentActivityInstruction(activity.type, activity.instructions, payload)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
            {labelTutorActivityType(activity.type)}
          </span>
        </div>

        <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-3">
          <p className="whitespace-pre-wrap text-sm font-bold leading-6 text-slate-900">{prompt}</p>
          {typeof payload.koreanHint === "string" && (
            <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
              힌트: {payload.koreanHint}
            </p>
          )}
        </div>

        {multipleChoiceTypes.has(activity.type) && options.length > 0 && (
          <div className="mt-3 grid gap-2">
            {options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                disabled={Boolean(feedback)}
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "rounded-2xl border px-3 py-3 text-left text-sm font-bold leading-5 transition",
                  selectedIndex === index
                    ? "border-blue-400 bg-blue-50 text-blue-800"
                    : "border-slate-200 bg-white text-slate-700 active:bg-slate-50",
                )}
              >
                <span className="mr-2 text-blue-600">{index + 1}</span>
                {option.label}
              </button>
            ))}
          </div>
        )}

        {isOrder && (
          <ArrangePicker
            items={shuffled}
            picked={picked}
            setPicked={setPicked}
            disabled={Boolean(feedback)}
            emptyLabel="아래 문장을 순서대로 눌러 흐름을 완성하세요."
          />
        )}

        {isArrange && (
          <ArrangePicker
            items={chunks}
            picked={picked}
            setPicked={setPicked}
            disabled={Boolean(feedback)}
            emptyLabel="아래 조각을 원문 순서대로 눌러 문장을 완성하세요."
          />
        )}

        {textAnswerTypes.has(activity.type) && (
          <Textarea
            value={textAnswer}
            onChange={(event) => setTextAnswer(event.target.value)}
            disabled={Boolean(feedback)}
            placeholder="답을 입력하세요."
            className="mt-3 min-h-20 rounded-2xl border-slate-200 bg-white text-sm"
          />
        )}

        {feedback && (
          <div
            className={cn(
              "mt-3 rounded-2xl border px-3 py-3",
              feedback.isCorrect ? "border-emerald-100 bg-emerald-50" : "border-rose-100 bg-rose-50",
            )}
          >
            <div className="flex items-center gap-2">
              {feedback.isCorrect ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <XCircle className="size-4 text-rose-600" />
              )}
              <p className={cn("text-sm font-black", feedback.isCorrect ? "text-emerald-700" : "text-rose-700")}>
                {feedback.isCorrect ? "정답" : "오답"} · {feedback.scoreEarned}/{feedback.scoreMax}점
              </p>
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">해설: {feedback.explanation}</p>
          </div>
        )}

        {message && <p className="mt-2 text-xs font-bold text-red-500">{message}</p>}

        <div className="mt-3 flex items-center gap-2">
          {(isOrder || isArrange) && !feedback && (
            <button
              type="button"
              onClick={resetArrange}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-500"
            >
              <RotateCcw className="size-3.5" />
              다시 배열
            </button>
          )}
          {feedback && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700"
            >
              <RotateCcw className="size-3.5" />
              다시 풀기
            </button>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="ml-auto h-10 rounded-xl bg-blue-600 px-4 text-xs font-black hover:bg-blue-700"
          >
            {isPending ? "채점 중" : feedback ? "채점 완료" : "바로 채점"}
            {!isPending && !feedback && <ChevronRight className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ArrangePicker({
  items,
  picked,
  setPicked,
  disabled,
  emptyLabel,
}: {
  items: Array<{ key: string; value: unknown; label: string }>;
  picked: Array<{ key: string; value: unknown; label: string }>;
  setPicked: (items: Array<{ key: string; value: unknown; label: string }>) => void;
  disabled: boolean;
  emptyLabel: string;
}) {
  const pickedKeys = new Set(picked.map((item) => item.key));
  const remaining = items.filter((item) => !pickedKeys.has(item.key));

  return (
    <div className="mt-3 space-y-2">
      <div className="min-h-14 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
        {picked.length === 0 ? (
          <p className="py-2 text-xs font-bold text-blue-500">{emptyLabel}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((item, index) => (
              <button
                key={item.key}
                type="button"
                disabled={disabled}
                onClick={() => setPicked(picked.filter((pickedItem) => pickedItem.key !== item.key))}
                className="rounded-xl bg-white px-2.5 py-2 text-left text-xs font-bold leading-5 text-blue-800 shadow-sm"
              >
                {index + 1}. {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        {remaining.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            onClick={() => setPicked([...picked, item])}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-bold leading-5 text-slate-700 active:bg-slate-50"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
