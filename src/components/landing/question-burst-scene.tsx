"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { QUESTION_SAMPLES, type QuestionSample } from "./shared/mock-data";
import { useReducedMotionPref } from "./shared/use-typewriter";
import { useIsMobileViewport } from "@/components/workbench/mobile-step-flow";
import { MainStage } from "./question-burst-scene/main-stage";
import { SideTracker } from "./question-burst-scene/side-tracker";
import { Item, Reveal, Stagger } from "./shared/reveal";
import { Accent, GRID_INK, SceneGhost, SceneKicker } from "./shared/scene-ui";
import type { GenerationState } from "./question-burst-scene/types";
import { DemoGate } from "./demo/demo-gate";
import { TypeChipSelector } from "./demo/step3-generate/type-chip-selector";
import type { DemoQuestionTypeId } from "./demo/fixtures/questions";

// 실제 유형선택→문제생성 데모 — PC(≥lg)에서 뷰포트 근접 시에만 청크 로드.
// 모바일은 기존 타자기 목업(MainStage/SideTracker)이 그대로 유지된다.
const Step3GenerateDemo = dynamic(
  () => import("./demo/step3-generate/step3-generate-demo"),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-2xl border border-blue-100 bg-slate-50"
        style={{ height: "max(400px, calc(100svh - 260px))" }}
      />
    ),
  },
);

// 모바일 시트 전용 3스텝 데모(지문→유형→문제). 탭 시에만 로드.
const Step3GenerateMobileDemo = dynamic(
  () => import("./demo/step3-generate/step3-generate-mobile"),
  { ssr: false },
);

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

function getCompletedGenerationState(sample: QuestionSample): GenerationState {
  return {
    phase: "done",
    stem: sample.stem,
    given: sample.given ?? sample.prompt ?? "",
    options: sample.options ?? [],
    activeOptionIndex: -1,
    answerVisible: true,
  };
}

function useGenerationSequence(
  sample: QuestionSample,
  runKey: number,
  reduced: boolean,
) {
  const [state, setState] = useState<GenerationState>(EMPTY_STATE);

  useEffect(() => {
    if (reduced) return;

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(t);
    };

    schedule(
      () => setState({ ...EMPTY_STATE, options: (sample.options ?? []).map(() => "") }),
      0,
    );

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

  return reduced ? getCompletedGenerationState(sample) : state;
}

export function QuestionBurstScene() {
  // 모바일(<lg)에서는 목업의 타자기 연출을 끈다 — 시간차로 카드가 길어지며
  // 스크롤이 튀는 문제 방지. reduced 경로가 완성 상태를 즉시 그리고 자동 순환도
  // 멈춘다. PC 는 이 목업 대신 라이브 데모가 렌더되므로 영향 없음.
  const prefersReducedMotion = useReducedMotionPref();
  const isMobileViewport = useIsMobileViewport();
  const reduced = prefersReducedMotion || isMobileViewport;
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set([0]));
  const [autoPlay, setAutoPlay] = useState(true);
  // PC 라이브 데모(우측)에서 생성할 유형 — 왼쪽 유형 칩이 이 상태를 조종한다.
  const [demoType, setDemoType] = useState<DemoQuestionTypeId | null>(null);

  const sample = QUESTION_SAMPLES[activeIndex];
  const generation = useGenerationSequence(sample, runKey, reduced);

  // Auto-advance when "done", but only if user hasn't paused
  useEffect(() => {
    if (reduced) return;
    if (!autoPlay) return;
    if (generation.phase !== "done") return;

    const t = setTimeout(() => {
      setCompleted((prev) => {
        if (prev.has(activeIndex)) return prev;
        const next = new Set(prev);
        next.add(activeIndex);
        return next;
      });
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
      className={`relative w-full overflow-hidden bg-white pt-8 pb-8 sm:pt-12 sm:pb-12 lg:flex lg:min-h-[100svh] lg:items-center lg:pb-10 lg:pt-28 ${GRID_INK}`}
    >
      {/* PC(≥lg): 카피(좌) | 데모(우) 한 화면 배치. 모바일은 세로 스택 그대로. */}
      <div className="relative mx-auto w-full max-w-[1480px] px-5 sm:px-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-8 lg:px-16">
        {/* Headline */}
        <div className="relative mb-4 max-w-[900px] text-left lg:mb-0">
          <SceneGhost n="01" className="-top-7 right-0 lg:-top-2 lg:-left-4 lg:right-auto" />
          <Reveal className="relative" y={16}>
            <SceneKicker className="mb-3 justify-center lg:mb-4 lg:justify-start">
              FEATURE · 24유형 문제 생성
            </SceneKicker>
          </Reveal>
          <Reveal delay={0.08}>
          <h2
            className="relative text-[25px] font-black leading-[1.2] text-slate-900 sm:text-[30px] lg:text-[38px] lg:leading-[1.24]"
            style={{
              wordBreak: "keep-all",
            }}
          >
            지문 하나로 시작하는,
            <br />
            <Accent>초고속 AI 문제 생성</Accent>
          </h2>
          </Reveal>
          <Reveal delay={0.16}>
          <p className="mt-3 max-w-3xl break-keep text-[14px] font-medium leading-[1.55] text-gray-600 sm:text-[15px] sm:leading-[1.7] lg:mt-4">
            지문을 넣는 순간, 빈칸·어법·순서부터 서술형까지
            <br className="lg:hidden" />
            <br className="hidden lg:inline" />{" "}
            <strong className="text-gray-900 font-bold">
              내신·수능 24유형 문항이 단 몇 초 만에
            </strong>{" "}
            완성됩니다.
          </p>
          </Reveal>
          {/* 모바일(<lg): 기존 안내 뱃지 유지 (데모 미노출) */}
          <Stagger className="mt-3 flex flex-wrap gap-2 lg:hidden" delay={0.3} gap={0.08}>
            {["24유형 전 영역", "1초 생성", "장문 세트", "동형 모의고사"].map((t) => (
              <Item key={t} pop>
                <span className="inline-block rounded-full border border-blue-100 bg-blue-50/70 px-3 py-1 text-[12.5px] font-bold text-blue-700">
                  {t}
                </span>
              </Item>
            ))}
          </Stagger>
          {/* PC(≥lg): 전 유형 칩 — 실제 동작 버튼. 누르면 우측 라이브 데모가
              그 유형의 문제를 이 지문으로 즉시 생성한다. */}
          <Reveal className="mt-5 hidden lg:block" delay={0.3}>
            <TypeChipSelector selected={demoType} onSelect={setDemoType} />
          </Reveal>
        </div>

        {/* Stage — PC: 실제 유형선택→생성 데모 / 모바일·로드 전: 기존 타자기 목업 */}
        <DemoGate
          minWidth="lg"
          className="min-w-0"
          fallback={
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-10">
              <Reveal className="lg:sticky lg:top-32 self-start" delay={0.12} amount={0.2}>
                <MainStage
                  sample={sample}
                  generation={generation}
                  runKey={runKey}
                  reduced={reduced}
                />
              </Reveal>
              {/* 실시간 생성 트래커 — 모바일에선 숨김(스크롤 방해). PC 는 이 목업
                  대신 라이브 데모가 렌더되므로 hidden lg:block 로 무영향 유지. */}
              <div className="hidden lg:block">
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
          }
          mobileDemo={<Step3GenerateMobileDemo />}
        >
          <Step3GenerateDemo
            selected={demoType}
            onReset={() => setDemoType(null)}
          />
        </DemoGate>
      </div>
    </section>
  );
}
