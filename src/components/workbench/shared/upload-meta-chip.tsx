"use client";

// ============================================================================
// 업로드 메타 칩 — 드롭존 아래 "지원 형식 · 페이지 한도 · 용량" 안내 알약.
// passages/import 로컬 컴포넌트였으나 문제생성·시험 리포트 인테이크가 함께
// 쓰게 되어 공용 위치로 승격했다(원본 경로는 re-export 셔닝으로 호환 유지).
// ============================================================================

import type { ReactNode } from "react";

export function UploadMetaChip({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {icon}
      {children}
    </span>
  );
}
