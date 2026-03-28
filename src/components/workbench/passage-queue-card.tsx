"use client";

import { useState, memo } from "react";
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Eye,
  Clock,
  Check,
  BookOpen,
  PenTool,
  Braces,
  MessageSquare,
  Target,
  LayoutList,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { QueuedPassage, QueuedPassageStatus } from "@/hooks/use-passage-queue";

// ─── Status Config ───────────────────────────────────────
const STATUS_CONFIG: Record<
  QueuedPassageStatus,
  { label: string; icon: React.ElementType; color: string; bgColor: string; borderColor: string; pulseRing?: boolean }
> = {
  pending: {
    label: "대기 중",
    icon: Clock,
    color: "text-slate-500",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
  },
  analyzing: {
    label: "분석 중",
    icon: Loader2,
    color: "text-blue-600",
    bgColor: "bg-blue-50/60",
    borderColor: "border-blue-200",
    pulseRing: true,
  },
  done: {
    label: "분석 완료",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bgColor: "bg-white",
    borderColor: "border-emerald-200",
  },
  error: {
    label: "오류 발생",
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-50/40",
    borderColor: "border-red-200",
  },
};

// ─── Analysis Summary Mini ───────────────────────────────
function AnalysisMiniSummary({ data }: { data: QueuedPassage["analysisData"] }) {
  if (!data) return null;

  const vocabCount = data.vocabulary?.length || 0;
  const grammarCount = data.grammarPoints?.length || 0;
  const syntaxCount = data.syntaxAnalysis?.length || 0;
  const keySentenceCount = data.structure?.topicSentenceIndex != null ? 1 : 0;
  const examPointCount =
    (data.examDesign?.paraphrasableSegments?.length || 0) +
    (data.examDesign?.structureTransformPoints?.length || 0);
  const mainIdea = data.structure?.mainIdea;

  return (
    <div className="mt-3 space-y-2">
      {mainIdea && (
        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
          {mainIdea}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {vocabCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
            <BookOpen className="w-3 h-3" />
            어휘 {vocabCount}
          </span>
        )}
        {grammarCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
            <PenTool className="w-3 h-3" />
            문법 {grammarCount}
          </span>
        )}
        {syntaxCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded">
            <Braces className="w-3 h-3" />
            구문 {syntaxCount}
          </span>
        )}
        {keySentenceCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
            <MessageSquare className="w-3 h-3" />
            핵심문장 {keySentenceCount}
          </span>
        )}
        {examPointCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
            <Target className="w-3 h-3" />
            출제포인트 {examPointCount}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Card Component ──────────────────────────────────────
interface PassageQueueCardProps {
  passage: QueuedPassage;
  selected?: boolean;
  onToggleSelect?: (passageId: string, shiftKey: boolean) => void;
  onViewDetail: (passageId: string) => void;
  onRetry: (passageId: string) => void;
  onRemove: (passageId: string) => void;
}

export const PassageQueueCard = memo(function PassageQueueCard({
  passage,
  selected = false,
  onToggleSelect,
  onViewDetail,
  onRetry,
  onRemove,
}: PassageQueueCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const config = STATUS_CONFIG[passage.status];
  const StatusIcon = config.icon;

  const questionsCount = passage.passageData.questions.length;

  return (
    <div
      className={`group relative rounded-xl border ${config.borderColor} ${config.bgColor} p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
        selected ? "ring-2 ring-blue-400" : ""
      }`}
      onClick={() => {
        if (passage.status === "done" || passage.status === "error") {
          onViewDetail(passage.id);
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (passage.status === "done" || passage.status === "error") {
            onViewDetail(passage.id);
          }
        }
      }}
      aria-label={`${passage.title} - ${config.label}`}
    >
      {/* Analyzing pulse ring */}
      {config.pulseRing && (
        <div className="absolute -inset-px rounded-xl border-2 border-blue-300 animate-pulse pointer-events-none" />
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {/* Checkbox */}
          {onToggleSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(passage.id, e.shiftKey); }}
              className={`w-[18px] h-[18px] rounded flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                selected
                  ? "bg-blue-600 text-white border border-blue-600"
                  : "bg-white border border-slate-300 text-transparent hover:border-blue-400 hover:text-blue-400"
              }`}
            >
              <Check className="w-3 h-3" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-semibold text-slate-800 truncate">
              {passage.title}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              {passage.status !== "done" && (
                <StatusIcon
                  className={`w-3 h-3 ${config.color} ${passage.status === "analyzing" ? "animate-spin" : ""}`}
                />
              )}
              <span className={`text-[10px] font-medium ${config.color}`}>
                {config.label}
              </span>
              <span className="text-[10px] text-slate-400">
                {passage.wordCount} words
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {passage.status === "done" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onViewDetail(passage.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                분석 결과 보기
              </TooltipContent>
            </Tooltip>
          )}
          {passage.status === "error" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onRetry(passage.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-blue-50 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                다시 분석
              </TooltipContent>
            </Tooltip>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onRemove(passage.id)}
                className="text-[10px] font-medium text-red-600 hover:text-red-700 px-1.5 py-0.5 rounded bg-red-50"
              >
                삭제
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] font-medium text-slate-500 hover:text-slate-700 px-1.5 py-0.5"
              >
                취소
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                큐에서 제거
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Content preview */}
      <p className="text-[11px] text-slate-500 leading-relaxed mt-2.5 line-clamp-3">
        {passage.contentPreview}
      </p>

      {/* Metadata tags */}
      {(passage.schoolName || passage.grade || passage.unit || passage.publisher) && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          {passage.schoolName && (
            <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium">
              {passage.schoolName}
            </Badge>
          )}
          {passage.grade && (
            <Badge variant="secondary" className="text-[9px] h-5 px-1.5">
              {passage.grade}학년
            </Badge>
          )}
          {passage.semester && (
            <Badge variant="secondary" className="text-[9px] h-5 px-1.5">
              {passage.semester === "FIRST" ? "1학기" : "2학기"}
            </Badge>
          )}
          {passage.unit && (
            <Badge variant="secondary" className="text-[9px] h-5 px-1.5">
              {passage.unit}
            </Badge>
          )}
          {passage.publisher && (
            <Badge variant="outline" className="text-[9px] h-5 px-1.5 text-slate-500">
              {passage.publisher}
            </Badge>
          )}
        </div>
      )}

      {/* Error message */}
      {passage.status === "error" && passage.error && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100">
          <p className="text-[11px] text-red-600 leading-relaxed">{passage.error}</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry(passage.id);
            }}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
          >
            <RotateCcw className="w-3 h-3" />
            다시 시도
          </button>
        </div>
      )}

      {/* Analysis progress indicator */}
      {passage.status === "analyzing" && (
        <div className="mt-3">
          <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-pulse"
              style={{ width: "65%", transition: "width 0.3s ease" }}
            />
          </div>
          <p className="text-[10px] text-blue-500 mt-1.5">
            AI가 5층 분석을 수행 중입니다...
          </p>
        </div>
      )}

      {/* Analysis summary for completed */}
      {passage.status === "done" && passage.analysisData && (
        <AnalysisMiniSummary data={passage.analysisData} />
      )}

      {/* Questions count */}
      {questionsCount > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <LayoutList className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] text-slate-400 font-medium">
            문제 {questionsCount}개
          </span>
        </div>
      )}

      {/* Click hint for completed cards */}
      {passage.status === "done" && (
        <div className="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[9px] text-blue-500 font-medium">클릭하여 상세 보기</span>
        </div>
      )}
    </div>
  );
});
