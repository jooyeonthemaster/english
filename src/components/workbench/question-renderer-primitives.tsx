"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Check, Eye, EyeOff } from "lucide-react";

// ============================================================================
// Shared UI primitives for question renderers
// ============================================================================

/** 답안 영역을 접어두는 래퍼 — 기본 접힌 상태, 토글로 열기 */
export function AnswerRevealSection({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-1.5 border-t border-dashed border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 transition-colors flex items-center gap-1.5"
      >
        {open ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {open ? "답안 숨기기" : "답안 보기"}
      </button>
      {open && <div className="space-y-3 pt-2">{children}</div>}
    </div>
  );
}

/** Direction (발문) — bold, dark, clearly separated. __text__ 밑줄 패턴도 처리. */
export function Direction({ text }: { text: string }) {
  return (
    <div className="text-[13px] font-bold text-slate-900 leading-relaxed whitespace-pre-line">
      {renderPassageFormatted(text)}
    </div>
  );
}

/** Passage section — light gray bg, monospace, with inline highlights */
export function PassageBlock({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-1">
      {label && (
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
          {label}
        </span>
      )}
      <div className="font-mono text-[12.5px] leading-[1.9] text-slate-700 whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

/** Render passage text with __word__ converted to underline spans */
export function renderUnderlinedText(text: string): React.ReactNode {
  const regex = /__([^_]+)__/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
      >
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** Render text with _____ blanks as visual blank lines */
export function renderBlanks(text: string): React.ReactNode {
  const regex = /_{3,}/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="inline-block min-w-[100px] border-b-2 border-blue-400 mx-1 align-baseline"
      >
        &nbsp;
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** Render passage with underlines, blanks, and (A)/(a) markers */
export function renderPassageFormatted(text: string): React.ReactNode {
  // Match: __content__ (underline), ___+ (blank), ①②③④⑤ (circled numbers)
  const combinedRegex = /__([^_]+)__|_{3,}|([①②③④⑤])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    if (match[1]) {
      // __content__ → check if content starts with a marker like (A), (a)
      const markerMatch = match[1].match(/^\(([a-eA-E])\)\s*(.+)$/);
      if (markerMatch) {
        // __(A) expression__ → bold blue marker + underlined expression
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">({markerMatch[1]})</span>
            {" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
              {markerMatch[2]}
            </span>
          </span>
        );
      } else {
        // __word__ → simple underline
        parts.push(
          <span
            key={key++}
            className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
          >
            {match[1]}
          </span>
        );
      }
    } else if (match[2]) {
      // ①②③④⑤ → circled number badge
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold mx-0.5"
        >
          {match[2]}
        </span>
      );
    } else {
      // _____ blank
      parts.push(
        <span
          key={key++}
          className="inline-block min-w-[100px] border-b-2 border-blue-400 mx-1 align-baseline"
        >
          &nbsp;
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** Render numbered markers (①②③④⑤) with colored styling */
export function renderWithMarkers(text: string): React.ReactNode {
  const markerRegex = /([①②③④⑤])/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = markerRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span
        key={key++}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold mx-0.5"
      >
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/** MC Option list */
export function OptionList({
  options,
  correctAnswer,
}: {
  options: Array<{ label: string; text: string }>;
  correctAnswer: string;
}) {
  return (
    <div className="space-y-1.5 pl-1">
      {options.map((opt, i) => {
        const isCorrect = opt.label === correctAnswer;
        return (
          <div
            key={i}
            className={`text-[13px] flex items-start gap-2 ${
              isCorrect ? "text-blue-700 font-semibold" : "text-slate-600"
            }`}
          >
            <span
              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isCorrect
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {opt.label}
            </span>
            <span>{opt.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Conditions box (서술형 조건 목록) */
export function ConditionsBox({ conditions, label }: { conditions: string[]; label?: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 p-3 space-y-1.5">
      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
        {label || "조건"}
      </span>
      <ol className="space-y-1 list-decimal list-inside">
        {conditions.map((c, i) => (
          <li key={i} className="text-[12px] text-slate-700 leading-relaxed">
            {c}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Model answer display */
export function ModelAnswer({ answer, label }: { answer: string; label?: string }) {
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
        {label || "모범 답안"}
      </span>
      <p className="text-[13px] font-semibold text-emerald-800 leading-relaxed">
        {answer}
      </p>
    </div>
  );
}

/** Given sentence highlight box */
export function GivenSentenceBox({ sentence, label }: { sentence: string; label?: string }) {
  return (
    <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block mb-1">
        {label || "주어진 문장"}
      </span>
      <p className="text-[13px] text-indigo-900 leading-relaxed font-medium">
        {sentence}
      </p>
    </div>
  );
}

/** Collapsible explanation section */
export function ExplanationSection({
  explanation,
  keyPoints,
  wrongOptionExplanations,
}: {
  explanation: string;
  keyPoints: string[];
  wrongOptionExplanations?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pt-1 border-t border-slate-100">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] font-medium text-blue-500 hover:text-blue-700 transition-colors flex items-center gap-1"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "해설 접기" : "해설 보기"}
      </button>

      {open && (
        <div className="space-y-3 pt-2">
          {explanation && (
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block mb-1">
                해설
              </span>
              <p className="text-[12px] text-slate-700 leading-relaxed">{explanation}</p>
            </div>
          )}

          {keyPoints && keyPoints.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-100">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                핵심 포인트
              </span>
              <ul className="space-y-1">
                {keyPoints.map((kp, i) => (
                  <li key={i} className="text-[12px] text-slate-600 flex items-start gap-1.5">
                    <span className="text-blue-400 mt-0.5">-</span>
                    {kp}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {wrongOptionExplanations && Object.keys(wrongOptionExplanations).length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block mb-1">
                오답 분석
              </span>
              <div className="space-y-1">
                {Object.entries(wrongOptionExplanations).map(([num, exp]) => (
                  <div key={num} className="text-[12px] text-slate-600 flex items-start gap-1.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-[9px] font-bold mt-0.5">
                      {num}
                    </span>
                    <span>{exp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Answer line with correct answer */
export function AnswerLine({ answer }: { answer: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
      <Check className="w-3.5 h-3.5 text-emerald-500" />
      <span className="text-[12px] text-slate-400">
        정답: <span className="font-bold text-emerald-600">{answer}</span>
      </span>
    </div>
  );
}
