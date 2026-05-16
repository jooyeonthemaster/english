"use client";

import { useMemo, useRef } from "react";
import { diffWords } from "diff";

export function EditableRestoredTextBox({
  value,
  rawText,
  onChange,
}: {
  value: string;
  rawText: string;
  onChange: (value: string) => void;
}) {
  const highlightRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">복원문</span>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
          RESTORED
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[14px] leading-7 text-slate-800"
        >
          <HighlightedText rawText={rawText} value={value} />
        </div>
        <textarea
          aria-label="복원문 수정"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            const el = highlightRef.current;
            if (!el) return;
            el.scrollTop = event.currentTarget.scrollTop;
            el.scrollLeft = event.currentTarget.scrollLeft;
          }}
          spellCheck={false}
          className="absolute inset-0 h-full w-full resize-none overflow-y-auto rounded-b-lg border-0 bg-transparent px-4 py-3 text-[14px] leading-7 text-transparent caret-slate-950 outline-none selection:bg-sky-200/60 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>
  );
}

function HighlightedText({
  rawText,
  value,
}: {
  rawText: string;
  value: string;
}) {
  const parts = useMemo(() => {
    if (!value) return [] as Array<{ text: string; added: boolean }>;
    if (!rawText) return [{ text: value, added: false }];
    const diff = diffWords(rawText, value);
    return diff
      .filter((part) => !part.removed)
      .map((part) => ({
        text: part.value,
        added: Boolean(part.added) && part.value.trim().length > 0,
      }));
  }, [rawText, value]);

  return (
    <>
      {parts.map((part, index) =>
        part.added ? (
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
