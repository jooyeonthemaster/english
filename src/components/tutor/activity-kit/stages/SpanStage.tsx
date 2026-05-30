"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpanStageProps } from "../types";

// SPAN: 원문 토큰을 탭해 어법 오류 구간을 선택. 처음 탭=기준점, 다음 탭=범위 끝.
export function SpanStage({ payload, disabled, onResponse }: SpanStageProps) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const [span, setSpan] = useState<[number, number] | null>(null);
  useEffect(() => {
    onResponse(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tap(index: number) {
    if (disabled) return;
    if (anchor === null) {
      setAnchor(index);
      const next: [number, number] = [index, index];
      setSpan(next);
      onResponse({ span: next }, true);
      return;
    }
    const next: [number, number] = [Math.min(anchor, index), Math.max(anchor, index)];
    setSpan(next);
    onResponse({ span: next }, true);
  }
  function reset() {
    if (disabled) return;
    setAnchor(null);
    setSpan(null);
    onResponse(null, false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-wide text-blue-600">어법상 틀린 구간을 탭하세요</p>
        {span && (
          <button
            type="button"
            onClick={reset}
            disabled={disabled}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-slate-100 px-2 text-[10px] font-bold text-slate-500 active:bg-slate-200"
          >
            <RotateCcw className="size-3" />
            다시 선택
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-l-2 border-slate-200 pl-3 leading-8">
        {payload.spanTokens.map((token, index) => {
          const inSpan = span !== null && index >= span[0] && index <= span[1];
          return (
            <button
              key={`${token}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() => tap(index)}
              className={cn(
                "rounded-md px-1.5 py-0.5 font-mono text-[13px] font-medium transition",
                inSpan ? "bg-blue-600 text-white" : "text-slate-800 active:bg-blue-50",
              )}
            >
              {token}
            </button>
          );
        })}
      </div>
    </div>
  );
}
