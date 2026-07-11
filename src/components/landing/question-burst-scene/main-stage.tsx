"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  const articleRef = useRef<HTMLElement>(null);
  const tint = CATEGORY_TINT[sample.category];
  const mobilePanelKey = `${sample.no}-${runKey}`;
  const [mobilePanelState, setMobilePanelState] = useState<{
    key: string;
    panel: 0 | 1;
  }>(() => ({ key: mobilePanelKey, panel: 0 }));
  const [mobileCarousel, setMobileCarousel] = useState(false);
  const [mobileStageInView, setMobileStageInView] = useState(false);
  const mobilePanel =
    mobilePanelState.key === mobilePanelKey ? mobilePanelState.panel : 0;

  // Phase progress for the bottom bar (0 → 1 across stem/given/options/answer)
  const phaseProgress =
    generation.phase === "stem"
      ? 0.15
      : generation.phase === "given"
      ? 0.45
      : generation.phase === "options"
      ? 0.75
      : 1;

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobileCarousel(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileCarousel) return;
    const el = articleRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setMobileStageInView(true), 0);
      return () => window.clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMobileStageInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mobileCarousel]);

  useEffect(() => {
    if (!mobileCarousel || !mobileStageInView || mobilePanel !== 0) return;
    const timer = window.setTimeout(
      () => setMobilePanelState({ key: mobilePanelKey, panel: 1 }),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [mobileCarousel, mobileStageInView, mobilePanel, mobilePanelKey]);

  const selectMobilePanel = (panel: 0 | 1) =>
    setMobilePanelState({ key: mobilePanelKey, panel });

  return (
    <article
      ref={articleRef}
      className="relative flex h-[374px] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_25px_70px_-15px_rgba(59,130,246,0.12)] sm:h-[410px] lg:h-[clamp(340px,calc(100svh-450px),450px)] lg:min-h-0"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-blue-50 bg-[#F8FAFC] px-3 py-2.5 sm:px-7 lg:px-9 lg:pb-4 lg:pt-6">
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
                className="rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] sm:px-3 sm:py-1.5 sm:text-[12px] sm:tracking-[0.15em]"
                style={{ background: tint.bg, color: tint.text }}
              >
                유형 {sample.no} · {sample.name}
              </span>
              <span className="hidden text-[12px] font-bold uppercase tracking-[0.1em] text-blue-400 sm:inline">
                {sample.category}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
        <PhaseIndicator phase={generation.phase} reduced={reduced} />
      </div>

      {/* Mobile: split at GENERATE into a short horizontal carousel. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex h-8 shrink-0 items-center justify-between border-b border-blue-50 bg-gradient-to-b from-white to-[#F8FAFC] px-2.5 sm:h-9 sm:px-3">
          <button
            type="button"
            onClick={() => selectMobilePanel(0)}
            aria-label="분석된 원문 보기"
            className={`inline-flex h-6 items-center gap-0.5 rounded-full px-1 text-[10.5px] font-extrabold transition hover:bg-blue-50 sm:h-7 sm:gap-1 sm:px-1.5 sm:text-[11px] ${
              mobilePanel === 0 ? "text-blue-600" : "text-slate-400"
            }`}
            disabled={mobilePanel === 0}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            원문
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-400">
              GENERATE
            </span>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {[0, 1].map((idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    mobilePanel === idx ? "w-5 bg-blue-500" : "w-1.5 bg-blue-200"
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => selectMobilePanel(1)}
            aria-label="생성된 문제 보기"
            className={`inline-flex h-6 items-center gap-0.5 rounded-full px-1 text-[10.5px] font-extrabold transition hover:bg-blue-50 sm:h-7 sm:gap-1 sm:px-1.5 sm:text-[11px] ${
              mobilePanel === 1 ? "text-blue-600" : "text-slate-400"
            }`}
            disabled={mobilePanel === 1}
          >
            문제
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          <motion.div
            className="flex h-full touch-pan-y"
            style={{ width: "200%" }}
            animate={{ x: mobilePanel === 1 ? "-50%" : "0%" }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.x < -45 || info.velocity.x < -350) selectMobilePanel(1);
              if (info.offset.x > 45 || info.velocity.x > 350) selectMobilePanel(0);
            }}
          >
            <div
              className="h-full shrink-0 overflow-y-auto custom-scrollbar"
              style={{ width: "50%" }}
            >
              {/* 지문이 짧아도 패널(그라디언트 배경)이 카드 높이를 가득 채우도록
                  스트레치 — 카드 하단에 맨 흰 여백이 뜨는 것 방지. */}
              <div className="flex min-h-full flex-col [&>div]:flex-1">
                <PassageSource
                  tokens={sample.sourceTokens ?? []}
                  active={generation.phase !== "done"}
                  runKey={runKey}
                  reduced={reduced}
                />
              </div>
            </div>
            <GeneratedQuestionPanel
              sample={sample}
              generation={generation}
              runKey={runKey}
              reduced={reduced}
              compact
            />
          </motion.div>
        </div>
      </div>

      {/* Desktop: original vertical flow. */}
      <div className="hidden lg:block">
        <PassageSource
          tokens={sample.sourceTokens ?? []}
          active={generation.phase !== "done"}
          runKey={runKey}
          reduced={reduced}
        />
        <ConnectionBeam phase={generation.phase} reduced={reduced} />
      </div>
      <GeneratedQuestionPanel
        sample={sample}
        generation={generation}
        runKey={runKey}
        reduced={reduced}
      />

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

function GeneratedQuestionPanel({
  sample,
  generation,
  runKey,
  reduced,
  compact = false,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  runKey: number;
  reduced: boolean;
  compact?: boolean;
}) {
  return (
    <div
      data-generated-question-panel={compact ? "mobile" : "desktop"}
      style={compact ? { width: "50%" } : undefined}
      className={`flex flex-col justify-start overflow-hidden bg-white ${
        compact
          ? "h-full shrink-0 px-3 py-2.5"
          : "hidden flex-1 px-4 py-5 sm:px-7 sm:py-6 lg:flex lg:px-10"
      }`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`body-${sample.no}-${runKey}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          data-generated-question-body={compact ? "mobile" : "desktop"}
          className={compact ? "min-h-0 overflow-hidden" : "min-h-0 overflow-y-auto pr-1 custom-scrollbar"}
        >
          <div
            className={
              compact
                ? "min-h-[34px] text-[14px] font-extrabold leading-[1.3] text-gray-900"
                : "min-h-[44px] text-[17px] font-bold leading-[1.5] text-gray-900 lg:min-h-[56px] lg:text-[20px] lg:leading-[1.55]"
            }
          >
            {generation.stem}
            {generation.phase === "stem" && !reduced && (
              <span className="ml-[2px] inline-block h-[1em] w-[3px] animate-[blink_0.8s_step-end_infinite] align-[-0.15em] bg-[#3B82F6]" />
            )}
          </div>

          <div className={compact ? "mt-2 text-gray-800" : "mt-4 text-gray-800 lg:mt-5"}>
            <ShapeBody
              sample={sample}
              generation={generation}
              reduced={reduced}
              compact={compact}
            />
          </div>
        </motion.div>
      </AnimatePresence>

      <div className={compact ? "mt-auto min-h-[28px] pt-2" : "mt-auto min-h-[34px] pt-4 lg:min-h-[40px] lg:pt-5"}>
        <AnimatePresence>
          {generation.answerVisible && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={
                compact
                  ? "flex items-center gap-2 text-[12px] font-extrabold"
                  : "flex items-center gap-3 text-[14px] font-bold lg:text-[15px]"
              }
            >
              <motion.span
                initial={{ scale: 0.7 }}
                animate={{ scale: [0.7, 1.15, 1] }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className={
                  compact
                    ? "inline-flex size-6 items-center justify-center rounded-full bg-[#3B82F6] text-[12px] text-white shadow-[0_4px_14px_rgba(59,130,246,0.4)]"
                    : "inline-flex size-7 items-center justify-center rounded-full bg-[#3B82F6] text-[14px] text-white shadow-[0_4px_14px_rgba(59,130,246,0.4)]"
                }
              >
                ✓
              </motion.span>
              <span className="text-[#3B82F6]">정답 도출 완료</span>
              <span
                className={
                  compact
                    ? "rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 font-extrabold text-gray-900"
                    : "rounded-lg border border-blue-100 bg-blue-50 px-3 py-1 font-extrabold tracking-tight text-gray-900"
                }
              >
                {sample.answer}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
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
