"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { buildTextSegments } from "@/lib/passage-utils";
import { VocabHighlight } from "./vocab-highlight";
import { GrammarHighlight } from "./grammar-highlight";
import type {
  SentenceAnalysis,
  VocabItem,
  GrammarPoint,
  DetailInfo,
} from "@/types/passage-analysis";

interface SentenceBlockProps {
  sentence: SentenceAnalysis;
  vocabItems: VocabItem[];
  grammarPoints: GrammarPoint[];
  onDetailOpen: (info: DetailInfo) => void;
}

export function SentenceBlock({
  sentence,
  vocabItems,
  grammarPoints,
  onDetailOpen,
}: SentenceBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const segments = buildTextSegments(
    sentence.english,
    vocabItems,
    grammarPoints
  );

  const hasHighlights = vocabItems.length > 0 || grammarPoints.length > 0;

  return (
    <div
      className="group relative rounded-xl bg-[#FAFBF8] p-4 shadow-card transition-all duration-200"
      onClick={() => setExpanded(!expanded)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setExpanded(!expanded);
      }}
    >
      <div className="flex gap-3">
        {/* Sentence number */}
        <span className="mt-[3px] flex size-5 shrink-0 items-center justify-center rounded-md bg-[#F3F4F0] text-[10px] font-bold text-[#9CA396]">
          {sentence.index + 1}
        </span>

        <div className="flex-1 min-w-0">
          {/* English with highlights */}
          <p className="text-[14px] leading-[1.85] tracking-[-0.01em] text-[#252B20]">
            {segments.map((segment, i) => {
              if (segment.type === "vocab" && segment.data) {
                return (
                  <VocabHighlight
                    key={i}
                    text={segment.text}
                    data={segment.data as VocabItem}
                    onTap={(data) =>
                      onDetailOpen({ type: "vocab", data })
                    }
                  />
                );
              }
              if (segment.type === "grammar" && segment.data) {
                return (
                  <GrammarHighlight
                    key={i}
                    text={segment.text}
                    data={segment.data as GrammarPoint}
                    onTap={(data) =>
                      onDetailOpen({ type: "grammar", data })
                    }
                  />
                );
              }
              return <span key={i}>{segment.text}</span>;
            })}
          </p>

          {/* Korean translation - expandable */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 rounded-lg bg-[#F1F8E9]/60 px-3 py-2.5 border border-[#C5E1A5]/30">
                  <p className="text-[13px] leading-[1.7] text-[#4A5043]">
                    {sentence.korean}
                  </p>
                </div>

                {/* Quick info about highlights in this sentence */}
                {hasHighlights && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vocabItems.map((v) => (
                      <button
                        key={v.word}
                        className="rounded-md bg-[#FEF3C7]/60 px-2 py-0.5 text-[11px] font-medium text-[#D97706] transition-colors hover:bg-[#FEF3C7]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDetailOpen({ type: "vocab", data: v });
                        }}
                      >
                        {v.word}
                      </button>
                    ))}
                    {grammarPoints.map((g) => (
                      <button
                        key={g.id}
                        className="rounded-md bg-[#F1F8E9]/80 px-2 py-0.5 text-[11px] font-medium text-[#7CB342] transition-colors hover:bg-[#F1F8E9]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDetailOpen({ type: "grammar", data: g });
                        }}
                      >
                        {g.pattern}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Expand indicator */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="mt-[3px] shrink-0"
        >
          <ChevronDown className="size-4 text-[#C8CCC2]" />
        </motion.div>
      </div>
    </div>
  );
}
