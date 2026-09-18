"use client";

// 어법 드릴 — 하단 시트 2종: 개념 카드 시트 · 질문(AI 튜터) 시트.
// 자체 구현(포털 없이 fixed) — /a·/t 의 자체 시트 관용구를 따른다.

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircleQuestion, SendHorizonal, X } from "lucide-react";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import type { GrammarConcept } from "@/lib/grammar-drill/types";
import { MarkupText } from "./markup-text";

function SheetShell({
  title,
  onClose,
  bottomInset,
  children,
}: {
  title: string;
  onClose: () => void;
  /** 가상 키보드 높이(px) — 시트를 키보드 위로 올린다(ChatSheet 입력용) */
  bottomInset?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="닫기"
        className="gd-sheet-backdrop"
        onClick={onClose}
      />
      <div
        className="gd-sheet gd-app"
        role="dialog"
        aria-modal="true"
        style={bottomInset ? { bottom: bottomInset } : undefined}
      >
        <div className="gd-sheet-grip" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <p className="gd-t-sm font-bold">{title}</p>
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
        {children}
      </div>
    </>
  );
}

// ── 개념 카드 시트 ───────────────────────────────────────────────────────────

export function ConceptSheet({
  conceptId,
  onClose,
  onPeeked,
}: {
  conceptId: string;
  onClose: () => void;
  onPeeked?: () => void;
}) {
  const [concept, setConcept] = useState<GrammarConcept | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onPeeked?.();
    let alive = true;
    fetch(`/api/grammar-drill/concept/${conceptId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) setConcept(d.concept);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId]);

  return (
    <SheetShell title="개념 카드" onClose={onClose}>
      <div className="gd-scroll min-h-0 flex-1 px-5 pb-6">
        {failed && (
          <p className="gd-t-sm py-8 text-center" style={{ color: "var(--gd-ink-3)" }}>
            개념 카드를 불러오지 못했습니다.
          </p>
        )}
        {!concept && !failed && (
          <div className="animate-pulse py-4" role="status" aria-live="polite">
            <span className="sr-only">개념 카드를 불러오는 중입니다</span>
            <div className="gd-skeleton h-5 w-2/5" aria-hidden />
            <div className="gd-skeleton mt-2.5 h-4 w-4/5" aria-hidden />
            <div className="gd-skeleton mt-4 h-3.5 w-full" aria-hidden />
            <div className="gd-skeleton mt-2 h-3.5 w-3/4" aria-hidden />
          </div>
        )}
        {concept && <ConceptCardBody concept={concept} />}
      </div>
    </SheetShell>
  );
}

export function ConceptCardBody({ concept }: { concept: GrammarConcept }) {
  return (
    <div>
      <h3 className="gd-t-lg font-bold">{concept.title}</h3>
      <p className="gd-t-sm mt-1" style={{ color: "var(--gd-ink-2)" }}>
        {concept.oneLiner}
      </p>

      <div
        className="mt-4 rounded-xl p-3.5"
        style={{ background: "var(--gd-blue-soft)", border: "1px solid var(--gd-blue-line)" }}
      >
        <p className="gd-label mb-2" style={{ color: "var(--gd-blue)" }}>
          판단 순서
        </p>
        <ol className="flex flex-col gap-1.5">
          {concept.algorithm.map((step, i) => (
            <li key={i} className="gd-t-sm flex gap-2 leading-relaxed">
              <span className="gd-mono shrink-0 font-bold" style={{ color: "var(--gd-blue)" }}>
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <p className="gd-label mt-5 mb-2">핵심 규칙</p>
      <div className="flex flex-col gap-2.5">
        {concept.rules.map((rule, i) => (
          <div key={i} className="gd-card p-3.5">
            <p className="gd-t-sm font-semibold leading-relaxed">{rule.rule}</p>
            {rule.examples.map((ex, j) => (
              <div key={j} className="gd-hairline-t mt-2.5 pt-2.5">
                <p className="gd-en gd-t-sm leading-relaxed">
                  <MarkupText text={ex.en} />
                </p>
                <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
                  {ex.ko}
                </p>
                {ex.note && (
                  <p className="gd-t-2xs mt-1" style={{ color: "var(--gd-blue)" }}>
                    {ex.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="gd-label mt-5 mb-2">함정 주의</p>
      <div className="flex flex-col gap-2.5">
        {concept.traps.map((trap, i) => (
          <div
            key={i}
            className="rounded-xl border p-3.5"
            style={{ borderColor: "var(--gd-bad-line)", background: "var(--gd-bad-soft)" }}
          >
            <p className="gd-t-sm font-bold" style={{ color: "var(--gd-bad)" }}>
              {trap.title}
            </p>
            <p className="gd-t-xs mt-1 leading-relaxed" style={{ color: "var(--gd-ink-2)" }}>
              {trap.body}
            </p>
            {trap.example && (
              <p className="gd-en gd-t-xs mt-2">
                <MarkupText text={trap.example.en} />{" "}
                <span className="font-sans" style={{ color: "var(--gd-ink-3)" }}>
                  — {trap.example.ko}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 질문(AI 튜터) 시트 ───────────────────────────────────────────────────────

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export function ChatSheet({
  itemId,
  conceptId,
  revealAllowed,
  onClose,
}: {
  itemId?: string;
  conceptId?: string;
  revealAllowed: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 가상 키보드가 열리면 시트째로 키보드 위로 — 입력창·전송 버튼 가림 방지
  const kbInset = useKeyboardInset();

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, []);

  useEffect(() => {
    const qs = itemId
      ? `itemId=${encodeURIComponent(itemId)}`
      : conceptId
        ? `conceptId=${encodeURIComponent(conceptId)}`
        : "";
    fetch(`/api/grammar-drill/chat?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setMessages(
            d.messages.map((m: { role: string; content: string }) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
          );
          setRemaining(d.remaining);
          scrollDown();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, conceptId]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    scrollDown();
    try {
      const res = await fetch("/api/grammar-drill/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, itemId, conceptId, revealAllowed }),
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
            next[next.length - 1] = {
              role: "assistant",
              content: last.content + chunk,
            };
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
    <SheetShell title="선생님 AI에게 질문" onClose={onClose} bottomInset={kbInset}>
      {/* min-h-0: flex 자식의 암묵 min-height:auto 를 무효화해 목록이 줄어들며
          스크롤되게 한다 — 없으면 긴 대화가 푸터(입력창)를 시트 밖으로 민다.
          빈 대화일 때만 인라인 최소 높이로 시트 볼륨을 확보한다. */}
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
              지금 보고 있는 {itemId ? "문제" : "개념"}에 대해 무엇이든 물어보십시오.
            </p>
            {!revealAllowed && itemId && (
              <p className="gd-t-2xs mt-1.5" style={{ color: "var(--gd-ink-3)" }}>
                아직 풀지 않은 문제이므로 정답은 알려주지 않습니다.
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
                {m.content ||
                  (streaming && i === messages.length - 1 ? "생각 중…" : "")}
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
              if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
            }}
            placeholder={
              remaining === 0 ? "오늘 질문을 모두 사용했습니다" : "질문을 입력하십시오"
            }
            disabled={streaming || remaining === 0}
            className="gd-t-sm h-11 w-full rounded-xl border px-3.5 outline-none focus:border-[var(--gd-blue)]"
            style={{ background: "var(--gd-card)", borderColor: "var(--gd-line-strong)" }}
          />
          <button
            type="button"
            onClick={send}
            disabled={streaming || !input.trim() || remaining === 0}
            className="gd-btn gd-btn-primary h-11 w-11 shrink-0 p-0"
            aria-label="보내기"
          >
            <SendHorizonal className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
