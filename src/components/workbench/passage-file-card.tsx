// @ts-nocheck
"use client";

import { useState, useRef, useEffect } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  Check,
  BookOpen,
  PenTool,
  Braces,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSemesterLabel } from "@/lib/utils";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import { isDirectInputPassage } from "@/lib/passage-source";
import { DragHandle, makeCardDragPreview } from "@/components/ui/drag-handle";
import { CardHoverActionLabel } from "@/components/ui/card-hover-action-label";

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
  dupCount,
}: {
  passage: PassageItem;
  selected: boolean;
  onToggleSelect: (id: string, shift: boolean) => void;
  onViewDetail: (id: string) => void;
  /** Optional. When this passage is part of a duplicate cluster, the number
   *  of *other* passages that share its normalized content. */
  dupCount?: number;
}) {
  const data = parseAnalysis(passage.analysis);
  const isAnalyzed = !!passage.analysis;
  const isDirectInput = isDirectInputPassage(passage.source);
  const vocabCount = data?.vocabulary?.length ?? 0;
  const grammarCount = data?.grammarPoints?.length ?? 0;
  const syntaxCount = data?.syntaxAnalysis?.length ?? 0;
  const keySentenceCount = data?.structure?.topicSentenceIndex != null ? 1 : 0;
  const examPointCount = (data?.examDesign?.paraphrasableSegments?.length ?? 0) + (data?.examDesign?.structureTransformPoints?.length ?? 0);
  const mainIdea = data?.structure?.mainIdea;
  const wordCount = passage.content.trim().split(/\s+/).filter((w: string) => w.length > 0).length;

  const borderColor = isAnalyzed ? "border-emerald-200" : "border-slate-200";
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // 네이티브 드래그(폴더 이동)는 손잡이에만 등록 → 카드 본문은 영역 선택용.
    const el = dragHandleRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        passageId: passage.id,
        title: sanitizeAiModelDisclosureText(passage.title),
        type: "passage",
      }),
      onGenerateDragPreview: makeCardDragPreview(dragRef),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [passage.id, passage.title]);

  return (
    <div
      ref={dragRef}
      data-drag-item-id={passage.id}
      onClick={() => onViewDetail(passage.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onViewDetail(passage.id);
      }}
      className={`group relative flex h-full flex-col rounded-xl border ${borderColor} bg-white px-4 py-2.5 transition-all duration-200 hover:shadow-md cursor-pointer ${
        selected ? "ring-2 ring-blue-400" : ""
      } ${isDragging ? "opacity-40 scale-95" : ""}
      `}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <DragHandle ref={dragHandleRef} className="mt-0.5 shrink-0" />
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
                {sanitizeAiModelDisclosureText(passage.title)}
              </h4>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {isAnalyzed ? (
                  <span className="text-[10px] font-medium text-emerald-600">분석 완료</span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400">분석 대기</span>
                )}
                {isDirectInput && (
                  <span className="inline-flex items-center text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    직접 입력
                  </span>
                )}
                <span className="text-[10px] text-slate-400">{wordCount} words</span>
                {dupCount && dupCount > 0 ? (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 tabular-nums"
                    title={`동일한 내용의 지문 ${dupCount}편이 더 존재합니다`}
                  >
                    <Copy className="w-2.5 h-2.5" />
                    {dupCount} 중복
                  </span>
                ) : null}
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
                <PenTool className="w-3 h-3" />어법 {grammarCount}
              </span>
            )}
            {syntaxCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
                <Braces className="w-3 h-3" />읽기포인트 {syntaxCount}
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

        <CardHoverActionLabel />
    </div>
  );
}
