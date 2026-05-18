// @ts-nocheck
"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { parseJSON } from "../shared/helpers";

interface Explanation {
  id: string;
  content: string;
  keyPoints: string | null;
  wrongOptionExplanations: string | null;
}

export function ExplanationSection({ explanation }: { explanation: Explanation | null }) {
  const [explanationOpen, setExplanationOpen] = useState(false);

  if (!explanation?.content) return null;

  return (
    <div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExplanationOpen(!explanationOpen);
        }}
        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
      >
        {explanationOpen ? "해설 접기" : "해설 보기"}
        {explanationOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {explanationOpen && (
        <div className="bg-blue-50/50 rounded-lg p-2.5 mt-1.5 border border-blue-100">
          <p className="text-[10px] font-semibold text-blue-600 mb-1">해설</p>
          <p className="text-[12px] text-slate-700 leading-relaxed">{explanation.content}</p>
          {explanation.keyPoints &&
            (() => {
              const kps = parseJSON<string[]>(explanation.keyPoints, []);
              return kps.length > 0 ? (
                <div className="mt-2 pt-2 border-t border-blue-100">
                  <p className="text-[10px] font-semibold text-blue-600 mb-1">핵심 포인트</p>
                  <ul className="space-y-0.5">
                    {kps.map((kp, i) => (
                      <li key={i} className="text-[11px] text-slate-600 flex gap-1.5">
                        <span className="text-blue-400 shrink-0">•</span>
                        {kp}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
          {explanation.wrongOptionExplanations &&
            (() => {
              const woe = parseJSON<Record<string, string>>(explanation.wrongOptionExplanations, {});
              const entries = Object.entries(woe);
              return entries.length > 0 ? (
                <div className="mt-2 pt-2 border-t border-blue-100">
                  <p className="text-[10px] font-semibold text-blue-600 mb-1">오답 해설</p>
                  <div className="space-y-0.5">
                    {entries.map(([label, text]) => (
                      <p key={label} className="text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-500">{label}.</span> {text}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
        </div>
      )}
    </div>
  );
}
