"use client";

// ============================================================================
// md-stream 실시간 미리보기 패널 — 로딩 카드의 metaSlot 에 들어간다.
// 생성 중 카드를 그리는 표면이 두 곳(BottomQueueSection 큐 카드, EmbeddedQuestionBank
// 의 QueueStripCard)이라 공유 컴포넌트로 분리한다 — 한쪽에만 달려 있으면
// 사용자가 보는 화면에 따라 스트리밍이 "안 되는" 것처럼 보인다(26-07-21 실사고).
// ============================================================================

import { useEffect, useState } from "react";

/**
 * 미리보기 프레임 계약 — 문제 생성(md-stream)과 학습지 분석(passage-analysis
 * SSE)이 공유한다. stage 는 분석처럼 여러 단계를 도는 생성에서만 채운다.
 */
export interface StreamPreview {
  phase: "thinking" | "generating";
  startedAt: number;
  outputStartedAt?: number;
  tail: string;
  /** "전체 초안" / "어휘" / "실전 워크북" 등 — 있으면 헤더에 표시 */
  stage?: string;
}

/**
 * 고정 높이(헤더 1줄 + 본문 64px) + overflow hidden + 하단 정렬이라 텍스트가
 * 아무리 흘러도 카드 레이아웃이 절대 밀리지 않는다(CLS 0). 위쪽 페이드 마스크로
 * 오래된 줄이 부드럽게 사라지는, 위로 흐르는 콘솔 미학.
 */
export function StreamPreviewPane({ preview }: { preview: StreamPreview }) {
  // 250ms 로컬 틱 — 토큰 공백(사고 정체) 구간에도 초 카운터가 멈추지 않게 한다.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => forceTick((v) => v + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const thinking = preview.phase === "thinking";
  const thinkSec = Math.max(
    0,
    ((preview.outputStartedAt ?? Date.now()) - preview.startedAt) / 1000,
  );
  const genSec = preview.outputStartedAt
    ? Math.max(0, (Date.now() - preview.outputStartedAt) / 1000)
    : 0;
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900/90 shadow-inner">
      <div className="flex items-center gap-1.5 px-2 pt-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-tight tabular-nums ${
            thinking
              ? "bg-violet-500/20 text-violet-300"
              : "bg-emerald-500/20 text-emerald-300"
          }`}
        >
          <span
            className={`size-1 animate-pulse rounded-full ${
              thinking ? "bg-violet-400" : "bg-emerald-400"
            }`}
          />
          {thinking ? `사고 중 ${thinkSec.toFixed(0)}s` : `작성 중 ${genSec.toFixed(0)}s`}
        </span>
        {!thinking && (
          <span className="text-[9px] font-medium tabular-nums text-slate-500">
            사고 {thinkSec.toFixed(0)}s
          </span>
        )}
        {preview.stage && (
          <span className="ml-auto truncate text-[9px] font-semibold text-slate-400">
            {preview.stage}
          </span>
        )}
      </div>
      <div className="h-[64px] overflow-hidden px-2 pb-1.5 [mask-image:linear-gradient(to_bottom,transparent,black_16px)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_16px)]">
        <p className="flex h-full flex-col justify-end whitespace-pre-wrap break-all font-mono text-[9.5px] leading-[13px] text-slate-300/90">
          {preview.tail}
        </p>
      </div>
    </div>
  );
}
