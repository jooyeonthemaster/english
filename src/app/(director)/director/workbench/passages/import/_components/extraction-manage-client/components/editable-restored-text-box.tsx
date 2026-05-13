"use client";

import { useMemo } from "react";

import type { M1PassageDraftChangeSnapshot } from "@/lib/extraction/types";

export function EditableRestoredTextBox({
  value,
  changes,
  onChange,
}: {
  value: string;
  changes: M1PassageDraftChangeSnapshot[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">복원문</span>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
          RESTORED
        </span>
      </div>
      <div className="relative min-h-[260px] flex-1">
        <div
          aria-hidden="true"
          className="pointer-events-none h-full min-h-[260px] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[14px] leading-7 text-slate-800"
        >
          <HighlightedText text={value} changes={changes} />
        </div>
        <textarea
          aria-label="복원문 수정"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="absolute inset-0 h-full min-h-[260px] w-full resize-none overflow-y-auto rounded-b-lg border-0 bg-transparent px-4 py-3 text-[14px] leading-7 text-transparent caret-slate-950 outline-none selection:bg-sky-200/60 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  changes,
}: {
  text: string;
  changes: M1PassageDraftChangeSnapshot[];
}) {
  const parts = useMemo(() => {
    const targets = changes
      .map((change) => change.after)
      .filter((after) => after.trim().length >= 3)
      .sort((a, b) => b.length - a.length);
    if (targets.length === 0) return [text];

    const result: Array<{ text: string; changed: boolean }> = [];
    let cursor = 0;
    while (cursor < text.length) {
      const match = targets.find((target) => text.startsWith(target, cursor));
      if (match) {
        result.push({ text: match, changed: true });
        cursor += match.length;
      } else {
        const nextIndex = targets
          .map((target) => text.indexOf(target, cursor + 1))
          .filter((index) => index >= 0)
          .sort((a, b) => a - b)[0];
        const end = nextIndex ?? text.length;
        result.push({ text: text.slice(cursor, end), changed: false });
        cursor = end;
      }
    }
    return result;
  }, [changes, text]);

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : part.changed ? (
          <mark key={index} className="rounded bg-amber-100 text-slate-900">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
