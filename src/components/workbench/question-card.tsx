"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronUp, Eye, FileText, Gem, Layers, Pencil, Trash2, XCircle } from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { QUESTION_TYPE_META } from "@/lib/question-schemas";
import { getQuestionGenerationPlanFromTags, sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { clearCardTextSelection, preventCardDoubleClickTextSelection, shouldIgnoreCardClick, shouldIgnoreCardDoubleClick, shouldIgnoreCardSelectionClick, useDeferredCardSelectionClick } from "./shared/card-click";
import { optionDisplayTextForSubtype, shouldRenderOptionListForSubtype } from "@/components/exams/paper-builder/option-display";
import { DIFFICULTY_CONFIG, STRUCTURED_RENDERER_SOURCE_PASSAGE_TYPES, SUBTYPE_LABELS, TYPE_LABELS } from "./question-card-constants";
import type { QuestionCardProps } from "./question-card-types";
import { detectPassageMarking, formatOption, normalizeAnswerLabel, parseCorrectAnswerLabels, parseJSON, readGenerationPlanFromStructuredData, structuredQuestionTextForCard } from "./question-card-helpers";
import { ReviewStatusStamp, renderFormatted } from "./question-card-format";

export {
  DIFFICULTY_CONFIG,
  SUBTYPE_LABELS,
} from "./question-card-constants";
export type {
  QuestionCardItem,
} from "./question-card-types";
export {
  detectPassageMarking,
  formatOption,
  normalizeAnswerLabel,
  parseCorrectAnswerLabels,
} from "./question-card-helpers";
export {
  ReviewStatusStamp,
  renderFormatted,
} from "./question-card-format";
export function QuestionCard({
  q,
  num,
  selected = false,
  recentlyViewed = false,
  onToggle,
  onDelete,
  onApprove,
  onUnapprove,
  onDetail,
  onEdit,
  readonly = false,
  compact = false,
  showReviewActions = false,
  hideReviewStatusStamp = false,
  suppressUnapprovedBorder = false,
  showHeaderActions = false,
  openOnCardClick = false,
  showDetailButton = false,
  showDetailIconButton = false,
  dragItemId,
  detailExtra,
}: QuestionCardProps) {
  const resolvedDragItemId = dragItemId === undefined ? q.id : dragItemId;
  const [passageOpen, setPassageOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [compactExpanded, setCompactExpanded] = useState(false);
  const router = useRouter();
  const {
    cancelPendingCardSelectionClick,
    scheduleCardSelectionClick,
  } = useDeferredCardSelectionClick();

  const options = parseJSON<{ label: string; text: string }[]>(q.options, []);
  const correctAnswerLabels = parseCorrectAnswerLabels(q.correctAnswer);
  const displayQuestionText = repairGrammarCorrectionQuestionText({
    subType: q.subType,
    questionText: q.questionText,
    structuredData: q.structuredData,
  });
  const displayCorrectAnswer = formatStoredQuestionCorrectAnswer(q);
  const passageMarking = detectPassageMarking(
    q.passage?.content || displayQuestionText,
  );
  const UNDERLINE_TYPES = [
    "VOCAB_CHOICE",
    "GRAMMAR_ERROR",
    "IMPLIED_MEANING",
    "ANTONYM",
  ];
  // 네모 어법은 밑줄 모드 금지 — (A) 뒤 첫 토큰("[후보1")만 밑줄 그어져 깨진다.
  const MARKER_ONLY_TYPES = ["SENTENCE_INSERT", "IRRELEVANT", "SENTENCE_ORDER", "GRAMMAR_CHOICE_COMBO"];
  const sub = q.subType || "";
  const needsUnderline = UNDERLINE_TYPES.includes(sub);
  const showMarkers =
    UNDERLINE_TYPES.includes(sub) || MARKER_ONLY_TYPES.includes(sub);
  // 지문 마커형(어법·어휘·삽입·무관)은 시험지와 동일하게 하단 보기 리스트 숨김.
  const hideOptionList = !shouldRenderOptionListForSubtype(sub);
  const tags: string[] = Array.isArray(q.tags)
    ? q.tags
    : parseJSON<string[]>(q.tags, []);
  const generationPlan =
    getQuestionGenerationPlanFromTags(tags) ??
    readGenerationPlanFromStructuredData(q.structuredData);
  // 생성 플랜(일반/프리미엄) 태그 — 프리미엄은 보라(프리미엄 톤), 일반은 슬레이트.
  // 카드 헤더(콤팩트·비콤팩트 공통)에 노출한다. (일반=PearlIcon)
  const planBadge =
    FEATURE_FLAGS.SHOW_MODEL_SELECTOR && generationPlan ? (
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
  const diffConfig = DIFFICULTY_CONFIG[q.difficulty];
  // 난이도 배지 — 일반/프리미엄(planBadge)과 동일한 pill 디자인.
  // 기본=파랑, 중급=노랑(amber), 킬러=빨강으로 색상 구분. plan 배지 왼쪽에 배치한다.
  const difficultyBadge = diffConfig ? (
    <Badge
      variant="outline"
      className={`shrink-0 text-[10px] font-bold ${diffConfig.className}`}
    >
      {diffConfig.label}
    </Badge>
  ) : null;
  const keyPoints = parseJSON<string[]>(q.explanation?.keyPoints || null, []);

  // 구조화 데이터가 있으면 해당 유형의 전용 렌더러 사용 (compact 아닐 때)
  const structuredData =
    q.structuredData &&
    typeof q.structuredData === "object" &&
    "_typeId" in q.structuredData
      ? (q.structuredData as Record<string, unknown>)
      : null;
  const hasStructured = !!structuredData;
  // 유형이 자체 지문을 포함하면 원본 지문 블록 숨김 (중복 방지)
  const typeMeta = sub ? QUESTION_TYPE_META[sub] : undefined;
  const typeIncludesPassage = typeMeta?.includesPassage ?? false;
  const structuredRendererOwnsPassage =
    typeIncludesPassage || STRUCTURED_RENDERER_SOURCE_PASSAGE_TYPES.has(sub);
  const hidePassageBlock = hasStructured && structuredRendererOwnsPassage;
  const showStructured = hasStructured && (!compact || compactExpanded);
  const flatDisplayQuestionText = structuredQuestionTextForCard(
    structuredData,
    displayQuestionText,
    structuredRendererOwnsPassage,
  );
  // compact 카드 헤더에 띄울 문제의 발문(의문문) — 구조화 direction 우선,
  // 없으면 문제 텍스트. 뱃지/태그 대신 "무엇을 묻는 문제인지"를 바로 보여준다.
  const directionText =
    (typeof structuredData?.direction === "string" &&
    structuredData.direction.trim()
      ? structuredData.direction
      : q.questionText) || "";
  // compact 본문은 발문을 헤더로 올렸으므로, 본문 텍스트가 발문으로 시작하면
  // 그 선행 발문을 떼어내 중복 노출을 막는다 (지문/보기만 본문에 남긴다).
  const compactBodyText =
    directionText && flatDisplayQuestionText.startsWith(directionText)
      ? flatDisplayQuestionText.slice(directionText.length).replace(/^\s+/, "")
      : flatDisplayQuestionText;
  const showFooterActions = showReviewActions && Boolean(q.id);
  const shouldShowDetailIconButton = showDetailIconButton || showDetailButton;
  const handleEdit = () => {
    if (onEdit) onEdit();
    else router.push(`/director/questions/${q.id}`);
  };
  const handleDetail = () => {
    if (onDetail) onDetail();
    else handleEdit();
  };
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!openOnCardClick || e.detail > 1) return;
    if (onToggle) {
      if (shouldIgnoreCardSelectionClick(e)) return;
      scheduleCardSelectionClick(onToggle);
      return;
    }
    if (shouldIgnoreCardClick(e)) return;
    handleDetail();
  };

  const handleCardDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    cancelPendingCardSelectionClick();
    clearCardTextSelection();
    if (!openOnCardClick || shouldIgnoreCardDoubleClick(e)) return;
    handleDetail();
  };

  const compactFixed = compact && !compactExpanded;

  // 펼친 해설 본문 — 일반/생성결과 두 레이아웃에서 공유한다.
  const explanationPanel =
    q.explanation && explanationOpen ? (
      <div className="mt-2 bg-slate-50 border border-slate-100 rounded-md px-3 py-2 space-y-2">
        <p className="text-[12px] text-slate-700 leading-relaxed whitespace-pre-line">
          {q.explanation.content}
        </p>
        {keyPoints.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-500">
              핵심 포인트
            </span>
            {keyPoints.map((kp, i) => (
              <p
                key={i}
                className="text-[11px] text-slate-600 pl-2 border-l-2 border-teal-300"
              >
                {kp}
              </p>
            ))}
          </div>
        )}
      </div>
    ) : null;
  const detailIconButton =
    shouldShowDetailIconButton && onDetail ? (
      <CardDetailIconButton
        className="size-7 rounded-md"
        iconClassName="size-3.5"
        onClick={(e) => {
          e.stopPropagation();
          onDetail();
        }}
      />
    ) : null;

  return (
    <Card
      data-drag-item-id={resolvedDragItemId ?? undefined}
      onMouseDown={preventCardDoubleClickTextSelection}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
      className={`group relative gap-0 py-0 transition-all ${openOnCardClick ? "cursor-pointer" : ""} ${
        selected ? "ring-2 ring-blue-400 bg-blue-50/30" : "hover:shadow-md"
      } ${!suppressUnapprovedBorder && !q.approved ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]" : ""}${
        recentlyViewed && !selected ? " motion-safe:animate-[card-recently-viewed-flash_1.2s_ease-out]" : ""
      }${
        compactFixed ? " h-full" : ""
      }`}
    >
      <CardContent
        className={
          compactFixed
            ? "p-3 flex flex-col gap-2 h-full"
            : compact
              ? "p-3 space-y-2"
              : "p-4 space-y-3"
        }
      >
        <div
          className={
            compactFixed ? "flex flex-col gap-2 flex-1 min-h-0" : "contents"
          }
        >
          {/* Top row — compact 헤더는 한 줄 발문이라 세로 가운데 정렬 */}
          <div className={`flex gap-3 ${compact ? "items-center" : "items-start"}`}>
            {onToggle && (
              <div className={compact ? "" : "pt-0.5"}>
                <Checkbox checked={selected} onCheckedChange={onToggle} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {compact ? (
                /* compact(생성/검수 결과) 카드: 헤더에 발문(의문문)을 바로 노출 —
                   "무엇을 묻는 문제인지"가 한눈에 보인다. 펼친 상태에서는 본문이
                   발문을 다시 렌더하므로(중복/겹침 방지) 헤더 발문은 접힌 상태에서만
                   보여준다. 단, 생성 플랜 태그는 접힘/펼침 모두 항상 노출한다. */
                <>
                  {difficultyBadge || planBadge ? (
                    <div
                      className={`flex items-center gap-1 ${
                        !compactExpanded ? "mb-1.5" : ""
                      }`}
                    >
                      {difficultyBadge}
                      {planBadge}
                    </div>
                  ) : null}
                  {!compactExpanded ? (
                    <p className="text-[12.5px] font-bold leading-snug text-slate-800 line-clamp-2">
                      {directionText}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-400">
                      {num}.
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABELS[q.type] || q.type}
                    </Badge>
                    {q.subType && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-slate-500"
                      >
                        {SUBTYPE_LABELS[q.subType] || q.subType}
                      </Badge>
                    )}
                    {difficultyBadge}
                    {planBadge}
                    {q.aiGenerated && (
                      <Layers className="w-3 h-3 text-blue-400" />
                    )}
                  </div>
                </>
              )}
            </div>
            {/* 펼치기/접기 — 발문 바로 옆(헤더 오른쪽)에 배치. */}
            {compact && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCompactExpanded((prev) => !prev);
                  if (compactExpanded) setPassageOpen(false);
                }}
                aria-expanded={compactExpanded}
                title={compactExpanded ? "접기" : "펼치기"}
                className="group/expand -m-1.5 inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md p-1.5 text-[11px] font-medium text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
              >
                {compactExpanded ? (
                  <>
                    접기
                    <ChevronUp className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    펼치기
                    <ChevronDown className="w-3 h-3 transition-transform group-hover/expand:translate-y-0.5" />
                  </>
                )}
              </button>
            )}
            {showHeaderActions && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600"
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
            {!readonly && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => router.push(`/director/questions/${q.id}`)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <span className="text-xs">...</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDetail}>
                      <Eye className="w-3.5 h-3.5 mr-2" /> 상세 보기
                    </DropdownMenuItem>
                    {!q.approved && onApprove && (
                      <DropdownMenuItem onClick={onApprove}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> 승인
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={onDelete}
                          className="text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> 삭제
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* ── 구조화 데이터가 있고 compact가 아닐 때: StructuredQuestionRenderer 사용 ── */}
          {showStructured ? (
            <>
              {/* 원본 지문: 유형이 자체 지문을 포함하지 않는 경우에만 표시 */}
              {q.passage && !hidePassageBlock && (
                <div className="bg-slate-50 rounded-md px-3 py-2">
                  <button
                    className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium w-full text-left"
                    onClick={() => setPassageOpen(!passageOpen)}
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {sanitizeAiModelDisclosureText(q.passage.title)}
                    </span>
                    {passageOpen ? (
                      <ChevronUp className="w-3 h-3 ml-auto shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
                    )}
                  </button>
                  {passageOpen && (
                    <p className="text-[11px] text-slate-500 font-mono leading-relaxed mt-1.5">
                      {renderFormatted(q.passage.content, {
                        underlineMarkedWords: needsUnderline,
                        highlightMarkers: showMarkers,
                        subType: sub,
                      })}
                    </p>
                  )}
                </div>
              )}
              <StructuredQuestionRenderer
                question={structuredData}
                index={num - 1}
                hideHeader
                sourcePassageContent={q.passage?.content}
                answerRevealMode={compact ? "show-all" : "default"}
              />
            </>
          ) : (
            <>
              {/* ── Flat 렌더링 (DB 저장 문제 또는 compact 모드) ── */}

              {/* Passage — structuredData가 있고 includesPassage인 유형만 지문 숨김 (DB 로드 문제는 항상 지문 표시) */}
              {q.passage &&
                (!compact || compactExpanded) &&
                !(q.structuredData && structuredRendererOwnsPassage) && (
                  <div className="bg-slate-50 rounded-md px-3 py-2">
                    <button
                      className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium w-full text-left"
                      onClick={() => setPassageOpen(!passageOpen)}
                    >
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {sanitizeAiModelDisclosureText(q.passage.title)}
                      </span>
                      {passageOpen ? (
                        <ChevronUp className="w-3 h-3 ml-auto shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 ml-auto shrink-0" />
                      )}
                    </button>
                    <p
                      className={`text-[11px] text-slate-500 font-mono leading-relaxed mt-1.5 ${passageOpen ? "" : "line-clamp-3"}`}
                    >
                      {renderFormatted(q.passage.content, {
                        underlineMarkedWords: needsUnderline,
                        highlightMarkers: showMarkers,
                        subType: sub,
                      })}
                    </p>
                  </div>
                )}

              {/* Question text */}
              <div
                className={`text-slate-800 leading-relaxed font-medium whitespace-pre-line ${
                  compact
                    ? compactExpanded
                      ? "text-[12px]"
                      : "text-[12px] line-clamp-3"
                    : "text-[13px]"
                }`}
              >
                {renderFormatted(
                  !compact || compactExpanded
                    ? flatDisplayQuestionText
                    : compactBodyText,
                  {
                    underlineMarkedWords: needsUnderline,
                    highlightMarkers: showMarkers,
                    subType: sub,
                  },
                )}
              </div>

              {/* Options */}
              {!hideOptionList &&
                options.length > 0 &&
                (() => {
                  const MAX_COMPACT_OPTIONS = 3;
                  const allEntries = options.map((opt, idx) => ({
                    opt,
                    idx,
                    isCorrect: correctAnswerLabels.has(
                      normalizeAnswerLabel(opt.label),
                    ),
                  }));
                  const compactCorrect = allEntries.filter((e) => e.isCorrect);
                  const visibleEntries = compactFixed
                    ? compactCorrect.slice(0, MAX_COMPACT_OPTIONS)
                    : allEntries;
                  const hiddenCount = options.length - visibleEntries.length;
                  return (
                    <div
                      className={`space-y-1 pl-1 ${compact ? "text-[11px]" : ""}`}
                    >
                      {visibleEntries.map(({ opt, idx, isCorrect }) => {
                        const optionText =
                          sub === "SENTENCE_INSERT"
                            ? optionDisplayTextForSubtype(sub, idx, opt.text)
                            : opt.text;
                        const { displayLabel, displayText } = formatOption(
                          opt.label,
                          optionText,
                          idx,
                          passageMarking,
                        );
                        return (
                          <div
                            key={`${opt.label}-${idx}`}
                            className={`flex items-start gap-2.5 ${compact ? "text-[11px]" : "text-[12px]"} rounded px-2 py-1 ${isCorrect ? "bg-slate-100 text-slate-800 font-medium" : "text-slate-600"}`}
                          >
                            <span
                              className={`shrink-0 text-[13px] font-bold tabular-nums pt-px ${isCorrect ? "text-slate-600" : "text-slate-400"}`}
                            >
                              {displayLabel}.
                            </span>
                            <span className="pt-0.5 line-clamp-1">
                              {displayText}
                            </span>
                          </div>
                        );
                      })}
                      {compactFixed && hiddenCount > 0 && (
                        <span className="text-[10px] text-slate-400 pl-2">
                          외 {hiddenCount}개 선택지
                        </span>
                      )}
                    </div>
                  );
                })()}

              {/* Non-MC answer — 서술형(영작 등)은 객관식 정답 배지와 동일하게
                  파란 원 '답' + 오른쪽 파란 글씨로 표시(문제카드·상세 디자인 통일). */}
              {options.length === 0 &&
                displayCorrectAnswer &&
                !flatDisplayQuestionText.includes(displayCorrectAnswer) &&
                (q.subType &&
                QUESTION_TYPE_META[q.subType]?.category === "서술형" ? (
                  <div className="flex items-start gap-2 pl-1 text-[13px] font-semibold text-blue-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      답
                    </span>
                    <span>{displayCorrectAnswer}</span>
                  </div>
                ) : (
                  <div className="text-[12px] bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded border border-slate-200">
                    <span className="font-medium">정답:</span> {displayCorrectAnswer}
                  </div>
                ))}

              {/* Explanation (+ 동형 '분석 정보' 등 detailExtra 슬롯) */}
              {showDetailButton && onDetail ? (
                detailExtra || q.explanation ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {detailExtra}
                      </div>
                      {q.explanation && !compact ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExplanationOpen(!explanationOpen);
                          }}
                          className="-m-1.5 flex items-center gap-1 rounded-md p-1.5 text-[11px] font-medium text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                        >
                          {explanationOpen ? "해설 접기" : "해설 보기"}
                          {explanationOpen ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                      ) : null}
                    </div>
                    {explanationPanel}
                  </div>
                ) : null
              ) : (
                q.explanation &&
                !compact && (
                  <div>
                    <button
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      onClick={() => setExplanationOpen(!explanationOpen)}
                    >
                      {explanationOpen ? "해설 접기" : "해설 보기"}
                      {explanationOpen ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    {explanationPanel}
                  </div>
                )
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div
          className={`space-y-2 pt-1 border-t border-slate-100${compactFixed ? " shrink-0" : ""}`}
        >
          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-[10px] text-slate-400">
              <span>{formatDate(q.createdAt)}</span>
              {q._count?.examLinks ? (
                <span>시험 {q._count.examLinks}회 사용</span>
              ) : null}
            </div>
            {!showFooterActions &&
            (!hideReviewStatusStamp || detailIconButton) ? (
              <div className="flex shrink-0 items-center gap-1.5">
                {!hideReviewStatusStamp ? (
                  <ReviewStatusStamp
                    approved={q.approved}
                    className="shrink-0"
                  />
                ) : null}
                {detailIconButton}
              </div>
            ) : null}
          </div>
          {showFooterActions &&
            (q.approved ? (
              <div className="flex items-end gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!onUnapprove}
                    className="h-7 flex-1 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-none hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:bg-slate-50 disabled:text-slate-300 disabled:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnapprove?.();
                    }}
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    검수취소
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-1 justify-center gap-1.5 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit();
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                    수정하기
                  </Button>
                </div>
                {detailIconButton}
              </div>
            ) : (
              <div className="flex items-end gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!onApprove}
                    className="h-7 flex-1 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 shadow-none hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 disabled:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApprove?.();
                    }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    검수완료
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-1 justify-center gap-1.5 border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit();
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                    수정하기
                  </Button>
                </div>
                {detailIconButton}
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
