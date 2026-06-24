// @ts-nocheck
"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  FileText,
  Pencil,
  Gem,
  ClipboardList,
  Star,
  CheckCircle2,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
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
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { DragHandle } from "@/components/ui/drag-handle";
import { formatDate, formatDateTime } from "@/lib/utils";
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
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "./shared/card-click";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import {
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  grammarMarkerDisplayLabel,
} from "@/components/exams/paper-builder/option-display";
import {
  sanitizeAiModelDisclosureText,
  getQuestionGenerationPlanFromTags,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export type { QuestionBankItem } from "./question-bank-card/types";

// ---------------------------------------------------------------------------
// QuestionBankCard
// ---------------------------------------------------------------------------

function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(
    /[([]?\s*(?:[A-Ja-j]|10|[1-9]|[①②③④⑤⑥⑦⑧⑨⑩])\s*[)\].:]?/g,
  );
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

// 뱃지에 찍을 라벨 표시용 — 동그라미 숫자(①②③)는 평문 숫자(1,2,3)로 풀고,
// 괄호·구두점은 떼되 영문 라벨(A/B)은 대소문자를 그대로 둔다.
// (저장 데이터는 건드리지 않고 '표시'만 정규화 — 동그라미 안 동그라미 방지)
export function optionBadgeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circled = "①②③④⑤⑥⑦⑧⑨⑩";
  const circledIndex = circled.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text.replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1");
}

function normalizeAnswerLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circled = "①②③④⑤⑥⑦⑧⑨⑩";
  const circledIndex = circled.indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text
    .replace(/^[\(\[]?\s*([A-Ja-j]|10|[1-9])\s*[\)\].:]?\s*$/, "$1")
    .toLowerCase();
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
  // 시험지 미리보기에서 지금 '보고 있는'(클릭한) 문항이면 카드 테두리를 진한 파랑으로
  // 강조하고, 보이지 않으면 스크롤로 끌어온다(스크롤 anchor는 data-question-card-id).
  // selected(시험지에 포함됨)와는 별개의 시각 상태다.
  active = false,
  // 접힘(콤팩트) 모드 — 시험지 빌더 등 목록을 콤팩트하게 볼 때. 기본은 펼침(전체) 유지.
  collapsible = false,
  // 접힌(콤팩트) 카드일 때만 적용할 min-height 클래스. 같은 줄의 접힌 카드들을
  // 동일 높이로 맞춰 footer(검수완료/수정하기)를 정렬한다. 펼치면 해제되어 카드가
  // 콘텐츠대로 자라므로 self-start 래퍼의 "옆 카드 안 늘어남" 동작과 공존한다.
  // (min-height는 바닥값이라 더 큰 카드엔 영향이 없어 부작용이 없다.)
  collapsedMinHeightClass,
  // 임베드(상세 팝업 등) 표시 전용 — 본문 영역만 카드 스타일로 노출한다.
  // 손잡이/체크박스/별/삭제/접기 토글과 하단 footer(사용 이력·검수 버튼)를 모두 숨기고
  // 항상 펼친 상태로 시작한다. (지문 제목 토글·발문·지문·선지·해설 보기는 유지)
  embedded = false,
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
  // 카드 본문 단일 클릭은 선택, 더블클릭은 상세/편집을 실행한다.
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
  // 시험지 미리보기에서 현재 클릭한 문항이면 진한 파란 테두리로 강조한다.
  active?: boolean;
  collapsible?: boolean;
  collapsedMinHeightClass?: string;
  embedded?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  // 카드 접힘/펼침 — 기본은 접힘(의문문 + 지문 2줄 + 정답만 보이는 미리보기).
  // 임베드 모드는 항상 펼친 상태로 시작한다.
  const [collapsed, setCollapsed] = useState(!embedded);
  const [passageOpen, setPassageOpen] = useState(false);
  const [duplicatePromptOpen, setDuplicatePromptOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const suppressCardClickRef = useRef(false);
  // 드래그 시작 시점의 최신 선택 상태를 읽기 위해 ref로 보관한다(effect 재구독 방지).
  const getDragQuestionIdsRef = useRef(getDragQuestionIds);
  const getDuplicateDragQuestionIdsRef = useRef(getDuplicateDragQuestionIds);
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();
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
  // 지문 마커형(어법·어휘·삽입·무관)은 시험지와 동일하게 하단 보기 리스트를 숨긴다
  // (마커는 지문에만). 같은 게이트(shouldRenderOptionListForSubtype) 공유 — 접힘/펼침 모두.
  const hideOptionList =
    !!q.subType && !shouldRenderOptionListForSubtype(q.subType);
  const visibleOptions = hideOptionList ? [] : displayOptions;
  // 어법 판단(GRAMMAR_ERROR)만 라벨/마커를 원형숫자(①)로 표시(시험지 렌더 동일). 타 유형 무영향.
  const isGrammarError = q.subType === "GRAMMAR_ERROR";
  // 배지(파란 원) 안엔 평문 숫자가 들어가므로(이중 동그라미 방지) 어법 라벨 (A)→①→"1"로 푼다.
  const badgeLabel = (label: unknown) =>
    optionBadgeLabel(isGrammarError ? grammarMarkerDisplayLabel(label) : label);
  const correctAnswerLabels = parseCorrectAnswerLabels(q.correctAnswer);
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
  const structuredQuestion =
    q.structuredData &&
    typeof q.structuredData === "object" &&
    "_typeId" in q.structuredData
      ? (q.structuredData as Record<string, unknown>)
      : null;
  const displayQuestionText = repairGrammarCorrectionQuestionText({
    subType: q.subType,
    questionText: q.questionText,
    structuredData: q.structuredData,
  });
  const displayCorrectAnswer = formatStoredQuestionCorrectAnswer(q);

  // 생성 플랜(일반/프리미엄) — 태그 우선, 없으면 구조화 데이터(_generationPlan) 폴백.
  const planTags: string[] = Array.isArray(q.tags)
    ? (q.tags as string[])
    : parseJSON<string[]>(q.tags, []);
  const structuredPlan =
    q.structuredData &&
    typeof q.structuredData === "object" &&
    "_generationPlan" in q.structuredData
      ? ((q.structuredData as { _generationPlan?: unknown })._generationPlan as
          | QuestionGenerationPlan
          | undefined)
      : undefined;
  const generationPlan: QuestionGenerationPlan | null =
    getQuestionGenerationPlanFromTags(planTags) ??
    (structuredPlan === "PREMIUM" || structuredPlan === "STANDARD"
      ? structuredPlan
      : null);
  // 프리미엄은 항상, 일반은 플래그(SHOW_MODEL_SELECTOR) ON일 때 노출 — 코드베이스 공통 게이트.
  const planBadge =
    generationPlan &&
    (generationPlan === "PREMIUM" || FEATURE_FLAGS.SHOW_MODEL_SELECTOR) ? (
      <Badge
        variant="outline"
        className={`shrink-0 gap-1 text-[10px] font-bold ${
          generationPlan === "PREMIUM"
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-slate-200 bg-slate-50 text-slate-500"
        }`}
      >
        {generationPlan === "PREMIUM" ? (
          <Gem className="h-3 w-3" />
        ) : (
          <PearlIcon className="h-3 w-3" />
        )}
        {generationPlan === "PREMIUM" ? "프리미엄" : "일반"}
      </Badge>
    ) : null;

  // Parse questionText into structured sections
  const sections = useMemo(
    () => parseQuestionSections(displayQuestionText, q.subType),
    [displayQuestionText, q.subType],
  );

  // 헤더에 제목처럼 띄울 문제의 발문(의문문) — 구조화 direction 우선,
  // 없으면 파싱된 direction 섹션, 그래도 없으면 문제 텍스트.
  const directionText =
    (typeof structuredQuestion?.direction === "string" &&
    structuredQuestion.direction.trim()
      ? structuredQuestion.direction
      : sections.find((s) => s.type === "direction")?.content) ||
    q.questionText ||
    "";
  // 본문에서는 발문 섹션을 빼서 헤더 제목과 중복되지 않게 한다(지문·보기만).
  const bodySections = useMemo(
    () => sections.filter((s) => s.type !== "direction"),
    [sections],
  );

  // 접힘 미리보기용 지문 — 파싱된 지문/요약/단락 섹션을 우선 쓰고,
  // 없으면 본문 첫 섹션, 그래도 없으면 참조 지문(q.passage) 본문을 쓴다.
  const collapsedPassage = useMemo(() => {
    const candidate =
      bodySections.find(
        (s) =>
          s.type === "passage" ||
          s.type === "summary" ||
          s.type === "paragraphs",
      ) ?? bodySections.find((s) => typeof s.content === "string" && s.content);
    return candidate?.content || q.passage?.content || "";
  }, [bodySections, q.passage]);

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
        duplicateQuestionIds:
          getDuplicateDragQuestionIdsRef.current?.(q.id) ?? [],
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

  const questionClamp = viewSize === "lg" ? "line-clamp-3" : "line-clamp-2";

  // Review action footer (검수완료/검수취소 + 수정하기 + stamp) — only in managed contexts
  const showReviewActions =
    showManagementActions && Boolean(q.id) && Boolean(onApprove || onUnapprove);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      suppressCardClickRef.current ||
      e.detail > 1 ||
      shouldIgnoreCardSelectionClick(e)
    )
      return;
    if (selectionDisabled && !onDetail && !onEdit) {
      if (onDuplicateSelectConfirm) setDuplicatePromptOpen(true);
      return;
    }
    if (cardClickSelects) {
      if (selectionDisabled) {
        if (onDuplicateSelectConfirm) setDuplicatePromptOpen(true);
      } else {
        scheduleCardSelectionClick(onToggle);
      }
      return;
    }
    if (!onDetail && !onEdit) return;
    if (onDetail) onDetail();
    else onEdit?.();
  };

  const handleCardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    cancelPendingCardSelectionClick();
    clearCardTextSelection();
    if (suppressCardClickRef.current || shouldIgnoreCardDoubleClick(e)) return;
    if (selectionDisabled && !onDetail && !onEdit) {
      if (onDuplicateSelectConfirm) setDuplicatePromptOpen(true);
      return;
    }
    if (onDetail) onDetail();
    else onEdit?.();
  };

  const card = (
    <Card
      ref={dragRef}
      data-drag-item-id={selectionDisabled ? undefined : q.id}
      data-question-card-id={q.id}
      onMouseDown={preventCardDoubleClickTextSelection}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      className={`${onDetail || onEdit || (cardClickSelects && !selectionDisabled) ? "cursor-pointer" : ""} group relative flex h-full flex-col gap-0 py-0 ${isDragging ? "opacity-40 scale-95" : ""} ${
        active
          ? "ring-2 ring-blue-500 ring-offset-1 bg-blue-50/40 shadow-md"
          : selected && selectedCardHighlight
            ? "ring-2 ring-blue-400 bg-blue-50/30"
            : "hover:shadow-md"
      } ${
        selectionDisabled
          ? "border-slate-200 bg-slate-100/80 text-slate-400 shadow-none hover:shadow-none"
          : ""
      } ${
        !selectionDisabled && !q.approved
          ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]"
          : ""
      }${collapsed && collapsedMinHeightClass ? ` ${collapsedMinHeightClass}` : ""}`}
    >
      <CardContent
        ref={contentRef}
        className="p-3 flex flex-1 flex-col gap-1.5"
      >
        {/* Header row — 손잡이~펼치기까지 한 줄에 세로 가운데 정렬 */}
        <div className="flex items-center gap-1.5 shrink-0">
          {enableDrag && !selectionDisabled && !embedded && (
            <DragHandle ref={dragHandleRef} className="shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {!embedded && (
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
            )}
            {selected && typeof selectionIndex === "number" && (
              <span
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold tabular-nums text-white"
                title={`체크 순서 ${selectionIndex}번`}
              >
                {selectionIndex}
              </span>
            )}
            {showStar && !embedded &&
              (onToggleStar ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar();
                  }}
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
                      q.starred
                        ? "fill-yellow-400 text-yellow-500"
                        : "text-slate-300"
                    }`}
                  />
                </span>
              ))}
            {/* 삭제 — 즐겨찾기(별표) 바로 오른쪽. 윗줄 일괄 삭제 버튼과 동일 사이즈(h-7 w-7). */}
            {showManagementActions && onDelete && !embedded && (
              <button
                type="button"
                aria-label="삭제"
                title="삭제"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {/* 지문 참조 토글 — 클릭하면 아래에 원문 지문이 펼쳐진다. */}
            {q.passage && viewSize !== "sm" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPassageOpen(!passageOpen);
                }}
                title={sanitizeAiModelDisclosureText(q.passage.title)}
                className="inline-flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
              >
                <FileText className="h-3 w-3 shrink-0 text-blue-400" />
                <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">
                  {sanitizeAiModelDisclosureText(q.passage.title)}
                </span>
                {passageOpen ? (
                  <ChevronUp className="h-3 w-3 shrink-0 text-slate-400" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {planBadge}
            {typeof duplicateCount === "number" && duplicateCount > 1 && (
              <span
                className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black tabular-nums text-white shadow-sm"
                title={`시험지에 ${duplicateCount}개 포함`}
              >
                {duplicateCount}
              </span>
            )}
            {/* 검수 토글 — 상단 점 대신 하단 '검수완료' 버튼으로 이동. */}
            {/* 카드 접기/펼치기 토글 — 옅은 파란색. (임베드 모드는 항상 펼침이라 숨김) */}
            {!embedded && (
              <button
                type="button"
                data-drag-select-ignore
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((prev) => !prev);
                }}
                aria-expanded={!collapsed}
                aria-label={collapsed ? "카드 펼치기" : "카드 접기"}
                title={collapsed ? "펼치기" : "접기"}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-blue-300 transition-colors hover:bg-blue-50 hover:text-blue-500"
              >
                {collapsed ? (
                  <ChevronDown className="size-4.5" />
                ) : (
                  <ChevronUp className="size-4.5" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {/* 지문 참조 펼침 콘텐츠 — 토글은 헤더의 '지문 N' 버튼으로 이동. */}
          {q.passage && viewSize !== "sm" && passageOpen && q.passage.content && (
            <div className="shrink-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
              <p className="text-[11px] text-slate-500 leading-relaxed font-mono whitespace-pre-line max-h-[250px] overflow-y-auto">
                {q.passage.content}
              </p>
            </div>
          )}

          {/* ── Question content ──
              접힘: 의문문 + 지문 2줄(말줄임) + 정답 선지만 미리보기.
              펼침: 전체 렌더(구조화 렌더러 또는 섹션/선지).
              마커 유형(어법·어휘 등)은 선지를 숨긴다(shouldRenderOptionListForSubtype). */}
          {collapsed ? (
            <CollapsedPreview
              direction={directionText}
              // 접힘 미리보기는 '정답 보기만' 렌더하므로(전체 리스트가 아님)
              // 마커 유형(어법·어휘·삽입·무관)도 전체 옵션을 넘겨 정답 배지 +
              // 정답 단어/구를 함께 보여준다. 옵션이 비면 번호 배지로 폴백된다.
              passage={collapsedPassage}
              options={displayOptions}
              correctAnswer={q.correctAnswer}
              displayCorrectAnswer={displayCorrectAnswer}
              subType={q.subType}
            />
          ) : (
            <>
              {/* 전체 구조화 렌더링 */}
              {structuredQuestion ? (
                <StructuredQuestionRenderer
                  question={structuredQuestion}
                  index={num - 1}
                  hideHeader
                  sourcePassageContent={q.passage?.content}
                  // 임베드(상세 팝업) 마커 유형은 정답 배지를 본문 아래에 직접 그리고
                  // 해설은 바깥 ExplanationSection 으로 내려, 렌더러 내부 '해설 보기'를
                  // 숨긴다(정답 배지가 '해설 보기' 위로 오도록). 일반 목록 카드는 기존 유지.
                  answerRevealMode={
                    embedded && hideOptionList ? "hidden" : "as-explanation"
                  }
                  hideAnswerLine
                />
              ) : (
                <RenderedSections sections={bodySections} expanded />
              )}

              {/* Options (MC) */}
              {!structuredQuestion && visibleOptions.length > 0 && (
                <div className="space-y-1 pl-1">
                  {visibleOptions.map((opt) => {
                    const isCorrect = correctAnswerLabels.has(
                      normalizeAnswerLabel(opt.label),
                    );
                    return (
                      <div
                        key={opt.label}
                        className={`flex items-start gap-2 text-[12px] rounded px-2 py-1 ${
                          isCorrect
                            ? "bg-blue-50 text-blue-700 font-semibold"
                            : "text-slate-600"
                        }`}
                      >
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isCorrect
                              ? "bg-blue-600 text-white"
                              : "border border-slate-300 bg-white text-slate-400"
                          }`}
                        >
                          {badgeLabel(opt.label)}
                        </span>
                        <span className="pt-0.5">
                          {renderFormatted(opt.text, q.subType)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Non-MC correct answer */}
              {!structuredQuestion &&
                displayOptions.length === 0 &&
                displayCorrectAnswer && (
                  <div className="text-[12px] bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded border border-slate-200">
                    <span className="font-medium">정답:</span>{" "}
                    {renderFormatted(displayCorrectAnswer, q.subType)}
                  </div>
                )}

              {/* 마커 유형(어법·어휘·삽입·무관): 보기 리스트는 숨기되(마커는 지문에)
                  정답만 파란 배지 + 정답 단어/구로 노출 — 접힘 미리보기와 동일 디자인.
                  구조화 렌더러는 정답을 '해설 보기' 토글 뒤에 숨기므로(hideAnswerLine),
                  구조화/비구조화 무관하게 여기서 정답 배지를 항상 직접 노출한다. */}
              {hideOptionList &&
                (() => {
                  const correctOpts = displayOptions.filter((opt) =>
                    correctAnswerLabels.has(normalizeAnswerLabel(opt.label)),
                  );
                  if (correctOpts.length > 0) {
                    return (
                      <div className="space-y-1 pl-1">
                        {correctOpts.map((opt) => (
                          <div
                            key={opt.label}
                            className="flex items-start gap-2 text-[12px] rounded px-2 py-1 bg-blue-50 text-blue-700 font-semibold"
                          >
                            <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-600 text-white">
                              {badgeLabel(opt.label)}
                            </span>
                            <span className="pt-0.5">
                              {renderFormatted(opt.text, q.subType)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  if (correctAnswerLabels.size > 0) {
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 pl-1">
                        {Array.from(correctAnswerLabels).map((label) => (
                          <span
                            key={label}
                            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-600 text-white"
                          >
                            {badgeLabel(label)}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}
            </>
          )}

          {/* 해설 보기 — 자체 토글이 있어 항상 렌더. 펼침 상태의 구조화 문제는 위
            StructuredQuestionRenderer 가 해설을 직접 제공하므로 비구조화에서만 렌더(중복 방지).
            접힘 상태에서는 미리보기가 해설을 포함하지 않으므로 항상 '해설 보기'를 노출한다.
            rightSlot에는 '분석 정보'(동형 전용)만 별도 액션으로 남긴다. */}
          {(collapsed || !structuredQuestion || (embedded && hideOptionList)) && (
            <ExplanationSection
              explanation={q.explanation}
              rightSlot={
                onShowAnalysis ? (
                  <button
                    type="button"
                    data-drag-select-ignore
                    onClick={(e) => {
                      e.stopPropagation();
                      onShowAnalysis();
                    }}
                    className="-m-1.5 flex items-center gap-1 rounded-md p-1.5 text-[11px] font-medium text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                  >
                    분석 정보
                  </button>
                ) : undefined
              }
            />
          )}

        </div>

        {/* Footer — exam-usage history band: shows whether (and where) this
            question has already been placed on an exam paper. */}
        {!embedded && (() => {
          const usedCount = q._count?.examLinks ?? 0;
          const used = usedCount > 0;
          const links = q.examLinks ?? [];
          const hasList = used && links.length > 0;

          const inner = (
            <>
              <ClipboardList
                className="h-3 w-3 shrink-0 text-slate-400"
                aria-hidden="true"
              />
              {compactUsageLabel ? (
                // 칸이 좁아져도 "N개"는 항상 보이고, "생성된 시험"만 말줄임
                // 처리(세로쓰기 방지). min-w-0 로 flex 안에서 줄어들 수 있게 한다.
                <span className="flex min-w-0 items-center gap-0.5 text-[11px] font-semibold text-slate-400">
                  <span className="min-w-0 truncate">생성된 시험</span>
                  <span className="shrink-0">{usedCount}개</span>
                </span>
              ) : (
                <span className="text-[11px] font-medium text-slate-500">
                  생성된 시험 {usedCount}개
                </span>
              )}
              {hasList && (
                <ChevronDown
                  className="ml-auto w-3 h-3 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
              )}
            </>
          );

          // 박스(테두리) 대신 상단 구분선 + 납작한 행(생성된 문제 토글과 동일 톤).
          const bandHover = "hover:bg-slate-50";
          const detailButton =
            showDetailButton && (onDetail || onEdit) ? (
              <CardDetailIconButton
                className="size-7 rounded-md"
                iconClassName="size-3.5"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDetail) onDetail();
                  else onEdit?.();
                }}
              />
            ) : null;

          if (hasList) {
            const sortedLinks = [...links].sort((a, b) => {
              const at = a.exam.createdAt
                ? new Date(a.exam.createdAt).getTime()
                : 0;
              const bt = b.exam.createdAt
                ? new Date(b.exam.createdAt).getTime()
                : 0;
              return bt - at;
            });
            return (
              <div className="mt-auto flex w-full shrink-0 items-center gap-1.5 border-t border-slate-100 pt-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="이 문제가 포함된 시험지 보기"
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors ${bandHover}`}
                    >
                      {inner}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[var(--radix-popover-trigger-width)] min-w-64 p-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
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
                {!showReviewActions && detailButton}
              </div>
            );
          }

          return (
            <div className="mt-auto flex w-full shrink-0 items-center gap-1.5 border-t border-slate-100 pt-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1">
                {inner}
              </div>
              {!showReviewActions && detailButton}
            </div>
          );
        })()}

        {/* Footer: review actions (검수완료/취소 + 수정) — '사용 이력' 밴드 아래로 이동.
            compactUsageLabel(시험지 빌더)에서는 날짜+스탬프 줄을 생략하고
            스탬프를 위 '사용 이력' 밴드 우측으로 옮긴다. */}
        {(embedded ? showReviewActions : !compactUsageLabel || showReviewActions) && (
          <div className="space-y-2 pt-1.5 border-t border-slate-100 shrink-0">
            {/* 임베드(상세 팝업)는 날짜/도장 줄을 숨기고 검수·수정 버튼만 노출한다. */}
            {!embedded && (
              <div className="flex items-end justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] text-slate-400">
                  <span>{formatDateTime(q.createdAt)}</span>
                  {q._count.examLinks > 0 && (
                    <span>시험 {q._count.examLinks}회 사용</span>
                  )}
                </div>
                {!showReviewActions && (
                  <ReviewStatusStamp approved={q.approved} className="shrink-0" />
                )}
              </div>
            )}
            {showReviewActions && (
              <div className="flex items-end gap-1.5">
                {/* 검수완료 토글 — 수정하기 왼쪽.
                    미검수=카드 미검수 테두리와 같은 분홍색(red-200/80) 테두리+아이콘+텍스트.
                      hover 시엔 검수완료(초록) 모습으로 미리보기 → 떼면 분홍 복귀.
                    검수완료=초록 테두리+아이콘+텍스트. 배경은 흰색. */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={q.approved}
                  title={
                    q.approved
                      ? "검수완료 — 누르면 검수를 취소합니다"
                      : "검수필요 — 누르면 검수완료로 표시합니다"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (q.approved) onUnapprove?.();
                    else onApprove?.();
                  }}
                  className={
                    "h-7 flex-1 justify-center gap-1.5 px-2 text-[11px] font-semibold bg-white " +
                    (q.approved
                      ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      : "border border-red-200/80 text-red-300 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600")
                  }
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {q.approved ? "검수완료" : "미검수"}
                </Button>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
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
                {showDetailButton && (onDetail || onEdit) ? (
                  <CardDetailIconButton
                    className="size-7 shrink-0 rounded-md"
                    iconClassName="size-3.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onDetail) onDetail();
                      else onEdit?.();
                    }}
                  />
                ) : !embedded ? (
                  <ReviewStatusStamp
                    approved={q.approved}
                    className="shrink-0"
                  />
                ) : null}
              </div>
            )}
          </div>
        )}
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
