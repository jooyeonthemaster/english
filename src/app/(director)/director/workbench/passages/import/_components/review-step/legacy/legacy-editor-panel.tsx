"use client";

// ============================================================================
// LegacyEditorPanel — right panel for the legacy M1 path: title input +
// TipTap editor + meta footer. Pulled out so the editor's local stats state
// (char/word count) doesn't re-render the whole LegacyReview tree on every
// keystroke.
// Extracted from review-step.tsx during mechanical split.
// ============================================================================

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { PassageContentEditor } from "@/components/workbench/editor/passage-content-editor";
import { MIN_COMMIT_PASSAGE_LENGTH } from "@/lib/extraction/constants";
import type { ResultDraft } from "@/lib/extraction/types";

interface LegacyEditorPanelProps {
  selected: ResultDraft;
  onTitle: (value: string) => void;
  onContent: (value: string) => void;
  onDelete: () => void;
}

export function LegacyEditorPanel({
  selected,
  onTitle,
  onContent,
  onDelete,
}: LegacyEditorPanelProps) {
  const [stats, setStats] = useState({
    chars: selected.content.length,
    words: selected.content.trim()
      ? selected.content.trim().split(/\s+/).filter(Boolean).length
      : 0,
  });

  const pagesLabel = useMemo(() => {
    const pages = selected.sourcePageIndex ?? [];
    if (pages.length === 0) return null;
    const sorted = [...pages].sort((a, b) => a - b);
    return sorted.map((p) => `p.${p + 1}`).join(", ");
  }, [selected.sourcePageIndex]);

  const lengthTone =
    stats.chars >= MIN_COMMIT_PASSAGE_LENGTH
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-rose-700 bg-rose-50 border-rose-200";

  return (
    <>
      {/* Title row — bold, inline-editable */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <input
          value={selected.title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="지문 제목"
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] font-bold tracking-tight text-slate-800 placeholder:text-slate-300 outline-none"
        />
        {pagesLabel ? (
          <span
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-semibold tabular-nums text-slate-600"
            title="원본 페이지"
          >
            {pagesLabel}
          </span>
        ) : null}
      </div>

      {/* TipTap editor fills the middle band */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <PassageContentEditor
          content={selected.content}
          onChange={onContent}
          onStats={setStats}
          placeholder="지문 내용을 입력하거나 붙여넣으세요."
        />
      </div>

      {/* Footer: live stats + delete */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-2.5">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span
            className={
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold tabular-nums " +
              lengthTone
            }
            title={`커밋 최소 길이 ${MIN_COMMIT_PASSAGE_LENGTH}자`}
          >
            {stats.chars.toLocaleString()}자
          </span>
          <span className="text-slate-300">·</span>
          <span className="tabular-nums">
            {stats.words.toLocaleString()} words
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <Trash2 className="size-3.5" strokeWidth={1.8} />
          삭제
        </button>
      </div>
    </>
  );
}
