// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  FileText,
  Pencil,
  ClipboardList,
  MoreHorizontal,
  Star,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import {
  TYPE_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_CONFIG,
} from "./question-type-filter";
import { parseJSON } from "./shared/helpers";
import { StructuredQuestionRenderer } from "./question-renderers";
import { CollapsedPreview } from "./question-bank-card/collapsed-preview";
import { ExplanationSection } from "./question-bank-card/explanation-section";
import { parseQuestionSections } from "./question-bank-card/parse-question-sections";
import { renderFormatted } from "./question-bank-card/render-formatted";
import { RenderedSections } from "./question-bank-card/rendered-sections";
import type { QuestionBankItem } from "./question-bank-card/types";
import {
  getVisibleQuestionTags,
  sanitizeAiModelDisclosureText,
} from "@/lib/question-generation-plans";

export type { QuestionBankItem } from "./question-bank-card/types";

// ---------------------------------------------------------------------------
// QuestionBankCard
// ---------------------------------------------------------------------------

function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(/[([]?\s*(?:[A-Ja-j]|10|[1-9]|[①②③④⑤⑥⑦⑧⑨⑩])\s*[)\].:]?/g);
  if (matches?.length) {
    matches.forEach((match) => {
      const label = normalizeAnswerLabel(match);
      if (label) labels.add(label);
    });
  } else {
    const label = normalizeAnswerLabel(correctAnswer);
    if (label) labels.add(label);
  }
  return labels;
}

function normalizeAnswerLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circled = "①②③④⑤⑥⑦⑧⑨⑩";
  const circledIndex = circled.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text.replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1").toLowerCase();
}

export function QuestionBankCard({
  q,
  num,
  selected,
  onToggle,
  onDelete,
  onApprove,
  onToggleStar,
  onEdit,
  viewSize = "lg",
  showManagementActions = true,
  showStar = true,
  enableDrag = true,
}: {
  q: QuestionBankItem;
  num: number;
  selected: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onToggleStar?: () => void;
  onEdit?: () => void;
  viewSize?: "lg" | "md" | "sm";
  showManagementActions?: boolean;
  showStar?: boolean;
  enableDrag?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const correctAnswerLabels = parseCorrectAnswerLabels(q.correctAnswer);
  const tags: string[] = Array.isArray(q.tags)
    ? q.tags
    : parseJSON<string[]>(q.tags, []);
  const visibleTags = getVisibleQuestionTags(tags);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
  const structuredQuestion =
    q.structuredData && typeof q.structuredData === "object" && "_typeId" in q.structuredData
      ? (q.structuredData as Record<string, unknown>)
      : null;

  // Parse questionText into structured sections
  const sections = useMemo(
    () => parseQuestionSections(q.questionText, q.subType),
    [q.questionText, q.subType],
  );

  // Make card draggable
  useEffect(() => {
    if (!enableDrag) return;
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ questionId: q.id, type: "question" }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [enableDrag, q.id]);

  const collapsedPx =
    viewSize === "lg" ? 280 : viewSize === "md" ? 240 : 200;

  const questionClamp =
    viewSize === "lg" ? "line-clamp-3" : "line-clamp-2";

  return (
    <Card
      ref={dragRef}
      className={`${enableDrag ? "cursor-grab active:cursor-grabbing" : ""} flex flex-col ${
        expanded ? "" : "overflow-hidden"
      } ${
        isDragging ? "opacity-40 scale-95" : ""
      } ${
        selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:shadow-md"
      }`}
      style={expanded ? undefined : {
        maxHeight: `${collapsedPx}px`,
      }}
    >
      <CardContent ref={contentRef} className={`p-3 flex flex-col gap-1.5 ${expanded ? "space-y-2" : ""}`}>
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="shrink-0"
          />
          {showStar && (
            onToggleStar ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
                className="shrink-0 p-0.5 rounded hover:bg-yellow-50 transition-colors"
                aria-label={q.starred ? "중요 해제" : "중요 표시"}
                aria-pressed={q.starred}
              >
                <Star
                  className={`w-3.5 h-3.5 transition-colors ${
                    q.starred
                      ? "fill-yellow-400 text-yellow-500"
                      : "text-slate-300 hover:text-yellow-400"
                  }`}
                />
              </button>
            ) : (
              <span className="shrink-0 p-0.5" aria-hidden="true">
                <Star
                  className={`w-3.5 h-3.5 ${
                    q.starred ? "fill-yellow-400 text-yellow-500" : "text-slate-300"
                  }`}
                />
              </span>
            )
          )}
          <span className="text-[13px] font-bold text-slate-500 shrink-0">
            {num}.
          </span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {TYPE_LABELS[q.type] || q.type}
          </Badge>
          {q.subType && SUBTYPE_LABELS[q.subType] && (
            <Badge variant="outline" className="text-[10px] shrink-0 bg-slate-50">
              {SUBTYPE_LABELS[q.subType]}
            </Badge>
          )}
          {diffConfig && (
            <Badge
              variant="outline"
              className={`text-[10px] shrink-0 ${diffConfig.className}`}
            >
              {diffConfig.label}
            </Badge>
          )}
          {q.approved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          )}
          {(q.examLinks?.length ?? 0) > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title={`${q.examLinks.length}개 시험지에 사용됨`}
                  aria-label="이 문제가 포함된 시험지 보기"
                  className="h-5 px-1.5 rounded-md flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shrink-0"
                >
                  <ClipboardList className="w-3 h-3 shrink-0" />
                  {q.examLinks.length}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-60 p-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-1 text-[11px] font-semibold text-slate-500">
                  이 문제가 포함된 시험지
                </div>
                <div className="flex flex-col max-h-64 overflow-y-auto">
                  {q.examLinks.map(({ exam }) => (
                    <a
                      key={exam.id}
                      href={`/director/exams/${exam.id}`}
                      className="px-2 py-1.5 rounded-md text-[12px] text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{exam.title}</span>
                    </a>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {/* Expand/Collapse toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); if (!expanded) setPassageOpen(false); }}
              aria-expanded={expanded}
              title={expanded ? "문제 내용 접기" : "문제 전체 내용 펼치기"}
              className={`group/expand h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold transition-colors border ${
                expanded
                  ? "text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                  : "text-blue-600 bg-blue-50/70 border-blue-200 hover:bg-blue-100 hover:text-blue-700"
              }`}
            >
              {expanded ? (
                <><ChevronUp className="w-3.5 h-3.5" />접기</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5 transition-transform group-hover/expand:translate-y-0.5" />펼치기</>
              )}
            </button>
            {showManagementActions && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                  }}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreHorizontal className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={onEdit}
                    >
                      <Eye className="w-3.5 h-3.5 mr-2" />
                      상세 보기
                    </DropdownMenuItem>
                    {!q.approved && (
                      <DropdownMenuItem onClick={onApprove}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                        승인
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-red-600">
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        {visibleTags.length > 0 && viewSize !== "sm" && (
          <div className="flex gap-1 overflow-hidden shrink-0 h-5">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap shrink-0"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Passage reference with independent toggle */}
        {q.passage && viewSize !== "sm" && (
          <div className="shrink-0 bg-slate-50 rounded-lg border border-slate-100">
            <button
              onClick={(e) => { e.stopPropagation(); setPassageOpen(!passageOpen); }}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[11px] text-slate-600 truncate flex-1 text-left font-medium">
                {sanitizeAiModelDisclosureText(q.passage.title)}
              </span>
              {passageOpen ? (
                <ChevronUp className="w-3 h-3 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              )}
            </button>
            {passageOpen && q.passage.content && (
              <div className="px-2.5 pb-2 border-t border-slate-100">
                <p className="text-[11px] text-slate-500 leading-relaxed mt-2 font-mono whitespace-pre-line max-h-[250px] overflow-y-auto">
                  {q.passage.content}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Question content: collapsed vs expanded ── */}
        {expanded ? (
          <>
            {/* Expanded: full structured rendering */}
            {structuredQuestion ? (
              <StructuredQuestionRenderer
                question={structuredQuestion}
                index={num - 1}
                hideHeader
                sourcePassageContent={q.passage?.content}
              />
            ) : (
              <RenderedSections sections={sections} expanded />
            )}

            {/* Options (MC) */}
            {!structuredQuestion && options.length > 0 && (
              <div className="space-y-1 pl-1">
                {options.map((opt) => {
                  const isCorrect = correctAnswerLabels.has(normalizeAnswerLabel(opt.label));
                  return (
                    <div
                      key={opt.label}
                      className={`flex items-start gap-2 text-[12px] rounded px-2 py-1 ${
                        isCorrect
                          ? "bg-emerald-50 text-emerald-800 font-medium"
                          : "text-slate-600"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          isCorrect
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {opt.label}
                      </span>
                      <span className="pt-0.5">{renderFormatted(opt.text)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Non-MC correct answer */}
            {!structuredQuestion && options.length === 0 && q.correctAnswer && (
              <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded">
                <span className="font-medium">정답:</span> {renderFormatted(q.correctAnswer)}
              </div>
            )}
          </>
        ) : (
          /* Collapsed: smart preview */
          <CollapsedPreview
            sections={sections}
            options={options}
            correctAnswer={q.correctAnswer}
            questionClamp={questionClamp}
          />
        )}

        {/* Explanation toggle */}
        <ExplanationSection explanation={q.explanation} />

        {/* Footer */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1.5 border-t border-slate-100 mt-auto shrink-0">
          <span>{formatDate(q.createdAt)}</span>
          {q._count.examLinks > 0 && (
            <span>시험 {q._count.examLinks}회 사용</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
