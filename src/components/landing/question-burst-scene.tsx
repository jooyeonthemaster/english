"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { QUESTION_SAMPLES, type QuestionSample } from "./shared/mock-data";
import { useReducedMotionPref } from "./shared/use-typewriter";
import { MainStage } from "./question-burst-scene/main-stage";
import { SideTracker } from "./question-burst-scene/side-tracker";
import type { GenerationState } from "./question-burst-scene/types";

// Phase pacing — tuned for visible "tatak tatak" character typing
const STEM_SPEED = 26;
const GIVEN_SPEED = 18;
const OPTION_SPEED = 16;
const PHASE_PAUSE = 200;
const FINAL_HOLD_MS = 2400;

const EMPTY_STATE: GenerationState = {
  phase: "stem",
  stem: "",
  given: "",
  options: [],
  activeOptionIndex: -1,
  answerVisible: false,
};

function useGenerationSequence(
  sample: QuestionSample,
  runKey: number,
  reduced: boolean,
) {
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
      setState((s) => ({
        ...s,
        phase: "answer",
        answerVisible: true,
        activeOptionIndex: -1,
      }));
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
            Step 2. AI 영어 문제 생성 · 내신 19유형
          </div>
          <h2
            className="font-extrabold text-gray-900 leading-[1.3]"
            style={{
              fontSize: "clamp(24px, 3.5vw, 44px)",
              letterSpacing: "-0.02em",
              wordBreak: "keep-all",
            }}
          >
            단순 변형이 아닙니다. 사전에{" "}
            <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">
              철저하게 분석된 출제 포인트
            </span>
            를 기반으로 문제를 생성합니다.
          </h2>
          <p className="mt-8 text-[17px] text-gray-600 leading-[1.8] font-medium max-w-3xl break-keep">
            흔한 자동 생성기와 다릅니다. 선생님이 설계한 의도와 SMOAT가
            딥다이브한 분석 결과를 바탕으로, 실제 내신과 수능에 직결되는
            고퀄리티 문항을 단 1초 만에{" "}
            <strong className="text-gray-900 font-bold">19개 전 유형</strong>
            으로 폭발적으로 생성합니다.
          </p>
        </div>

        {/* Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-10">
          <div className="lg:sticky lg:top-32 self-start">
            <MainStage
              sample={sample}
              generation={generation}
              runKey={runKey}
              reduced={reduced}
            />
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
