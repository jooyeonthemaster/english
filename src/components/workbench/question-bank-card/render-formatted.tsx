// @ts-nocheck
"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Render text with __word__ -> underline, _____ -> blank line, markers
// Enhanced version matching question-card.tsx quality
// ---------------------------------------------------------------------------

export function renderFormatted(text: string): React.ReactNode {
  // Match: __content__ (underline with possible marker inside), ___+ (blank), circled numbers, (a)/(A) markers
  const regex = /__([^_]+)__|_{3,}|([①②③④⑤])|\(([a-eA-E])\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // __content__ -- check if content starts with a marker like (A)/(a)
      const markerMatch = match[1].match(/^\(([a-eA-E])\)\s*(.+)$/);
      if (markerMatch) {
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">({markerMatch[1]})</span>
            {" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
              {markerMatch[2]}
            </span>
          </span>,
        );
      } else {
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
      // circled numbers
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold mx-0.5"
        >
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // (a)/(A) markers
      parts.push(
        <span key={key++} className="font-bold text-blue-600">
          ({match[3]})
        </span>,
      );
    } else {
      // _____ blank
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
