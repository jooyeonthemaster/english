"use client";

// ============================================================================
// TopBar — review surface header. Extracted from review-step.tsx during
// mechanical split.
// ============================================================================

import { Save } from "lucide-react";
import type { Stats } from "./types";

interface TopBarProps {
  modeLabel: string;
  modeName: string;
  fileName: string;
  stats: Stats;
  onCommit: () => void;
  committing: boolean;
}

export function TopBar({
  modeLabel,
  modeName,
  fileName,
  stats,
  onCommit,
  committing,
}: TopBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-bold tracking-wide text-sky-700">
          {modeLabel}
        </span>
        <span className="truncate text-[14px] font-semibold text-slate-800">
          {fileName}
        </span>
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {modeName}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-slate-500">
          지문 {stats.passages} · 문제 {stats.questions} · 선지 {stats.choices} ·
          해설 {stats.explanations}
        </span>
        <button
          onClick={onCommit}
          disabled={committing}
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          aria-label="리뷰 내용을 저장합니다"
        >
          <Save className="size-4" strokeWidth={1.8} />
          {committing ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
