"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { HERO_PASSAGE, HERO_ANNOTATIONS, ANALYSIS_LINES } from "./shared/mock-data";
import { MarkByKind, ANNOTATION_COLORS, ANNOTATION_LABEL } from "./shared/annotation-marks";
import { useReducedMotionPref, useTypewriter } from "./shared/use-typewriter";

function buildAnnotated(text: string, activeCount: number): ReactNode[] {
  const slices = HERO_ANNOTATIONS.slice(0, activeCount).map((a) => ({
    ...a,
    start: text.indexOf(a.match),
    end: text.indexOf(a.match) + a.match.length,
  }));
  const ordered = [...slices].sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  ordered.forEach((s, i) => {
    if (s.start < 0 || s.start < cursor) return;
    if (s.start > cursor) nodes.push(<span key={`t-${i}`}>{text.slice(cursor, s.start)}</span>);
    nodes.push(
      <MarkByKind key={`m-${i}`} kind={s.kind}>
        {text.slice(s.start, s.end)}
      </MarkByKind>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) nodes.push(<span key="t-end">{text.slice(cursor)}</span>);
  return nodes;
}

function AnalysisLine({ line, active, reduced }: { line: (typeof ANALYSIS_LINES)[number]; active: boolean; reduced: boolean; }) {
  const { output, done } = useTypewriter(line.body, {
    speed: reduced ? 0 : 14,
    start: active,
    startDelay: 120,
  });
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: active ? 1 : 0.4, x: active ? 0 : 12 }}
      transition={{ duration: 0.4 }}
      className="flex items-start gap-4 py-4 border-b border-blue-50 last:border-0"
    >
      <span
        className="w-[4px] h-5 rounded-sm shrink-0 mt-0.5"
        style={{ background: ANNOTATION_COLORS[line.kind] }}
      />
      <div className="w-[120px] shrink-0">
        <span className="text-[14px] font-bold text-gray-800">
          {line.label}
        </span>
        {line.count && (
          <span className="ml-1.5 text-[12px] font-semibold text-blue-400">
            ({line.count})
          </span>
        )}
      </div>
      <div className="flex-1 text-[14px] font-mono leading-relaxed min-h-[24px] text-gray-700">
        {active ? (
          <>
            {output}
            {!done && <span className="inline-block w-[6px] h-[12px] bg-[#60A5FA] align-middle ml-[2px] animate-pulse" />}
          </>
        ) : (
          <span className="text-gray-400 font-medium">— 딥다이브 분석 대기 중</span>
        )}
      </div>
    </motion.div>
  );
}

export function AnnotationScene() {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setStep(HERO_ANNOTATIONS.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    HERO_ANNOTATIONS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i + 1), 500 + i * 950));
    });
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced]);

  return (
    <section ref={ref} id="annotation" className="relative w-full min-h-screen bg-[#F8FAFC] py-24 lg:py-32 border-t border-blue-100/50">
      <div className="px-6 lg:px-16 max-w-[1480px] mx-auto">
        <div className="mb-20 max-w-[900px]">
          <div className="text-[13px] uppercase tracking-[0.25em] text-[#60A5FA] font-bold mb-4 flex items-center gap-3">
            <span className="w-8 h-[2px] bg-[#60A5FA]" />
            Step 1. 딥다이브 분석
          </div>
          <h2 className="font-extrabold text-gray-900 leading-[1.3]" style={{ fontSize: "clamp(24px, 3.5vw, 44px)", letterSpacing: "-0.02em", wordBreak: "keep-all" }}>
            AI가 아무거나 분석하는 것이 아닙니다. 선생님이 <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">필기한 포인트</span>를 바탕으로 분석합니다.
          </h2>
          <p className="mt-8 text-[17px] text-gray-600 leading-[1.8] font-medium max-w-3xl">
            단순 텍스트 복붙으로 얻은 의미 없는 결과물은 이제 버리세요. 강사님이 지문에서 
            <strong className="text-gray-900 font-bold"> 강조하고 마킹한 필기 </strong> 그 자체가 AI의 나침반이 됩니다. 
            그 출제 의도와 포인트를 100% 이해하여, 가장 정확한 핵심 분석을 자동으로 도출합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_80px_1fr] gap-6 lg:gap-10 items-stretch">
          {/* Left — passage editor mock (Clean Light Mode) */}
          <div className="rounded-2xl bg-white border border-blue-100/50 p-8 lg:p-10 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.05)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#60A5FA] to-transparent opacity-50" />
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-blue-50">
              <span className="text-[13px] uppercase tracking-[0.15em] text-blue-400 font-bold">
                선생님의 원문 마킹
              </span>
              <span className="text-[12px] text-[#3B82F6] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE] font-bold">
                Live Input
              </span>
            </div>
            <p className="text-[17px] leading-[2.1] text-gray-800 font-serif">
              {buildAnnotated(HERO_PASSAGE, step)}
            </p>
            <div className="mt-10 pt-6 border-t border-blue-50 flex items-center gap-2.5 flex-wrap">
              {HERO_ANNOTATIONS.map((a, i) => (
                <div
                  key={a.kind}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all duration-500"
                  style={{
                    background: i < step ? `${ANNOTATION_COLORS[a.kind]}1A` : "#EFF6FF",
                    color: i < step ? ANNOTATION_COLORS[a.kind] : "#60A5FA",
                    border: `1px solid ${i < step ? ANNOTATION_COLORS[a.kind] + "40" : "#BFDBFE"}`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: i < step ? ANNOTATION_COLORS[a.kind] : "#93C5FD" }}
                  />
                  {ANNOTATION_LABEL[a.kind]}
                </div>
              ))}
            </div>
          </div>

          {/* Middle — Flow indicator */}
          <div className="hidden lg:flex items-center justify-center relative">
            <div className="absolute inset-y-16 left-1/2 w-[2px] bg-gradient-to-b from-blue-50 via-blue-300 to-blue-50" />
            {HERO_ANNOTATIONS.map((a, i) => (
              <motion.div
                key={a.kind}
                initial={{ opacity: 0, y: -10 }}
                animate={
                  i < step
                    ? { opacity: [0, 1, 1, 0], y: [0, 60, 120, 180], scale: [1, 1.2, 1.2, 1] }
                    : { opacity: 0 }
                }
                transition={{ duration: 1.5, ease: "easeInOut", delay: 0.1 }}
                className="absolute left-1/2 top-16 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-[2px] border-white shadow-md"
                style={{ background: ANNOTATION_COLORS[a.kind], top: `${80 + i * 15}px` }}
              />
            ))}
          </div>

          {/* Right — analysis output */}
          <div className="rounded-2xl bg-white border border-blue-100/50 p-8 lg:p-10 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.05)] relative">
            <div className="absolute top-0 right-0 w-1/2 h-1 bg-gradient-to-l from-[#60A5FA]/60 to-transparent" />
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-blue-50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <span className="block w-3 h-3 rounded-full bg-[#60A5FA]" />
                  <span className="absolute inset-0 rounded-full bg-[#60A5FA] animate-ping opacity-75" />
                </div>
                <span className="text-[13px] uppercase tracking-[0.15em] text-[#3B82F6] font-bold">
                  AI Deep Dive Analysis
                </span>
              </div>
              <span className="text-[12px] text-blue-400 font-mono tracking-widest font-bold">{step}/5 완료</span>
            </div>
            <div className="space-y-1">
              {ANALYSIS_LINES.map((line, i) => (
                <AnalysisLine
                  key={line.label}
                  line={line}
                  active={i < step}
                  reduced={reduced}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
