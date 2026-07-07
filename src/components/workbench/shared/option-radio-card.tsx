"use client";

// ============================================================================
// 범용 라디오 옵션 카드 — 학습지 생성(passage-input-stack)의 "학습지 구성"
// 선택 카드 마크업을 그대로 공용화한 것. 라디오닷 + 제목 + (선택) 우측 뱃지 +
// 설명 구조로, 학습지 생성과 시험 리포트가 동일 룩의 선택 카드를 공유한다.
// 부모는 role="radiogroup" 컨테이너(grid grid-cols-1 gap-2 sm:grid-cols-2)로
// 감싸 쓰는 것을 권장한다.
// ============================================================================

import type { ReactNode } from "react";

interface OptionRadioCardProps {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  /** 우측 소형 뱃지(예: "지문당 ◈4") — 텍스트/노드 모두 허용 */
  badge?: ReactNode;
  disabled?: boolean;
}

export function OptionRadioCard({
  checked,
  onSelect,
  title,
  description,
  badge,
  disabled,
}: OptionRadioCardProps) {
  return (
    <div
      role="radio"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled) onSelect();
        }
      }}
      className={`group flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2.5 transition-all ${
        checked
          ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-200"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        {/* 라디오닷 — 선택 시 파란 원 안에 흰 점 */}
        <span
          aria-hidden="true"
          className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            checked
              ? "border-blue-500 bg-blue-500"
              : "border-slate-300 bg-white group-hover:border-slate-400"
          }`}
        >
          {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[12.5px] font-bold ${
            checked ? "text-blue-800" : "text-slate-700"
          }`}
        >
          {title}
        </span>
        {badge != null ? (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              checked ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </div>
      <p className="pl-5 text-[11px] leading-snug text-slate-500">{description}</p>
    </div>
  );
}
