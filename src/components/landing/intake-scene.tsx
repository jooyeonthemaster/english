"use client";

import { useRef } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, Camera, FileText, ScanText, Sparkles } from "lucide-react";
import { Item, Reveal, Stagger } from "./shared/reveal";
import { DemoGate } from "./demo/demo-gate";

// 인터랙티브 크롭 데모 — PC(≥lg)에서 뷰포트 근접 시에만 청크 로드(ssr:false).
// 모바일은 아래 UploadMock(기존 목업)이 그대로 유지된다.
const Step1CropDemo = dynamic(
  () => import("./demo/step1-crop/step1-crop-demo"),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-2xl border border-blue-100 bg-slate-50"
        style={{ height: "max(400px, calc(100svh - 270px))" }}
      />
    ),
  },
);

const EXTRACT_LINES = [
  { text: "In the digital age, attention has become the most", restored: false },
  { text: "valuable currency. Every notification, every scroll,", restored: false },
  { text: "every swipe demands a fragment of our consciousness,", restored: false },
  { text: "and what we choose to engage with shapes the", restored: true },
  { text: "architecture of our thinking.", restored: true },
];

export function IntakeScene() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section
      ref={ref}
      id="intake"
      className="relative w-full border-t border-blue-50 bg-white py-7 sm:py-10 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10"
    >
      {/* PC(≥lg): 카피(좌) | 데모(우) 한 화면 배치. 모바일은 세로 스택 그대로. */}
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-1 items-center gap-5 px-5 sm:gap-8 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8 lg:px-16">
        {/* Left — copy */}
        <div className="max-w-[600px]">
          <Reveal className="mb-2 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.2em] text-[#3B82F6] sm:mb-4 sm:text-[13px] sm:tracking-[0.25em] justify-center lg:justify-start" y={16}>
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
            Feature · 자료 추출
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8 lg:hidden" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="text-[25px] font-extrabold leading-[1.18] text-gray-900 sm:text-[30px] sm:leading-[1.25] lg:text-[34px] lg:leading-[1.3]"
              style={{ wordBreak: "keep-all" }}
            >
              교재를 찍어 올리면,
              <br />
              <span className="text-[#3B82F6] underline decoration-[#3B82F6] decoration-[3px] underline-offset-[3px] sm:decoration-4 sm:underline-offset-[5px] lg:underline-offset-[7px]">지문이 텍스트로</span> 들어옵니다.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-3 break-keep text-[14px] font-medium leading-[1.55] text-gray-600 sm:mt-4 sm:text-[15px] sm:leading-[1.7]">
              사진·PDF만 올리면 지문 추출부터{" "}
              <strong className="text-gray-900 font-bold">잘린 문장 복원</strong>까지 자동입니다.
            </p>
          </Reveal>

          <Stagger className="mt-3 grid grid-cols-3 gap-2 sm:mt-6 sm:flex sm:flex-col sm:gap-4 sm:border-l-[3px] sm:border-[#BFDBFE] sm:pl-6" delay={0.25}>
            {[
              { k: "사진 · PDF 자동 추출", v: "휴대폰으로 찍은 교재 사진도 OK" },
              { k: "잘린 지문 AI 복원", v: "페이지 경계에서 끊긴 문장 자동 복원" },
              { k: "텍스트 추출은 무료", v: "OCR에는 크레딧이 들지 않습니다" },
            ].map((row) => (
              <Item key={row.k} className="flex min-h-[52px] flex-col justify-center rounded-xl border border-blue-100 bg-blue-50/45 px-2.5 py-2 sm:min-h-0 sm:justify-start sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0" y={18}>
                <div className="text-center text-[11.5px] font-extrabold leading-tight text-gray-900 sm:text-left sm:text-[15px] sm:tracking-wide">{row.k}</div>
                <div className="hidden text-[13.5px] font-medium leading-[1.6] text-gray-600 sm:block">{row.v}</div>
              </Item>
            ))}
          </Stagger>
        </div>

        {/* Right — PC: 실제 크롭보드 데모 / 모바일·로드 전: 기존 업로드→추출 목업 */}
        <DemoGate
          minWidth="lg"
          fallback={<UploadMock />}
          className="min-w-0"
          mobileDemo={<Step1CropDemo />}
        >
          <Step1CropDemo />
        </DemoGate>
      </div>
    </section>
  );
}

/** 기존 업로드→추출 목업 — 모바일(<lg)과 데모 로드 전 폴백으로 유지. */
function UploadMock() {
  return (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="absolute -inset-6 rounded-full bg-blue-300/15 blur-[56px] sm:-inset-10 sm:blur-[80px]" />

          <div className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch sm:gap-4">
            {/* Source card */}
            <div className="relative flex flex-col rounded-2xl border border-blue-100 bg-[#F8FAFC] p-4 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)] sm:p-5">
              {/* 업로드한 자료 → 추출된 지문 연결 화살표. 모바일(세로 배치)=아래로,
                  PC(가로 배치)=오른쪽으로. 카드 경계 사이 여백 중앙에 얹는다. */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 bottom-0 z-20 -translate-x-1/2 translate-y-1/2 sm:left-auto sm:bottom-auto sm:right-0 sm:top-1/2 sm:translate-x-1/2 sm:-translate-y-1/2"
              >
                <span className="flex size-7 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-600 shadow-[0_8px_20px_-8px_rgba(59,130,246,0.6)] sm:size-8">
                  <ArrowDown className="size-3.5 sm:hidden" strokeWidth={2.5} />
                  <ArrowRight className="hidden size-4 sm:block" strokeWidth={2.5} />
                </span>
              </div>
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <span className="flex items-center gap-2 text-[12px] font-black text-slate-950">
                  <Camera className="size-4 text-blue-600" />
                  업로드한 자료
                </span>
                <span className="rounded-full bg-white border border-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">
                  교재_p.142.jpg
                </span>
              </div>
              <div className="flex flex-1 gap-3 sm:gap-4">
                <div className="relative aspect-[2/3] w-20 shrink-0 self-start overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:w-28">
                  <Image
                    src="/landing/generated/uploaded-exam-photo.webp"
                    alt="휴대폰으로 촬영한 영어 시험지 업로드 예시"
                    fill
                    sizes="112px"
                    className="object-cover object-top"
                  />
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/80 to-transparent" />
                </div>
                <div className="min-w-0 flex-1 self-center">
                  <div className="flex items-center gap-2 text-[12px] font-black text-blue-700">
                    <ScanText className="size-4" />
                    텍스트 추출 중
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                    <motion.div
                      className="h-full rounded-full bg-blue-500"
                      initial={{ width: "8%" }}
                      whileInView={{ width: "100%" }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={{ duration: 1.6, ease: "easeInOut", delay: 0.3 }}
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold text-slate-400 sm:mt-2">OCR 텍스트 추출 · 무료</div>
                </div>
              </div>
            </div>

            {/* Extracted text card */}
            <div className="flex flex-col rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)] sm:p-5">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <span className="flex items-center gap-2 text-[12px] font-black text-slate-950">
                  <FileText className="size-4 text-blue-600" />
                  추출된 지문
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
                  <Sparkles className="size-3" />
                  잘린 문장 AI 복원
                </span>
              </div>
              <p className="line-clamp-4 font-serif text-[12.5px] leading-[1.65] text-gray-800 sm:line-clamp-none sm:text-[13px] sm:leading-[1.85]">
                {EXTRACT_LINES.slice(0, 4).map((line, i) => (
                  <motion.span
                    key={line.text}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ delay: 0.5 + i * 0.18, duration: 0.35 }}
                    className={line.restored ? "rounded bg-blue-50 px-0.5" : undefined}
                  >
                    {line.text}{" "}
                  </motion.span>
                ))}
              </p>
            </div>
          </div>
        </motion.div>
  );
}
