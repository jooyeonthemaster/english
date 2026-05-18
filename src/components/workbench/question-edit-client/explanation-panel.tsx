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
    <div className="w-[360px] shrink-0 border-l border-slate-200 bg-slate-50 flex min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <h3 className="text-[13px] font-semibold text-slate-800 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-blue-500" />해설
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 overflow-y-auto">
        {/* Explanation textarea — flex-[3] fills available space */}
        <div className="min-h-[220px] flex flex-col gap-1">
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="w-full min-h-[220px] px-3 py-2.5 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 resize-y placeholder:text-slate-400"
            placeholder="해설을 입력하세요..."
          />
        </div>

        {/* Key points */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">핵심 포인트</label>
          <div className="space-y-1">
            {keyPoints.map((kp, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                <input
                  value={kp}
                  onChange={(e) => {
                    const u = [...keyPoints];
                    u[idx] = e.target.value;
                    setKeyPoints(u);
                  }}
                  className="flex-1 h-7 text-[12px] px-2 rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400"
                />
                <button
                  onClick={() => setKeyPoints(keyPoints.filter((_, i) => i !== idx))}
                  className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-red-500 shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setKeyPoints([...keyPoints, ""])}
              className="flex items-center gap-1 text-[11px] text-blue-600 font-medium hover:text-blue-700"
            >
              <Plus className="w-3 h-3" />추가
            </button>
          </div>
        </div>

        {/* Wrong explanations */}
        {options.length > 0 && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">오답 해설</label>
            <div className="space-y-1">
              {options
                .filter((o) => o.label !== correctAnswer)
                .map((opt) => (
                  <div key={opt.label} className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 w-4 text-center shrink-0">{opt.label}</span>
                    <input
                      value={wrongExplanations[opt.label] || ""}
                      onChange={(e) => setWrongExplanations({ ...wrongExplanations, [opt.label]: e.target.value })}
                      placeholder="오답 이유..."
                      className="flex-1 h-7 text-[12px] px-2 rounded-md border border-slate-200 bg-white outline-none focus:border-blue-400 placeholder:text-slate-400"
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
