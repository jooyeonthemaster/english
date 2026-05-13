"use client";

import type { M1PassageDraftWithJob } from "../types";

export function OriginalProblemBox({ draft }: { draft: M1PassageDraftWithJob }) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">문제 원문</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
          RAW
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
          {draft.rawText}
        </div>
      </div>
    </div>
  );
}
