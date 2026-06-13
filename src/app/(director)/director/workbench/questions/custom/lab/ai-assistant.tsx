"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Wand2 } from "lucide-react";

import { parseCompiledCustomType, type CompiledCustomType } from "@/lib/custom-question-types/types";
import { cn } from "@/lib/utils";

import { summarizeFormatChanges } from "./lab-types";

const FORMAT_HINTS =
  "형식을 바꾸려면 예: “서술형으로”, “빈칸 2개로”, “지문 밑줄 다 지워줘”, “선지를 (a)~(e)로”, “지문 박스 테두리 없애줘”";

// AI 어시스턴트 — 자연어 지시 → spec-revise(stateless) → workingSpec 교체.
// 변경 요약은 클라이언트에서 이전/이후 format 비교로 계산한다(서버 응답은 spec 만).

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const SUGGESTION_CHIPS = [
  "선지를 (a)~(e)로 바꿔줘",
  "빈칸을 2개로 줄여줘",
  "조건 박스를 추가해줘",
  "서술형으로 바꿔줘",
];

function msgId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export function AiAssistant({
  typeId,
  spec,
  onSpecChange,
}: {
  typeId: string;
  spec: CompiledCustomType;
  onSpecChange: (next: CompiledCustomType) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // 비동기 요청 중에도 항상 최신 workingSpec 을 보낸다(렌더 중 ref 쓰기 금지 → effect 동기화).
  const specRef = useRef(spec);
  useEffect(() => {
    specRef.current = spec;
  }, [spec]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const send = useCallback(
    async (text: string) => {
      const instruction = text.trim();
      if (instruction.length < 2 || sending) return;
      setMessages((m) => [...m, { id: msgId(), role: "user", text: instruction }]);
      setInput("");
      setSending(true);
      try {
        const current = specRef.current;
        const res = await fetch("/api/custom-question-types/spec-revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ typeId, instruction, spec: current }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          spec?: unknown;
          changes?: string[];
          contentChanged?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(json?.error || "스펙 수정에 실패했습니다.");

        let next = parseCompiledCustomType(json.spec);
        // AI 가 format/sourceLayout 을 누락 반환하면 작업 중 값을 보존(미리보기 붕괴 방지).
        if (!next.format && current.format) next = { ...next, format: current.format };
        if (!next.sourceLayout && current.sourceLayout) next = { ...next, sourceLayout: current.sourceLayout };

        // 서버가 계산한 변경 요약을 우선 사용(결정 해석기/LLM 공통). 누락 시 클라 폴백 진단.
        const changes =
          Array.isArray(json.changes) && json.changes.length
            ? json.changes
            : summarizeFormatChanges(current.format, next.format);
        onSpecChange(next);
        setMessages((m) => [
          ...m,
          {
            id: msgId(),
            role: "assistant",
            text: changes.length
              ? `형식을 수정해 미리보기에 바로 반영했어요.\n${changes.map((c) => `• ${c}`).join("\n")}`
              : json.contentChanged
                ? `출제 지침(유형의 본질)을 업데이트했어요. 형식·미리보기 모양은 그대로예요.\n${FORMAT_HINTS}`
                : `요청에서 바꿀 형식을 찾지 못했어요. 더 구체적으로 말해 주세요.\n${FORMAT_HINTS}`,
          },
        ]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: msgId(),
            role: "assistant",
            text: err instanceof Error ? err.message : "스펙 수정에 실패했습니다.",
            error: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, typeId, onSpecChange],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 px-3 py-2">
        <Wand2 className="size-3.5 text-blue-600" />
        <span className="text-[12px] font-bold text-slate-800">AI 어시스턴트</span>
        <span className="ml-auto text-[10px] text-slate-400">변경은 저장 전까지 임시</span>
      </div>

      {/* 메시지 목록 */}
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-[11.5px] leading-relaxed text-slate-500">
            자연어로 유형의 형식·본질을 수정합니다. 적용 결과는 중앙 미리보기에 즉시 반영되고,
            마음에 들면 상단 [버전 저장] 으로 확정하세요.
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                  m.role === "user"
                    ? "rounded-br-sm bg-blue-600 text-white"
                    : m.error
                      ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-600"
                      : "rounded-bl-sm bg-slate-100 text-slate-700",
                )}
              >
                {m.text}
              </div>
            </div>
          ))
        )}
        {sending ? (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-1.5 rounded-xl rounded-bl-sm bg-slate-100 px-3 py-2 text-[12px] text-slate-500">
              <Loader2 className="size-3.5 animate-spin" />
              스펙을 수정하는 중…
            </div>
          </div>
        ) : null}
      </div>

      {/* 추천 지시 칩 + 입력 */}
      <div className="shrink-0 space-y-2 border-t border-slate-200 p-2.5">
        <div className="flex flex-wrap gap-1">
          {SUGGESTION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => void send(chip)}
              disabled={sending}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 transition-colors hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="예: 선지를 표 형태로 바꾸고 열 헤더를 (X)(Y)로"
            className="min-w-0 flex-1 resize-none rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px] leading-relaxed placeholder:text-slate-300"
          />
          <button
            type="button"
            onClick={() => void send(input)}
            disabled={sending || input.trim().length < 2}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="전송"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
