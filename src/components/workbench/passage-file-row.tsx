// @ts-nocheck
"use client";

import Link from "next/link";
import { FileText, Check, BookOpen, PenTool } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  _count: { questions: number; notes: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAnalysis(analysis: PassageItem["analysis"]) {
  if (!analysis?.analysisData) return null;
  try {
    return typeof analysis.analysisData === "string" ? JSON.parse(analysis.analysisData) : analysis.analysisData;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// PassageFileRow (List view)
// ---------------------------------------------------------------------------

export function PassageFileRow({
  passage,
  selected,
  onToggleSelect,
}: {
  passage: PassageItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
}) {
  const data = parseAnalysis(passage.analysis);
  const isAnalyzed = !!passage.analysis;
  const vocabCount = data?.vocabulary?.length ?? 0;
  const grammarCount = data?.grammarPoints?.length ?? 0;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all hover:shadow-sm cursor-pointer group ${
        selected ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"
      }`}
    >
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(passage.id, e.shiftKey); }}
        className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 transition-all ${
          selected ? "bg-blue-600 text-white border border-blue-600" : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
        }`}
      >
        <Check className="w-3 h-3" />
      </button>

      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isAnalyzed ? "bg-blue-50" : "bg-slate-50"}`}>
        <FileText className={`w-4 h-4 ${isAnalyzed ? "text-blue-500" : "text-slate-400"}`} />
      </div>

      <Link href={`/director/workbench/passages/${passage.id}`} className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
          {passage.title}
        </p>
      </Link>

      <div className="flex items-center gap-1.5 shrink-0">
        {passage.school && (
          <Badge variant="outline" className="text-[9px] h-5 px-1.5">{passage.school.name}</Badge>
        )}
        {passage.grade && (
          <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.grade}학년</Badge>
        )}
      </div>

      {isAnalyzed && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-blue-500 font-medium flex items-center gap-0.5">
            <BookOpen className="w-3 h-3" />{vocabCount}
          </span>
          <span className="text-[10px] text-violet-500 font-medium flex items-center gap-0.5">
            <PenTool className="w-3 h-3" />{grammarCount}
          </span>
        </div>
      )}

      <div className="shrink-0 w-20 text-right">
        {isAnalyzed ? (
          <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
        ) : (
          <span className="text-[10px] font-medium text-slate-400">분석 대기</span>
        )}
      </div>

      <span className="text-[10px] text-slate-400 shrink-0 w-20 text-right">
        {formatDate(passage.createdAt)}
      </span>
    </div>
  );
}
