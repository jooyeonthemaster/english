"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Minus, Square, X } from "lucide-react";
import { Item, Reveal, Stagger } from "./shared/reveal";
import { DemoGate } from "./demo/demo-gate";

// 실제 시험지 조판 데모 — PC(≥lg)에서 뷰포트 근접 시에만 청크 로드.
// 모바일은 아래 HwpWindowMock(기존 한글 창 목업)이 그대로 유지된다.
const Step4PaperDemo = dynamic(
  () => import("./demo/step4-paper/step4-paper-demo"),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-2xl border border-blue-100 bg-slate-50"
        style={{ height: "max(360px, calc(100svh - 344px))" }}
      />
    ),
  },
);

// 모바일 시트 전용 3스텝 데모(구성→미리보기→다운로드). 탭 시에만 로드.
const Step4PaperMobileDemo = dynamic(
  () => import("./demo/step4-paper/step4-paper-mobile"),
  { ssr: false },
);

export function ExamPaperScene() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section ref={ref} id="paper" className="relative w-full overflow-hidden border-t border-blue-100 bg-[#EFF6FF] py-7 sm:py-10 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10">
      {/* 모바일: 카피 → 문제지 목업 → 데모 버튼. PC(≥lg): 카피(좌) | 데모(우). */}
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 items-center gap-5 px-5 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:px-16">
        {/* Copy — 모바일과 PC 모두 먼저 읽히고, PC 에선 좌측에 배치. */}
        <div className="max-w-[600px] lg:order-1">
          <Reveal className="mb-2 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[#3B82F6] sm:mb-4 sm:text-[13px] sm:tracking-[0.25em] justify-center lg:justify-start" y={16}>
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
            Feature · 1초 만에 시험지 파일로
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8 lg:hidden" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-[24px] font-extrabold leading-[1.2] text-gray-900 sm:text-[30px] sm:leading-[1.25] lg:text-[34px] lg:leading-[1.3]" style={{ wordBreak: "keep-all" }}>
              웹에서 바로 편집하는 시험지!
              <br />
              <span className="text-[#3B82F6] underline decoration-[#3B82F6] decoration-[3px] underline-offset-[3px] sm:decoration-4 sm:underline-offset-[5px] lg:underline-offset-[7px]">워드(DOCX), 한글(HWPX),PDF</span>로도
              <br />
              바로 다운가능!
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 break-keep text-[14px] font-medium leading-[1.55] text-gray-600 sm:mt-4 sm:text-[15px] sm:leading-[1.7]">
              폰트·여백·표지 양식까지 조판된 파일이라,
              <br />
              <strong className="text-[#1E3A8A] font-bold">받아서 바로 인쇄하고 편집</strong>합니다.
            </p>
          </Reveal>

          <Stagger className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-col sm:gap-3 sm:border-l-[3px] sm:border-[#BFDBFE] sm:pl-6" delay={0.25}>
            {[
              { k: "100% 편집 가능", v: "로고 삽입·문항 수정 자유" },
              { k: "워드 · 한글 · PDF 출력", v: "워드 안정 지원 · 한글(HWPX) 베타 · 인쇄(PDF)" },
              { k: "자동 조판 시스템", v: "웹 미리보기와 1:1 완성형 조판" },
              { k: "정답 및 해설지 동시 생성", v: "학생용·강사용 해설지 분리 생성" },
            ].map((row) => (
              <Item key={row.k} className={`flex flex-col gap-0.5 rounded-xl border border-blue-100/80 bg-white/65 px-3 py-2 sm:gap-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0${row.k === "100% 편집 가능" ? " lg:[@media(max-height:820px)]:hidden" : ""}`} y={18}>
                <div className="text-[12.5px] font-extrabold text-gray-900 sm:text-[15px]">{row.k}</div>
                <div className="hidden text-[13.5px] font-medium leading-[1.6] text-gray-600 sm:block">{row.v}</div>
              </Item>
            ))}
          </Stagger>
        </div>

        {/* PC: 실제 조판 데모(우) / 모바일·로드 전: 한글 창 목업 + 체험 버튼 */}
        <DemoGate
          minWidth="lg"
          fallback={<HwpWindowMock />}
          className="min-w-0 lg:order-2"
          mobileDemo={<Step4PaperMobileDemo />}
        >
          <Step4PaperDemo />
        </DemoGate>
      </div>
    </section>
  );
}

/** 기존 한글 편집기 창 목업 — 모바일(<lg)과 데모 로드 전 폴백으로 유지. */
function HwpWindowMock() {
  return (
        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex justify-center"
        >
          <div className="absolute -inset-6 rounded-full bg-blue-300/20 blur-[60px] sm:-inset-10 sm:blur-[80px]" />
          <div className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-300/80 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_30px_60px_-12px_rgba(59,130,246,0.25)] sm:max-w-[480px]">
            {/* 타이틀바 */}
            <div className="flex h-8 items-center justify-between border-b border-slate-200 bg-[#f7f8fa] px-3 sm:h-9">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-[4px] bg-[#2563eb] text-[9px] font-black text-white">한</span>
                <span className="truncate text-[11.5px] font-bold text-slate-700">실전모의고사_문제지.hwpx - 한글</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-400">
                <Minus className="size-3.5" />
                <Square className="size-2.5" />
                <X className="size-3.5" />
              </div>
            </div>
            {/* 메뉴바 */}
            <div className="flex h-6 items-center gap-3 border-b border-slate-200 bg-white px-3 text-[10.5px] font-semibold text-slate-600 sm:h-7 sm:gap-3.5 sm:px-3.5 sm:text-[11px]">
              {["파일", "편집", "보기", "입력", "서식", "쪽", "보안", "검토", "도구"].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
            {/* 서식 툴바 */}
            <div className="flex h-7 items-center gap-1.5 border-b border-slate-200 bg-[#fafbfc] px-3 sm:h-9">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="size-4 rounded bg-slate-200/80 sm:size-5" />
              ))}
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <span className="flex h-5 items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 sm:h-6 sm:px-2 sm:text-[10.5px]">함초롬바탕</span>
              <span className="flex h-5 items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 sm:h-6 sm:px-2 sm:text-[10.5px]">10.0 pt</span>
            </div>
            {/* 눈금자 */}
            <div
              className="hidden h-4 border-b border-slate-200 bg-white sm:block"
              style={{
                backgroundImage: "repeating-linear-gradient(to right, #cbd5e1 0 1px, transparent 1px 24px)",
                backgroundSize: "auto 7px",
                backgroundPosition: "14px bottom",
                backgroundRepeat: "repeat-x",
              }}
            />
            {/* 편집 캔버스 — 실제 모의고사 1페이지가 열려 있는 모습(아래는 창 밖으로 이어짐) */}
            <div className="flex h-[clamp(170px,calc(var(--landing-feature-screen,100svh)-450px),250px)] justify-center overflow-hidden bg-[#e9edf2] px-4 pt-3 sm:h-[clamp(300px,calc(100svh-470px),520px)] sm:px-6 sm:pt-5">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="w-full overflow-hidden bg-white"
                style={{
                  aspectRatio: "210 / 297",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.25), 0 0 0 1px rgba(15,23,42,0.04)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/samples/sample-mock-exam-page1.png"
                  alt="SMOAT가 생성한 실전 모의고사 문제지 1페이지 — 한글 파일로 열린 모습"
                  className="h-full w-full object-cover object-top"
                />
              </motion.div>
            </div>
            {/* 상태바 */}
            <div className="hidden h-6 items-center justify-between border-t border-slate-200 bg-[#f7f8fa] px-3 text-[10px] font-semibold text-slate-500 sm:flex">
              <span>1쪽 1단 1줄 1칸 · 삽입</span>
              <span>100%</span>
            </div>
          </div>
        </motion.div>
  );
}
