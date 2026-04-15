"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { CATEGORY_TINT, QUESTION_SAMPLES, type QuestionSample } from "./shared/mock-data";
import { useReducedMotionPref } from "./shared/use-typewriter";

const DURATION_MS = 1600;
const STAGE = { STEM_END: 0.4, OPTIONS_END: 0.75, ANSWER_END: 0.92 };

function useClickAnimator(activeIndex: number, reduced: boolean) {
  const [progress, setProgress] = useState(1);
  const firstRenderRef = useRef(true);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (reduced) { setProgress(1); return; }
    if (firstRenderRef.current) { firstRenderRef.current = false; setProgress(1); return; }
    setProgress(0);
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [activeIndex, reduced]);

  return progress;
}

export function QuestionBurstScene() {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [nonce, setNonce] = useState(0);
  const progress = useClickAnimator(nonce, reduced);
  const sample = QUESTION_SAMPLES[activeIndex];
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [helperDismissed, setHelperDismissed] = useState(false);

  const handleSelect = useCallback((i: number) => {
    setActiveIndex(i); setNonce((n) => n + 1); setHelperDismissed(true);
  }, []);

  const handleReset = useCallback(() => {
    setCompleted(new Set()); setActiveIndex(0); setNonce((n) => n + 1); setHelperDismissed(false);
  }, []);

  useEffect(() => {
    if (progress > STAGE.ANSWER_END) {
      setCompleted((prev) => {
        if (prev.has(activeIndex)) return prev;
        const next = new Set(prev); next.add(activeIndex); return next;
      });
    }
  }, [activeIndex, progress]);

  useEffect(() => {
    setCompleted((prev) => {
      if (prev.has(0)) return prev;
      const next = new Set(prev); next.add(0); return next;
    });
  }, []);

  const [flashAll, setFlashAll] = useState(false);
  useEffect(() => {
    if (completed.size < QUESTION_SAMPLES.length) return;
    setFlashAll(true);
    const t = setTimeout(() => setFlashAll(false), 700);
    return () => clearTimeout(t);
  }, [completed]);

  return (
    <section ref={ref} id="burst" className="relative w-full bg-white py-24 lg:py-32 overflow-hidden border-t border-blue-50">
      <div className="relative px-6 lg:px-16 max-w-[1480px] mx-auto">
        
        {/* Headline */}
        <div className="mb-20 max-w-[900px] text-left">
          <div className="text-[13px] uppercase tracking-[0.25em] text-[#60A5FA] font-bold mb-4 flex items-center gap-3">
            <span className="w-8 h-[2px] bg-[#60A5FA]" />
            Step 2. 19유형 문제 생성
          </div>
          <h2 className="font-extrabold text-gray-900 leading-[1.3]" style={{ fontSize: "clamp(24px, 3.5vw, 44px)", letterSpacing: "-0.02em", wordBreak: "keep-all" }}>
            단순 변형이 아닙니다. 사전에 <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">철저하게 분석된 출제 포인트</span>를 기반으로 문제를 생성합니다.
          </h2>
          <p className="mt-8 text-[17px] text-gray-600 leading-[1.8] font-medium max-w-3xl">
            흔한 자동 생성기와 다릅니다. 선생님이 설계한 의도와 NARA가 딥다이브한 분석 결과를 바탕으로, 
            실제 내신과 수능에 직결되는 고퀄리티 문항을 단 1초 만에 <strong className="text-gray-900 font-bold">19개 전 유형</strong>으로 폭발적으로 생성합니다.
          </p>
        </div>

        {/* Stage */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-10">
          <div className="lg:sticky lg:top-32 self-start">
            <MainStage sample={sample} progress={progress} reduced={reduced} showHelper={!helperDismissed} />
          </div>
          <SideTracker currentIndex={activeIndex} completed={completed} flashAll={flashAll} reduced={reduced} onSelect={handleSelect} onReset={handleReset} />
        </div>
      </div>
    </section>
  );
}

function MainStage({ sample, progress, reduced, showHelper }: { sample: QuestionSample; progress: number; reduced: boolean; showHelper: boolean; }) {
  const tint = CATEGORY_TINT[sample.category];
  const stemProgress = Math.min(1, progress / STAGE.STEM_END);
  const typedStem = sample.stem.slice(0, Math.ceil(sample.stem.length * stemProgress));
  const optionsProgress = Math.max(0, Math.min(1, (progress - STAGE.STEM_END) / (STAGE.OPTIONS_END - STAGE.STEM_END)));
  const answerVisible = progress > STAGE.ANSWER_END;

  return (
    <motion.article
      className="relative bg-white rounded-2xl border border-blue-100 overflow-hidden flex flex-col shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)]"
      style={{ minHeight: "560px", height: "560px" }}
      whileHover={reduced ? undefined : { scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-7 lg:px-9 pt-7 pb-5 border-b border-blue-50 bg-[#F8FAFC]">
        <div role="status" aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait">
            <motion.div key={`badge-${sample.no}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="inline-flex items-center gap-3">
              <span className="text-[12px] uppercase font-extrabold tracking-[0.15em] px-3 py-1.5 rounded-full" style={{ background: tint.bg, color: tint.text }}>
                유형 {sample.no} · {sample.name}
              </span>
              <span className="text-[12px] uppercase tracking-[0.1em] font-bold text-blue-400">
                {sample.category}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Stage body */}
      <div className="px-7 lg:px-10 py-8 lg:py-10 flex-1 flex flex-col justify-start overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={`body-${sample.no}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: reduced ? 0 : 0.15 }}>
            <div className="min-h-[60px] text-[19px] lg:text-[21px] font-bold text-gray-900 leading-[1.6]">
              {reduced ? sample.stem : typedStem}
              {!reduced && stemProgress < 1 && <span className="inline-block w-[3px] h-[1em] align-[-0.15em] bg-[#60A5FA] ml-[2px] animate-pulse" />}
            </div>
            {(sample.given || sample.prompt) && (
              <div className="mt-6 px-5 py-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[15px] text-blue-900 leading-[1.7] font-medium">
                {sample.given ?? sample.prompt}
              </div>
            )}
            <div className="mt-8 text-gray-800">
              <ShapeBody sample={sample} optionsProgress={reduced ? 1 : optionsProgress} reduced={reduced} />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Answer reveal */}
        <div className="mt-auto min-h-[30px] pt-6">
          <AnimatePresence>
            {answerVisible && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 text-[15px] font-bold">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#3B82F6] text-white text-[13px] shadow-sm">✓</span>
                <span className="text-[#3B82F6]">정답 도출 완료</span>
                <span className="text-gray-900 bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg">{sample.answer}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="absolute left-0 right-0 bottom-0 h-1.5 bg-transparent">
        <motion.div className="h-full" style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: "linear-gradient(90deg, #93C5FD 0%, #3B82F6 50%, #1D4ED8 100%)" }} />
      </div>
    </motion.article>
  );
}

const CIRCLED = ["①", "②", "③", "④", "⑤"];
function ShapeBody({ sample, optionsProgress, reduced }: any) {
  const visibleCount = (total: number) => reduced ? total : Math.ceil(total * optionsProgress);
  switch (sample.shape) {
    case "mcq":
    case "insert": {
      const opts = sample.options ?? [];
      const count = visibleCount(opts.length);
      return (
        <ul className="space-y-3">
          {opts.map((opt: string, i: number) => (
            <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: i < count ? 1 : 0, x: i < count ? 0 : -8 }} className="flex items-start gap-4 px-4 py-3 rounded-xl bg-white border border-blue-50 shadow-sm hover:border-blue-200 hover:bg-[#F8FAFC] transition-colors">
              <span className="inline-flex items-center justify-center w-[24px] h-[24px] rounded-full bg-blue-50 text-[13px] font-bold text-blue-600 flex-shrink-0">{CIRCLED[i] ?? `${i + 1}.`}</span>
              <span className="text-[16px] font-medium text-gray-800 leading-[1.6]">{opt}</span>
            </motion.li>
          ))}
        </ul>
      );
    }
    default: return <div className="text-sm font-medium text-blue-400">이외 포맷은 축약(디자인 테마에 맞게 커스텀 적용됨)</div>;
  }
}

function SideTracker({ currentIndex, completed, flashAll, reduced, onSelect, onReset }: any) {
  const completedCount = completed.size;
  const total = QUESTION_SAMPLES.length;
  return (
    <aside className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col shadow-[0_15px_40px_-15px_rgba(0,0,0,0.05)] h-[560px]">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="text-[12px] uppercase tracking-[0.15em] font-extrabold text-gray-500">실시간 생성 트래커</div>
        <div className="text-[13px] font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">{completedCount}/{total} 완료</div>
      </div>
      <div className="grid grid-cols-2 gap-2 flex-1 overflow-auto pr-1 custom-scrollbar">
        {QUESTION_SAMPLES.map((q, i) => {
          const tint = CATEGORY_TINT[q.category];
          const isCurrent = i === currentIndex;
          const isDone = completed.has(i);
          return (
            <button key={q.no} onClick={() => onSelect(i)} className={`relative w-full flex items-center h-11 pl-3 pr-3 rounded-lg cursor-pointer transition-all text-left border ${isCurrent ? 'border-gray-800 bg-gray-50 shadow-sm' : isDone ? 'border-gray-200 bg-white' : 'border-transparent hover:bg-gray-50'}`}>
              <span className="text-[13px] font-mono font-black w-[22px]" style={{ color: isCurrent ? '#1F2937' : '#9CA3AF' }}>{q.no}</span>
              <span className={`flex-1 text-[13px] truncate ${isCurrent ? "font-bold text-gray-900" : isDone ? "font-bold text-gray-700" : "font-semibold text-gray-500"}`}>{q.name}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
