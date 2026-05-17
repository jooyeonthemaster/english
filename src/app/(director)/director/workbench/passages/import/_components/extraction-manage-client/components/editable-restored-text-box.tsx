"use client";

import { useEffect, useMemo, useRef } from "react";
import { diffWords } from "diff";

import {
  mapChangesToOffsets,
  segmentText,
  type InlineRestorationChange,
} from "../utils/restoration-changes";

interface EditableRestoredTextBoxProps {
  value: string;
  rawText: string;
  onChange: (value: string) => void;
  /** Sentence-level changes the AI emitted. Empty array → fall back to the
   *  legacy word-diff highlight so we still mark *something* for older
   *  drafts that lack inline-evidence change rows. */
  changes: InlineRestorationChange[];
  /** Card the user is hovering in the sidebar (or null). */
  hoveredChangeId: string | null;
  /** Card the user clicked / locked in the sidebar (or null). */
  activeChangeId: string | null;
  /** Body marks emit hover events upward to drive sidebar focus. */
  onHoverChange: (id: string | null) => void;
  /** Click on a body mark toggles the locked selection. */
  onSelectChange: (id: string | null) => void;
}

export function EditableRestoredTextBox({
  value,
  rawText,
  onChange,
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: EditableRestoredTextBoxProps) {
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
          <HighlightedText
            rawText={rawText}
            value={value}
            changes={changes}
            hoveredChangeId={hoveredChangeId}
            activeChangeId={activeChangeId}
            onHoverChange={onHoverChange}
            onSelectChange={onSelectChange}
          />
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
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: {
  rawText: string;
  value: string;
  changes: InlineRestorationChange[];
  hoveredChangeId: string | null;
  activeChangeId: string | null;
  onHoverChange: (id: string | null) => void;
  onSelectChange: (id: string | null) => void;
}) {
  const segments = useMemo(() => {
    if (!value) return [];
    if (changes.length === 0) {
      // Legacy fallback: word-diff against raw. No change ids to anchor to,
      // so highlights here are non-interactive.
      if (!rawText) return [{ text: value, changeId: null as string | null }];
      const diff = diffWords(rawText, value);
      return diff
        .filter((part) => !part.removed)
        .map((part) => ({
          text: part.value,
          changeId:
            part.added && part.value.trim().length > 0 ? "__diff__" : null,
        }));
    }
    const spans = mapChangesToOffsets(
      value,
      changes.map((c) => ({ id: c.id, text: c.after })),
    );
    return segmentText(value, spans);
  }, [rawText, value, changes]);

  // Scroll the active mark into view when selection is driven by the
  // sidebar (the user clicks a card). The textarea overlays the highlight
  // layer, so we scroll the highlight container directly.
  const containerRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!activeChangeId) return;
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `[data-change-id="${cssEscape(activeChangeId)}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeChangeId]);

  return (
    <span ref={containerRef}>
      {segments.map((segment, index) => {
        if (!segment.changeId) {
          return <span key={index}>{segment.text}</span>;
        }
        if (segment.changeId === "__diff__") {
          return (
            <mark
              key={index}
              className="rounded bg-amber-100 text-slate-900"
            >
              {segment.text}
            </mark>
          );
        }
        const isActive = activeChangeId === segment.changeId;
        const isHovered = hoveredChangeId === segment.changeId;
        return (
          <mark
            key={index}
            data-change-id={segment.changeId}
            onMouseEnter={() => onHoverChange(segment.changeId)}
            onMouseLeave={() => onHoverChange(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectChange(isActive ? null : segment.changeId);
            }}
            className={
              "pointer-events-auto cursor-pointer rounded px-0.5 transition-colors " +
              (isActive
                ? "bg-violet-200 text-violet-950 ring-1 ring-violet-400"
                : isHovered
                  ? "bg-amber-200 text-slate-900 ring-1 ring-amber-300"
                  : "bg-amber-100 text-slate-900")
            }
          >
            {segment.text}
          </mark>
        );
      })}
    </span>
  );
}

/** Minimal CSS.escape polyfill — change ids are cuids (alphanumeric) so the
 *  built-in `CSS.escape` is overkill, but using it where available keeps us
 *  defensive for any future id format change. */
function cssEscape(value: string): string {
  if (typeof window !== "undefined" && typeof window.CSS?.escape === "function") {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
