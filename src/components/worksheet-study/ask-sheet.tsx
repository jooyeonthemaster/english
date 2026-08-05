"use client";

// ============================================================================
// 학습지 스터디 — 문항 질문(AI 튜터) 하단 시트
//
// 어법 드릴 질문 시트(components/grammar-drill/sheets.tsx)의 검증된 상호작용을
// 따른다: text/plain 스트림을 청크 단위로 받아 마지막 assistant 말풍선에 누적,
// 일일 잔여는 X-Chat-Remaining 헤더로 갱신. 컨텍스트는 (stageId, itemKey) 만
// 보내고 본문·정답은 서버가 plan 에서 재조립한다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, SendHorizonal, X } from "lucide-react";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export function StudyAskSheet({
  taskId,
  stageId,
  itemKey,
  itemLabel,
  revealAllowed,
  onClose,
}: {
  taskId: string;
  stageId: string;
  itemKey: string;
  /** 빈 상태 안내에 쓰는 단계 이름 — "어휘 시험" */
  itemLabel: string;
  /** 이 문항을 이미 풀었는가 — 서버가 완료 스테이지는 무조건 공개로 승격한다 */
  revealAllowed: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/g/study/${taskId}/ask?itemKey=${encodeURIComponent(itemKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setMessages(
          d.messages.map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        );
        setRemaining(d.remaining);
        scrollDown();
      })
      .catch(() => {});
    // 문항이 바뀌면 그 문항의 이력으로 다시 로드한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, itemKey]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    scrollDown();
    try {
      const res = await fetch(`/api/g/study/${taskId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, stageId, itemKey, revealAllowed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg =
          err?.error === "DAILY_LIMIT"
            ? "오늘의 질문 횟수를 모두 사용했습니다. 내일 다시 질문할 수 있습니다."
            : "답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주십시오.";
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", content: msg };
          return next;
        });
        setStreaming(false);
        return;
      }
      const rem = res.headers.get("X-Chat-Remaining");
      if (rem !== null) setRemaining(Number(rem));
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessages((m) => {
            const next = [...m];
            const last = next[next.length - 1];
            next[next.length - 1] = { role: "assistant", content: last.content + chunk };
            return next;
          });
          scrollDown();
        }
      }
    } catch {
      setMessages((m) => {
        const next = [...m];
        const last = next[next.length - 1];
        if (!last.content) {
          next[next.length - 1] = {
            role: "assistant",
            content: "네트워크 오류로 답변이 중단되었습니다.",
          };
        }
        return next;
      });
    }
    setStreaming(false);
    scrollDown();
  }

  return (
    <>
      <button type="button" aria-label="닫기" className="gd-sheet-backdrop" onClick={onClose} />
      <div className="gd-sheet gd-app" role="dialog" aria-modal="true" aria-label="선생님 AI에게 질문">
        <div className="gd-sheet-grip" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <p className="gd-t-sm font-bold">선생님 AI에게 질문</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: "var(--gd-ink-3)" }}
            aria-label="닫기"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </div>

        {/* min-h-0: flex 자식의 암묵 min-height:auto 를 무효화해 목록이 줄어들며
            스크롤되게 한다 — 없으면 긴 대화가 입력창을 시트 밖으로 민다. */}
        <div
          ref={listRef}
          className="gd-scroll min-h-0 flex-1 px-5"
          style={messages.length === 0 ? { minHeight: "12rem" } : undefined}
        >
          {messages.length === 0 && (
            <div className="py-8 text-center">
              <MessageCircleQuestion
                className="mx-auto mb-2 h-8 w-8"
                style={{ color: "var(--gd-ink-3)" }}
                strokeWidth={1.5}
              />
              <p className="gd-t-sm" style={{ color: "var(--gd-ink-2)" }}>
                지금 풀고 있는 {itemLabel} 문항에 대해 무엇이든 물어보십시오.
              </p>
              {!revealAllowed && (
                <p className="gd-t-2xs mt-1.5" style={{ color: "var(--gd-ink-3)" }}>
                  아직 풀지 않은 문항이므로 정답은 알려주지 않습니다.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2.5 pb-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                  m.role === "user" ? "self-end text-white" : "self-start"
                }`}
                style={
                  m.role === "user"
                    ? { background: "var(--gd-blue)" }
                    : { background: "var(--gd-paper)", border: "1px solid var(--gd-line)" }
                }
              >
                <p className="gd-t-sm whitespace-pre-wrap leading-relaxed">
                  {m.content || (streaming && i === messages.length - 1 ? "생각 중…" : "")}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="gd-hairline-t gd-safe-b shrink-0 px-4 pt-3">
          <div className="flex items-end gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void send();
              }}
              placeholder={remaining === 0 ? "오늘 질문을 모두 사용했습니다" : "질문을 입력하십시오"}
              disabled={streaming || remaining === 0}
              className="gd-t-sm h-11 w-full rounded-xl border bg-white px-3.5 outline-none focus:border-[var(--gd-blue)]"
              style={{ borderColor: "var(--gd-line-strong)" }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={streaming || !input.trim() || remaining === 0}
              className="gd-btn gd-btn-primary h-11 w-11 shrink-0 p-0"
              aria-label="보내기"
            >
              <SendHorizonal className="h-4.5 w-4.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
