"use client";

import Link from "next/link";
import { HERO_ANNOTATIONS } from "./shared/mock-data";
import { ANNOTATION_COLORS, ANNOTATION_LABEL } from "./shared/annotation-marks";

export function HeroScene() {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="relative w-full min-h-screen overflow-hidden bg-white flex items-center justify-center">
      {/* Atmospheric radial gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 w-[800px] h-[800px] rounded-full opacity-60"
        style={{
          background: "radial-gradient(circle at center, #DBEAFE 0%, rgba(219,234,254,0) 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 w-[800px] h-[800px] rounded-full opacity-50"
        style={{
          background: "radial-gradient(circle at center, #EFF6FF 0%, rgba(239,246,255,0) 60%)",
        }}
      />

      <style>{`
        @keyframes nara-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.45); opacity: 0.55; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nara-pulse-dot { animation: none !important; }
        }
      `}</style>

      {/* Top brand bar */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-10 lg:px-16 py-8">
        <div className="flex items-baseline gap-3">
          <span className="text-[20px] font-black tracking-tight text-gray-900">NARA</span>
          <span className="text-[11px] uppercase tracking-[0.25em] text-gray-400">
            Intelligent English Authoring
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-[13px] font-semibold text-gray-500">
          <a href="#section-annotation" className="hover:text-gray-900 transition">필기 기반 분석</a>
          <a href="#section-question" className="hover:text-gray-900 transition">출제 기반 생성</a>
          <a href="#section-exam" className="hover:text-gray-900 transition">Word 시험지</a>
          <a href="#section-folder" className="hover:text-gray-900 transition">파일 아카이브</a>
          <Link
            href="/login"
            className="px-5 py-2 rounded-full bg-gray-100 text-gray-900 text-[12px] font-bold hover:bg-gray-200 transition"
          >
            로그인
          </Link>
        </nav>
      </header>

      {/* Centered hero content */}
      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 lg:px-10 py-32 flex flex-col items-center text-center mt-10">
        
        {/* Provocative Headline */}
        <h1
          className="font-bold text-gray-900 tracking-tight leading-[1.15]"
          style={{
            fontSize: "clamp(32px, 5vw, 68px)",
            letterSpacing: "-0.02em",
          }}
        >
          아직도 AI한테 <span className="text-[#3B82F6] font-black">하나하나</span><br />
          지문 분석을 지시하고 계세요?
        </h1>

        {/* Subtitle / Problem Definition */}
        <p className="mt-8 text-[16px] lg:text-[18px] text-gray-600 leading-[1.8] max-w-3xl font-medium">
          기존의 텍스트 붙여넣기 방식은 틀렸습니다. 쓸데없는 결과만 내놓는 AI에 지치셨나요? <br className="hidden md:block"/>
          <strong className="text-gray-900 font-bold">이제는 완벽하게 다릅니다.</strong> NARA는 핵심 어휘, 반의어, 유의어 제시 및 핵심 출제 어휘 추출, <br className="hidden md:block"/>
          핵심 어법 구문 분석, 출제 포인트 분석 등 <strong className="text-gray-900 font-bold border-b-2 border-[#3B82F6] pb-0.5">모든 것을 자동으로 완벽하게</strong> 해줍니다.
        </p>

        {/* CTAs */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-14 px-10 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold text-[16px] shadow-[0_10px_30px_rgba(59,130,246,0.3)] transition-all hover:scale-105"
          >
            지금 무료로 가입하기 →
          </Link>
        </div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] tracking-[0.4em] uppercase text-gray-400 font-bold animate-bounce">
        scroll down
      </div>
    </section>
  );
}
