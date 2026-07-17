"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Item, Reveal, Stagger } from "./shared/reveal";
import { Accent, GRID_INK, SceneGhost, SceneKicker } from "./shared/scene-ui";
import { DemoGate } from "./demo/demo-gate";

// 실제 시험 리포트 문서 데모 — PC(≥lg)에서 뷰포트 근접 시에만 청크 로드.
// 모바일은 아래 ReportMock(기존 목업)이 그대로 유지된다.
const Step5ReportDemo = dynamic(
  () => import("./demo/step5-report/step5-report-demo"),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-2xl border border-blue-100 bg-slate-50"
        style={{ height: "max(400px, calc(100svh - 330px))" }}
      />
    ),
  },
);

const TYPE_BARS: Array<{ label: string; pct: number; weak?: boolean }> = [
  { label: "빈칸 추론", pct: 92 },
  { label: "어법 판단", pct: 84 },
  { label: "글의 순서", pct: 61, weak: true },
  { label: "문장 삽입", pct: 55, weak: true },
  { label: "서술형", pct: 78 },
];

const THEME_DOTS = ["#4F46E5", "#334155", "#0D9488", "#1E3A8A", "#18181B", "#166534"];

export function ReportScene() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      ref={ref}
      id="report"
      className={`relative w-full bg-white pt-6 pb-6 sm:pt-10 sm:pb-10 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10 ${GRID_INK}`}
    >
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-4 px-5 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:px-16">
        {/* PC: 실제 리포트 문서 데모(우) / 모바일·로드 전: 기존 리포트 목업 */}
        <DemoGate
          minWidth="lg"
          fallback={<ReportMock />}
          className="min-w-0 order-last lg:order-2"
          mobileDemo={<Step5ReportDemo />}
        >
          <Step5ReportDemo />
        </DemoGate>

        {/* Copy — PC 에선 좌측(order-1) */}
        <div className="relative max-w-[600px] lg:order-1">
          <SceneGhost n="05" className="-top-7 right-0 lg:-top-2 lg:-left-4 lg:right-auto" />
          <Reveal className="relative mb-2 sm:mb-4" y={16}>
            <SceneKicker className="justify-center lg:justify-start">
              FEATURE · 시험 리포트
            </SceneKicker>
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="relative text-[25px] font-black leading-[1.18] text-slate-900 sm:text-[30px] sm:leading-[1.25] lg:text-[38px] lg:leading-[1.24]"
              style={{ wordBreak: "keep-all" }}
            >
              시험이 끝나면,
              <br />
              <Accent>학생별 분석 리포트</Accent>가 완성됩니다.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 break-keep text-[14px] font-medium leading-[1.55] text-gray-600 sm:mt-4 sm:text-[15px] sm:leading-[1.7]">
              채점만 입력하면 학생별 리포트가 완성됩니다
              <span className="hidden lg:inline"> — </span>
              <br className="lg:hidden" />
              <strong className="text-gray-900 font-bold">수치는 채점 그대로</strong>, 코멘트만 AI가 다듬습니다.
            </p>
          </Reveal>

          <Stagger className="mt-3 grid grid-cols-3 gap-2 sm:mt-6 sm:flex sm:flex-col sm:gap-4" delay={0.25}>
            {[
              { k: "유형별 취약점 분석", v: "취약 유형과 다음 학습 방향이 한눈에" },
              { k: "학부모 상담용 리포트", v: "6가지 테마 · 그대로 인쇄해 전달" },
              { k: "출제와 이어지는 보완 학습", v: "취약 유형으로 변형문제 바로 재출제" },
            ].map((row) => (
              <Item key={row.k} className="flex min-h-[52px] flex-col justify-center rounded-xl border border-blue-100 bg-white/70 px-2.5 py-2 sm:min-h-0 sm:flex-row sm:items-start sm:justify-start sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0" y={18}>
                <span className="mt-0.5 hidden size-[22px] shrink-0 items-center justify-center rounded-full bg-blue-600 text-white sm:flex" aria-hidden>
                  <Check className="size-3" strokeWidth={3.5} />
                </span>
                <div className="min-w-0">
                  <div className="text-center text-[11.5px] font-extrabold leading-tight text-gray-900 sm:text-left sm:text-[15px] sm:tracking-wide">{row.k}</div>
                  <div className="hidden text-[13.5px] font-medium leading-[1.6] text-gray-600 sm:block">{row.v}</div>
                </div>
              </Item>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

/** 기존 리포트 목업 — 모바일(<lg)과 데모 로드 전 폴백으로 유지. */
function ReportMock() {
  return (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex justify-center order-last lg:order-first"
        >
          <div className="absolute -inset-6 rounded-full bg-blue-300/20 blur-[56px] sm:-inset-10 sm:blur-[80px]" />
          <div
            className="relative z-10 w-full max-w-[520px] bg-white p-3.5 sm:p-5 lg:p-7"
            style={{
              boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 30px 60px -10px rgba(59,130,246,0.15)",
              borderRadius: "4px",
            }}
          >
            <div className="mb-3 flex items-baseline justify-between border-b-[3px] border-[#1E3A8A] pb-2 sm:mb-4 sm:pb-2.5">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-blue-500 sm:text-[11px]">Exam Report</div>
                <div className="mt-0.5 text-[13px] font-black text-[#1E3A8A] sm:mt-1 sm:text-[15px]">중간고사 대비 모의고사 · 시험 리포트</div>
              </div>
              <div className="text-right text-[10px] font-bold text-blue-800 sm:text-[11px]">김스모 학생<br />고3 · 영어</div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2 sm:mb-4 sm:gap-3">
              {[
                { k: "점수", v: "87점" },
                { k: "반 평균 대비", v: "+9.5" },
                { k: "취약 유형", v: "2개" },
              ].map((cell) => (
                <div key={cell.k} className="rounded-xl border border-blue-100 bg-blue-50/40 px-2 py-1.5 text-center sm:px-3 sm:py-2">
                  <div className="text-[10px] font-bold text-blue-500 sm:text-[11px]">{cell.k}</div>
                  <div className="mt-0.5 text-[15px] font-black text-[#1E3A8A] sm:text-[16px]">{cell.v}</div>
                </div>
              ))}
            </div>

            <div className="mb-3 sm:mb-4">
              <div className="mb-1.5 text-[11.5px] font-black text-slate-950 sm:mb-2 sm:text-[12px]">유형별 정답률</div>
              <div className="space-y-1.5 sm:space-y-2">
                {TYPE_BARS.map((bar, i) => (
                  <div key={bar.label} className="flex items-center gap-3">
                    <span className="w-[68px] shrink-0 text-[11px] font-bold text-gray-600 sm:w-[76px] sm:text-[11.5px]">{bar.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 sm:h-2">
                      <motion.div
                        className={`h-full rounded-full ${bar.weak ? "bg-amber-400" : "bg-blue-500"}`}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${bar.pct}%` }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.12, ease: "easeOut" }}
                      />
                    </div>
                    <span className={`w-8 shrink-0 text-right text-[11px] font-black sm:w-9 sm:text-[11.5px] ${bar.weak ? "text-amber-600" : "text-blue-700"}`}>
                      {bar.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="line-clamp-2 rounded-xl border border-blue-100 bg-[#F8FAFC] px-3 py-2 text-[11.5px] font-medium leading-[1.45] text-gray-700 sm:line-clamp-none sm:px-4 sm:py-3 sm:text-[12px] sm:leading-[1.65]">
              <span className="font-black text-[#1E3A8A]">학습 코멘트 · </span>
              글의 순서와 문장 삽입 유형에서 연결어 단서를 놓치는 패턴이 보입니다. 이번 주는 순서·삽입
              변형 세트로 보완 학습을 권합니다.
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-blue-50 pt-2.5 sm:mt-4 sm:pt-3">
              <div className="flex items-center gap-1.5">
                {THEME_DOTS.map((color) => (
                  <span key={color} className="size-2.5 rounded-full border border-white shadow-sm sm:size-3" style={{ background: color }} />
                ))}
                <span className="ml-1 text-[10.5px] font-bold text-slate-400 sm:ml-1.5 sm:text-[11px]">6가지 디자인 테마</span>
              </div>
              <span className="rounded-full bg-[#1E3A8A] px-2.5 py-0.5 text-[10.5px] font-black text-white sm:px-3 sm:py-1 sm:text-[11px]">인쇄하기</span>
            </div>
          </div>
        </motion.div>
  );
}
