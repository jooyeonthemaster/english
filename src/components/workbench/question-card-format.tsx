"use client";

import React from "react";
import { grammarMarkerDisplayLabel } from "@/components/exams/paper-builder/option-display";
import { CIRCLED_MARKER_PATTERN } from "./question-card-constants";
export function ReviewStatusStamp({
  approved,
  className = "",
}: {
  approved: boolean;
  className?: string;
}) {
  const label = approved ? "검수완료" : "검수필요";
  return (
    <span
      role="img"
      aria-label={label}
      className={
        "pointer-events-none inline-flex -rotate-12 select-none items-center justify-center rounded-full leading-none " +
        (approved
          ? "size-7 whitespace-nowrap border-2 border-slate-500 bg-white/70 text-[7px] font-bold tracking-tighter text-slate-600 shadow-sm"
          : "size-7 border border-dashed border-red-300/70 bg-red-50/30 text-[7.5px] font-bold tracking-tight text-red-400/80") +
        " " +
        className
      }
    >
      {label}
    </span>
  );
}

export function renderFormatted(
  text: string,
  opts?: {
    underlineMarkedWords?: boolean;
    highlightMarkers?: boolean;
    /** GRAMMAR_ERROR 일 때만 지문 마커 (A)→① 로 표시(시험지 렌더 동일). 타 유형 무영향. */
    subType?: string | null;
  },
): React.ReactNode {
  const underline = opts?.underlineMarkedWords ?? false;
  const highlightMarkers = opts?.highlightMarkers ?? false;
  const isGrammarError = opts?.subType === "GRAMMAR_ERROR";

  // Build regex based on options
  let pattern: string;
  if (underline) {
    // Match (a) word with the word captured separately
    pattern = `__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])|\\(([a-jA-J])\\)\\s*(\\S+)`;
  } else if (highlightMarkers) {
    // Match (a) marker only, no word capture
    pattern = `__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])|\\(([a-jA-J])\\)`;
  } else {
    // Basic: only __word__, blanks, circled numbers
    pattern = `__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])`;
  }
  const regex = new RegExp(pattern, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // 어법 판단(GRAMMAR_ERROR): __(A) expression__ → 원형숫자(①) 마커 + 밑줄 표현
      // (시험지 렌더와 동일). 타 유형은 isGrammarError=false 라 기존 통밑줄 유지.
      const grammarMarker = isGrammarError
        ? match[1].match(/^\(([a-jA-J])\)\s*(.+)$/)
        : null;
      if (grammarMarker) {
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">
              {grammarMarkerDisplayLabel(grammarMarker[1])}
            </span>{" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
              {grammarMarker[2]}
            </span>
          </span>,
        );
      } else {
        // __word__ → underline
        parts.push(
          <span
            key={key++}
            className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
          >
            {match[1]}
          </span>,
        );
      }
    } else if (match[2]) {
      // Circled number -> bold blue
      parts.push(
        <span
          key={key++}
          className="font-extrabold text-blue-600 text-[18px] mx-1 relative -top-[1px]"
        >
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // (a)~(e), (A)~(E) marker
      if (match[4] && underline) {
        // (a) word → blue marker + underlined word (for passage text)
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">({match[3]})</span>{" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold">
              {match[4]}
            </span>
          </span>,
        );
      } else {
        // Just the marker, no underline (for options / non-underline mode)
        parts.push(
          <span key={key++} className="font-bold text-blue-600">
            ({match[3]})
          </span>,
        );
      }
    } else {
      // _____ → blank
      parts.push(
        <span
          key={key++}
          className="inline-block min-w-[80px] border-b-2 border-blue-400 mx-1 align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}
