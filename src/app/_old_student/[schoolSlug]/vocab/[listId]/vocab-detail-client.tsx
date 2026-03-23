"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface VocabItemData {
  id: string;
  english: string;
  korean: string;
  partOfSpeech: string | null;
  exampleEn: string | null;
  exampleKr: string | null;
  phonetic: string | null;
}

interface VocabDetailClientProps {
  items: VocabItemData[];
  totalCount: number;
  schoolSlug: string;
  listId: string;
}

const POS_COLORS: Record<string, { bg: string; text: string }> = {
  noun: { bg: "bg-[#F1F8E9]", text: "text-[#7CB342]" },
  verb: { bg: "bg-[#ECFDF5]", text: "text-[#4CAF50]" },
  adjective: { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  adverb: { bg: "bg-[#FEE2E2]", text: "text-[#EF4444]" },
  preposition: { bg: "bg-[#F3E8FF]", text: "text-[#7C3AED]" },
  conjunction: { bg: "bg-[#F3F4F0]", text: "text-[#6B7265]" },
};

function getPosColor(pos: string | null) {
  if (!pos) return { bg: "bg-[#F3F4F0]", text: "text-[#6B7265]" };
  return (
    POS_COLORS[pos.toLowerCase()] ?? {
      bg: "bg-[#F3F4F0]",
      text: "text-[#6B7265]",
    }
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.05,
    },
  },
} as const;

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 420,
      damping: 28,
    },
  },
};

export function VocabDetailClient({
  items,
  totalCount,
  schoolSlug,
  listId,
}: VocabDetailClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col pb-24">
      {/* Counter with mini progress bar */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className="text-[13px] font-semibold tracking-[-0.025em] text-[#1A1F16]">
          {totalCount}
          <span className="font-normal text-[#9CA396]"> 단어</span>
        </span>
        <div className="flex-1 h-[3px] rounded-full bg-[#F3F4F0] overflow-hidden">
          <div
            className="h-full rounded-full gradient-accent"
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* Word cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-2 px-5"
      >
        {items.map((item, index) => {
          const isExpanded = expandedId === item.id;
          const hasExample = item.exampleEn || item.exampleKr;
          const posColor = getPosColor(item.partOfSpeech);

          return (
            <motion.div key={item.id} variants={cardVariants}>
              <button
                onClick={() => hasExample && toggleExpand(item.id)}
                className={cn(
                  "relative flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-card transition-all duration-200",
                  hasExample &&
                    "cursor-pointer hover:shadow-card-hover active:scale-[0.98]",
                  !hasExample && "cursor-default"
                )}
                style={{
                  transition:
                    "box-shadow 0.2s ease, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)",
                }}
              >
                {/* Left accent bar */}
                <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl bg-gradient-to-b from-[#7CB342] to-[#AED581]" />

                <div className="flex items-center gap-3 p-4 pl-5">
                  {/* Number badge - circular gradient */}
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full gradient-primary">
                    <span className="text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                  </div>

                  {/* Word info */}
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold tracking-[-0.025em] text-[#1A1F16]">
                        {item.english}
                      </span>
                      {item.phonetic && (
                        <span className="text-[11px] text-[#C8CCC2] font-medium">
                          {item.phonetic}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] text-[#6B7265] leading-snug">
                      {item.korean}
                    </span>
                  </div>

                  {/* Part of speech + expand icon */}
                  <div className="flex shrink-0 items-center gap-2">
                    {item.partOfSpeech && (
                      <span
                        className={cn(
                          "rounded-md px-2 py-[3px] text-[10px] font-bold tracking-[-0.025em]",
                          posColor.bg,
                          posColor.text
                        )}
                      >
                        {item.partOfSpeech}
                      </span>
                    )}
                    {hasExample && (
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{
                          type: "spring" as const,
                          stiffness: 400,
                          damping: 25,
                        }}
                      >
                        <ChevronDown className="size-4 text-[#C8CCC2]" />
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Expanded example sentences */}
                <AnimatePresence initial={false}>
                  {isExpanded && hasExample && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: {
                          type: "spring" as const,
                          stiffness: 350,
                          damping: 30,
                        },
                        opacity: { duration: 0.2 },
                      }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-[#F3F4F0] mx-4" />
                      <div className="px-5 py-3.5 pl-[52px]">
                        {item.exampleEn && (
                          <p className="text-[13px] leading-[1.6] text-[#343B2E] italic">
                            {item.exampleEn}
                          </p>
                        )}
                        {item.exampleKr && (
                          <p className="mt-1.5 text-[12px] leading-[1.6] text-[#9CA396]">
                            {item.exampleKr}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Sticky CTA */}
      {totalCount > 0 && (
        <div className="fixed bottom-14 z-40 w-full max-w-[430px] px-5 pb-3 pt-3">
          {/* Fade gradient background */}
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white to-white/0 pointer-events-none" />
          <Link
            href={`/${schoolSlug}/vocab/${listId}/test`}
            className="relative flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl gradient-primary text-[15px] font-bold tracking-[-0.025em] text-white shadow-glow-green transition-all duration-200 active:scale-[0.97] animate-pulse-ring"
          >
            <Sparkles className="size-4" />
            단어 테스트 시작
          </Link>
        </div>
      )}
    </div>
  );
}
