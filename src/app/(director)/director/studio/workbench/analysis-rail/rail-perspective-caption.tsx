"use client";

// ============================================================================
// 레일 탭 본문 최상단 「관점 캡션」 1줄 (26-09-03, 리포트 2관점 분리)
//
// 사용자 지시: "리포트가 2개의 관점 — 시험지 자체를 분석한 리포트 / 학생이 그
// 시험을 치른 다음의 리포트 — 두 개를 구분해 줘." 탭 라벨(총평·학생)만으론 어느
// 리포트를 보고 있는지 즉시 안 읽혀, 본문 첫 줄에 관점 이름 + 한 줄 힌트를 박는다.
// 도크 블록의 아이브로우(「시험지 분석 리포트」/「학생 리포트 · 다음 단계」)와 같은
// 어휘를 쓴다 — 본문 위와 도크 아래가 같은 이름으로 호응.
// 토큰: 10.5px uppercase 아이브로우 + 11px 힌트, 2급 카드(slate-50). 폭 296px 플로어 →
// 힌트는 truncate+title.
// ============================================================================

import type { ReactNode } from "react";

export function RailPerspectiveCaption({
  icon,
  label,
  hint,
  perspective,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  /** 계약 속성 data-rail-perspective 값("exam" | "students") — 프로브용. */
  perspective: "exam" | "students";
}) {
  return (
    <div
      data-rail-perspective={perspective}
      className="flex min-w-0 items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-white text-slate-500 ring-1 ring-inset ring-slate-200/60">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="truncate text-[11px] leading-snug text-slate-400" title={hint}>
          {hint}
        </p>
      </div>
    </div>
  );
}
