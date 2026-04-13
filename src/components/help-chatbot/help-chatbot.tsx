// @ts-nocheck
"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  HelpCircle,
  X,
  Lightbulb,
  BookOpen,
  ArrowRight,
  List,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { findGuideForPath, type PageGuide } from "./page-guides";

// ─── Chat message types ───
interface ChatMessage {
  id: string;
  type: "bot" | "user";
  content: string;
  guideSteps?: string[];
  options?: { label: string; action: string }[];
  /** compact = small inline buttons (다른 가이드/처음으로) */
  optionStyle?: "default" | "compact";
}

// ─── Main Component ───
export function HelpChatbot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<string | null>(null);
  const guide = useMemo(() => findGuideForPath(pathname), [pathname]);

  // Reset messages when page changes
  useEffect(() => {
    if (open && guide) {
      initChat(guide);
    }
  }, [pathname]);

  // Smart scroll: to target message or bottom
  useEffect(() => {
    if (!scrollRef.current) return;
    const targetId = scrollTargetRef.current;
    if (targetId) {
      // Scroll to the start of the new content (the user's message)
      requestAnimationFrame(() => {
        const el = scrollRef.current?.querySelector(
          `[data-msg-id="${targetId}"]`,
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        scrollTargetRef.current = null;
      });
    } else {
      // Default: scroll to bottom (initial load, etc.)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function initChat(g: PageGuide) {
    scrollTargetRef.current = null;
    setMessages([
      {
        id: "welcome",
        type: "bot",
        content: `**${g.title}** 페이지에 오신 걸 환영합니다!`,
      },
      {
        id: "desc",
        type: "bot",
        content: g.description,
      },
      {
        id: "features",
        type: "bot",
        content: "이 페이지에서 할 수 있는 것들:",
        guideSteps: g.features,
      },
      {
        id: "ask",
        type: "bot",
        content: "무엇을 도와드릴까요?",
        options: g.guides.map((guide, i) => ({
          label: guide.title,
          action: `guide_${i}`,
        })),
      },
    ]);
  }

  function handleOpen() {
    setOpen(true);
    if (guide) {
      initChat(guide);
    } else {
      setMessages([
        {
          id: "no-guide",
          type: "bot",
          content:
            "이 페이지에 대한 가이드가 아직 준비되지 않았습니다. 다른 페이지에서 다시 시도해주세요.",
        },
      ]);
    }
  }

  function handleSelectGuide(guideIndex: number) {
    if (!guide) return;
    const selectedGuide = guide.guides[guideIndex];
    if (!selectedGuide) return;

    const ts = Date.now();
    const userMsgId = `user_${ts}`;

    // Scroll to the user message (start of this interaction)
    scrollTargetRef.current = userMsgId;

    setMessages((prev) => [
      ...prev,
      // ── User's selection
      {
        id: userMsgId,
        type: "user",
        content: selectedGuide.title,
      },
      // ── Guide steps (the MAIN content)
      {
        id: `steps_${ts}`,
        type: "bot",
        content: `**${selectedGuide.title}**`,
        guideSteps: selectedGuide.steps,
      },
      // ── Tips (if any)
      ...(guide.tips && guide.tips.length > 0
        ? [
            {
              id: `tips_${ts}`,
              type: "bot" as const,
              content: "💡 **팁**",
              guideSteps: guide.tips,
            },
          ]
        : []),
      // ── Compact navigation (just 2 buttons, not 10+)
      {
        id: `more_${ts}`,
        type: "bot",
        content: "",
        options: [
          { label: "다른 가이드 보기", action: "show_guides" },
          { label: "처음으로", action: "reset" },
        ],
        optionStyle: "compact",
      },
    ]);
  }

  function handleAction(action: string) {
    if (action === "reset" && guide) {
      initChat(guide);
      return;
    }
    if (action === "show_guides" && guide) {
      const ts = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id: `user_sg_${ts}`,
          type: "user",
          content: "다른 가이드 보기",
        },
        {
          id: `guides_${ts}`,
          type: "bot",
          content: "원하는 가이드를 선택하세요.",
          options: [
            ...guide.guides.map((g, i) => ({
              label: g.title,
              action: `guide_${i}`,
            })),
            { label: "처음으로", action: "reset" },
          ],
        },
      ]);
      return;
    }
    if (action.startsWith("guide_")) {
      const idx = parseInt(action.replace("guide_", ""), 10);
      handleSelectGuide(idx);
    }
  }

  // ─── Bold text renderer (avoids dangerouslySetInnerHTML) ───
  function renderBoldText(text: string) {
    if (!text) return null;
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="font-semibold">
          {part}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  }

  return (
    <>
      {/* ─── Floating button ─── */}
      <button
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-105",
          open
            ? "w-11 h-11 bg-slate-700 text-white hover:bg-slate-800"
            : "w-14 h-14 bg-blue-600 text-white hover:bg-blue-700",
        )}
        aria-label={open ? "도움말 닫기" : "도움말 열기"}
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <HelpCircle className="w-6 h-6" />
        )}
      </button>

      {/* ─── Chat panel ─── */}
      <div
        className={cn(
          "fixed bottom-24 right-6 z-50 w-[380px] max-h-[560px] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden transition-all duration-300 origin-bottom-right",
          open
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none",
        )}
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold leading-tight">
                페이지 가이드
              </h3>
              <p className="text-[11px] text-blue-200 mt-0.5">
                {guide?.title || "도움말"}
              </p>
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/50"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              data-msg-id={msg.id}
              className={cn(
                "flex",
                msg.type === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[320px] rounded-2xl text-[13px] leading-relaxed",
                  msg.type === "user"
                    ? "bg-blue-600 text-white rounded-br-md px-4 py-3"
                    : msg.optionStyle === "compact"
                      ? "px-0 py-0"
                      : "bg-white border border-slate-100 text-slate-700 rounded-bl-md shadow-sm px-4 py-3",
                )}
              >
                {/* Content with bold support (safe, no dangerouslySetInnerHTML) */}
                {msg.content && (
                  <p className="whitespace-pre-wrap">
                    {renderBoldText(msg.content)}
                  </p>
                )}

                {/* Step list */}
                {msg.guideSteps && (
                  <div className="mt-2.5 space-y-1.5">
                    {msg.guideSteps.map((step, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-[12px] text-slate-600 leading-relaxed">
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Option buttons — default style (vertical list for menu) */}
                {msg.options && msg.optionStyle !== "compact" && (
                  <div className="mt-3 flex flex-col gap-1">
                    {msg.options.map((opt) => (
                      <button
                        key={opt.action}
                        onClick={() => handleAction(opt.action)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[12px] font-medium text-blue-700 bg-blue-50/70 hover:bg-blue-100 transition-colors text-left"
                      >
                        <ArrowRight className="w-3 h-3 shrink-0 text-blue-400" />
                        <span className="leading-snug">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Option buttons — compact style (inline, for "다른 가이드/처음으로") */}
                {msg.options && msg.optionStyle === "compact" && (
                  <div className="flex items-center gap-2">
                    {msg.options.map((opt) => (
                      <button
                        key={opt.action}
                        onClick={() => handleAction(opt.action)}
                        className={cn(
                          "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors",
                          opt.action === "reset"
                            ? "text-slate-500 bg-slate-100 hover:bg-slate-200"
                            : "text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100",
                        )}
                      >
                        {opt.action === "reset" ? (
                          <RotateCcw className="w-3 h-3" />
                        ) : (
                          <List className="w-3 h-3" />
                        )}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-3 bg-white border-t border-slate-100">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Lightbulb className="w-3.5 h-3.5 text-slate-300" />
            <span>
              각 페이지에서 도움말 버튼을 누르면 해당 페이지 안내를 볼 수
              있어요
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
