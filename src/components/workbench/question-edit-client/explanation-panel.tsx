// @ts-nocheck
"use client";

import React from "react";
import { Lightbulb, Plus, X } from "lucide-react";

interface Option {
  label: string;
  text: string;
}

interface Props {
  explanation: string;
  setExplanation: (v: string) => void;
  keyPoints: string[];
  setKeyPoints: (v: string[]) => void;
  options: Option[];
  correctAnswer: string;
  wrongExplanations: Record<string, string>;
  setWrongExplanations: (v: Record<string, string>) => void;
}

export function ExplanationPanel({
  explanation,
  setExplanation,
  keyPoints,
  setKeyPoints,
  options,
  correctAnswer,
  wrongExplanations,
  setWrongExplanations,
}: Props) {
  return (
    <div className="w-[580px] shrink-0 border-l border-slate-200 bg-slate-50 flex min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
        <h3 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
          <Lightbulb className="w-[18px] h-[18px] text-blue-500" />해설
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-5 flex flex-col gap-5 overflow-y-auto">
        {/* Explanation textarea */}
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-slate-700">정답 해설</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full min-h-[260px] px-4 py-3 text-[14px] leading-[1.75] rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-y placeholder:text-slate-400 text-slate-800 shadow-sm"
            placeholder="해설을 입력하세요..."
          />
        </div>

        {/* Key points */}
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-[13px] font-semibold text-slate-700">핵심 포인트</label>
          <div className="space-y-1.5">
            {keyPoints.map((kp, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-3.5" />
                <textarea
                  value={kp}
                  onChange={(e) => {
                    const u = [...keyPoints];
                    u[idx] = e.target.value;
                    setKeyPoints(u);
                  }}
                  rows={2}
                  className="flex-1 min-h-9 text-[13.5px] leading-[1.6] px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 shadow-sm resize-y break-words"
                />
                <button
                  onClick={() => setKeyPoints(keyPoints.filter((_, i) => i !== idx))}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 shrink-0 mt-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setKeyPoints([...keyPoints, ""])}
              className="flex items-center gap-1.5 text-[13px] text-blue-600 font-semibold hover:text-blue-700 mt-1"
            >
              <Plus className="w-3.5 h-3.5" />추가
            </button>
          </div>
        </div>

        {/* Wrong explanations */}
        {options.length > 0 && (
          <div className="flex flex-col gap-2 shrink-0">
            <label className="text-[13px] font-semibold text-slate-700">오답 해설</label>
            <div className="space-y-1.5">
              {options
                .filter((o) => o.label !== correctAnswer)
                .map((opt) => (
                  <div key={opt.label} className="flex items-start gap-2">
                    <span className="text-[12.5px] font-bold text-slate-600 w-6 h-6 flex items-center justify-center rounded-md bg-slate-200 shrink-0 mt-1.5">{opt.label}</span>
                    <textarea
                      value={wrongExplanations[opt.label] || ""}
                      onChange={(e) => setWrongExplanations({ ...wrongExplanations, [opt.label]: e.target.value })}
                      placeholder="오답 이유..."
                      rows={3}
                      className="flex-1 min-h-9 text-[13.5px] leading-[1.6] px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400 shadow-sm resize-y break-words"
                    />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
