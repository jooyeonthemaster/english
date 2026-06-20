"use client";

// ============================================================================
// 문제 수정 뷰 토글 — "AI 수정" ↔ "직접 수정"
// ============================================================================
// AI 수정 뷰(AiEditView)와 직접 수정 헤더(EditHeader) 양쪽에서 동일한 마크업·동일한
// 위치(타이틀 바로 옆)로 렌더해, 어느 뷰에 있든 같은 컨트롤로 전환하게 한다(재학습 불필요).
// 디자인은 시험지 편집 패널 탭과 동일: grid 2분할 + 슬라이드 인디케이터.
// ============================================================================

import { Bot, Pencil } from "lucide-react";

interface Props {
  /** 현재 활성 뷰. */
  active: "ai" | "manual";
  /** "AI 수정" 선택. */
  onAi: () => void;
  /** "직접 수정" 선택. */
  onManual: () => void;
}

export function EditViewToggle({ active, onAi, onManual }: Props) {
  const isAi = active === "ai";
  return (
    <div
      role="tablist"
      aria-label="문제 수정 방식"
      className="relative grid grid-cols-2 overflow-hidden rounded-md border border-blue-200 bg-white p-1"
    >
      {/* 슬라이드 인디케이터 — 선택된 탭으로 이동 */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded bg-blue-600 shadow-sm shadow-blue-600/20 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isAi ? "translate-x-0" : "translate-x-full"
        }`}
      />
      <button
        type="button"
        role="tab"
        aria-selected={isAi}
        onClick={isAi ? undefined : onAi}
        className={`relative z-10 flex h-8 items-center justify-center gap-1.5 rounded px-2 text-[12px] font-black transition-colors duration-200 ${
          isAi ? "text-white" : "text-blue-700 hover:text-blue-900"
        }`}
      >
        <Bot className="h-3.5 w-3.5" />
        AI 수정
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!isAi}
        onClick={isAi ? onManual : undefined}
        className={`relative z-10 flex h-8 items-center justify-center gap-1.5 rounded px-2 text-[12px] font-black transition-colors duration-200 ${
          !isAi ? "text-white" : "text-blue-700 hover:text-blue-900"
        }`}
      >
        <Pencil className="h-3.5 w-3.5" />
        직접 수정
      </button>
    </div>
  );
}
