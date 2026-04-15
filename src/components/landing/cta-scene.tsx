"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function CtaScene() {
  return (
    <section
      className="relative w-full min-h-[80vh] pb-32 overflow-hidden border-t border-gray-200"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center opacity-40 pointer-events-none">
         <div className="w-[800px] h-[800px] bg-blue-100 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-[1440px] mx-auto px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center text-center pt-32 pb-16"
        >
          <div
            aria-hidden
            className="w-20 h-20 bg-[#3B82F6] text-white rounded-3xl flex items-center justify-center font-black text-3xl mb-12 shadow-[0_10px_30px_rgba(59,130,246,0.3)]"
          >
            N
          </div>

          <h2
            className="font-extrabold text-gray-900 tracking-tight max-w-4xl"
            style={{
              fontSize: "clamp(40px, 5vw, 76px)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
            }}
          >
            가장 진보된 방식의 <br />
            <span className="text-[#3B82F6]">영어 출제 시스템</span>
          </h2>

          <p className="mt-8 text-gray-600 text-lg max-w-2xl leading-relaxed font-medium">
            지문을 딥다이브하는 AI도, 19개 유형을 즉시 뽑는 엔진도, <br />
            Word 시험지를 조판하는 자동화 도구도 — 모두 이곳에 있습니다.
          </p>

          <div className="mt-14 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="#apply"
              className="inline-flex items-center justify-center h-14 px-10 rounded-full bg-[#3B82F6] text-white font-bold shadow-[0_10px_20px_rgba(59,130,246,0.2)] hover:bg-[#2563EB] hover:scale-105 transition-all text-[16px]"
            >
              지금 바로 시작하기
              <span className="ml-2">→</span>
            </Link>
          </div>
        </motion.div>

        <div className="border-t border-gray-200 my-16 max-w-5xl mx-auto" />

        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-baseline gap-3">
            <span className="text-gray-900 font-black text-base tracking-widest">
              NARA
            </span>
            <span className="text-gray-500 text-sm font-bold">
              Intelligent English Authoring
            </span>
          </div>
          <div className="text-gray-400 text-xs flex items-center gap-3 font-medium">
            <span>© 2026</span>
            <span aria-hidden>·</span>
            <a href="mailto:support@nara.team" className="hover:text-gray-900 transition">
              support@nara.team
            </a>
            <span aria-hidden>·</span>
            <Link href="/terms" className="hover:text-gray-900 transition">
              이용약관
            </Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-gray-900 transition">
              개인정보처리방침
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
