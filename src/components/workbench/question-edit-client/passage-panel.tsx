// @ts-nocheck
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, FileText } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import { DIFFICULTY_OPTIONS } from "./constants";

interface Props {
  isModal: boolean;
  passage: { id: string; title: string; content: string };
  passageAnalysis: PassageAnalysisData | null;
  questionText: string;
  setQuestionText: (v: string) => void;
  difficulty: string;
  setDifficulty: (v: string) => void;
}

export function PassagePanel({
  isModal,
  passage,
  passageAnalysis,
  questionText,
  setQuestionText,
  difficulty,
  setDifficulty,
}: Props) {
  const diffConfig = DIFFICULTY_OPTIONS.find((d) => d.value === difficulty);
  const [view, setView] = useState<"analysis" | "original">(
    passageAnalysis ? "analysis" : "original",
  );
  const [open, setOpen] = useState(false);
  const [showTranslation, setShowTranslation] = useState(true);

  const wordCount = useMemo(
    () => passage.content.trim().split(/\s+/).filter(Boolean).length,
    [passage.content],
  );

  const title = sanitizeAiModelDisclosureText(passage.title);

  const popoverBody = (
    <PopoverContent
      align="start"
      sideOffset={6}
      className="w-[var(--radix-popover-trigger-width)] max-h-[70vh] overflow-y-auto p-3 z-[70]"
    >
      {/* 컨트롤 — 분석/원문 탭 + 번역 토글 + 단어수 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
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
        <div className="flex items-center gap-2">
          {passageAnalysis && view === "analysis" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-600">번역</span>
              <button
                type="button"
                role="switch"
                aria-checked={showTranslation}
                onClick={() => setShowTranslation((v) => !v)}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                  showTranslation
                    ? "border-blue-300 bg-blue-500"
                    : "border-slate-200 bg-slate-200"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                    showTranslation ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          )}
          <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
            {wordCount} words
          </span>
        </div>
      </div>

      {/* 분석 / 원문 */}
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
    </PopoverContent>
  );

  return (
    <div className="w-[38%] min-w-[440px] max-w-[680px] shrink-0 border-r border-slate-200 bg-[#F8FAFB] flex min-h-0 flex-col overflow-hidden">
      {/* Passage title — 클릭하면 지문 분석/원문이 팝오버로 열림 / 우측에 난이도 토글 */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          {isModal ? (
            <PopoverTrigger asChild>
              <button
                type="button"
                title={title}
                aria-expanded={open}
                className="inline-flex flex-1 h-9 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 transition-colors hover:bg-slate-100"
              >
                <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-blue-700">
                  {title}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                />
              </button>
            </PopoverTrigger>
          ) : (
            <PopoverAnchor asChild>
              <div className="inline-flex flex-1 h-9 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 transition-colors hover:bg-slate-100">
                <FileText className="h-4 w-4 shrink-0 text-blue-500" />
                <Link
                  href={`/director/workbench/passages/${passage.id}`}
                  className="min-w-0 flex-1 truncate text-left text-[14.5px] font-semibold text-blue-700 hover:underline"
                >
                  {title}
                </Link>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={open ? "지문 접기" : "지문 펼치기"}
                    aria-expanded={open}
                    className="shrink-0 text-slate-400 hover:text-slate-600"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                </PopoverTrigger>
              </div>
            </PopoverAnchor>
          )}
          {popoverBody}
        </Popover>
        {/* 난이도 토글 — 지문 토글과 같은 줄·세로 길이(h-9) */}
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className={`h-9 w-[88px] shrink-0 text-[13px] font-semibold ${diffConfig?.color || ""}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIFFICULTY_OPTIONS.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Body: 문제 내용 — 패널 전체 사용 */}
      <div className="flex-1 min-h-0 flex flex-col px-3 py-3 gap-3">
        <div className="flex flex-1 min-h-0 flex-col gap-2">
          <label className="text-[13px] font-semibold text-slate-700 px-1">문제 내용</label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            className="w-full flex-1 min-h-0 resize-none text-[14.5px] leading-[1.75] px-4 py-3 rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 text-slate-800 placeholder:text-slate-400 shadow-sm"
            placeholder="문제를 입력하세요..."
          />
        </div>
      </div>
    </div>
  );
}
