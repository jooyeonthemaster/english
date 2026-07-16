"use client";

import Image from "next/image";
import Link from "next/link";
import { Item, Stagger } from "./shared/reveal";
import { BrandIcon } from "@/components/brand/brand-mark";
import { GRID_DARK, SceneGlow } from "./shared/scene-ui";

export function CtaScene() {
  return (
    <section className="relative w-full overflow-hidden bg-[radial-gradient(120%_120%_at_50%_0%,#1B2A4A,#0B1220_62%)] pb-14 sm:pb-20 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-24 lg:pb-8">
      <div aria-hidden className={`absolute inset-0 ${GRID_DARK}`} />
      <SceneGlow className="top-0 h-[400px] w-[760px]" />
      <div className="w-full max-w-[1440px] mx-auto px-8 relative z-10">
        <Stagger
          className="flex flex-col items-center text-center pt-16 pb-10 sm:pt-20 sm:pb-12 lg:py-0"
          amount={0.25}
          gap={0.12}
        >
          <Item className="relative mb-6 h-[clamp(140px,24vw,300px)] w-full max-w-[920px] overflow-hidden rounded-2xl border border-blue-300/20 bg-[#071426] shadow-[0_30px_90px_-34px_rgba(37,99,235,0.7)] lg:h-[clamp(150px,calc(100svh-600px),300px)]">
            <Image
              src="/landing/generated/ai-english-system-hero-v5.png"
              alt="알파벳과 영어 시험지가 분석되어 정돈된 문항으로 생성되는 과정"
              fill
              sizes="(max-width: 1024px) 100vw, 920px"
              className="object-cover"
            />
          </Item>

          <Item pop>
            <BrandIcon className="mb-6 size-14 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.3)]" />
          </Item>

          <Item><h2
            className="font-black text-white tracking-tight max-w-4xl break-keep"
            style={{
              fontSize: "clamp(34px, 3.8vw, 56px)",
              lineHeight: 1.16,
              letterSpacing: "-0.03em",
              wordBreak: "keep-all",
            }}
          >
            가장 진보된 방식의
            <br />
            <span className="bg-gradient-to-r from-[#7DB0FF] to-[#3B82F6] bg-clip-text text-transparent">영어 출제 시스템</span>
          </h2></Item>

          <Item><p className="mt-5 text-[#B6C2D9] text-[16px] sm:text-lg max-w-2xl leading-relaxed font-medium">
            분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다.
          </p></Item>

          <Item className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4" pop>
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-14 px-10 rounded-full bg-blue-500 text-white font-extrabold shadow-[0_18px_40px_-14px_rgba(59,130,246,0.85)] hover:bg-blue-400 hover:-translate-y-0.5 transition-all text-[16px]"
            >
              지금 바로 시작하기
              <span className="ml-2">→</span>
            </Link>
            <Link
              href="/credits/products"
              className="inline-flex items-center justify-center h-14 px-10 rounded-full border border-white/[0.28] bg-white/[0.12] text-white font-extrabold hover:border-white/50 hover:bg-white/20 transition-all text-[16px]"
            >
              가격 보기
              <span className="ml-2">→</span>
            </Link>
          </Item>
        </Stagger>

      </div>
    </section>
  );
}
