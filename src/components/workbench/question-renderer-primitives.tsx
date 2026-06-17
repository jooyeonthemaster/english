"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getCircledNumber, getCircledNumbers } from "@/lib/question-postprocess/types";

/**
 * AnswerRevealSection / ExplanationSection 의 답안·해설 노출 방식.
 *  - "default": 기존. "답안 보기/숨기기" 토글로 정답·해설을 접어둔다.
 *  - "show-all": 토글 없이 정답·해설을 곧장 노출(정답이 보기에 파란색으로
 *    이미 표시되는 compact 결과 카드용). 해설은 자체 "해설 보기" 토글 유지.
 *  - "as-explanation": 단일 "해설 보기" 토글 하나로 [밑줄 분석·정답·해설]을
 *    모두 감싼다(문제 관리 카드용). 내부 해설은 토글 없이 인라인으로 펼친다.
 */
export type AnswerRevealMode = "default" | "show-all" | "as-explanation";
export const AnswerRevealContext = createContext<AnswerRevealMode>("default");

// ============================================================================
// Shared UI primitives for question renderers
// ============================================================================

const CIRCLED_MARKER_PATTERN = "\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF";

function normalizeCircledSentenceMarker(marker: string) {
  const codePoint = marker.codePointAt(0);
  if (codePoint === undefined || codePoint < 0x24D0 || codePoint > 0x24E9) {
    return marker;
  }
  return getCircledNumber(codePoint - 0x24D0);
}

function circledNumberFromLetter(letter: string) {
  const index = letter.toUpperCase().charCodeAt(0) - 65;
  return index >= 0 && index < 26 ? getCircledNumber(index) : letter;
}

/** 답안 영역을 접어두는 래퍼 — 기본 접힌 상태, 토글로 열기.
 *  AnswerRevealContext 가 true 면 토글 없이 정답·해설을 바로 보여 준다
 *  (정답이 이미 보기에 파란색으로 표시되는 화면에서). */
export function AnswerRevealSection({ children }: { children: React.ReactNode }) {
  const mode = useContext(AnswerRevealContext);
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 답안을 펼치면 화면이 튀지 않게 부드럽게 스크롤해서 펼쳐진 답안을 보여 준다.
  // block: "nearest" — 이미 보이면 움직이지 않고, 가려져 있을 때만 최소한으로 내려간다.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // 토글 없이 바로 노출 — 정답 줄 + 그 자리의 '해설 보기' 버튼이 곧장 보인다.
  if (mode === "show-all") {
    return <div className="space-y-3 pt-1.5">{children}</div>;
  }

  // as-explanation(문제 관리 카드): "해설 보기"를 팝오버로 띄운다.
  // 팝오버 폭은 카드 가로폭에 맞춘다(행 전체를 앵커로 사용).
  if (mode === "as-explanation") {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="pt-1.5 border-t border-dashed border-slate-200">
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-500 transition-colors hover:text-blue-700"
              >
                {open ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {open ? "해설 접기" : "해설 보기"}
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          onClick={(e) => e.stopPropagation()}
          className="max-h-[60vh] w-[var(--radix-popover-trigger-width)] overflow-y-auto p-3"
        >
          <div className="space-y-3">{children}</div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="pt-1.5 border-t border-dashed border-slate-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-600 transition-colors hover:text-teal-700"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "답안 숨기기" : "답안 보기"}
      </button>
      {open && (
        <div ref={contentRef} className="space-y-3 pt-2 scroll-mt-4">
          {children}
        </div>
      )}
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

/** Render passage with underlines, blanks, and numbered markers */
export function renderPassageFormatted(text: string): React.ReactNode {
  // 원본(PDF/추출)이 줄 단위로 저장돼 단락 내부에 강제 줄바꿈(\n)이 박혀 있으면
  // 화면에서 문장이 어색하게 끊긴다 → 단락(\n\n)은 유지하고 단락 내부의 단일
  // 줄바꿈만 공백으로 합쳐(reflow) 자연스럽게 흐르게 한다. (표시 전용)
  text = text.replace(/([^\n])\n(?!\n)/g, "$1 ");
  // Match: __content__ (underline), ___+ (blank), circled numbers
  const combinedRegex = new RegExp(`__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])`, "g");
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
      const markerMatch = match[1].match(/^\(([a-jA-J])\)\s*(.+)$/);
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
      // Circled number -> badge
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

/** Render numbered markers with colored styling */
export function renderWithMarkers(text: string): React.ReactNode {
  const markerRegex = new RegExp(`([${CIRCLED_MARKER_PATTERN}])|\\(([A-Ea-e])\\)`, "g");
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
        {match[1] || circledNumberFromLetter(match[2])}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

/**
 * Render the IRRELEVANT marked passage. Legacy circled-letter markers are
 * normalized to circled numbers; each marked sentence is underlined via __...__.
 */
export function renderMarkedSentencePassage(text: string): React.ReactNode {
  const regex = new RegExp(
    `__([^_]+)__|([\\u24D0-\\u24E9${CIRCLED_MARKER_PATTERN}])`,
    "g",
  );
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(
        <span
          key={key++}
          className="underline decoration-2 decoration-blue-500 underline-offset-4 text-slate-900"
        >
          {match[1]}
        </span>,
      );
    } else {
      parts.push(
        <span key={key++} className="mr-0.5 font-bold text-blue-600">
          {normalizeCircledSentenceMarker(match[2])}
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

/** MC Option list */
export function OptionList({
  options,
  correctAnswer,
  correctAnswers,
}: {
  options: Array<{ label: string; text: string }>;
  correctAnswer: string;
  correctAnswers?: string[];
}) {
  const correctLabels = getCorrectAnswerLabels(correctAnswer, correctAnswers);
  return (
    <div className="space-y-1.5 pl-1">
      {options.map((opt, i) => {
        const isCorrect = correctLabels.has(normalizeAnswerLabel(opt.label));
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

function getCorrectAnswerLabels(correctAnswer: string, correctAnswers?: string[]): Set<string> {
  const labels = new Set<string>();
  const push = (value: unknown) => {
    const label = normalizeAnswerLabel(value);
    if (label) labels.add(label);
  };

  correctAnswers?.forEach(push);
  const matches = correctAnswer?.match(/[\(\[]?\s*(?:[A-Ja-j]|\d{1,3}|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g);
  if (matches?.length) matches.forEach(push);
  else push(correctAnswer);
  return labels;
}

function normalizeAnswerLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text.replace(/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/, "$1").toLowerCase();
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
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
        {label || "주어진 문장"}
      </span>
      <p className="text-[13px] text-slate-900 leading-relaxed font-medium">
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
  const mode = useContext(AnswerRevealContext);
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 해설을 펼치면 답안 보기와 동일하게 부드럽게 스크롤해서 펼쳐진 해설을 보여 준다.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const content = (
    <div className="space-y-3">
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
  );

  // as-explanation: 부모 '해설 보기' 토글이 이미 감싸므로 자체 토글 없이 인라인 노출.
  if (mode === "as-explanation") {
    return content;
  }

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
        <div ref={contentRef} className="pt-2 scroll-mt-4">
          {content}
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
