"use client";

import { useMemo } from "react";
import { diffWords } from "diff";

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
          <HighlightedRawText
            rawText={draft.rawText}
            teacherText={draft.teacherText}
          />
        </div>
      </div>
    </div>
  );
}

function HighlightedRawText({
  rawText,
  teacherText,
}: {
  rawText: string;
  teacherText: string;
}) {
  const parts = useMemo(() => {
    if (!rawText) return [] as Array<{ text: string; removed: boolean }>;
    if (!teacherText) return [{ text: rawText, removed: false }];
    const diff = diffWords(rawText, teacherText);
    return diff
      .filter((part) => !part.added)
      .map((part) => ({
        text: part.value,
        removed: Boolean(part.removed) && part.value.trim().length > 0,
      }));
  }, [rawText, teacherText]);

  return (
    <>
      {parts.map((part, index) =>
        part.removed ? (
          <mark key={index} className="rounded bg-rose-100 text-rose-900">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
