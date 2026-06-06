// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileText,
  Pencil,
  Layers,
  ClipboardList,
  Star,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverAnchor,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DetailActionButton } from "@/components/ui/detail-action-button";
import { DragHandle } from "@/components/ui/drag-handle";
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
  onShowAnalysis,
  viewSize = "lg",
  showManagementActions = true,
  showStar = true,
  enableDrag = true,
  compactUsageLabel = false,
  cardClickSelects = false,
  showDetailButton = false,
  dragRequiresSelection = false,
  getDragQuestionIds,
  getDuplicateDragQuestionIds,
  selectionIndex,
  selectionDisabled = false,
  duplicateCount,
  onDuplicateSelectConfirm,
  selectedCardHighlight = true,
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
  // 동형 문제 생성 전용: 전달된 경우에만 '분석 정보' 버튼이 보인다(동형 한정).
  onShowAnalysis?: () => void;
  viewSize?: "lg" | "md" | "sm";
  showManagementActions?: boolean;
  showStar?: boolean;
  enableDrag?: boolean;
  // 시험지 빌더(exams/create)용 간결 표기: 미사용 "0개 시험지에 미사용",
  // 사용 "N개 시험지에 사용". 기본(questions 페이지)은 기존 문구 유지.
  compactUsageLabel?: boolean;
  // 시험지 빌더: 카드 본문 클릭 시 상세 대신 체크(선택)를 토글한다.
  cardClickSelects?: boolean;
  // 시험지 빌더: 해설보기 줄 오른쪽에 '상세 보기' 버튼을 띄운다.
  showDetailButton?: boolean;
  // 영역 선택(마키) 우선 모드: 카드가 "선택된 상태"일 때만 네이티브 드래그를
  // 허용한다. 미선택 카드를 끌면 드래그 영역 선택이 동작한다.
  dragRequiresSelection?: boolean;
  // 다중 드래그: 드래그 시작 시 함께 끌고 갈 문항 id 목록을 계산한다.
  // (선택된 카드를 끌면 선택 전체, 아니면 이 카드만)
  getDragQuestionIds?: (draggedId: string) => string[];
  getDuplicateDragQuestionIds?: (draggedId: string) => string[];
  // 체크한 순서(1,2,3…). 드롭 시 이 순서대로 미리보기에 들어간다.
  selectionIndex?: number;
  // 시험지 빌더: 이미 들어간 문항은 일반 선택/드래그를 막고 흐리게 표시한다.
  selectionDisabled?: boolean;
  // 시험지 빌더: 같은 문항이 여러 번 들어간 경우 총 포함 개수를 숫자만 표시한다.
  duplicateCount?: number;
  // 시험지 빌더: 이미 들어간 문항을 다시 선택할지 확인한 뒤 체크 상태로 만든다.
  onDuplicateSelectConfirm?: () => void;
  // 시험지 빌더처럼 체크박스/순서 뱃지만으로 선택 상태를 표시할 때 카드 배경 강조를 끈다.
  selectedCardHighlight?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const [duplicatePromptOpen, setDuplicatePromptOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressCardClickRef = useRef(false);
  // 드래그 시작 시점의 최신 선택 상태를 읽기 위해 ref로 보관한다(effect 재구독 방지).
  const getDragQuestionIdsRef = useRef(getDragQuestionIds);
  const getDuplicateDragQuestionIdsRef = useRef(getDuplicateDragQuestionIds);
  useEffect(() => {
    getDragQuestionIdsRef.current = getDragQuestionIds;
  }, [getDragQuestionIds]);
  useEffect(() => {
    getDuplicateDragQuestionIdsRef.current = getDuplicateDragQuestionIds;
  }, [getDuplicateDragQuestionIds]);

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

  // Make card draggable — 단, 네이티브 드래그는 "손잡이(DragHandle)"에만 등록한다.
  // 카드 본문은 draggable 이 아니므로 본문 위에서는 영역 선택(마키)이 동작하고,
  // 손잡이를 끌면 폴더 이동 등 기존 드래그&드롭이 그대로 동작한다.
  useEffect(() => {
    if (!enableDrag || selectionDisabled) return;
    const el = dragHandleRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        questionId: q.id,
        questionIds: getDragQuestionIdsRef.current?.(q.id) ?? [q.id],
        duplicateQuestionIds: getDuplicateDragQuestionIdsRef.current?.(q.id) ?? [],
        type: "question",
      }),
      // 다중 선택 드래그: 선택한 카드들이 한 장으로 겹쳐진 듯한 미리보기 + 개수 배지.
      // (1개일 땐 기본 드래그 미리보기를 그대로 사용)
      onGenerateDragPreview: ({ nativeSetDragImage }) => {
        const count = getDragQuestionIdsRef.current?.(q.id)?.length ?? 1;
        if (count <= 1) return;
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: ({ container }) => {
            const rect = container.getBoundingClientRect();
            return { x: Math.min(120, rect.width / 2), y: 24 };
          },
          render: ({ container }) => {
            const source = dragRef.current;
            if (!source) return;
            const rect = source.getBoundingClientRect();
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";
            wrapper.style.width = `${rect.width}px`;
            wrapper.style.height = `${rect.height}px`;
            // 뒤로 살짝 어긋나게 겹친 카드 2장 — "여러 장이 한 덩어리" 느낌.
            const backCount = Math.min(2, count - 1);
            for (let i = backCount; i >= 1; i--) {
              const back = document.createElement("div");
              back.style.position = "absolute";
              back.style.inset = "0";
              back.style.transform = `translate(${i * 6}px, ${i * 6}px)`;
              back.style.borderRadius = "12px";
              back.style.background = "white";
              back.style.border = "1px solid rgb(226, 232, 240)";
              back.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
              wrapper.appendChild(back);
            }
            const clone = source.cloneNode(true) as HTMLElement;
            clone.style.position = "relative";
            clone.style.width = `${rect.width}px`;
            clone.style.margin = "0";
            clone.style.opacity = "1";
            clone.style.transform = "none";
            wrapper.appendChild(clone);
            const badge = document.createElement("div");
            badge.textContent = String(count);
            badge.style.position = "absolute";
            badge.style.top = "-10px";
            badge.style.right = "-10px";
            badge.style.minWidth = "28px";
            badge.style.height = "28px";
            badge.style.padding = "0 8px";
            badge.style.borderRadius = "14px";
            badge.style.background = "#2563eb";
            badge.style.color = "white";
            badge.style.fontSize = "13px";
            badge.style.fontWeight = "700";
            badge.style.display = "flex";
            badge.style.alignItems = "center";
            badge.style.justifyContent = "center";
            badge.style.boxShadow = "0 4px 12px rgba(37,99,235,0.35)";
            badge.style.fontVariantNumeric = "tabular-nums";
            wrapper.appendChild(badge);
            container.appendChild(wrapper);
          },
        });
      },
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
  }, [enableDrag, q.id, selectionDisabled]);

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
    if (suppressCardClickRef.current || shouldIgnoreCardClick(e)) return;
    if (selectionDisabled) {
      if (onDuplicateSelectConfirm) setDuplicatePromptOpen(true);
      return;
    }
    // 시험지 빌더: 본문 클릭은 체크(선택) 토글. 상세는 '상세 보기' 버튼으로만 연다.
    if (cardClickSelects) {
      onToggle();
      return;
    }
    if (!onDetail && !onEdit) return;
    if (onDetail) onDetail();
    else onEdit?.();
  };

  const card = (
    <Card
      ref={dragRef}
      data-drag-item-id={selectionDisabled ? undefined : q.id}
      onClick={handleCardClick}
      className={`${onDetail || onEdit || (cardClickSelects && !selectionDisabled) ? "cursor-pointer" : ""} relative flex flex-col ${
        expanded ? "" : "overflow-hidden"
      } ${
        isDragging ? "opacity-40 scale-95" : ""
      } ${
        selected && selectedCardHighlight
          ? "ring-2 ring-blue-400 bg-blue-50/30"
          : "hover:shadow-md"
      } ${
        selectionDisabled ? "border-slate-200 bg-slate-100/80 text-slate-400 shadow-none hover:shadow-none" : ""
      } ${
        !selectionDisabled && !q.approved
          ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]"
          : ""
      }`}
    >
      <CardContent ref={contentRef} className={`p-3 flex flex-col gap-1.5 ${expanded ? "" : "flex-1 min-h-0"}`}>
        {/* Header row */}
        <div className="flex items-start gap-1.5 shrink-0">
          {enableDrag && !selectionDisabled && (
            <DragHandle ref={dragHandleRef} className="mt-0.5 shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Checkbox
            checked={selected}
            aria-disabled={selectionDisabled}
            onCheckedChange={() => {
              if (selectionDisabled) {
                if (onDuplicateSelectConfirm) setDuplicatePromptOpen(true);
                return;
              }
              onToggle();
            }}
            className="shrink-0"
          />
          {selected && typeof selectionIndex === "number" && (
            <span
              className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold tabular-nums text-white"
              title={`체크 순서 ${selectionIndex}번`}
            >
              {selectionIndex}
            </span>
          )}
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
          {q.approved && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {typeof duplicateCount === "number" && duplicateCount > 1 && (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black tabular-nums text-white shadow-sm"
                title={`시험지에 ${duplicateCount}개 포함`}
              >
                {duplicateCount}
              </span>
            )}
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

        {/* Explanation toggle (+ optional 상세 보기 button on the same row) */}
        <ExplanationSection
          explanation={q.explanation}
          rightSlot={
            (showDetailButton && (onDetail || onEdit)) || onShowAnalysis ? (
              <div className="flex items-center gap-1.5">
                {showDetailButton && (onDetail || onEdit) ? (
                  <DetailActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      (onDetail ?? onEdit)?.();
                    }}
                  />
                ) : null}
                {onShowAnalysis ? (
                  <DetailActionButton
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowAnalysis();
                    }}
                  >
                    분석 정보
                  </DetailActionButton>
                ) : null}
              </div>
            ) : undefined
          }
        />
        </div>

        {/* Footer: review actions (검수완료/취소 + 수정).
            compactUsageLabel(시험지 빌더)에서는 날짜+스탬프 줄을 생략하고
            스탬프를 아래 '사용 이력' 밴드 우측으로 옮긴다. */}
        {(!compactUsageLabel || showReviewActions) && (
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
        )}

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
              {compactUsageLabel ? (
                // 칸이 좁아져도 "N개"는 항상 보이고, "시험지에 사용"만 말줄임
                // 처리(세로쓰기 방지). min-w-0 로 flex 안에서 줄어들 수 있게 한다.
                <span
                  className={`flex min-w-0 items-center gap-0.5 text-[11px] font-semibold ${used ? "text-blue-700" : "text-slate-400"}`}
                >
                  <span className="shrink-0">{usedCount}개</span>
                  <span className="min-w-0 truncate">시험지에 사용</span>
                </span>
              ) : (
                <span
                  className={`text-[11px] font-semibold ${used ? "text-blue-700" : "text-slate-400"}`}
                >
                  {used ? `${usedCount}개 시험지에 사용됨` : "아직 사용 안 됨"}
                </span>
              )}
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-400">
                {createdLabel}
              </span>
              {hasList && (
                <ChevronDown className="w-3 h-3 shrink-0 text-blue-400" aria-hidden="true" />
              )}
              {/* 시험지 빌더: 검수 도장을 밴드(카드 오른쪽 아래)로 옮겨 표시 */}
              {compactUsageLabel && (
                <ReviewStatusStamp approved={q.approved} className="ml-1 shrink-0" />
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

  if (!selectionDisabled || !onDuplicateSelectConfirm) return card;

  return (
    <Popover open={duplicatePromptOpen} onOpenChange={setDuplicatePromptOpen}>
      <div className="relative">
        {card}
        <PopoverAnchor asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 size-2 rounded-full bg-slate-400/45 ring-2 ring-white"
          />
        </PopoverAnchor>
      </div>
      <PopoverContent
        side="right"
        align="start"
        alignOffset={-6}
        sideOffset={10}
        collisionPadding={12}
        className="w-56 border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <PopoverArrow width={10} height={5} />
        <p className="text-[12px] font-bold leading-relaxed text-slate-700">
          이미 시험지에 추가된 문제입니다.
        </p>
        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
          다시 선택하시겠습니까?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setDuplicatePromptOpen(false)}
            className="flex h-7 items-center justify-center rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-50"
          >
            거절
          </button>
          <button
            type="button"
            onClick={() => {
              onDuplicateSelectConfirm();
              setDuplicatePromptOpen(false);
            }}
            className="flex h-7 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-700 transition-colors hover:bg-blue-100"
          >
            승인
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
