// @ts-nocheck
"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  BookOpen,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import {
  getVisibleQuestionTags,
  sanitizeAiModelDisclosureText,
} from "@/lib/question-generation-plans";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import type { PassageData } from "./admin-passage-detail/types";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
  parseJSON,
} from "./admin-passage-detail/helpers";
import { SectionHeader } from "./admin-passage-detail/section-header";
import { ReadonlyQuestionCard } from "./admin-passage-detail/readonly-question-card";
import {
  GrammarPoints,
  NotesSection,
  SentenceTranslations,
  StructureSection,
  VocabularyTable,
} from "./admin-passage-detail/analysis-sections";

interface Props {
  passage: PassageData;
  academyId: string;
}

export function AdminPassageDetail({ passage, academyId }: Props) {
  const analysisData = useMemo<PassageAnalysisData | null>(() => {
    if (!passage.analysis?.analysisData) return null;
    try {
      return JSON.parse(passage.analysis.analysisData);
    } catch {
      return null;
    }
  }, [passage.analysis]);

  const tags = getVisibleQuestionTags(parseJSON<string[]>(passage.tags, []));

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/academies/${academyId}/passages`}
          className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          지문 목록
        </Link>
      </div>

      {/* Passage header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 shrink-0">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[18px] font-bold text-slate-900">
              {sanitizeAiModelDisclosureText(passage.title) || "제목 없음"}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {passage.grade && (
                <span className="text-[12px] text-slate-500">
                  {passage.grade}학년
                </span>
              )}
              {passage.semester && (
                <span className="text-[12px] text-slate-500">
                  {passage.semester === "FIRST" ? "1학기" : "2학기"}
                </span>
              )}
              {passage.unit && (
                <span className="text-[12px] text-slate-500">
                  {passage.unit}
                </span>
              )}
              {passage.publisher && (
                <span className="text-[12px] text-slate-500">
                  {passage.publisher}
                </span>
              )}
              {passage.school && (
                <Badge variant="outline" className="text-[10px]">
                  {passage.school.name}
                </Badge>
              )}
              {passage.difficulty && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    DIFFICULTY_COLORS[passage.difficulty],
                  )}
                >
                  {DIFFICULTY_LABELS[passage.difficulty] || passage.difficulty}
                </Badge>
              )}
              {passage.source && (
                <span className="text-[11px] text-slate-400">
                  출처: {sanitizeAiModelDisclosureText(passage.source)}
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-2">
              {formatDate(passage.createdAt)} 생성
            </div>
          </div>
        </div>
      </div>

      {/* Passage content */}
      <SectionHeader icon={BookOpen} title="지문 원문" defaultOpen={true}>
        <div className="p-5">
          <p className="text-[14px] text-slate-700 leading-[2] font-mono whitespace-pre-wrap">
            {passage.content}
          </p>
        </div>
      </SectionHeader>

      {/* Analysis: Sentence translations */}
      {analysisData?.sentences && analysisData.sentences.length > 0 && (
        <SentenceTranslations sentences={analysisData.sentences} />
      )}

      {/* Analysis: Vocabulary */}
      {analysisData?.vocabulary && analysisData.vocabulary.length > 0 && (
        <VocabularyTable vocabulary={analysisData.vocabulary} />
      )}

      {/* Analysis: Grammar points */}
      {analysisData?.grammarPoints && analysisData.grammarPoints.length > 0 && (
        <GrammarPoints grammarPoints={analysisData.grammarPoints} />
      )}

      {/* Analysis: Structure */}
      {analysisData?.structure && (
        <StructureSection structure={analysisData.structure} />
      )}

      {/* Notes */}
      {passage.notes.length > 0 && <NotesSection notes={passage.notes} />}

      {/* Questions */}
      <SectionHeader
        icon={HelpCircle}
        title="연결된 문제"
        count={passage.questions.length}
        defaultOpen={true}
      >
        {passage.questions.length === 0 ? (
          <div className="text-center py-10 text-[13px] text-slate-400">
            이 지문에 연결된 문제가 없습니다
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {passage.questions.map((q, i) => (
              <ReadonlyQuestionCard key={q.id} q={q} num={i + 1} />
            ))}
          </div>
        )}
      </SectionHeader>
    </div>
  );
}
