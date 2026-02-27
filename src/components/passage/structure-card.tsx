"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  FileText,
  Target,
  Layers,
  Lightbulb,
} from "lucide-react";
import type { StructureAnalysis } from "@/types/passage-analysis";

interface StructureCardProps {
  structure: StructureAnalysis;
}

export function StructureCard({ structure }: StructureCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl bg-[#FAFBF8] shadow-card overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#F1F8E9]">
            <Layers className="size-4 text-[#7CB342]" />
          </div>
          <div className="text-left">
            <p className="text-[14px] font-bold tracking-[-0.025em] text-[#1A1F16]">
              글 구조 분석
            </p>
            <p className="text-[11px] text-[#9CA396] mt-0.5">
              {structure.textType} · {structure.purpose}
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

      {/* Expandable content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <div className="h-px bg-[#E5E7E0]" />

              {/* Main idea */}
              <div className="flex items-start gap-2.5">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#F1F8E9]">
                  <Target className="size-3 text-[#7CB342]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#9CA396] mb-0.5">
                    주제
                  </p>
                  <p className="text-[13px] leading-[1.6] text-[#343B2E]">
                    {structure.mainIdea}
                  </p>
                </div>
              </div>

              {/* Paragraph summaries */}
              <div className="flex items-start gap-2.5">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F0]">
                  <FileText className="size-3 text-[#6B7265]" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-[#9CA396] mb-1.5">
                    단락 구조
                  </p>
                  <div className="space-y-2">
                    {structure.paragraphSummaries.map((ps) => (
                      <div
                        key={ps.paragraphIndex}
                        className="flex gap-2 items-start"
                      >
                        <span className="mt-[3px] shrink-0 rounded-md bg-[#F3F4F0] px-1.5 py-[1px] text-[10px] font-bold text-[#9CA396]">
                          {ps.role}
                        </span>
                        <p className="text-[12px] leading-[1.6] text-[#4A5043]">
                          {ps.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Key points */}
              <div className="flex items-start gap-2.5">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#FEF3C7]">
                  <Lightbulb className="size-3 text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#9CA396] mb-1.5">
                    핵심 포인트
                  </p>
                  <ul className="space-y-1">
                    {structure.keyPoints.map((kp, i) => (
                      <li
                        key={i}
                        className="text-[12px] leading-[1.6] text-[#4A5043] pl-3 relative before:absolute before:left-0 before:top-[0.55em] before:size-1.5 before:rounded-full before:bg-[#7CB342]/40"
                      >
                        {kp}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
