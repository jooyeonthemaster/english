"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MessageCircleQuestion, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type TutorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const quickPrompts = [
  "이 지문의 핵심 흐름을 3단계로 다시 설명해줘.",
  "헷갈리는 어법 포인트를 질문 형식으로 확인해줘.",
  "빈칸이나 서술형으로 나올 만한 표현을 뽑아줘.",
];

export function TutorLessonAskClient({
  academy,
  programId,
  lessonId,
  title,
  passage,
  initialMessages,
}: {
  academy: string;
  programId: string;
  lessonId: string;
  title: string;
  passage: string;
  initialMessages: TutorMessage[];
}) {
  const [messages, setMessages] = useState<TutorMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const answerIdRef = useRef(0);

  const trimmed = useMemo(() => input.trim(), [input]);

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
    setMessages((current) => [...current, userMessage, { id: answerId, role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/tutor/conversations/${lessonId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, programId }),
      });
      if (!res.ok || !res.body) throw new Error("답변을 불러오지 못했습니다.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((current) =>
          current.map((message) =>
            message.id === answerId ? { ...message, content: message.content + chunk } : message,
          ),
        );
      }
    } catch {
      setError("잠시 후 다시 질문해 주세요.");
      setMessages((current) =>
        current.map((message) =>
          message.id === answerId && !message.content
            ? { ...message, content: "답변을 이어오지 못했어요. 다시 시도해 주세요." }
            : message,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-78px)] min-h-0 flex-col overflow-hidden bg-white">
      <header className="border-b border-slate-100 px-4 py-4 sm:px-6 md:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/tutor/${academy}/study/${programId}/units/${lessonId}`}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-600"
                aria-label="학습 랩으로 돌아가기"
              >
                <ArrowLeft className="size-5" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-black text-blue-600">
                  <MessageCircleQuestion className="size-4" />
                  질문하기
                </div>
                <h1 className="mt-1 line-clamp-1 text-xl font-black text-slate-950">{title}</h1>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-blue-600" />
            <p className="text-xs font-black text-blue-700">지문 기반 답변</p>
          </div>
          <p className="line-clamp-4 text-sm font-semibold leading-6 text-slate-700">{passage}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-6 md:px-8">
        {messages.length === 0 && (
          <div className="rounded-3xl border border-dashed border-blue-100 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-600">
            막히는 문장, 어법, 단어, 흐름을 바로 물어보세요. 답변은 현재 지문 분석을 우선으로 참고합니다.
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                message.role === "user"
                  ? "max-w-[84%] break-words rounded-3xl bg-blue-600 px-4 py-3 text-sm font-bold leading-6 text-white shadow-sm"
                  : "max-w-[88%] break-words rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-700 shadow-sm"
              }
            >
              {message.role === "assistant" && <p className="mb-1 text-[10px] font-black uppercase text-blue-600">Tutor</p>}
              {message.content || (isStreaming ? "생각을 정리하는 중..." : "")}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 bg-white px-4 py-3 sm:px-6 md:px-8">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void submitQuestion(undefined, prompt)}
              className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
              disabled={isStreaming}
            >
              {prompt}
            </button>
          ))}
        </div>
        <form onSubmit={(event) => void submitQuestion(event)} className="flex items-end gap-2">
          <Textarea
            data-testid="tutor-ask-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="어휘, 문법, 문장 흐름을 질문해 보세요."
            className="min-h-12 resize-none rounded-2xl border-slate-200 bg-slate-50 text-sm"
            disabled={isStreaming}
          />
          <Button
            data-testid="tutor-ask-submit"
            type="submit"
            className="h-12 w-12 shrink-0 rounded-2xl bg-blue-600 p-0 hover:bg-blue-700"
            disabled={!trimmed || isStreaming}
          >
            <Send className="size-4" />
          </Button>
        </form>
        {error && <p className="mt-2 text-xs font-bold text-red-500">{error}</p>}
      </div>
    </div>
  );
}
