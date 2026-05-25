// @ts-nocheck
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface Props {
  isModal: boolean;
  passage: { id: string; title: string; content: string };
  passageAnalysis: PassageAnalysisData | null;
  questionText: string;
  setQuestionText: (v: string) => void;
}

export function PassagePanel({
  isModal,
  passage,
  passageAnalysis,
  questionText,
  setQuestionText,
}: Props) {
  const [view, setView] = useState<"analysis" | "original">(
    passageAnalysis ? "analysis" : "original",
  );
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);

  const wordCount = useMemo(
    () => passage.content.trim().split(/\s+/).filter(Boolean).length,
    [passage.content],
  );

  const tabSwitcher = (
    <div className="inline-flex h-8 items-center rounded-lg bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => setView("analysis")}
        disabled={!passageAnalysis}
        className={`h-6 px-3 rounded-md text-[12px] font-semibold transition-colors ${
          view === "analysis"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
        }`}
      >
        분석 보기
      </button>
      <button
        type="button"
        onClick={() => setView("original")}
        className={`h-6 px-3 rounded-md text-[12px] font-semibold transition-colors ${
          view === "original"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-900"
        }`}
      >
        원문 보기
      </button>
    </div>
  );

  const collapseButton = (
    <button
      type="button"
      onClick={() => setShowAnalysis((v) => !v)}
      className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-colors"
    >
      {showAnalysis ? (
        <>
          <ChevronUp className="w-3.5 h-3.5" />지문 접기
        </>
      ) : (
        <>
          <ChevronDown className="w-3.5 h-3.5" />지문 펼치기
        </>
      )}
    </button>
  );

  return (
    <div className="w-[38%] min-w-[440px] max-w-[680px] shrink-0 border-r border-slate-200 bg-[#F8FAFB] flex min-h-0 flex-col overflow-hidden">
      {/* Passage title */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="w-[18px] h-[18px] text-blue-500 shrink-0" />
          {isModal ? (
            <span className="text-[14.5px] font-semibold text-blue-700 truncate">
              {sanitizeAiModelDisclosureText(passage.title)}
            </span>
          ) : (
            <Link
              href={`/director/workbench/passages/${passage.id}`}
              className="text-[14.5px] font-semibold text-blue-700 hover:underline truncate"
            >
              {sanitizeAiModelDisclosureText(passage.title)}
            </Link>
          )}
        </div>
      </div>

      {/* Body: 문제 내용 (always) + 분석/원문 (collapsible) */}
      <div className="flex-1 min-h-0 flex flex-col px-3 py-3 gap-3">
        {/* 문제 내용 — 분석이 접혀있으면 flex-1로 패널 전체 사용 */}
        <div className={`flex flex-col gap-2 ${showAnalysis ? "shrink-0" : "flex-1 min-h-0"}`}>
          <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
            <label className="text-[13px] font-semibold text-slate-700">문제 내용</label>
            <div className="flex items-center gap-2 flex-wrap">
              {showAnalysis && (
                <>
                  {tabSwitcher}
                  {passageAnalysis && view === "analysis" && (
                    <button
                      type="button"
                      onClick={() => setShowTranslation((v) => !v)}
                      className={`h-8 rounded-lg border px-2.5 text-[11px] font-semibold shadow-sm transition-colors ${
                        showTranslation
                          ? "border-slate-200 bg-slate-100 text-slate-700"
                          : "border-slate-200 bg-white text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      번역 {showTranslation ? "ON" : "OFF"}
                    </button>
                  )}
                  <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                    {wordCount} words
                  </span>
                </>
              )}
              {collapseButton}
            </div>
          </div>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            rows={showAnalysis ? 8 : undefined}
            className={`w-full text-[14.5px] leading-[1.75] px-4 py-3 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 text-slate-800 placeholder:text-slate-400 shadow-sm ${
              showAnalysis ? "resize-y" : "flex-1 min-h-0 resize-none"
            }`}
            placeholder="문제를 입력하세요..."
          />
        </div>

        {/* 분석 / 원문 view — collapsible, default 접힘 */}
        {showAnalysis && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {view === "analysis" && passageAnalysis ? (
              <InteractivePassageView
                content={passage.content}
                analysisData={passageAnalysis}
                layout="vertical"
                hideHeaderControls
                showTranslation={showTranslation}
                onShowTranslationChange={setShowTranslation}
              />
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-[14px] text-slate-800 font-mono leading-[1.9] whitespace-pre-wrap">
                  {passage.content}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
