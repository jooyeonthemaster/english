import React from "react";
import { grammarMarkerDisplayLabel } from "@/components/exams/paper-builder/option-display";

// ---------------------------------------------------------------------------
// 문제 본문 안의 __강조__ / __ / 원 숫자(①②...) 마크업을 React 노드로 변환
// ---------------------------------------------------------------------------

export function renderFormatted(
  text: string,
  // GRAMMAR_ERROR 일 때만 지문 마커 (A)→① 로 표시(시험지 렌더 동일). 타 유형 미전달 → (A) 보존.
  subType?: string | null,
): React.ReactNode {
  const isGrammarError = subType === "GRAMMAR_ERROR";
  const regex = /__([^_]+)__|_{3,}|([\u2460-\u2473\u3251-\u325F\u32B1-\u32BF\u24D0-\u24E9])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // 어법 판단: __(A) expression__ → 원형숫자(①) 마커 + 밑줄 표현 (시험지 렌더와 동일).
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
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold mx-0.5"
        >
          {match[2]}
        </span>,
      );
    } else {
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

export function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}
