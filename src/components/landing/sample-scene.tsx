"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Reveal } from "./shared/reveal";

const SAMPLES: Array<{
  file: string;
  thumb: string;
  eyebrow: string;
  title: string;
  meta: string;
  description: string;
  tags: string[];
}> = [
  {
    file: "/landing/samples/sample-mock-exam.pdf",
    thumb: "/landing/samples/sample-mock-exam-thumb.png",
    eyebrow: "MOCK EXAM",
    title: "실전 모의고사 문제지",
    meta: "독해 28문항 (18~45번) · 7쪽",
    description:
      "수능 독해 전 유형을 실전 구성 그대로 — 이대로 인쇄해 쓸 수 있습니다.",
    tags: ["수능 실전 구성", "전 유형 출제", "2단 조판"],
  },
  {
    file: "/landing/samples/sample-analysis-worksheet.pdf",
    thumb: "/landing/samples/sample-analysis-worksheet-thumb.png",
    eyebrow: "PASSAGE ANALYSIS",
    title: "심층 지문 분석 학습지",
    meta: "지문 분석 + 실전 학습지 · 22쪽",
    description:
      "지문 한 편을 해석·구조·어법·어휘·실전 학습지까지 한 권으로 완성했습니다.",
    tags: ["문장별 직독직해", "논리 구조 분석", "실전 학습지"],
  },
];

export function SampleScene() {
  return (
    <section
      id="samples"
      className="relative w-full border-t border-blue-100/50 bg-[#F8FAFC] py-8 sm:py-12 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-28 lg:pb-10"
    >
      <div className="w-full px-6 lg:px-16 max-w-[1480px] mx-auto">
        <div className="mb-5 max-w-[900px] text-center mx-auto sm:mb-6">
          <Reveal className="text-[12px] uppercase tracking-[0.2em] text-[#3B82F6] font-bold mb-3 justify-center flex items-center gap-3 sm:mb-4 sm:text-[13px] sm:tracking-[0.25em]" y={16}>
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
            실제 결과물 샘플
            <span className="h-[2px] w-7 bg-[#3B82F6] sm:w-8" />
          </Reveal>
          <Reveal delay={0.08}>
            <h2
              className="font-extrabold text-gray-900 leading-[1.2] break-keep"
              style={{ fontSize: "clamp(24px, 2.8vw, 38px)", letterSpacing: "-0.02em", wordBreak: "keep-all" }}
            >
              말로만 설명하지 않겠습니다.
              <br />
              직접 <span className="text-[#3B82F6] underline decoration-[#3B82F6] decoration-4 underline-offset-[3px] sm:underline-offset-[5px] lg:underline-offset-[7px]">SMOAT AI의 우수한 품질</span>을
              <br />
              확인해보세요.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-4 text-[15px] text-gray-600 leading-[1.7] font-medium max-w-2xl mx-auto break-keep">
              SMOAT가 실제로 생성한 두 자료입니다.
              <br className="lg:hidden" /> 직접 열어 보고 품질로 판단하세요.
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {SAMPLES.map((sample, i) => (
            <motion.article
              key={sample.file}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_20px_60px_-15px_rgba(59,130,246,0.08)]"
            >
              {/* First-page preview */}
              <a
                href={sample.file}
                target="_blank"
                rel="noopener"
                aria-label={`${sample.title} 브라우저 미리보기`}
                className="relative block h-[82px] overflow-hidden border-b border-blue-50 bg-slate-100 sm:h-[clamp(80px,calc(100svh-720px),150px)]"
              >
                <Image
                  src={sample.thumb}
                  alt={`${sample.title} 첫 페이지 미리보기`}
                  fill
                  sizes="(max-width: 768px) 100vw, 480px"
                  className="object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                />
                <span className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/90 to-transparent" />
                <span className="absolute bottom-2 right-2 hidden items-center gap-1.5 rounded-full bg-slate-950/80 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur sm:inline-flex sm:bottom-3 sm:right-3 sm:px-3 sm:py-1.5 sm:text-[11px]">
                  <ExternalLink className="size-3" />
                  클릭해서 전체 보기
                </span>
              </a>

              {/* Card body */}
              <div className="flex flex-1 flex-col p-3.5 sm:p-4">
                <div className="hidden text-[11px] uppercase tracking-[0.2em] text-blue-500 font-extrabold sm:block">
                  {sample.eyebrow}
                </div>
                <h3 className="text-center text-[18px] font-extrabold text-gray-900 sm:mt-1 sm:text-left">{sample.title}</h3>
                <div className="mt-1 hidden items-center gap-1.5 text-[13px] font-bold text-slate-400 sm:flex">
                  <FileText className="size-3.5" />
                  {sample.meta}
                </div>
                <p className="mt-2 hidden text-[13.5px] leading-[1.65] text-gray-600 font-medium break-keep sm:block lg:[@media(max-height:800px)]:hidden">
                  {sample.description}
                </p>
                <div className="mt-2 hidden flex-wrap gap-2 sm:flex">
                  {sample.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-blue-100 bg-blue-50/60 px-2.5 py-1 text-[11px] font-bold text-blue-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex gap-2 pt-1 sm:mt-4 sm:gap-3">
                  <a
                    href={sample.file}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#3B82F6] px-3 text-[12.5px] font-black text-white shadow-[0_10px_20px_rgba(59,130,246,0.2)] transition hover:bg-[#2563EB] sm:h-11 sm:gap-2 sm:px-4 sm:text-[13.5px]"
                  >
                    <ExternalLink className="size-4" />
                    브라우저 미리보기
                  </a>
                  <a
                    href={sample.file}
                    download
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-[12.5px] font-black text-slate-800 transition hover:border-blue-400 hover:text-blue-600 sm:h-11 sm:gap-2 sm:px-4 sm:text-[13.5px]"
                  >
                    <Download className="size-4" />
                    PDF 다운로드
                  </a>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        <p className="mt-3 hidden text-center text-[12.5px] font-medium text-slate-400 sm:block lg:[@media(max-height:860px)]:hidden">
          학습 목적으로 제작된 샘플 자료입니다 · 회원가입 없이 열람할 수 있습니다
        </p>
      </div>
    </section>
  );
}
