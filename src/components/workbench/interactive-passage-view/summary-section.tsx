/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import React from "react";
import { Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PassageAnalysisData } from "@/types/passage-analysis";

export function SummarySection({ data }: { data: PassageAnalysisData }) {
  return (
    <div className="space-y-3 text-[13px]">
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-slate-50 rounded-lg p-3"><span className="text-[11px] text-slate-400 block mb-1">주제</span><span className="text-slate-700">{data.structure.mainIdea}</span></div>
        <div className="bg-slate-50 rounded-lg p-3"><span className="text-[11px] text-slate-400 block mb-1">목적 / 유형</span><span className="text-slate-700">{data.structure.purpose} · {data.structure.textType}{data.structure.tone && ` · ${data.structure.tone}`}</span></div>
      </div>
      {data.structure.logicFlow?.length > 0 && (
        <div>
          <span className="text-[12px] font-semibold text-slate-600 block mb-2">논리 흐름</span>
          <div className="flex items-center gap-1 flex-wrap">
            {data.structure.logicFlow.map((f, i) => (
              <React.Fragment key={i}>
                <span className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-[11px]">
                  <span className="font-semibold text-blue-600">{f.role}</span>
                  <span className="text-slate-500 truncate max-w-[150px]">{f.summary}</span>
                </span>
                {i < data.structure.logicFlow!.length - 1 && <span className="text-slate-300">→</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {data.structure.connectorAnalysis?.length > 0 && (
        <div>
          <span className="text-[12px] font-semibold text-slate-600 block mb-2">연결어</span>
          {data.structure.connectorAnalysis.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] mb-1">
              <span className="font-mono font-bold text-blue-600 shrink-0">{c.word}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">{c.role}</Badge>
              <span className="text-slate-500 truncate">{c.examRelevance}</span>
            </div>
          ))}
        </div>
      )}
      {data.structure.keyPoints?.length > 0 && (
        <div>
          <span className="text-[12px] font-semibold text-slate-600 block mb-2 flex items-center gap-1"><Target className="w-3 h-3" />출제 핵심</span>
          <ul className="space-y-1 pl-4">{data.structure.keyPoints.map((kp, i) => <li key={i} className="list-disc text-[12px] text-slate-600">{kp}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
