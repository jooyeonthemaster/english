"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import type { ViewablePassage } from "@/lib/tutor/visibility";
import { cn } from "@/lib/utils";

// 원문 가시성 정책에 따른 표시. hidden_hintable은 '원문 보기(감점)' 버튼으로만 열람.
export function PassageStrip({
  title,
  viewable,
  onReveal,
}: {
  title: string;
  viewable: ViewablePassage;
  onReveal?: () => void; // 힌트성 열람 시 상위에 보고(감점 기록)
}) {
  const [expanded, setExpanded] = useState(!viewable.collapsed && viewable.content !== null);
  const [revealed, setRevealed] = useState(false);

  const hasContent = viewable.content !== null;
  const showBody = hasContent && (expanded || (!viewable.collapsed && !viewable.hintable));

  function toggle() {
    if (!hasContent && viewable.hintable && !revealed) {
      setRevealed(true);
      setExpanded(true);
      onReveal?.();
      return;
    }
    setExpanded((value) => !value);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wide text-slate-400">PASSAGE</p>
          <p className="line-clamp-1 text-[12.5px] font-bold text-slate-900">{title}</p>
        </div>
        {hasContent ? (
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-bold text-slate-600 active:bg-slate-200"
          >
            {showBody ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showBody ? "가리기" : "원문 보기"}
          </button>
        ) : viewable.hintable && !revealed ? (
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2.5 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100 active:bg-blue-100"
          >
            <Eye className="size-3.5" />
            원문 보기 (힌트·감점)
          </button>
        ) : !viewable.hintable ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[11px] font-bold text-slate-400">
            <Lock className="size-3.5" />
            암기 모드
          </span>
        ) : null}
      </div>

      {showBody && viewable.content ? (
        <p className="max-h-44 overflow-y-auto whitespace-pre-wrap border-l-2 border-slate-100 pl-3 font-mono text-[12.5px] font-medium leading-6 text-slate-700">
          {viewable.content}
        </p>
      ) : (
        <p className="border-l-2 border-dashed border-slate-200 pl-3 text-[11.5px] font-medium leading-6 text-slate-400">
          {viewable.hintable
            ? "원문을 가리고 단서로 풀어보세요. 필요하면 위에서 원문을 열 수 있어요(감점)."
            : "원문을 가리고 기억으로 풀어보는 모드입니다."}
        </p>
      )}
    </section>
  );
}
