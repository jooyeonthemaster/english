/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React from "react";
import { ChevronUp } from "lucide-react";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { SummarySection } from "./summary-section";

export function AnalysisSummaryAccordion({
  data,
  open,
  onToggle,
}: {
  data: PassageAnalysisData;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
      open ? "border-blue-200 ring-1 ring-blue-100" : "border-blue-200 ring-1 ring-blue-100/70"
    }`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`group/summary flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          open
            ? "bg-blue-50/90 hover:bg-blue-100/90"
            : "bg-blue-50/80 hover:bg-blue-100/80"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 transition-colors ${
            open
              ? "bg-blue-600 text-white ring-blue-500"
              : "bg-blue-600 text-white ring-blue-500"
          }`}>
            <ChevronUp className={`h-4 w-4 transition-transform duration-200 ease-out ${open ? "rotate-0" : "rotate-180"}`} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-blue-950">분석 요약</span>
            <span className="block text-[11px] font-medium text-blue-600">
              {open ? "주제, 논리 흐름, 출제 핵심을 확인 중" : "접혀 있음 · 클릭하면 분석 요약이 펼쳐집니다"}
            </span>
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm transition-colors ${
          open
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-blue-200 bg-white text-blue-700 group-hover/summary:border-blue-300"
        }`}>
          {open ? "접기" : "요약 펼치기"}
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}>
        <div className="overflow-hidden">
          <div className={`border-t border-slate-100 p-4 transition-opacity duration-150 ease-out ${
            open ? "opacity-100" : "opacity-0"
          }`}>
            <SummarySection data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
