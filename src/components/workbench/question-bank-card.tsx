// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileText,
  Pencil,
  Layers,
  ClipboardList,
  Clock,
  Star,
  XCircle,
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
import { formatDate } from "@/lib/utils";
import {
  TYPE_LABELS,
  SUBTYPE_LABELS,
  DIFFICULTY_CONFIG,
} from "./question-type-filter";
import { parseJSON } from "./shared/helpers";
import { StructuredQuestionRenderer } from "./question-renderers";
import { ReviewStatusStamp } from "./question-card";
import { CollapsedPreview } from "./question-bank-card/collapsed-preview";
import { ExplanationSection } from "./question-bank-card/explanation-section";
import { parseQuestionSections } from "./question-bank-card/parse-question-sections";
import { renderFormatted } from "./question-bank-card/render-formatted";
import { RenderedSections } from "./question-bank-card/rendered-sections";
import type { QuestionBankItem } from "./question-bank-card/types";
import { shouldIgnoreCardClick } from "./shared/card-click";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { optionDisplayTextForSubtype } from "@/components/exams/paper-builder/option-display";
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
  onUnapprove,
  onToggleStar,
  onDetail,
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
  onUnapprove?: () => void;
  onToggleStar?: () => void;
  onDetail?: () => void;
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
  const suppressCardClickRef = useRef(false);

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const displayOptions =
    q.subType === "SENTENCE_INSERT"
      ? options.map((option, index) => ({
          ...option,
          text: optionDisplayTextForSubtype(q.subType, index, option.text),
        }))
      : options;
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
  const displayQuestionText = repairGrammarCorrectionQuestionText({
    subType: q.subType,
    questionText: q.questionText,
    structuredData: q.structuredData,
  });

  // Parse questionText into structured sections
  const sections = useMemo(
    () => parseQuestionSections(displayQuestionText, q.subType),
    [displayQuestionText, q.subType],
  );

  // Make card draggable
  useEffect(() => {
    if (!enableDrag) return;
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ questionId: q.id, type: "question" }),
      onDragStart: () => {
        suppressCardClickRef.current = true;
        setIsDragging(true);
      },
      onDrop: () => {
        setIsDragging(false);
        window.setTimeout(() => {
          suppressCardClickRef.current = false;
        }, 0);
      },
    });
  }, [enableDrag, q.id]);

  const questionClamp =
    viewSize === "lg" ? "line-clamp-3" : "line-clamp-2";

  // Review action footer (검수완료/검수취소 + 수정하기 + stamp) — only in managed contexts
  const showReviewActions =
    showManagementActions && Boolean(q.id) && Boolean(onApprove || onUnapprove);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      (!onDetail && !onEdit) ||
      suppressCardClickRef.current ||
      shouldIgnoreCardClick(e)
    ) {
      return;
    }
    if (onDetail) onDetail();
    else onEdit?.();
  };

  return (
    <Card
      ref={dragRef}
      onClick={handleCardClick}
      className={`${enableDrag ? "cursor-grab active:cursor-grabbing" : onDetail || onEdit ? "cursor-pointer" : ""} flex flex-col ${
        expanded ? "" : "overflow-hidden"
      } ${
        isDragging ? "opacity-40 scale-95" : ""
      } ${
        selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:shadow-md"
      } ${
        !q.approved
          ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]"
          : ""
      }`}
    >
      <CardContent ref={contentRef} className={`p-3 flex flex-col gap-1.5 ${expanded ? "" : "flex-1 min-h-0"}`}>
        {/* Header row */}
        <div className="flex items-start gap-1.5 shrink-0">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
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
          <span className="text-xs font-bold text-slate-400 shrink-0">
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
          {q.aiGenerated && (
            <Layers className="w-3 h-3 text-blue-400 shrink-0" />
          )}
          {q.approved ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {showManagementActions && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-red-500 hover:bg-red-50 hover:text-red-600"
                aria-label="삭제"
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
            {/* Expand/Collapse toggle */}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); if (!expanded) setPassageOpen(false); }}
              aria-expanded={expanded}
              title={expanded ? "문제 내용 접기" : "문제 전체 내용 펼치기"}
              className="group/expand inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
            >
              {expanded ? (
                <><ChevronUp className="size-3.5" />접기</>
              ) : (
                <><ChevronDown className="size-3.5 transition-transform group-hover/expand:translate-y-0.5" />펼치기</>
              )}
            </button>
          </div>
        </div>

        <div className={`flex flex-col ${expanded ? "gap-2" : "gap-1.5 flex-1 min-h-0 overflow-hidden"}`}>
        {/* Tags — compact view caps at 3 (+N overflow); expanding shows all.
            Keeps the card from drowning in topic chips. */}
        {visibleTags.length > 0 && viewSize !== "sm" && (
          <div className="flex flex-wrap items-center gap-1 shrink-0">
            {(expanded ? visibleTags : visibleTags.slice(0, 3)).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-100 whitespace-nowrap"
              >
                {tag}
              </span>
            ))}
            {!expanded && visibleTags.length > 3 && (
              <span
                title={visibleTags.join(", ")}
                className="text-[10px] px-1 py-0.5 font-semibold text-slate-400 whitespace-nowrap"
              >
                +{visibleTags.length - 3}
              </span>
            )}
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
            {!structuredQuestion && displayOptions.length > 0 && (
              <div className="space-y-1 pl-1">
                {displayOptions.map((opt) => {
                  const isCorrect = correctAnswerLabels.has(normalizeAnswerLabel(opt.label));
                  return (
                    <div
                      key={opt.label}
                      className={`flex items-start gap-2.5 text-[12px] rounded px-2 py-1 ${
                        isCorrect
                          ? "bg-emerald-50 text-emerald-800 font-medium"
                          : "text-slate-600"
                      }`}
                    >
                      <span
                        className={`shrink-0 text-[13px] font-bold tabular-nums pt-px ${
                          isCorrect ? "text-emerald-600" : "text-slate-400"
                        }`}
                      >
                        {opt.label}.
                      </span>
                      <span className="pt-0.5">{renderFormatted(opt.text)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Non-MC correct answer */}
            {!structuredQuestion && displayOptions.length === 0 && q.correctAnswer && (
              <div className="text-[12px] bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded">
                <span className="font-medium">정답:</span> {renderFormatted(q.correctAnswer)}
              </div>
            )}
          </>
        ) : (
          /* Collapsed: smart preview */
          <CollapsedPreview
            sections={sections}
            options={displayOptions}
            correctAnswer={q.correctAnswer}
            questionClamp={questionClamp}
          />
        )}

        {/* Explanation toggle */}
        <ExplanationSection explanation={q.explanation} />
        </div>

        {/* Footer: review actions (검수완료/취소 + 수정) */}
        <div className="space-y-2 pt-1.5 border-t border-slate-100 shrink-0">
          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] text-slate-400">
              <span>{formatDate(q.createdAt)}</span>
              {q._count.examLinks > 0 && (
                <span>시험 {q._count.examLinks}회 사용</span>
              )}
            </div>
            {!showReviewActions && (
              <ReviewStatusStamp approved={q.approved} className="shrink-0" />
            )}
          </div>
          {showReviewActions && (
            <div className="flex items-end gap-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {q.approved ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!onUnapprove}
                    className="h-7 flex-1 border border-red-200 bg-red-50 px-2 text-[11px] font-semibold text-red-600 shadow-none hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:bg-red-50 disabled:text-red-300 disabled:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnapprove?.();
                    }}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    검수취소
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!onApprove}
                    className="h-7 flex-1 border border-green-200 bg-green-50/60 px-2 text-[11px] font-semibold text-green-700 shadow-none hover:border-green-300 hover:bg-green-50 hover:text-green-800 disabled:border-green-100 disabled:bg-green-50/50 disabled:text-green-300 disabled:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApprove?.();
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    검수완료
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 flex-1 justify-center gap-1.5 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                  onClick={handleEdit}
                >
                  <Pencil className="w-3 h-3" />
                  수정하기
                </Button>
              </div>
              <ReviewStatusStamp approved={q.approved} className="shrink-0" />
            </div>
          )}
        </div>

        {/* Footer — exam-usage history band: shows whether (and where) this
            question has already been placed on an exam paper. */}
        {(() => {
          const usedCount = q._count?.examLinks ?? 0;
          const used = usedCount > 0;
          const links = q.examLinks ?? [];
          const hasList = used && links.length > 0;
          const createdLabel = formatDate(q.createdAt);

          const inner = (
            <>
              <ClipboardList
                className={`w-3.5 h-3.5 shrink-0 ${used ? "text-blue-500" : "text-slate-300"}`}
                aria-hidden="true"
              />
              <span
                className={`text-[11px] font-semibold ${used ? "text-blue-700" : "text-slate-400"}`}
              >
                {used ? `${usedCount}개 시험지에 사용됨` : "아직 사용 안 됨"}
              </span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-400">
                {createdLabel}
              </span>
              {hasList && (
                <ChevronDown className="w-3 h-3 shrink-0 text-blue-400" aria-hidden="true" />
              )}
            </>
          );

          const bandTone = used
            ? "border-blue-100 bg-blue-50/70"
            : "border-slate-100 bg-slate-50/70";

          if (hasList) {
            const sortedLinks = [...links].sort((a, b) => {
              const at = a.exam.createdAt ? new Date(a.exam.createdAt).getTime() : 0;
              const bt = b.exam.createdAt ? new Date(b.exam.createdAt).getTime() : 0;
              return bt - at;
            });
            return (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="이 문제가 포함된 시험지 보기"
                    className={`mt-auto flex w-full shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors hover:bg-blue-100/70 ${bandTone}`}
                  >
                    {inner}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-64 p-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-500">
                    이 문제가 포함된 시험지 {usedCount}개
                  </div>
                  <div className="flex max-h-64 flex-col overflow-y-auto">
                    {sortedLinks.map(({ exam }) => (
                      <a
                        key={exam.id}
                        href={`/director/exams/${exam.id}`}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-100"
                      >
                        <FileText className="w-3 h-3 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate text-[12px] text-slate-700">
                          {exam.title}
                        </span>
                        {exam.createdAt && (
                          <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                            {formatDate(exam.createdAt)}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            );
          }

          return (
            <div
              className={`mt-auto flex w-full shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 ${bandTone}`}
            >
              {inner}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
