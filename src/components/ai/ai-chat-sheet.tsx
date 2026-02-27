"use client";

import { useEffect, useRef, useCallback } from "react";
import { Drawer } from "vaul";
import { X, Sparkles } from "lucide-react";
import { useAIChat } from "@/hooks/use-ai-chat";
import { AIMessageBubble } from "@/components/ai/ai-message-bubble";
import { AIChatInput } from "@/components/ai/ai-chat-input";

interface AIChatSheetProps {
  questionId: string;
  examId: string;
  schoolSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WELCOME_MESSAGE = "안녕하세요! 이 문항에 대해 궁금한 점이 있으면 물어보세요.";

export function AIChatSheet({
  questionId,
  open,
  onOpenChange,
}: AIChatSheetProps) {
  const { messages, isLoading, sendMessage, loadConversation } = useAIChat({
    questionId,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  // Load conversation when sheet opens
  useEffect(() => {
    if (open && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadConversation();
    }
  }, [open, loadConversation]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    // Small delay to ensure DOM is updated
    const timer = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timer);
  }, [messages, isLoading, scrollToBottom]);

  const handleSend = useCallback(
    (content: string) => {
      sendMessage(content);
    },
    [sendMessage]
  );

  // Determine if the last assistant message is currently streaming
  const lastMessage = messages[messages.length - 1];
  const isLastStreaming =
    isLoading && lastMessage?.role === "assistant";

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[0.6, 0.9]}
      activeSnapPoint={0.6}
      fadeFromIndex={0}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl bg-white focus:outline-none"
          style={{ height: "90dvh" }}
        >
          {/* Drag handle + header */}
          <div className="flex flex-col items-center border-b border-[#E5E7E0]/60">
            {/* Gradient drag handle */}
            <div className="pt-3 pb-2">
              <div className="h-1 w-10 rounded-full gradient-accent opacity-40" />
            </div>

            {/* Header with gradient accent */}
            <div className="flex w-full items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-2.5">
                {/* Gradient accent AI avatar */}
                <div className="flex size-8 items-center justify-center rounded-xl gradient-accent shadow-glow-green">
                  <Sparkles className="size-4 text-white" />
                </div>
                <div className="flex flex-col">
                  <Drawer.Title className="text-[16px] font-bold tracking-[-0.02em] text-[#1A1F16]">
                    AI 튜터
                  </Drawer.Title>
                  <span className="text-[11px] text-[#9CA396]">
                    무엇이든 물어보세요
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex size-8 items-center justify-center rounded-full text-[#9CA396] transition-colors hover:bg-[#F3F4F0] active:bg-[#E5E7E0]"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="flex flex-col gap-3.5 py-4">
              {/* Welcome message (always show at top) */}
              <AIMessageBubble
                role="assistant"
                content={WELCOME_MESSAGE}
                isStreaming={false}
              />

              {/* Conversation messages */}
              {messages.map((msg, idx) => {
                const isThisStreaming =
                  isLastStreaming && idx === messages.length - 1;
                return (
                  <AIMessageBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    isStreaming={isThisStreaming}
                  />
                );
              })}
            </div>
          </div>

          {/* Input area */}
          <AIChatInput onSend={handleSend} isLoading={isLoading} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
