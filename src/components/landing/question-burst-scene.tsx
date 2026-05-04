"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CATEGORY_TINT,
  HERO_PASSAGE,
  QUESTION_SAMPLES,
  type QuestionSample,
} from "./shared/mock-data";
import { useReducedMotionPref } from "./shared/use-typewriter";

const CIRCLED = ["①", "②", "③", "④", "⑤"];

// Phase pacing — tuned for visible "tatak tatak" character typing
const STEM_SPEED = 26;
const GIVEN_SPEED = 18;
const OPTION_SPEED = 16;
const PHASE_PAUSE = 200;
const FINAL_HOLD_MS = 2400;

type Phase = "stem" | "given" | "options" | "answer" | "done";

type GenerationState = {
  phase: Phase;
  stem: string;
  given: string;
  options: string[];
  activeOptionIndex: number;
  answerVisible: boolean;
};

const EMPTY_STATE: GenerationState = {
  phase: "stem",
  stem: "",
  given: "",
  options: [],
  activeOptionIndex: -1,
  answerVisible: false,
};

function useGenerationSequence(sample: QuestionSample, runKey: number, reduced: boolean) {
  const [state, setState] = useState<GenerationState>(EMPTY_STATE);

  useEffect(() => {
    if (reduced) {
      setState({
        phase: "done",
        stem: sample.stem,
        given: sample.given ?? sample.prompt ?? "",
        options: sample.options ?? [],
        activeOptionIndex: -1,
        answerVisible: true,
      });
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(t);
    };

    setState({ ...EMPTY_STATE, options: (sample.options ?? []).map(() => "") });

    const givenFull = sample.given ?? sample.prompt ?? "";
    const opts = sample.options ?? [];

    // 1) Type the stem character-by-character
    const typeStem = (i: number) => {
      if (cancelled) return;
      setState((s) => ({ ...s, phase: "stem", stem: sample.stem.slice(0, i) }));
      if (i >= sample.stem.length) {
        schedule(() => beginGiven(), PHASE_PAUSE);
        return;
      }
      schedule(() => typeStem(i + 1), STEM_SPEED);
    };

    // 2) Type the given/prompt block (if any)
    const beginGiven = () => {
      setState((s) => ({ ...s, phase: "given" }));
      if (givenFull.length === 0) {
        schedule(() => beginOptions(), PHASE_PAUSE);
        return;
      }
      const typeGiven = (i: number) => {
        if (cancelled) return;
        setState((s) => ({ ...s, given: givenFull.slice(0, i) }));
        if (i >= givenFull.length) {
          schedule(() => beginOptions(), PHASE_PAUSE);
          return;
        }
        schedule(() => typeGiven(i + 1), GIVEN_SPEED);
      };
      typeGiven(1);
    };

    // 3) Type each option in sequence
    const beginOptions = () => {
      setState((s) => ({ ...s, phase: "options" }));
      if (opts.length === 0) {
        schedule(() => revealAnswer(), PHASE_PAUSE);
        return;
      }
      const typeOption = (idx: number, char: number) => {
        if (cancelled) return;
        if (idx >= opts.length) {
          schedule(() => revealAnswer(), PHASE_PAUSE);
          return;
        }
        const target = opts[idx];
        setState((s) => {
          const next = [...s.options];
          next[idx] = target.slice(0, char);
          return { ...s, options: next, activeOptionIndex: idx };
        });
        if (char >= target.length) {
          schedule(() => typeOption(idx + 1, 1), 90);
          return;
        }
        schedule(() => typeOption(idx, char + 1), OPTION_SPEED);
      };
      typeOption(0, 1);
    };

    // 4) Reveal answer
    const revealAnswer = () => {
      setState((s) => ({ ...s, phase: "answer", answerVisible: true, activeOptionIndex: -1 }));
      schedule(() => setState((s) => ({ ...s, phase: "done" })), 700);
    };

    schedule(() => typeStem(1), 200);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [sample, runKey, reduced]);

  return state;
}

export function QuestionBurstScene() {
  const reduced = useReducedMotionPref();
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set([0]));
  const [autoPlay, setAutoPlay] = useState(true);

  const sample = QUESTION_SAMPLES[activeIndex];
  const generation = useGenerationSequence(sample, runKey, reduced);

  // Auto-advance when "done", but only if user hasn't paused
  useEffect(() => {
    if (reduced) return;
    if (!autoPlay) return;
    if (generation.phase !== "done") return;

    setCompleted((prev) => {
      if (prev.has(activeIndex)) return prev;
      const next = new Set(prev);
      next.add(activeIndex);
      return next;
    });

    const t = setTimeout(() => {
      setActiveIndex((i) => (i + 1) % QUESTION_SAMPLES.length);
      setRunKey((k) => k + 1);
    }, FINAL_HOLD_MS);
    return () => clearTimeout(t);
  }, [generation.phase, activeIndex, reduced, autoPlay]);

  const handleSelect = useCallback((i: number) => {
    setActiveIndex(i);
    setRunKey((k) => k + 1);
  }, []);

  const handleReset = useCallback(() => {
    setCompleted(new Set([0]));
    setActiveIndex(0);
    setRunKey((k) => k + 1);
    setAutoPlay(true);
  }, []);

  const completedCount = completed.size;
  const totalCount = QUESTION_SAMPLES.length;

  return (
    <section
      ref={sectionRef}
      id="burst"
      className="relative w-full bg-white py-24 lg:py-32 overflow-hidden border-t border-blue-50"
    >
      <div className="relative px-6 lg:px-16 max-w-[1480px] mx-auto">
        {/* Headline */}
        <div className="mb-20 max-w-[900px] text-left">
          <div className="text-[13px] uppercase tracking-[0.25em] text-[#60A5FA] font-bold mb-4 flex items-center gap-3">
            <span className="w-8 h-[2px] bg-[#60A5FA]" />
            Step 2. 19유형 문제 생성
          </div>
          <h2
            className="font-extrabold text-gray-900 leading-[1.3]"
            style={{ fontSize: "clamp(24px, 3.5vw, 44px)", letterSpacing: "-0.02em", wordBreak: "keep-all" }}
          >
            단순 변형이 아닙니다. 사전에{" "}
            <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">
              철저하게 분석된 출제 포인트
            </span>
            를 기반으로 문제를 생성합니다.
          </h2>
          <p className="mt-8 text-[17px] text-gray-600 leading-[1.8] font-medium max-w-3xl">
            흔한 자동 생성기와 다릅니다. 선생님이 설계한 의도와 영신ai가 딥다이브한 분석 결과를 바탕으로,
            실제 내신과 수능에 직결되는 고퀄리티 문항을 단 1초 만에{" "}
            <strong className="text-gray-900 font-bold">19개 전 유형</strong>으로 폭발적으로 생성합니다.
          </p>
        </div>

        {/* Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-10">
          <div className="lg:sticky lg:top-32 self-start">
            <MainStage sample={sample} generation={generation} runKey={runKey} reduced={reduced} />
          </div>
          <SideTracker
            currentIndex={activeIndex}
            completed={completed}
            completedCount={completedCount}
            totalCount={totalCount}
            autoPlay={autoPlay}
            onTogglePlay={() => setAutoPlay((p) => !p)}
            onSelect={handleSelect}
            onReset={handleReset}
          />
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// MainStage — split into [Source Passage] + [Question Theater]
// ============================================================================

function MainStage({
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
      className="relative bg-white rounded-2xl border border-blue-100 overflow-hidden flex flex-col shadow-[0_25px_70px_-15px_rgba(59,130,246,0.12)]"
      style={{ minHeight: "680px" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-7 lg:px-9 pt-6 pb-4 border-b border-blue-50 bg-[#F8FAFC]">
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
      <div className="px-7 lg:px-10 py-6 flex-1 flex flex-col justify-start overflow-hidden">
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
          style={{ background: "linear-gradient(90deg, #93C5FD 0%, #3B82F6 50%, #1D4ED8 100%)" }}
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

// ============================================================================
// PassageSource — shows HERO_PASSAGE with current question's tokens highlighted
// ============================================================================

function PassageSource({
  tokens,
  active,
  runKey,
  reduced,
}: {
  tokens: string[];
  active: boolean;
  runKey: number;
  reduced: boolean;
}) {
  const segments = useMemo(() => buildPassageSegments(HERO_PASSAGE, tokens), [tokens]);

  return (
    <div className="px-7 lg:px-10 pt-5 pb-4 bg-gradient-to-b from-[#F8FAFC] to-white border-b border-blue-50 relative">
      <div className="flex items-center gap-3 mb-2.5">
        <span className="text-[10px] uppercase tracking-[0.2em] font-extrabold text-blue-500">
          분석된 원문
        </span>
        <span className="h-px flex-1 bg-blue-100" />
        <div className="flex items-center gap-1.5">
          {!reduced && active && (
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-blue-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-[#3B82F6]" />
            </span>
          )}
          <span className="text-[10px] font-bold text-blue-600 font-mono tracking-wider">
            EXTRACTING · {tokens.length}
          </span>
        </div>
      </div>
      <p className="text-[13px] lg:text-[14px] leading-[1.7] text-gray-600 font-serif">
        {segments.map((seg, i) =>
          seg.highlighted ? (
            <PassageToken
              key={`${runKey}-${i}`}
              text={seg.text}
              delay={seg.tokenIndex * 220}
              reduced={reduced}
            />
          ) : (
            <span key={`${runKey}-${i}`}>{seg.text}</span>
          ),
        )}
      </p>
    </div>
  );
}

function PassageToken({ text, delay, reduced }: { text: string; delay: number; reduced: boolean }) {
  return (
    <motion.span
      initial={{ backgroundColor: "rgba(219, 234, 254, 0)", color: "#4B5563" }}
      animate={
        reduced
          ? { backgroundColor: "#DBEAFE", color: "#1E3A8A" }
          : {
              backgroundColor: ["rgba(219, 234, 254, 0)", "#BFDBFE", "#DBEAFE"],
              color: ["#4B5563", "#1E3A8A", "#1E40AF"],
              boxShadow: [
                "0 0 0 0 rgba(59, 130, 246, 0)",
                "0 0 0 4px rgba(59, 130, 246, 0.18)",
                "0 0 0 0 rgba(59, 130, 246, 0)",
              ],
            }
      }
      transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : delay / 1000, ease: "easeOut" }}
      className="px-1 py-[1px] mx-[1px] rounded font-bold border-b-2 border-[#3B82F6]"
    >
      {text}
    </motion.span>
  );
}

function buildPassageSegments(passage: string, tokens: string[]) {
  if (tokens.length === 0) return [{ text: passage, highlighted: false, tokenIndex: -1 }];
  const lower = passage.toLowerCase();
  const ranges: Array<{ start: number; end: number; tokenIndex: number }> = [];
  tokens.forEach((tok, idx) => {
    if (!tok) return;
    const at = lower.indexOf(tok.toLowerCase());
    if (at >= 0) ranges.push({ start: at, end: at + tok.length, tokenIndex: idx });
  });
  ranges.sort((a, b) => a.start - b.start);
  // Merge overlaps
  const merged: typeof ranges = [];
  ranges.forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  });
  const out: Array<{ text: string; highlighted: boolean; tokenIndex: number }> = [];
  let cursor = 0;
  merged.forEach((r) => {
    if (r.start > cursor) {
      out.push({ text: passage.slice(cursor, r.start), highlighted: false, tokenIndex: -1 });
    }
    out.push({ text: passage.slice(r.start, r.end), highlighted: true, tokenIndex: r.tokenIndex });
    cursor = r.end;
  });
  if (cursor < passage.length) {
    out.push({ text: passage.slice(cursor), highlighted: false, tokenIndex: -1 });
  }
  return out;
}

// ============================================================================
// ConnectionBeam — animated arrow between source and question theater
// ============================================================================

function ConnectionBeam({ phase, reduced }: { phase: Phase; reduced: boolean }) {
  const visible = phase !== "done";
  return (
    <div className="relative h-7 bg-gradient-to-b from-white to-[#F8FAFC] border-b border-blue-50 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-400">
          GENERATE
        </span>
        <div className="relative w-[180px] h-[2px] bg-blue-100 rounded-full overflow-hidden">
          {!reduced && visible && (
            <motion.span
              key={phase}
              className="absolute inset-y-0 w-[40px] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, #3B82F6 50%, transparent 100%)",
              }}
              initial={{ left: "-40px" }}
              animate={{ left: "180px" }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>
        <svg width="14" height="10" viewBox="0 0 14 10" className="text-blue-500" fill="currentColor">
          <path d="M0 5 L11 5 M7 1 L11 5 L7 9" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

// ============================================================================
// PhaseIndicator — small live status pill in top bar
// ============================================================================

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

// ============================================================================
// ShapeBody — shape-specific renderers
// ============================================================================

function ShapeBody({
  sample,
  generation,
  reduced,
}: {
  sample: QuestionSample;
  generation: GenerationState;
  reduced: boolean;
}) {
  switch (sample.shape) {
    case "mcq":
      return <McqBody sample={sample} generation={generation} reduced={reduced} />;
    case "insert":
      return <InsertBody sample={sample} generation={generation} reduced={reduced} />;
    case "ordering":
      return <OrderingBody sample={sample} generation={generation} reduced={reduced} />;
    case "write":
      return <WriteBody sample={sample} generation={generation} reduced={reduced} />;
    case "blanks":
      return <BlanksBody sample={sample} generation={generation} reduced={reduced} />;
    case "arrange":
      return <ArrangeBody sample={sample} generation={generation} reduced={reduced} />;
    case "correct":
      return <CorrectBody sample={sample} generation={generation} reduced={reduced} />;
    default:
      return null;
  }
}

function GivenBox({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="px-5 py-3.5 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[15px] text-blue-900 leading-[1.7] font-medium relative">
      {label && (
        <span className="absolute -top-2 left-4 text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 bg-white px-1.5">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function McqBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const opts = sample.options ?? [];
  const showGiven = generation.phase !== "stem" && (sample.given?.length ?? 0) > 0;
  const showOptions = generation.phase === "options" || generation.phase === "answer" || generation.phase === "done";

  return (
    <div className="space-y-4">
      {sample.given && (
        <AnimatePresence>
          {showGiven && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GivenBox label="원문 인용">
                {generation.given}
                {generation.phase === "given" && !reduced && (
                  <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
                )}
              </GivenBox>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {showOptions && (
        <ul className="space-y-2">
          {opts.map((opt, i) => {
            const visibleText = generation.options[i] ?? "";
            const isVisible = visibleText.length > 0 || generation.phase === "done" || generation.phase === "answer";
            const isTyping = generation.activeOptionIndex === i;
            const isCorrect = generation.answerVisible && CIRCLED.indexOf(sample.answer) === i;
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: isVisible ? 1 : 0.2, x: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border transition-all ${
                  isCorrect
                    ? "bg-blue-50 border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.18)]"
                    : isTyping
                    ? "bg-[#F8FAFC] border-blue-200"
                    : "bg-white border-blue-50"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-[24px] h-[24px] rounded-full text-[12px] font-bold flex-shrink-0 ${
                    isCorrect ? "bg-[#3B82F6] text-white" : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {CIRCLED[i] ?? `${i + 1}.`}
                </span>
                <span className={`text-[15px] font-medium leading-[1.5] ${isCorrect ? "text-blue-900 font-bold" : "text-gray-800"}`}>
                  {visibleText || (reduced ? opt : "")}
                  {isTyping && !reduced && (
                    <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-[#3B82F6] ml-[1px] animate-[blink_0.7s_step-end_infinite]" />
                  )}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InsertBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const showGiven = generation.phase !== "stem";
  const showSlots = generation.phase === "options" || generation.phase === "answer" || generation.phase === "done";
  const correctIdx = CIRCLED.indexOf(sample.answer);

  return (
    <div className="space-y-4">
      {showGiven && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="px-5 py-3.5 rounded-xl bg-blue-50 border-l-4 border-[#3B82F6] text-[15px] text-blue-900 italic leading-[1.7] font-semibold relative">
            <span className="absolute -top-2 left-4 text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 bg-white px-1.5 not-italic">
              삽입 문장
            </span>
            <span className="text-blue-400 mr-2">«</span>
            {generation.given}
            <span className="text-blue-400 ml-2">»</span>
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </div>
        </motion.div>
      )}

      {showSlots && (
        <div className="rounded-xl bg-[#F8FAFC] border border-blue-100 p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 mb-2">
            삽입 위치 후보
          </div>
          <p className="text-[13px] text-gray-700 leading-[1.9] font-serif">
            Attention has become the most valuable currency.
            {[1, 2, 3, 4, 5].map((n, idx) => {
              const isCorrect = idx === correctIdx;
              return (
                <span key={n}>
                  {" "}
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: idx * 0.08, duration: 0.25 }}
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-extrabold border-2 ${
                      isCorrect && generation.answerVisible
                        ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-[0_0_0_4px_rgba(59,130,246,0.2)]"
                        : "bg-white text-blue-600 border-blue-200"
                    }`}
                  >
                    {CIRCLED[idx]}
                  </motion.span>{" "}
                  <span className="text-gray-500 text-[12px]">
                    {n === 1 && "Apps compete for it."}
                    {n === 2 && "Notifications fragment focus."}
                    {n === 3 && "Yet abundance arrived."}
                    {n === 4 && "Habits silently re-form."}
                    {n === 5 && "We must protect it."}
                  </span>
                </span>
              );
            })}
          </p>
        </div>
      )}
    </div>
  );
}

function OrderingBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const showGiven = generation.phase !== "stem";
  const showParas = generation.phase !== "stem";
  const showOptions = generation.phase === "options" || generation.phase === "answer" || generation.phase === "done";
  const opts = sample.options ?? [];
  const correctIdx = CIRCLED.indexOf(sample.answer);

  return (
    <div className="space-y-3">
      {showGiven && sample.given && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="주어진 글">{generation.given}</GivenBox>
        </motion.div>
      )}
      {showParas && sample.paragraphs && (
        <div className="grid grid-cols-3 gap-2">
          {sample.paragraphs.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.3 }}
              className="rounded-lg border border-blue-100 bg-white p-3"
            >
              <div className="text-[11px] uppercase font-extrabold text-blue-500 tracking-[0.18em] mb-1">
                ({p.label})
              </div>
              <div className="text-[12px] text-gray-700 leading-[1.55]">{p.body}</div>
            </motion.div>
          ))}
        </div>
      )}
      {showOptions && (
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          {opts.map((opt, i) => {
            const visibleText = generation.options[i] ?? "";
            const isCorrect = generation.answerVisible && i === correctIdx;
            return (
              <div
                key={i}
                className={`text-center px-2 py-2 rounded-lg border text-[12px] font-mono font-bold ${
                  isCorrect
                    ? "bg-[#3B82F6] text-white border-[#3B82F6] shadow-[0_4px_14px_rgba(59,130,246,0.25)]"
                    : "bg-white text-gray-700 border-blue-100"
                }`}
              >
                <span className="block text-[10px] text-blue-400 mb-0.5">{CIRCLED[i]}</span>
                {visibleText || (reduced ? opt : "")}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WriteBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;

  return (
    <div className="space-y-3">
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="제시문">
            {generation.given}
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </GivenBox>
        </motion.div>
      )}
      <div className="rounded-xl border-2 border-dashed border-blue-200 bg-white p-4 min-h-[80px] flex items-center">
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} />
        ) : (
          <span className="text-[13px] font-mono text-blue-300">
            {generation.phase === "options" ? "▎ 답안 작성 중..." : "정답 작성란"}
          </span>
        )}
      </div>
    </div>
  );
}

function BlanksBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;
  const blanks = sample.blanks ?? [];

  return (
    <div className="space-y-4">
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <GivenBox label="요약문">
            {generation.given}
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </GivenBox>
        </motion.div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {blanks.map((b, i) => (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: showAnswer ? 1 : 0.5, scale: 1 }}
            transition={{ delay: i * 0.18, duration: 0.3 }}
            className={`rounded-xl border p-4 ${
              showAnswer ? "bg-blue-50 border-[#3B82F6]" : "bg-[#F8FAFC] border-blue-100"
            }`}
          >
            <div className="text-[11px] uppercase font-extrabold text-blue-500 tracking-[0.18em] mb-1">
              ({b.label})
            </div>
            <div className="text-[18px] font-bold text-blue-900 font-mono">
              {showAnswer ? b.value : "______"}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ArrangeBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const showChips = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;
  const chips = sample.chips ?? [];

  return (
    <div className="space-y-4">
      {showChips && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <motion.span
              key={`${c}-${i}`}
              initial={{ opacity: 0, y: 8, rotate: -3 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.3 }}
              className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-[13px] font-mono font-bold text-blue-700 shadow-sm"
            >
              {c}
            </motion.span>
          ))}
        </div>
      )}
      <div className="rounded-xl bg-[#F8FAFC] border-2 border-dashed border-blue-200 p-4 min-h-[60px] flex items-center">
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} />
        ) : (
          <span className="text-[13px] font-mono text-blue-300">▎ 정렬 중...</span>
        )}
      </div>
    </div>
  );
}

function CorrectBody({ sample, generation, reduced }: { sample: QuestionSample; generation: GenerationState; reduced: boolean; }) {
  const showPrompt = generation.phase !== "stem";
  const showAnswer = generation.answerVisible;

  return (
    <div className="space-y-3">
      {showPrompt && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <div className="px-5 py-3.5 rounded-xl bg-[#F8FAFC] border border-blue-100 text-[15px] text-gray-600 leading-[1.7] font-medium relative">
            <span className="absolute -top-2 left-4 text-[10px] uppercase tracking-[0.18em] font-extrabold text-blue-500 bg-white px-1.5">
              원문
            </span>
            <span className={showAnswer ? "line-through opacity-60" : ""}>
              {generation.given}
            </span>
            {generation.phase === "given" && !reduced && (
              <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-blue-700 ml-[2px] animate-[blink_0.7s_step-end_infinite]" />
            )}
          </div>
        </motion.div>
      )}
      <div
        className={`rounded-xl border-2 p-4 min-h-[60px] flex items-center ${
          showAnswer ? "bg-blue-50 border-[#3B82F6]" : "border-dashed border-blue-200 bg-white"
        }`}
      >
        {showAnswer ? (
          <AnimatedAnswer text={sample.answer} reduced={reduced} />
        ) : (
          <span className="text-[13px] font-mono text-blue-300">
            {generation.phase === "options" ? "▎ 교정 중..." : "교정 결과"}
          </span>
        )}
      </div>
    </div>
  );
}

function AnimatedAnswer({ text, reduced }: { text: string; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? text : "");
  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    setShown("");
    let i = 0;
    const tick = () => {
      i += 1;
      setShown(text.slice(0, i));
      if (i < text.length) {
        timer = setTimeout(tick, 22);
      }
    };
    let timer = setTimeout(tick, 100);
    return () => clearTimeout(timer);
  }, [text, reduced]);
  return (
    <div className="text-[15px] font-bold text-blue-900 leading-[1.5] font-mono">
      {shown}
      {!reduced && shown.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] align-[-0.15em] bg-[#3B82F6] ml-[1px] animate-[blink_0.7s_step-end_infinite]" />
      )}
    </div>
  );
}

// ============================================================================
// SideTracker — same shape as before, with autoplay control
// ============================================================================

function SideTracker({
  currentIndex,
  completed,
  completedCount,
  totalCount,
  autoPlay,
  onTogglePlay,
  onSelect,
  onReset,
}: {
  currentIndex: number;
  completed: Set<number>;
  completedCount: number;
  totalCount: number;
  autoPlay: boolean;
  onTogglePlay: () => void;
  onSelect: (i: number) => void;
  onReset: () => void;
}) {
  return (
    <aside className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col shadow-[0_15px_40px_-15px_rgba(0,0,0,0.05)] h-[680px]">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="text-[11px] uppercase tracking-[0.18em] font-extrabold text-gray-500">
          실시간 생성 트래커
        </div>
        <div className="text-[12px] font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
          {completedCount}/{totalCount}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex gap-[3px] mb-4 px-2">
        {QUESTION_SAMPLES.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-[3px] rounded-full transition-colors ${
              i === currentIndex
                ? "bg-[#3B82F6]"
                : completed.has(i)
                ? "bg-blue-300"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5 flex-1 overflow-auto pr-1 custom-scrollbar">
        {QUESTION_SAMPLES.map((q, i) => {
          const isCurrent = i === currentIndex;
          const isDone = completed.has(i);
          return (
            <button
              key={q.no}
              onClick={() => onSelect(i)}
              className={`relative w-full flex items-center h-10 pl-2.5 pr-2.5 rounded-lg cursor-pointer transition-all text-left border ${
                isCurrent
                  ? "border-[#3B82F6] bg-blue-50 shadow-sm"
                  : isDone
                  ? "border-blue-100 bg-white"
                  : "border-transparent hover:bg-gray-50"
              }`}
            >
              <span
                className="text-[12px] font-mono font-black w-[20px]"
                style={{ color: isCurrent ? "#1D4ED8" : isDone ? "#60A5FA" : "#9CA3AF" }}
              >
                {q.no}
              </span>
              <span
                className={`flex-1 text-[12px] truncate ${
                  isCurrent
                    ? "font-bold text-blue-900"
                    : isDone
                    ? "font-bold text-gray-700"
                    : "font-semibold text-gray-500"
                }`}
              >
                {q.name}
              </span>
              {isCurrent && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-pulse" />
              )}
              {isDone && !isCurrent && (
                <svg width="11" height="11" viewBox="0 0 11 11" className="text-blue-400" fill="none">
                  <path d="M1 5.5 L4.5 9 L10 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={onTogglePlay}
          className={`flex-1 text-[11px] uppercase tracking-[0.15em] font-extrabold py-2 rounded-lg border transition-colors ${
            autoPlay
              ? "bg-[#3B82F6] text-white border-[#3B82F6]"
              : "bg-white text-gray-700 border-gray-200 hover:border-blue-300"
          }`}
        >
          {autoPlay ? "■ 일시정지" : "▶ 자동재생"}
        </button>
        <button
          onClick={onReset}
          className="px-3 text-[11px] uppercase tracking-[0.15em] font-extrabold py-2 rounded-lg border border-gray-200 text-gray-700 hover:border-blue-300 transition-colors"
        >
          ↺ 초기화
        </button>
      </div>
    </aside>
  );
}
