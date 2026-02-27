"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AIChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function AIChatInput({ onSend, isLoading }: AIChatInputProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = value.trim().length > 0 && !isLoading;

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    // Max 3 lines (approx 72px with line-height 24px)
    const maxHeight = 72;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSubmit = useCallback(() => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
    // Reset height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="glass-strong border-t border-[#E5E7E0]/60 px-4 pb-[env(safe-area-inset-bottom,8px)] pt-3">
      <div className="flex items-end gap-2.5">
        {/* Input container with focus glow */}
        <div
          className={cn(
            "flex-1 rounded-2xl border bg-white px-4 py-2.5 transition-all duration-200",
            isFocused
              ? "border-[#7CB342]/30 shadow-[0_0_0_3px_rgba(124,179,66,0.08)]"
              : "border-[#E5E7E0]"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="질문을 입력하세요..."
            disabled={isLoading}
            rows={1}
            className="w-full resize-none bg-transparent text-[14px] leading-6 text-[#1A1F16] placeholder:text-[#9CA396] focus:outline-none disabled:opacity-50"
            style={{ height: "24px" }}
          />
        </div>

        {/* Send button with gradient */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className={cn(
            "mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full transition-all duration-200",
            canSend
              ? "gradient-primary text-white shadow-glow-green active:scale-90"
              : "bg-[#F3F4F0] text-[#C8CCC2]"
          )}
        >
          {isLoading ? (
            <Loader2 className="size-[18px] animate-spin" />
          ) : (
            <ArrowUp className="size-[18px]" strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
}
