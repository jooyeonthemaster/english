"use client";

import { useRef, type ReactNode } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Minus, Square, X } from "lucide-react";
import { HERO_PASSAGE, HERO_ANNOTATIONS, ANALYSIS_LINES } from "./shared/mock-data";
import { MarkByKind, ANNOTATION_COLORS, ANNOTATION_LABEL } from "./shared/annotation-marks";
import { Reveal } from "./shared/reveal";
import { Accent, GRID_INK, SceneGhost, SceneKicker } from "./shared/scene-ui";
import { DemoGate } from "./demo/demo-gate";

// 실제 분석 리포트 데모 — PC(≥lg)에서 뷰포트 근접 시에만 청크 로드.
// 모바일은 실제 학습지 1페이지 미리보기 창만 보여주고, 버튼 탭 시 데모를 연다.
const Step2AnalysisDemo = dynamic(
  () => import("./demo/step2-analysis/step2-analysis-demo"),
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

function AnalysisLine({ line }: { line: (typeof ANALYSIS_LINES)[number] }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b border-blue-50 last:border-0">
      <span
        className="w-[4px] h-5 rounded-sm shrink-0 mt-0.5"
        style={{ background: ANNOTATION_COLORS[line.kind] }}
      />
      <div className="w-[90px] sm:w-[120px] shrink-0">
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
        {line.body}
      </div>
    </div>
  );
}

// 시간차 마킹 연출을 없애고 처음부터 완성된 분석을 보여준다.
const STEP = HERO_ANNOTATIONS.length;

export function AnnotationScene() {
  const ref = useRef<HTMLElement>(null);
  const step = STEP;

  return (
    <section ref={ref} id="annotation" className={`relative w-full bg-[#F8FAFC] pt-8 pb-8 sm:pt-12 sm:pb-12 lg:flex lg:min-h-[100svh] lg:items-center lg:pb-10 lg:pt-28 ${GRID_INK}`}>
      {/* PC(≥lg): 카피(좌) | 데모(우) 한 화면 배치. 모바일은 세로 스택 그대로. */}
      <div className="mx-auto w-full max-w-[1480px] px-5 sm:px-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-8 lg:px-10 xl:px-16">
        <div className="relative mb-4 max-w-[900px] lg:mb-0">
          <SceneGhost n="02" className="-top-7 right-0 lg:-top-2 lg:-left-4 lg:right-auto" />
          <Reveal className="relative mb-3 lg:mb-4" y={16}>
            <SceneKicker className="justify-center lg:justify-start">
              FEATURE · 학습지 생성
            </SceneKicker>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="relative text-[25px] font-black leading-[1.2] text-slate-900 sm:text-[30px] lg:text-[38px] lg:leading-[1.24]"
              style={{ wordBreak: "keep-all" }}
            >
              어떤 지문이든,
              <br />
              <Accent>바로 수업 가능한 학습지</Accent>가
              <br />
              1초만에 나옵니다.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 max-w-3xl break-keep text-[14px] font-medium leading-[1.55] text-gray-600 sm:text-[15px] sm:leading-[1.7] lg:mt-4">
              문장별 해석·구문 분석부터 학습문제까지,
              <br />
              <strong className="text-gray-900 font-bold">인쇄만 하면 수업이 시작되는 학습지</strong>가
              한 번에 완성됩니다.
            </p>
          </Reveal>
        </div>

        {/* PC: 실제 분석 리포트 문서 데모 / 모바일: 학습지 미리보기 + 풀스크린 시트 데모 */}
        <DemoGate
          minWidth="lg"
          fallback={<AnnotationFallback step={step} />}
          className="min-w-0"
          mobileDemo={<Step2AnalysisDemo />}
        >
          <Step2AnalysisDemo />
        </DemoGate>
      </div>
    </section>
  );
}

function AnnotationFallback({ step }: { step: number }) {
  return (
    <>
      <div className="lg:hidden">
        <WorksheetWindowPreview />
      </div>
      <div className="hidden lg:block">
        <AnnotationMock step={step} />
      </div>
    </>
  );
}

/** 모바일 전용 실제 학습지 1페이지 미리보기. */
function WorksheetWindowPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex justify-center"
    >
      <div className="absolute -inset-6 rounded-full bg-blue-300/20 blur-[60px]" />
      <div className="relative z-10 w-full max-w-[480px] overflow-hidden rounded-xl border border-slate-300/80 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_30px_60px_-12px_rgba(59,130,246,0.25)]">
        <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-[#f7f8fa] px-3 sm:h-9">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-[#2563eb] text-[8px] font-black text-white sm:size-[18px] sm:text-[9px]">
              한
            </span>
            <span className="truncate text-[10.5px] font-bold text-slate-700 sm:text-[11.5px]">
              SMOAT_분석학습지.hwpx - 한글
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-400">
            <Minus className="size-3.5" aria-hidden="true" />
            <Square className="size-2.5" aria-hidden="true" />
            <X className="size-3.5" aria-hidden="true" />
          </div>
        </div>

        <div className="flex h-6 items-center gap-3 border-b border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-600 sm:h-7 sm:gap-3.5 sm:px-3.5 sm:text-[11px]">
          {["파일", "편집", "보기", "입력", "서식", "쪽", "보안", "검토", "도구"].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>

        <div className="flex h-7 items-center gap-1.5 border-b border-slate-200 bg-[#fafbfc] px-3 sm:h-9">
          {[...Array(5)].map((_, i) => (
            <span key={i} className="size-4 rounded bg-slate-200/80 sm:size-5" />
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <span className="flex h-5 items-center rounded border border-slate-200 bg-white px-2 text-[9.5px] font-semibold text-slate-600 sm:h-6 sm:text-[10.5px]">
            함초롬바탕
          </span>
          <span className="flex h-5 items-center rounded border border-slate-200 bg-white px-2 text-[9.5px] font-semibold text-slate-600 sm:h-6 sm:text-[10.5px]">
            10.0 pt
          </span>
        </div>

        <div
          className="h-3 border-b border-slate-200 bg-white sm:h-4"
          style={{
            backgroundImage: "repeating-linear-gradient(to right, #cbd5e1 0 1px, transparent 1px 24px)",
            backgroundSize: "auto 7px",
            backgroundPosition: "14px bottom",
            backgroundRepeat: "repeat-x",
          }}
        />

        <div className="flex h-[230px] justify-center overflow-hidden bg-[#e9edf2] px-4 pt-3 sm:h-[300px] sm:px-6 sm:pt-5">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full overflow-hidden bg-white"
            style={{
              aspectRatio: "210 / 297",
              boxShadow: "0 1px 3px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.04)",
            }}
          >
            <Image
              src="/landing/generated/actual-smoat-worksheet-page1.webp"
              alt="SMOAT가 생성한 실제 분석 학습지 1페이지 미리보기"
              fill
              sizes="(max-width: 1024px) calc(100vw - 96px), 480px"
              className="object-cover object-top"
            />
          </motion.div>
        </div>

        <div className="flex h-5 items-center justify-between border-t border-slate-200 bg-[#f7f8fa] px-3 text-[9.5px] font-semibold text-slate-500 sm:h-6 sm:text-[10px]">
          <span>1쪽 1단 1줄 1칸 · 삽입</span>
          <span>100%</span>
        </div>
      </div>
    </motion.div>
  );
}

/** 기존 마킹→분석 목업 — PC 데모 로드 전 폴백으로 유지. */
function AnnotationMock({ step }: { step: number }) {
  return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_56px_1fr] xl:grid-cols-[1fr_80px_1fr] gap-6 xl:gap-10 items-stretch">
          {/* Left — passage editor mock (Clean Light Mode) */}
          <Reveal delay={0.1} className="rounded-2xl bg-white border border-blue-100/50 p-4 lg:p-5 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.05)] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#60A5FA] to-transparent opacity-50" />
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-blue-50">
              <span className="text-[13px] uppercase tracking-[0.15em] text-blue-400 font-bold">
                선생님의 원문 마킹
              </span>
              <span className="text-[12px] text-[#3B82F6] bg-[#EFF6FF] px-3 py-1 rounded-full border border-[#BFDBFE] font-bold">
                Live Input
              </span>
            </div>
            <div className="relative mb-3 h-[clamp(118px,18vw,178px)] overflow-hidden rounded-xl border border-blue-100 bg-slate-100 shadow-sm lg:[@media(max-height:820px)]:hidden">
              <Image
                src="/landing/generated/teacher-marked-passage.webp"
                alt="선생님이 필기와 형광펜으로 표시한 영어 지문 자료"
                fill
                sizes="(max-width: 1024px) 100vw, 520px"
                className="object-cover object-[center_42%]"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white/85 to-transparent" />
            </div>
            <p className="text-[15px] leading-[1.75] text-gray-800 font-serif">
              {buildAnnotated(HERO_PASSAGE, step)}
            </p>
            <div className="mt-3 pt-3 border-t border-blue-50 flex items-center gap-2.5 flex-wrap">
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
          </Reveal>

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
          <Reveal delay={0.22} className="rounded-2xl bg-white border border-blue-100/50 p-4 lg:p-5 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.05)] relative">
            <div className="absolute top-0 right-0 w-1/2 h-1 bg-gradient-to-l from-[#60A5FA]/60 to-transparent" />
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-blue-50">
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
              {ANALYSIS_LINES.map((line) => (
                <AnalysisLine key={line.label} line={line} />
              ))}
            </div>
          </Reveal>
        </div>
  );
}
