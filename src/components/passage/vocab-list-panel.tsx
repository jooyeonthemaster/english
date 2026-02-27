"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, BookOpen } from "lucide-react";
import type { VocabItem, DetailInfo } from "@/types/passage-analysis";

interface VocabListPanelProps {
  vocabulary: VocabItem[];
  onDetailOpen: (info: DetailInfo) => void;
}

const DIFFICULTY_STYLE = {
  basic: { dot: "bg-[#7CB342]", text: "text-[#7CB342]" },
  intermediate: { dot: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
  advanced: { dot: "bg-[#EF5350]", text: "text-[#EF5350]" },
};

export function VocabListPanel({
  vocabulary,
  onDetailOpen,
}: VocabListPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Sort: advanced first, then intermediate, then basic
  const sorted = [...vocabulary].sort((a, b) => {
    const order = { advanced: 0, intermediate: 1, basic: 2 };
    return order[a.difficulty] - order[b.difficulty];
  });

  return (
    <div className="rounded-2xl bg-[#FAFBF8] shadow-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#FEF3C7]">
            <BookOpen className="size-4 text-[#F59E0B]" />
          </div>
          <div className="text-left">
            <p className="text-[14px] font-bold tracking-[-0.025em] text-[#1A1F16]">
              핵심 어휘
            </p>
            <p className="text-[11px] text-[#9CA396] mt-0.5">
              {vocabulary.length}개 단어
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-4 text-[#C8CCC2]" />
        </motion.div>
      </button>

      {/* Expandable vocabulary list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              <div className="h-px bg-[#E5E7E0] mb-3" />

              {/* Legend */}
              <div className="flex items-center gap-4 mb-3">
                {(
                  [
                    ["basic", "기본"],
                    ["intermediate", "심화"],
                    ["advanced", "고난도"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div
                      className={`size-2 rounded-full ${DIFFICULTY_STYLE[key].dot}`}
                    />
                    <span className="text-[10px] text-[#9CA396]">{label}</span>
                  </div>
                ))}
              </div>

              {/* Vocab items */}
              <div className="space-y-1">
                {sorted.map((v) => {
                  const style = DIFFICULTY_STYLE[v.difficulty];
                  return (
                    <button
                      key={`${v.word}-${v.sentenceIndex}`}
                      onClick={() =>
                        onDetailOpen({ type: "vocab", data: v })
                      }
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#F3F4F0] active:bg-[#E5E7E0]/60"
                    >
                      <div
                        className={`size-1.5 shrink-0 rounded-full ${style.dot}`}
                      />
                      <span className="text-[13px] font-semibold text-[#252B20] min-w-[80px] text-left">
                        {v.word}
                      </span>
                      <span className="text-[11px] text-[#9CA396] shrink-0">
                        {v.partOfSpeech}
                      </span>
                      <span className="text-[12px] text-[#4A5043] ml-auto text-right">
                        {v.meaning}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
