"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Eye,
  FileText,
  Gem,
  Pencil,
  Layers,
  XCircle,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CardDetailIconButton } from "@/components/ui/card-detail-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import { StructuredQuestionRenderer } from "@/components/workbench/question-renderers";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { QUESTION_TYPE_META } from "@/lib/question-schemas";
import {
  getQuestionGenerationPlanFromTags,
  sanitizeAiModelDisclosureText,
  type QuestionGenerationPlan,
} from "@/lib/question-generation-plans";
import { getCircledNumbers } from "@/lib/question-postprocess/types";
import { repairGrammarCorrectionQuestionText } from "@/lib/grammar-correction-display";
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import {
  clearCardTextSelection,
  preventCardDoubleClickTextSelection,
  shouldIgnoreCardClick,
  shouldIgnoreCardDoubleClick,
  shouldIgnoreCardSelectionClick,
  useDeferredCardSelectionClick,
} from "./shared/card-click";
import {
  optionDisplayTextForSubtype,
  shouldRenderOptionListForSubtype,
  grammarMarkerDisplayLabel,
} from "@/components/exams/paper-builder/option-display";

// ─── Constants ───────────────────────────────────────────

const CIRCLED_MARKER_PATTERN = "\\u2460-\\u2473\\u3251-\\u325F\\u32B1-\\u32BF";
const CIRCLED_MARKER_REGEX = new RegExp(`^[${CIRCLED_MARKER_PATTERN}]$`);

const TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
};

const SUBTYPE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸 추론",
  GRAMMAR_ERROR: "어법 판단",
  GRAMMAR_CHOICE_COMBO: "네모 어법",
  VOCAB_CHOICE: "어휘 적절성",
  SENTENCE_ORDER: "글의 순서",
  SENTENCE_INSERT: "문장 삽입",
  TOPIC: "주제 추론",
  MAIN_IDEA: "요지/주장",
  TOPIC_MAIN_IDEA: "주제/요지",
  TITLE: "제목 추론",
  IMPLIED_MEANING: "함축 의미 추론",
  REFERENCE: "지칭 추론",
  CONTENT_MATCH: "내용 일치",
  SUMMARY_COMPLETE_MC: "요약문 완성(객관식)",
  IRRELEVANT: "무관한 문장",
  CONDITIONAL_WRITING: "조건부 영작",
  SENTENCE_TRANSFORM: "문장 전환",
  FILL_BLANK_KEY: "핵심 표현 빈칸",
  SUMMARY_COMPLETE: "요약문 완성",
  WORD_ORDER: "배열 영작",
  GRAMMAR_CORRECTION: "문법 오류 수정",
  CONTEXT_MEANING: "문맥 속 의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

const DIFFICULTY_CONFIG: Record<string, { label: string; className: string }> =
  {
    BASIC: {
      label: "기본",
      className: "bg-slate-50 text-slate-600 border-slate-200",
    },
    INTERMEDIATE: {
      label: "중급",
      className: "bg-slate-50 text-slate-600 border-slate-200",
    },
    KILLER: {
      label: "킬러",
      className: "bg-slate-50 text-slate-600 border-slate-200",
    },
  };

export function ReviewStatusStamp({
  approved,
  className = "",
}: {
  approved: boolean;
  className?: string;
}) {
  const label = approved ? "검수완료" : "검수필요";
  return (
    <span
      role="img"
      aria-label={label}
      className={
        "pointer-events-none inline-flex -rotate-12 select-none items-center justify-center rounded-full leading-none " +
        (approved
          ? "size-7 whitespace-nowrap border-2 border-slate-500 bg-white/70 text-[7px] font-bold tracking-tighter text-slate-600 shadow-sm"
          : "size-7 border border-dashed border-red-300/70 bg-red-50/30 text-[7.5px] font-bold tracking-tight text-red-400/80") +
        " " +
        className
      }
    >
      {label}
    </span>
  );
}

// ─── Types ───────────────────────────────────────────────

export interface QuestionCardItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  createdAt: Date;
  passage: {
    id: string;
    title: string;
    content: string;
    grade?: number | null;
    semester?: string | null;
    publisher?: string | null;
    school?: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count?: { examLinks: number };
  /** AI 생성 시 원본 구조화 데이터 (StructuredQuestionRenderer용) */
  structuredData?: unknown;
}

// ─── Helpers ─────────────────────────────────────────────

function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object" && str !== null) {
    return (Array.isArray(fallback) ? fallback : str) as T;
  }
  if (typeof str !== "string") return fallback;
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function parseCorrectAnswerLabels(correctAnswer: string): Set<string> {
  const labels = new Set<string>();
  const matches = correctAnswer?.match(
    /[\(\[]?\s*(?:[A-Ja-j]|\d{1,3}|[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF])\s*[\)\].:]?/g,
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

function normalizeAnswerLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  const circledIndex = getCircledNumbers(50).indexOf(text);
  if (circledIndex >= 0) return String(circledIndex + 1);
  return text
    .replace(/^[\(\[]?\s*([A-Ja-j]|\d{1,3})\s*[\)\].:]?\s*$/, "$1")
    .toLowerCase();
}

function pushStructuredTextPart(parts: string[], value: unknown) {
  if (typeof value === "string" && value.trim()) parts.push(value);
}

function structuredQuestionTextForCard(
  structuredData: Record<string, unknown> | null,
  fallback: string,
  preferStructured: boolean,
): string {
  if (!structuredData || !preferStructured) return fallback;

  const parts: string[] = [];
  pushStructuredTextPart(parts, structuredData.direction);
  if (structuredData.givenSentence)
    parts.push(`[given] ${String(structuredData.givenSentence)}`);
  pushStructuredTextPart(parts, structuredData.passageWithBlank);
  pushStructuredTextPart(parts, structuredData.passageWithMarkers);
  pushStructuredTextPart(parts, structuredData.passageWithUnderline);
  pushStructuredTextPart(parts, structuredData.passageWithNumbers);

  if (Array.isArray(structuredData.paragraphs)) {
    const paragraphText = structuredData.paragraphs
      .map((paragraph) => {
        if (!paragraph || typeof paragraph !== "object") return "";
        const row = paragraph as Record<string, unknown>;
        return `${String(row.label ?? "")} ${String(row.text ?? "")}`.trim();
      })
      .filter(Boolean)
      .join("\n");
    pushStructuredTextPart(parts, paragraphText);
  }

  pushStructuredTextPart(parts, structuredData.sentenceWithBlank);
  pushStructuredTextPart(parts, structuredData.summaryWithBlanks);
  return parts.length > 0 ? parts.join("\n\n") : fallback;
}

// Detect what marking pattern the passage uses: (a)(b)(c), (A)(B)(C), circled numbers, or none
function readGenerationPlanFromStructuredData(
  value: unknown,
): QuestionGenerationPlan | null {
  if (!value || typeof value !== "object" || !("_generationPlan" in value))
    return null;
  const plan = (value as { _generationPlan?: unknown })._generationPlan;
  return plan === "PREMIUM" || plan === "STANDARD" ? plan : null;
}

function detectPassageMarking(
  passageContent?: string,
): "lowercase" | "uppercase" | "circled" | "none" {
  if (!passageContent) return "none";
  if (/\(a\)/.test(passageContent)) return "lowercase";
  if (/\(A\)/.test(passageContent)) return "uppercase";
  if (/[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]/.test(passageContent))
    return "circled";
  return "none";
}

const MARKERS = {
  lowercase: [
    "(a)",
    "(b)",
    "(c)",
    "(d)",
    "(e)",
    "(f)",
    "(g)",
    "(h)",
    "(i)",
    "(j)",
  ],
  uppercase: [
    "(A)",
    "(B)",
    "(C)",
    "(D)",
    "(E)",
    "(F)",
    "(G)",
    "(H)",
    "(I)",
    "(J)",
  ],
  circled: getCircledNumbers(50),
  none: getCircledNumbers(50),
};

const STRUCTURED_RENDERER_SOURCE_PASSAGE_TYPES = new Set([
  "TOPIC",
  "MAIN_IDEA",
  "TOPIC_MAIN_IDEA",
  "TITLE",
  "CONTENT_MATCH",
  "SUMMARY_COMPLETE_MC",
]);

// Format option: always use index-based number label, adapt text based on passage marking
function formatOption(
  label: string,
  text: string,
  index: number,
  passageMarking: "lowercase" | "uppercase" | "circled" | "none",
): { displayLabel: string; displayText: string } {
  const displayLabel = `${index + 1}`;
  const trimmed = text.trim();

  // If text is just a marker (circled number, number, or empty) — use passage marking pattern
  const isTextOnlyMarker =
    !trimmed || CIRCLED_MARKER_REGEX.test(trimmed) || /^\d{1,3}$/.test(trimmed);
  if (isTextOnlyMarker) {
    return {
      displayLabel,
      displayText: MARKERS[passageMarking][index] || label,
    };
  }

  // If label is a plain number or circled number, just show text
  const num = parseInt(label);
  if ((!isNaN(num) && num >= 1) || CIRCLED_MARKER_REGEX.test(label)) {
    return { displayLabel, displayText: text };
  }
  // Otherwise prepend label to text (e.g. "(A) that", "(a) advantages")
  return { displayLabel, displayText: `${label} ${text}` };
}

export function renderFormatted(
  text: string,
  opts?: {
    underlineMarkedWords?: boolean;
    highlightMarkers?: boolean;
    /** GRAMMAR_ERROR 일 때만 지문 마커 (A)→① 로 표시(시험지 렌더 동일). 타 유형 무영향. */
    subType?: string | null;
  },
): React.ReactNode {
  const underline = opts?.underlineMarkedWords ?? false;
  const highlightMarkers = opts?.highlightMarkers ?? false;
  const isGrammarError = opts?.subType === "GRAMMAR_ERROR";

  // Build regex based on options
  let pattern: string;
  if (underline) {
    // Match (a) word with the word captured separately
    pattern = `__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])|\\(([a-jA-J])\\)\\s*(\\S+)`;
  } else if (highlightMarkers) {
    // Match (a) marker only, no word capture
    pattern = `__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])|\\(([a-jA-J])\\)`;
  } else {
    // Basic: only __word__, blanks, circled numbers
    pattern = `__([^_]+)__|_{3,}|([${CIRCLED_MARKER_PATTERN}])`;
  }
  const regex = new RegExp(pattern, "g");
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // 어법 판단(GRAMMAR_ERROR): __(A) expression__ → 원형숫자(①) 마커 + 밑줄 표현
      // (시험지 렌더와 동일). 타 유형은 isGrammarError=false 라 기존 통밑줄 유지.
      const grammarMarker = isGrammarError
        ? match[1].match(/^\(([a-jA-J])\)\s*(.+)$/)
        : null;
      if (grammarMarker) {
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">
              {grammarMarkerDisplayLabel(grammarMarker[1])}
            </span>{" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900">
              {grammarMarker[2]}
            </span>
          </span>,
        );
      } else {
        // __word__ → underline
        parts.push(
          <span
            key={key++}
            className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold text-slate-900"
          >
            {match[1]}
          </span>,
        );
      }
    } else if (match[2]) {
      // Circled number -> bold blue
      parts.push(
        <span
          key={key++}
          className="font-extrabold text-blue-600 text-[18px] mx-1 relative -top-[1px]"
        >
          {match[2]}
        </span>,
      );
    } else if (match[3]) {
      // (a)~(e), (A)~(E) marker
      if (match[4] && underline) {
        // (a) word → blue marker + underlined word (for passage text)
        parts.push(
          <span key={key++}>
            <span className="font-bold text-blue-600">({match[3]})</span>{" "}
            <span className="underline decoration-2 decoration-blue-500 underline-offset-4 font-semibold">
              {match[4]}
            </span>
          </span>,
        );
      } else {
        // Just the marker, no underline (for options / non-underline mode)
        parts.push(
          <span key={key++} className="font-bold text-blue-600">
            ({match[3]})
          </span>,
        );
      }
    } else {
      // _____ → blank
      parts.push(
        <span
          key={key++}
          className="inline-block min-w-[80px] border-b-2 border-blue-400 mx-1 align-baseline"
        >
          &nbsp;
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

// ─── Component ───────────────────────────────────────────

interface QuestionCardProps {
  q: QuestionCardItem;
  num: number;
  selected?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  onApprove?: () => void;
  onUnapprove?: () => void;
  onDetail?: () => void;
  onEdit?: () => void;
  /** Hide actions (edit, dropdown) — for read-only contexts */
  readonly?: boolean;
  /** Compact mode — smaller padding, hide passage preview by default */
  compact?: boolean;
  showReviewActions?: boolean;
  hideReviewStatusStamp?: boolean;
  /** Show the 수정(pencil) + 더보기(...) action pair in the header, left of 펼치기.
   *  Works even in readonly contexts (e.g. 문제 생성 결과 카드). */
  showHeaderActions?: boolean;
  /** Open the detail view when the card body is clicked. */
  openOnCardClick?: boolean;
  /** 해설보기 줄 왼쪽에 '상세 보기' 버튼을 띄우고, 해설보기를 오른쪽으로 보낸다.
   *  두 버튼 색은 '펼치기' 버튼과 통일(blue-400). 생성/검수 결과 카드 전용. */
  showDetailButton?: boolean;
  /** Icon-only detail button anchored at the bottom-right of the card. */
  showDetailIconButton?: boolean;
  /** 영역 드래그 선택(DragSelect)이 읽는 식별자. 기본은 q.id 지만, 선택 상태가
   *  q.id 가 아닌 다른 키(예: 생성 결과의 persistedQuestionId)로 관리되는 경우
   *  해당 키를 넘긴다. null 을 주면 이 카드는 영역 선택 대상에서 제외된다. */
  dragItemId?: string | null;
  /** 해설 보기 줄 왼쪽에 끼울 추가 액션(예: 동형 '분석 정보'). 카드 클릭으로 상세가 열리므로
   *  별도 '상세 보기' 버튼 없이 이 슬롯만 노출된다. 선택 — 미지정 시 표시 안 함. */
  detailExtra?: React.ReactNode;
}

export function QuestionCard({
  q,
  num,
  selected = false,
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
      } ${!q.approved ? "border-red-200/80 shadow-[0_0_0_1px_rgba(252,165,165,0.35),0_0_18px_rgba(248,113,113,0.12)]" : ""}${
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
                  {planBadge ? (
                    <div className={!compactExpanded ? "mb-1.5" : ""}>
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
                    {diffConfig && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${diffConfig.className}`}
                      >
                        {diffConfig.label}
                      </Badge>
                    )}
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

              {/* Non-MC answer */}
              {options.length === 0 &&
                displayCorrectAnswer &&
                !flatDisplayQuestionText.includes(displayCorrectAnswer) && (
                  <div className="text-[12px] bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded border border-slate-200">
                    <span className="font-medium">정답:</span> {displayCorrectAnswer}
                  </div>
                )}

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
