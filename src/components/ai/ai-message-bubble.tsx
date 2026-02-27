"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

interface AIMessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

/**
 * Renders basic markdown: **bold**, *italic*, bullet lists (- item), numbered lists (1. item)
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let listKey = 0;

  function flushList() {
    if (listItems.length > 0 && listType) {
      const Tag = listType;
      elements.push(
        <Tag
          key={`list-${listKey++}`}
          className={cn(
            "my-1 pl-4",
            listType === "ul" ? "list-disc" : "list-decimal"
          )}
        >
          {listItems}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Bullet list: - item or * item
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (bulletMatch) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(
        <li key={`li-${i}`} className="mb-0.5">
          {formatInline(bulletMatch[1])}
        </li>
      );
      continue;
    }

    // Numbered list: 1. item
    const numberMatch = line.match(/^\s*\d+\.\s+(.+)/);
    if (numberMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push(
        <li key={`li-${i}`} className="mb-0.5">
          {formatInline(numberMatch[1])}
        </li>
      );
      continue;
    }

    flushList();

    if (line.trim() === "") {
      elements.push(<br key={`br-${i}`} />);
    } else {
      elements.push(
        <p key={`p-${i}`} className="mb-1 last:mb-0">
          {formatInline(line)}
        </p>
      );
    }
  }

  flushList();
  return elements;
}

/**
 * Formats inline markdown: **bold** and *italic*
 */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match **bold** or *italic*
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-[#1A1F16]">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={`i-${keyIdx++}`} className="italic text-[#7CB342]">
          {match[3]}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function AIMessageBubble({
  role,
  content,
  isStreaming = false,
}: AIMessageBubbleProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, type: "spring", stiffness: 400, damping: 30 }}
        className="flex justify-end px-4"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-sm gradient-primary px-4 py-3 text-[14px] leading-6 text-white shadow-glow-green">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </motion.div>
    );
  }

  // Assistant message
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, type: "spring", stiffness: 400, damping: 30 }}
      className="flex gap-2.5 px-4"
    >
      {/* AI avatar with gradient */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg gradient-accent">
        <Sparkles className="size-3.5 text-white" />
      </div>

      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-[#E5E7E0]/60 bg-[#FAFBF8] px-4 py-3 text-[14px] leading-6 text-[#343B2E]">
        {content ? (
          <div className="whitespace-pre-wrap">
            {renderMarkdown(content)}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse rounded-full bg-[#7CB342]" />
            )}
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-1.5 py-1">
            <motion.span
              className="inline-block size-[5px] rounded-full bg-[#9CA396]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
            />
            <motion.span
              className="inline-block size-[5px] rounded-full bg-[#9CA396]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
            />
            <motion.span
              className="inline-block size-[5px] rounded-full bg-[#9CA396]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
            />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
