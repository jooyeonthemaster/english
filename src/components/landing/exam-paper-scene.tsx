"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { EXAM_QUESTIONS } from "./shared/mock-data";

export function ExamPaperScene() {
  const ref = useRef<HTMLElement>(null);

  return (
    <section ref={ref} id="paper" className="relative w-full min-h-screen bg-[#EFF6FF] py-24 lg:py-32 overflow-hidden border-t border-blue-100">
      <div className="px-6 lg:px-16 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        
        {/* Left — A4 paper (White) */}
        <motion.div className="relative flex justify-center">
          <div className="absolute -inset-10 bg-blue-300/20 blur-[80px] rounded-full" />
          <div className="bg-white relative z-10 w-full max-w-[560px]" style={{ aspectRatio: "210 / 297", boxShadow: "0 0 0 1px rgba(59,130,246,0.1), 0 30px 60px -10px rgba(59,130,246,0.15)", padding: "48px 42px", borderRadius: "4px" }}>
            <div className="border-b-[3px] border-[#1E3A8A] pb-3 mb-6">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[12px] tracking-[0.2em] uppercase text-blue-500 font-extrabold">Mid-term Exam</div>
                  <div className="text-[18px] font-black text-[#1E3A8A] mt-1">2026학년도 1학기 내신 대비 모의고사</div>
                </div>
                <div className="text-right text-[12px] text-blue-800 font-bold">OO고등학교 3학년<br />영어 · 60분</div>
              </div>
            </div>
            <div className="space-y-8">
              {EXAM_QUESTIONS.slice(0, 3).map((q, i) => (
                <motion.div key={q.no} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-[15px] font-black text-[#1E3A8A]">{q.no}.</span>
                    <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded font-bold bg-[#DBEAFE] text-[#1E3A8A]">{q.type}</span>
                  </div>
                  <div className="text-[13.5px] text-gray-900 whitespace-pre-line pl-6 font-serif leading-[1.8] font-medium">{q.stem}</div>
                </motion.div>
              ))}
              <div className="pl-6 mt-10 opacity-40">
                <div className="h-3 w-full bg-blue-100 rounded mb-3" />
                <div className="h-3 w-3/4 bg-blue-100 rounded" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right — copy */}
        <div className="max-w-[600px]">
          <div className="text-[13px] uppercase tracking-[0.25em] text-[#3B82F6] font-bold mb-4 flex items-center gap-3">
            <span className="w-8 h-[2px] bg-[#3B82F6]" />
            Step 3. 1초만에 워드 시험지로
          </div>
          <h2 className="font-extrabold text-gray-900 leading-[1.3]" style={{ fontSize: "clamp(24px, 3.5vw, 44px)", letterSpacing: "-0.02em", wordBreak: "keep-all" }}>
            웹에서 보고 끝? 생성된 모든 문제는 <span className="text-[#3B82F6] border-b-4 border-[#3B82F6] pb-1">실제 편집 가능한 Word 파일</span>로 떨어집니다.
          </h2>
          <p className="mt-8 text-[17px] text-gray-600 leading-[1.8] font-medium">
            아무리 문제가 좋아도 결국 학원 포맷에 맞춰 편집해야 한다면 반쪽짜리입니다. <br/>
            영신ai는 생성된 모든 문항을 폰트, 여백, 문항 간격, 표지 양식까지 완벽하게 조판하여
            <strong className="text-[#1E3A8A] font-bold"> 즉시 인쇄하고 편집할 수 있는 Word(.docx) 파일 형태로 제공</strong>합니다.
          </p>

          <div className="mt-12 flex flex-col gap-6 border-l-[3px] border-[#BFDBFE] pl-6">
            {[
              { k: "100% 편집 가능", v: "이미지나 PDF가 아닌 Word 포맷으로 제공되어 학원 로고를 넣거나 문항을 미세 조정할 수 있습니다." },
              { k: "자동 조판 시스템", v: "학교별 맞춤 폰트와 간격 규격을 학습하여 손댈 곳 없는 완성형 시험지를 출력합니다." },
              { k: "정답 및 해설지 동시 생성", v: "학생용 시험지뿐만 아니라 강사용 상세 해설지까지 분리된 파일로 원클릭 생성됩니다." },
            ].map((row) => (
              <div key={row.k} className="flex flex-col gap-1.5">
                <div className="text-[16px] text-gray-900 font-extrabold tracking-wide">{row.k}</div>
                <div className="text-[15px] text-gray-600 leading-[1.6] font-medium">{row.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
