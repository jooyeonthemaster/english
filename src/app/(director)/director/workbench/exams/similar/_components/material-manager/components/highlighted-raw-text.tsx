"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  buildHighlightedSegments,
  type InlineRestorationChange,
} from "../utils/restoration-changes";

function cssEscape(value: string): string {
  if (
    typeof window !== "undefined" &&
    typeof window.CSS?.escape === "function"
  ) {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

export function HighlightedRawText({
  rawText,
  teacherText,
  changes,
  hoveredChangeId,
  activeChangeId,
  onHoverChange,
  onSelectChange,
}: {
  rawText: string;
  teacherText: string;
  changes: InlineRestorationChange[];
  hoveredChangeId: string | null;
  activeChangeId: string | null;
  onHoverChange: (id: string | null) => void;
  onSelectChange: (id: string | null) => void;
}) {
  const segments = useMemo(
    () =>
      buildHighlightedSegments({
        hostText: rawText,
        otherText: teacherText,
        changes,
        side: "raw",
      }),
    [rawText, teacherText, changes],
  );

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
            <mark key={index} className="rounded bg-rose-100/70 text-rose-900">
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
            className={
              "cursor-pointer rounded px-0.5 transition-colors " +
              (isActive
                ? "bg-blue-100 text-slate-950 ring-1 ring-blue-300"
                : isHovered
                  ? "bg-rose-200 text-rose-950 ring-1 ring-rose-300"
                  : "bg-rose-100 text-rose-900")
            }
          >
            {segment.text}
          </mark>
        );
      })}
    </span>
  );
}
