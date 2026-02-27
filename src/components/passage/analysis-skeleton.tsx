"use client";

import { Sparkles } from "lucide-react";

export function AnalysisSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 py-8">
      {/* Loading header */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-[#F1F8E9] animate-pulse-ring">
          <Sparkles className="size-5 text-[#7CB342]" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-[14px] font-semibold tracking-[-0.025em] text-[#343B2E]">
            AI가 지문을 분석하고 있습니다
          </p>
          <p className="text-[12px] text-[#9CA396]">
            문장 번역, 어휘, 문법 포인트를 추출 중...
          </p>
        </div>
      </div>

      {/* Skeleton sentence blocks */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-[#FAFBF8] p-4 shadow-card"
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <div className="flex gap-3">
            <div className="mt-0.5 h-4 w-4 rounded bg-[#F3F4F0] animate-shimmer" />
            <div className="flex-1 space-y-2">
              <div
                className="h-4 rounded bg-[#F3F4F0] animate-shimmer"
                style={{ width: `${85 - i * 8}%` }}
              />
              <div
                className="h-4 rounded bg-[#F3F4F0] animate-shimmer"
                style={{ width: `${65 - i * 5}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
