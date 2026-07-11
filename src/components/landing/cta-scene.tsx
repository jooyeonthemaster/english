"use client";

import Image from "next/image";
import Link from "next/link";
import { Item, Stagger } from "./shared/reveal";
import { BrandIcon } from "@/components/brand/brand-mark";

export function CtaScene() {
  return (
    <section
      className="relative w-full pb-14 sm:pb-20 overflow-hidden border-t border-gray-200 lg:flex lg:min-h-[100svh] lg:items-center lg:pt-24 lg:pb-8"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
      }}
    >
      <div className="w-full max-w-[1440px] mx-auto px-8 relative z-10">
        <Stagger
          className="flex flex-col items-center text-center pt-16 pb-10 sm:pt-20 sm:pb-12 lg:py-0"
          amount={0.25}
          gap={0.12}
        >
          <Item className="relative mb-6 h-[clamp(140px,24vw,300px)] w-full max-w-[920px] overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_24px_70px_-32px_rgba(15,23,42,0.35)] lg:h-[clamp(150px,calc(100svh-600px),300px)]">
            <Image
              src="/landing/generated/printed-output-stack-real-docs.webp"
              alt="SMOAT로 생성한 시험지, 학습지, 성적 리포트 출력물 예시"
              fill
              sizes="(max-width: 1024px) 100vw, 920px"
              className="object-cover"
            />
          </Item>

          <Item pop>
            <BrandIcon className="mb-6 size-14 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.3)]" />
          </Item>

          <Item><h2
            className="font-extrabold text-gray-900 tracking-tight max-w-4xl break-keep"
            style={{
              fontSize: "clamp(34px, 3.8vw, 56px)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              wordBreak: "keep-all",
            }}
          >
            가장 진보된 방식의
            <br />
            <span className="text-[#3B82F6]">영어 출제 시스템</span>
          </h2></Item>

          <Item><p className="mt-5 text-gray-600 text-[16px] sm:text-lg max-w-2xl leading-relaxed font-medium">
            분석부터 출제, 시험지, 리포트까지 — 모두 이곳에 있습니다.
          </p></Item>

          <Item className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4" pop>
            <Link
              href="/register"
              className="inline-flex items-center justify-center h-14 px-10 rounded-full bg-[#3B82F6] text-white font-bold shadow-[0_10px_20px_rgba(59,130,246,0.2)] hover:bg-[#2563EB] hover:scale-105 transition-all text-[16px]"
            >
              지금 바로 시작하기
              <span className="ml-2">→</span>
            </Link>
            <Link
              href="/credits/products"
              className="inline-flex items-center justify-center h-14 px-10 rounded-full border border-slate-300 bg-white text-slate-800 font-bold hover:border-blue-400 hover:text-blue-600 transition-all text-[16px]"
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
