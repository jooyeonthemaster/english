// @ts-nocheck
"use client";

import React from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface Props {
  isModal: boolean;
  passage: { id: string; title: string; content: string };
  passageAnalysis: PassageAnalysisData | null;
}

export function PassagePanel({ isModal, passage, passageAnalysis }: Props) {
  return (
    <div className="w-[46%] min-w-[560px] max-w-[660px] shrink-0 border-r border-slate-200 bg-[#F8FAFB] flex min-h-0 flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
          {isModal ? (
            <span className="text-[13px] font-semibold text-blue-600 truncate">
              {passage.title}
            </span>
          ) : (
            <Link
              href={`/director/workbench/passages/${passage.id}`}
              className="text-[13px] font-semibold text-blue-600 hover:underline truncate"
            >
              {passage.title}
            </Link>
          )}
        </div>
      </div>

      <Tabs defaultValue={passageAnalysis ? "analysis" : "original"} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 shrink-0">
          <TabsList className="h-8 bg-slate-100">
            <TabsTrigger value="analysis" disabled={!passageAnalysis} className="h-7 px-3 text-[12px]">
              분석 보기
            </TabsTrigger>
            <TabsTrigger value="original" className="h-7 px-3 text-[12px]">
              원문 보기
            </TabsTrigger>
          </TabsList>
          {!passageAnalysis && (
            <span className="text-[11px] font-medium text-slate-400">분석 데이터 없음</span>
          )}
        </div>

        <TabsContent value="analysis" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
          {passageAnalysis && (
            <InteractivePassageView
              content={passage.content}
              analysisData={passageAnalysis}
              layout="vertical"
            />
          )}
        </TabsContent>

        <TabsContent value="original" className="m-0 min-h-0 flex-1 overflow-y-auto p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[13px] text-slate-700 font-mono leading-[1.8] whitespace-pre-wrap">
              {passage.content}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
