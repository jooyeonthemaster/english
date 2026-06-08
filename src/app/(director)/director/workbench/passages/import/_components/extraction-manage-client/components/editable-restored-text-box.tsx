"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import {
  buildHighlightedSegments,
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
  /** Re-run AI restoration. Hidden when omitted (e.g., read-only contexts). */
  onRerestore?: () => void;
  isRerestoring?: boolean;
  rerestoreDisabled?: boolean;
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
  onRerestore,
  isRerestoring = false,
  rerestoreDisabled = false,
}: EditableRestoredTextBoxProps) {
  const highlightRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 px-4">
        <span className="text-[13px] font-bold text-slate-900">복원문</span>
        {onRerestore ? (
          <button
            type="button"
            onClick={onRerestore}
            disabled={rerestoreDisabled || isRerestoring}
            className="inline-flex h-6 cursor-pointer items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 text-[13px] font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRerestoring ? (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3" aria-hidden="true" />
            )}
            AI 복원 다시 실행
          </button>
        ) : null}
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
  const segments = useMemo(
    () =>
      buildHighlightedSegments({
        hostText: value,
        otherText: rawText,
        changes,
        side: "restored",
      }),
    [rawText, value, changes],
  );

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
        if (segment.diffOverlay) {
          return (
            <mark
              key={index}
              className="rounded bg-amber-100/70 text-slate-900"
            >
              {segment.text}
            </mark>
          );
        }
        if (!segment.changeId) {
          return <span key={index}>{segment.text}</span>;
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
            // `-mx-0.5` cancels the `px-0.5` so the mark's inline advance
            // matches plain text exactly. Without this, every highlighted run
            // is 4px wider than the same text in the transparent <textarea>
            // overlay, so the highlight layer wraps to more lines than the
            // textarea — and scrollTop-sync can't reveal its last line(s).
            className={
              "pointer-events-auto cursor-pointer rounded px-0.5 -mx-0.5 transition-colors " +
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
