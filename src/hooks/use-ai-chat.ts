"use client";

import { useState, useCallback, useRef } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface UseAIChatOptions {
  questionId: string;
}

interface UseAIChatReturn {
  messages: Message[];
  isLoading: boolean;
  sendMessage: (content: string) => Promise<void>;
  loadConversation: () => Promise<void>;
}

let messageIdCounter = 0;
function generateId() {
  messageIdCounter += 1;
  return `msg-${Date.now()}-${messageIdCounter}`;
}

export function useAIChat({ questionId }: UseAIChatOptions): UseAIChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadConversation = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai/conversation/${questionId}`);
      if (!response.ok) return;

      const data = await response.json();
      if (data.messages && data.messages.length > 0) {
        const loaded: Message[] = data.messages.map(
          (m: { role: string; content: string }) => ({
            id: generateId(),
            role: m.role as "user" | "assistant",
            content: m.content,
          })
        );
        setMessages(loaded);
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  }, [questionId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Add user message
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
      };

      // Add placeholder assistant message for streaming
      const assistantMessageId = generateId();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            message: content.trim(),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || "AI 응답 중 오류가 발생했습니다."
          );
        }

        if (!response.body) {
          throw new Error("응답 스트림을 받을 수 없습니다.");
        }

        // Read the streaming response (Vercel AI SDK data stream protocol)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });

          // Parse Vercel AI SDK data stream format
          // Each line is formatted as: TYPE:CONTENT\n
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;

            // Text delta format: 0:"text content"\n
            if (line.startsWith("0:")) {
              try {
                const textContent = JSON.parse(line.slice(2));
                fullText += textContent;

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: fullText }
                      : m
                  )
                );
              } catch {
                // Skip non-parseable lines
              }
            }
            // Other protocol messages (e, d, etc.) are ignored for display
          }
        }

        // If no content was streamed, show an error
        if (!fullText) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? { ...m, content: "응답을 받지 못했습니다. 다시 시도해주세요." }
                : m
            )
          );
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;

        const errorMessage =
          error instanceof Error
            ? error.message
            : "알 수 없는 오류가 발생했습니다.";

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: `오류: ${errorMessage}`,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [questionId, isLoading]
  );

  return {
    messages,
    isLoading,
    sendMessage,
    loadConversation,
  };
}
