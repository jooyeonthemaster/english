"use client";

import { AnimatePresence, motion } from "framer-motion";

import { CATEGORY_TINT, type QuestionSample } from "../shared/mock-data";
import { ConnectionBeam, PassageSource } from "./passage-source";
import { ShapeBody } from "./shape-bodies";
import type { GenerationState, Phase } from "./types";

export function MainStage({
  sample,
  generation,
  runKey,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  runKey: number;
  reduced: boolean;
}) {
  const tint = CATEGORY_TINT[sample.category];

  // Phase progress for the bottom bar (0 → 1 across stem/given/options/answer)
  const phaseProgress =
    generation.phase === "stem"
      ? 0.15
      : generation.phase === "given"
      ? 0.45
      : generation.phase === "options"
      ? 0.75
      : 1;

  return (
    <article
      className="relative bg-white rounded-2xl border border-blue-100 overflow-hidden flex flex-col shadow-[0_25px_70px_-15px_rgba(59,130,246,0.12)] min-h-[500px] sm:min-h-[680px]"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-7 lg:px-9 pt-5 sm:pt-6 pb-4 border-b border-blue-50 bg-[#F8FAFC]">
        <div role="status" aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait">
            <motion.div
              key={`badge-${sample.no}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="inline-flex items-center gap-3"
            >
              <span
                className="text-[12px] uppercase font-extrabold tracking-[0.15em] px-3 py-1.5 rounded-full"
                style={{ background: tint.bg, color: tint.text }}
              >
                유형 {sample.no} · {sample.name}
              </span>
              <span className="text-[12px] uppercase tracking-[0.1em] font-bold text-blue-400">
                {sample.category}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
        <PhaseIndicator phase={generation.phase} reduced={reduced} />
      </div>

      {/* Source passage panel */}
      <PassageSource
        tokens={sample.sourceTokens ?? []}
        active={generation.phase !== "done"}
        runKey={runKey}
        reduced={reduced}
      />

      {/* Connection beam */}
      <ConnectionBeam phase={generation.phase} reduced={reduced} />

      {/* Question theater body */}
      <div className="px-4 sm:px-7 lg:px-10 py-5 sm:py-6 flex-1 flex flex-col justify-start overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`body-${sample.no}-${runKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
          >
            {/* Stem with cursor */}
            <div className="min-h-[56px] text-[18px] lg:text-[20px] font-bold text-gray-900 leading-[1.55]">
              {generation.stem}
              {generation.phase === "stem" && !reduced && (
                <span className="inline-block w-[3px] h-[1em] align-[-0.15em] bg-[#3B82F6] ml-[2px] animate-[blink_0.8s_step-end_infinite]" />
              )}
            </div>

            {/* Shape-specific body */}
            <div className="mt-5 text-gray-800">
              <ShapeBody sample={sample} generation={generation} reduced={reduced} />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Answer reveal */}
        <div className="mt-auto min-h-[40px] pt-5">
          <AnimatePresence>
            {generation.answerVisible && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 text-[15px] font-bold"
              >
                <motion.span
                  initial={{ scale: 0.7 }}
                  animate={{ scale: [0.7, 1.15, 1] }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#3B82F6] text-white text-[14px] shadow-[0_4px_14px_rgba(59,130,246,0.4)]"
                >
                  ✓
                </motion.span>
                <span className="text-[#3B82F6]">정답 도출 완료</span>
                <span className="text-gray-900 bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg font-extrabold tracking-tight">
                  {sample.answer}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-blue-50/50">
        <motion.div
          className="h-full"
          animate={{ width: `${phaseProgress * 100}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{
            background:
              "linear-gradient(90deg, #93C5FD 0%, #3B82F6 50%, #1D4ED8 100%)",
          }}
        />
      </div>

      <style jsx>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
      `}</style>
    </article>
  );
}

function PhaseIndicator({ phase, reduced }: { phase: Phase; reduced: boolean }) {
  const labels: Record<Phase, string> = {
    stem: "발문 생성중",
    given: "지문 추출중",
    options: "선지 생성중",
    answer: "정답 검증중",
    done: "생성 완료",
  };
  const isActive = phase !== "done";
  return (
    <div className="flex items-center gap-2">
      {isActive && !reduced && (
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-blue-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full w-2 h-2 bg-[#3B82F6]" />
        </span>
      )}
      <span
        className={`text-[11px] font-mono font-bold tracking-wider ${
          isActive ? "text-[#3B82F6]" : "text-gray-400"
        }`}
      >
        {labels[phase]}
      </span>
    </div>
  );
}
