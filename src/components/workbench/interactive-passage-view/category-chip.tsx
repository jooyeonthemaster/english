/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { CATEGORY_META } from "./constants";
import type { NoteCategory } from "./types";

export function CategoryChip({
  category,
  count,
  rawCount,
  active,
  onClick,
}: {
  category: NoteCategory;
  count: number;
  rawCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[category];
  const hasMismatch = rawCount > count;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${meta.label} ${count}개 목록 보기 · 분석 원본 ${rawCount}개`}
      className={`group/chip inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
        active ? `${meta.active} shadow-md` : `bg-white ${meta.text} border-slate-200 hover:bg-slate-50 hover:border-slate-300`
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      <span>{meta.label}</span>
      <span className={`ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-bold ${active ? "bg-white/80 text-slate-700" : "bg-slate-50 text-slate-600"}`}>
        {count}
      </span>
      {hasMismatch && <span className="text-slate-400">/{rawCount}</span>}
      <ChevronRight className="h-3 w-3 opacity-45 transition-transform group-hover/chip:translate-x-0.5 group-hover/chip:opacity-80" />
    </button>
  );
}
