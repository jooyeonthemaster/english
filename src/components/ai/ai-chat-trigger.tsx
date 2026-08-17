"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AIChatSheet } from "@/components/ai/ai-chat-sheet";

interface AIChatTriggerProps {
  questionId: string;
  examId: string;
  schoolSlug: string;
}

export function AIChatTrigger({
  questionId,
  examId,
  schoolSlug,
}: AIChatTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.97 }}
        className="group relative flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl gradient-accent text-[15px] font-bold text-white shadow-glow-green transition-shadow duration-300 hover:shadow-[0_4px_32px_rgba(124,179,66,0.3)]"
      >
        {/* Shimmer overlay */}
        <div className="absolute inset-0 animate-shimmer opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Sparkle icon with subtle animation */}
        <motion.div
          animate={{ rotate: [0, 8, -8, 0] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Sparkles className="size-5" />
        </motion.div>

        <span className="relative z-10">AI에게 질문하기</span>
      </motion.button>

      {/* Description text */}
      <p className="mt-2 text-center text-[12px] text-[#9CA396]">
        이 문항에 대해 궁금한 점을 자유롭게 물어보세요
      </p>

      <AIChatSheet
        questionId={questionId}
        examId={examId}
        schoolSlug={schoolSlug}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
