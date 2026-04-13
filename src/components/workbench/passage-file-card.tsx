// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  BookOpen,
  PenTool,
  Braces,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSemesterLabel } from "@/lib/utils";

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
// PassageFileCard (Grid view)
// ---------------------------------------------------------------------------

export function PassageFileCard({
  passage,
  selected,
  onToggleSelect,
  onViewDetail,
}: {
  passage: PassageItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onViewDetail: (id: string) => void;
}) {
  const data = parseAnalysis(passage.analysis);
  const isAnalyzed = !!passage.analysis;
  const vocabCount = data?.vocabulary?.length ?? 0;
  const grammarCount = data?.grammarPoints?.length ?? 0;
  const syntaxCount = data?.syntaxAnalysis?.length ?? 0;
  const keySentenceCount = data?.structure?.topicSentenceIndex != null ? 1 : 0;
  const examPointCount = (data?.examDesign?.paraphrasableSegments?.length ?? 0) + (data?.examDesign?.structureTransformPoints?.length ?? 0);
  const mainIdea = data?.structure?.mainIdea;
  const wordCount = passage.content.trim().split(/\s+/).filter((w: string) => w.length > 0).length;

  const borderColor = isAnalyzed ? "border-emerald-200" : "border-slate-200";
  const dragRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ passageId: passage.id, title: passage.title, type: "passage" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [passage.id, passage.title]);

  return (
    <div
      ref={dragRef}
      onClick={() => onViewDetail(passage.id)}
      className={`group relative rounded-xl border ${borderColor} bg-white p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
        selected ? "ring-2 ring-blue-400" : ""
      } ${isDragging ? "opacity-40 scale-95" : ""}
      `}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(passage.id, e.shiftKey); }}
              className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                selected ? "bg-blue-600 text-white border border-blue-600" : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
              }`}
            >
              <Check className="w-3 h-3" />
            </button>
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                {passage.title}
              </h4>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isAnalyzed ? (
                  <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400">분석 대기</span>
                )}
                <span className="text-[10px] text-slate-400">{wordCount} words</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-3">
          {passage.content.length > 200 ? passage.content.slice(0, 200) + "..." : passage.content}
        </p>

        {(passage.school || passage.grade || passage.unit || passage.publisher) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
            {passage.school && <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">{passage.school.name}</Badge>}
            {passage.grade && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.grade}학년</Badge>}
            {passage.semester && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{getSemesterLabel(passage.semester)}</Badge>}
            {passage.unit && <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{passage.unit}</Badge>}
            {passage.publisher && <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-slate-500">{passage.publisher}</Badge>}
          </div>
        )}

        {isAnalyzed && mainIdea && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-2 line-clamp-2">{mainIdea}</p>
        )}

        {isAnalyzed && (
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {vocabCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                <BookOpen className="w-3 h-3" />어휘 {vocabCount}
              </span>
            )}
            {grammarCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                <PenTool className="w-3 h-3" />문법 {grammarCount}
              </span>
            )}
            {syntaxCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                <Braces className="w-3 h-3" />구문 {syntaxCount}
              </span>
            )}
            {keySentenceCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                핵심문장 {keySentenceCount}
              </span>
            )}
            {examPointCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                출제포인트 {examPointCount}
              </span>
            )}
          </div>
        )}

        <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] text-blue-500 font-medium">클릭하여 상세 보기</span>
        </div>
    </div>
  );
}
