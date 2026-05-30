/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React from "react";
import type {
  GrammarPoint,
  PassageAnalysisData,
  SentenceAnalysis,
  SyntaxItem,
  VocabItem,
} from "@/types/passage-analysis";
import { FOCUS_STYLES } from "./constants";
import {
  buildSegments,
  collectHighlights,
  getSegmentStyle,
  highlightCategory,
  highlightNoteId,
  keySentenceKey,
  noteDomId,
} from "./helpers";
import type { ExamPointData, FocusedNote, Highlight } from "./types";

const TYPE_COLORS: Record<string, string> = {
  vocab: "bg-blue-500",
  grammar: "bg-violet-500",
  syntax: "bg-cyan-500",
  exam: "bg-yellow-500",
};

interface SentenceRowProps {
  sentence: SentenceAnalysis;
  vocab: VocabItem[];
  grammar: GrammarPoint[];
  syntax: SyntaxItem | undefined;
  examTexts: { text: string; data: ExamPointData }[];
  isKey: boolean;
  isTopic: boolean;
  flow: { role: string } | undefined;
  showTranslation: boolean;
  focusedNote: FocusedNote | null;
  analysisData: PassageAnalysisData | null;
  onSegmentClick: (segKey: string, highlights: Highlight[], sentence: SentenceAnalysis) => void;
  onKeySentenceClick: (sentence: SentenceAnalysis) => void;
  onSyntaxBadgeClick: (sentence: SentenceAnalysis, syntax: SyntaxItem) => void;
}

export function SentenceRow({
  sentence,
  vocab,
  grammar,
  syntax,
  examTexts,
  isKey,
  isTopic,
  flow,
  showTranslation,
  focusedNote,
  onSegmentClick,
  onKeySentenceClick,
  onSyntaxBadgeClick,
}: SentenceRowProps) {
  const text = sentence.english;
  const allHighlights = collectHighlights(text, vocab, grammar, undefined, examTexts);
  const segments = buildSegments(allHighlights);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let focusAnchorAttached = false;
  for (const seg of segments) {
    if (cursor < seg.start) parts.push(<span key={`p-${sentence.index}-${cursor}`}>{text.slice(cursor, seg.start)}</span>);
    const frag = text.slice(seg.start, seg.end);
    const style = getSegmentStyle(seg.types);
    const segKey = `${sentence.index}-${seg.start}`;
    const uniqueTypes = [...new Set(seg.highlights.map((h) => h.type))];
    const hasOverlap = uniqueTypes.length > 1;
    const focusedHighlight = focusedNote
      ? seg.highlights.find((h) => highlightNoteId(h) === focusedNote.id)
      : null;
    const focusCategory = focusedHighlight ? highlightCategory(focusedHighlight.type) : null;
    const hoverCls = seg.types.has("exam")
      ? "hover:opacity-80"
      : seg.types.has("grammar") && !seg.types.has("vocab") && !seg.types.has("exam")
        ? "hover:bg-violet-50"
        : seg.types.has("syntax") && seg.types.size === 1
          ? "hover:bg-cyan-50"
          : "";
    parts.push(
      <span
        key={`h-${segKey}`}
        id={focusedHighlight && focusedNote && !focusAnchorAttached ? noteDomId(focusedNote.id) : undefined}
        className={`cursor-pointer transition-colors ${hoverCls} relative scroll-mt-20 ${focusedHighlight ? "z-10" : ""}`}
        style={focusCategory ? { ...style, ...FOCUS_STYLES[focusCategory] } : style}
        onClick={(e) => { e.stopPropagation(); onSegmentClick(segKey, seg.highlights, sentence); }}
        role="button"
        tabIndex={0}
        title={hasOverlap ? `클릭하여 순환: ${uniqueTypes.map((t) => t === "vocab" ? "어휘" : t === "grammar" ? "어법" : t === "syntax" ? "읽기포인트" : "출제포인트").join(" → ")}` : undefined}
      >
        {frag}
        {hasOverlap && (
          <span className="absolute -top-1 -right-0.5 flex gap-px pointer-events-none">
            {uniqueTypes.map((t) => (
              <span key={t} className={`w-1 h-1 rounded-full ${TYPE_COLORS[t]}`} />
            ))}
          </span>
        )}
      </span>,
    );
    if (focusedHighlight) focusAnchorAttached = true;
    cursor = seg.end;
  }
  if (cursor < text.length) parts.push(<span key={`p-${sentence.index}-end`}>{text.slice(cursor)}</span>);

  const isFocusedKeySentence = focusedNote?.id === keySentenceKey(sentence.index);

  return (
    <div
      key={`s-${sentence.index}`}
      id={isFocusedKeySentence && focusedNote ? noteDomId(focusedNote.id) : undefined}
      className={`mb-3 scroll-mt-20 transition-all ${isKey ? "border-l-[3px] border-green-500 pl-2 bg-green-50/30 rounded-r" : ""} ${isFocusedKeySentence ? "ring-2 ring-green-400 ring-offset-2 shadow-sm" : ""}`}
      style={isFocusedKeySentence ? FOCUS_STYLES.key : undefined}
    >
      <div className="flex items-start gap-1">
        {/* 줄번호 + 핵심문장/읽기 포인트 뱃지 */}
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <sup className="text-[10px] font-bold text-slate-400 select-none w-3">{sentence.index + 1}</sup>
          {isTopic && (
            <span
              className={`text-[8px] font-bold text-green-600 bg-green-100 px-1 py-0.5 rounded leading-none ${isKey ? "cursor-pointer hover:bg-green-200" : ""}`}
              onClick={isKey ? () => onKeySentenceClick(sentence) : undefined}
            >
              주제문
            </span>
          )}
          {flow && isKey && !isTopic && (
            <span
              className="text-[8px] font-bold text-green-600 bg-green-100 px-1 py-0.5 rounded leading-none cursor-pointer hover:bg-green-200"
              onClick={() => onKeySentenceClick(sentence)}
            >
              {flow.role}
            </span>
          )}
          {syntax && (
            <span
              className="text-[8px] font-bold text-cyan-600 bg-cyan-50 px-1 py-0.5 rounded leading-none cursor-pointer hover:bg-cyan-100 transition-colors"
              onClick={() => onSyntaxBadgeClick(sentence, syntax)}
              title="이 문장 읽기 포인트 보기"
            >
              읽기
            </span>
          )}
        </div>
        {/* 본문 텍스트: 내부 하이라이트 개별 클릭 */}
        <span className="font-mono text-[14px] leading-[1.9]">{parts}</span>
      </div>
      {showTranslation && (
        <p className={`text-[12px] text-slate-400 mt-0.5 leading-relaxed ${isKey ? "pl-6" : "pl-4"}`}>{sentence.korean}</p>
      )}
    </div>
  );
}
