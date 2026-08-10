"use client";

// ============================================================================
// 시험 상세 와이드 모달 — 한 응시의 채점·문항 검토 정본 (2607 §7.3, 구 ReviewDrawer)
//
// 640px 우측 Sheet 였던 채점 검토를 WideModal 로 전면 교체한다. 드로어에서는
// 문항 카드를 세로로 쌓아 스크롤로만 훑을 수 있었고, 대리입력을 켜면 화면이
// 통째로 갈아끼워져 점수·정오 맥락이 사라졌다. 이 모달은 그 두 결함을 함께 고친다.
//
//  좌 ① 요약 스트립 — 점수·정오 4분포·정답률 링·타임라인(응시/제출/채점)
//    ② 문항 타일 그리드 + 정오 필터 칩(모집단을 숨기지 않는다)
//    ③ 선택 문항 상세 — 발문 전문·선지(정답/학생 선택)·지문 원문·해설·수동확정
//       └ 대리입력 모드는 **③ 자리만** TeacherEntry 로 바꾼다. ①② 는 남는다.
//  우 채점 상태 배너 + 액션(대리입력·재채점·리포트) + 오답 일괄 변형(§8)
//
// 색축 계약: 정답 emerald / 오답 rose / 부분 blue / 검토 대기·미입력 slate —
// 학생 허브와 같은 축이다. shared.tsx 의 EFFECTIVE_STATUS_META 는 CORRECT=blue
// 축이라 다른 소비처(테이블·칩)가 있으므로 **고치지 않고** 이 파일 안에 자체 톤
// 맵(VERDICT_TONE)을 둔다. 라벨만 EFFECTIVE_STATUS_META 에서 가져와 단일화한다.
//
// 서버 계약: getSubmissionReviewDetail 1콜(기존 그대로). 발문 전문·선지·지문·
// 해설·난이도는 페이로드 확장(2607 §7.4)이 도착하면 켜지는 **옵셔널 소비**다 —
// 없으면 brief·정답 표기 폴백으로 우아하게 강등된다(무음 실패 없음).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ClipboardList,
  FileChartColumn,
  Info,
  Loader2,
  Minus,
  PenLine,
  RefreshCw,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ModalCloseGuardCard, WideModal } from "@/components/layout/wide-modal";
import {
  CardEmpty,
  FilterChip,
  fmtAt,
  scoreText,
} from "@/components/students/hub/analytics/kit";
import { renderFormatted } from "@/components/workbench/question-card-format";
import {
  getSubmissionReviewDetail,
  regradeSubmission,
  resolveNeedsReview,
  type SubmissionMutationResult,
  type SubmissionReviewDetail,
  type SubmissionReviewQuestion,
} from "@/actions/exams/submission-review";
import {
  buildVariantGenerateHref,
  choiceOrdinal,
  filterVariantQuestions,
  saveVariantSeed,
  type VariantBlockReason,
  type VariantSeedQuestion,
} from "@/lib/question-variant";
import { getQuestionDifficultyLabel } from "@/lib/difficulty";
import {
  EXAM_ROW_DISABLED_REASONS,
  SITTING_DETAIL_COPY,
  VARIANT_COPY,
  VARIANT_DISABLED_REASONS,
} from "@/lib/wording/director-glossary";
import { cn, formatDateTime } from "@/lib/utils";
import { reportLinkFor } from "./assignment-table";
import {
  choiceIndexOf,
  choiceLabelOf,
  EFFECTIVE_STATUS_META,
  EXAM_FONT,
  MODE_LABELS,
  type EffectiveStatusKind,
} from "./shared";
import { TeacherEntry } from "./teacher-entry";

// ── 서버 페이로드 확장(2607 §7.4)의 옵셔널 소비 계약 ────────────────────────
//
// A5 단위가 SubmissionReviewQuestion 에 추가 중인 필드들. 도착 전에도 타입이
// 맞도록 구조적 확장으로 선언하고 값은 전부 옵셔널로 읽는다(@ts-nocheck 금지).
// 필드가 없으면 brief·correctChoiceLabels 폴백 경로로 내려간다.
interface ReviewQuestionExtras {
  /** 발문 전문(클램프 없음) — 없으면 brief(80자 클램프) 폴백 */
  questionText?: string;
  /** 선지 원문 — 없으면 정답 라벨·학생 입력 요약 폴백 */
  options?: { label: string; text: string }[];
  /** 변형 생성 딥링크의 지문 원천 */
  passageId?: string | null;
  passage?: { id: string; title: string; content: string } | null;
  explanation?: {
    content: string;
    keyPoints: string[];
    wrongOptions: { label: string; text: string }[];
  } | null;
  difficulty?: string | null;
}

type ReviewQuestion = SubmissionReviewQuestion & ReviewQuestionExtras;

// ── 정오 톤 축(학생 허브 통일) ──────────────────────────────────────────────

interface VerdictTone {
  label: string;
  /** 타일 배경·테두리 */
  tile: string;
  /** 요약 도트 */
  dot: string;
  /** 상세 헤더 칩 */
  chip: string;
  /** 글리프 색 */
  glyph: string;
}

const VERDICT_TONE: Record<EffectiveStatusKind, VerdictTone> = {
  CORRECT: {
    label: EFFECTIVE_STATUS_META.CORRECT.label,
    tile: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    glyph: "text-emerald-600",
  },
  WRONG: {
    label: EFFECTIVE_STATUS_META.WRONG.label,
    tile: "border-rose-200 bg-rose-50 text-rose-800",
    dot: "bg-rose-500",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    glyph: "text-rose-600",
  },
  PARTIAL: {
    label: EFFECTIVE_STATUS_META.PARTIAL.label,
    tile: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-600",
    chip: "border-blue-200 bg-blue-50 text-blue-700",
    glyph: "text-blue-600",
  },
  NEEDS_REVIEW: {
    label: EFFECTIVE_STATUS_META.NEEDS_REVIEW.label,
    tile: "border-slate-300 bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    chip: "border-slate-300 bg-slate-100 text-slate-600",
    glyph: "text-slate-500",
  },
  UNKNOWN: {
    label: EFFECTIVE_STATUS_META.UNKNOWN.label,
    tile: "border-slate-200 bg-white text-slate-400",
    dot: "bg-slate-300",
    chip: "border-slate-200 bg-white text-slate-400",
    glyph: "text-slate-300",
  },
};

/** 타일·칩 좌측 글리프 — 정답 체크 / 오답 X / 부분 반원 / 나머지 dash */
function VerdictGlyph({ status }: { status: EffectiveStatusKind }) {
  const tone = VERDICT_TONE[status];
  if (status === "CORRECT") {
    return <Check className={cn("size-3.5", tone.glyph)} strokeWidth={3} aria-hidden />;
  }
  if (status === "WRONG") {
    return <X className={cn("size-3.5", tone.glyph)} strokeWidth={2.5} aria-hidden />;
  }
  if (status === "PARTIAL") {
    return (
      <span
        aria-hidden
        className="relative inline-block size-3.5 overflow-hidden rounded-full border-[1.5px] border-blue-600"
      >
        <span className="absolute inset-y-0 left-0 w-1/2 bg-blue-600" />
      </span>
    );
  }
  return <Minus className={cn("size-3.5", tone.glyph)} strokeWidth={2.5} aria-hidden />;
}

function VerdictChip({ status }: { status: EffectiveStatusKind }) {
  const tone = VERDICT_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone.chip,
      )}
    >
      <VerdictGlyph status={status} />
      {tone.label}
    </span>
  );
}

// ── 시험 본문 마커 렌더 ─────────────────────────────────────────────────────
//
// 검수 [11]: 발문·지문·선지를 평문(`{stem}`)으로 뱉어 `__(A) that__` 같은
// 마크다운 밑줄 마커가 언더스코어째 화면에 노출됐다. 어법 판단은 「밑줄 친 부분
// 중 틀린 것」을 고르는 유형이라 밑줄이 없으면 문항 자체를 읽을 수 없다.
// exam-report 의 QuestionDetailView 는 QuestionCard 를 쓰고, 그 QuestionCard 가
// 내부적으로 부르는 정본 렌더러가 renderFormatted 다. 같은 함수를 직접 소비해
// 두 표면의 마커 관용(원형숫자 ①·(A)(B) 마커·빈칸 밑줄)을 한 벌로 맞춘다.

/** 밑줄 모드 유형 — question-card.tsx:92-96 과 동일 목록(같은 렌더 결과 보장) */
const UNDERLINE_SUBTYPES = ["VOCAB_CHOICE", "GRAMMAR_ERROR", "IMPLIED_MEANING", "ANTONYM"];
/** 마커만 강조(밑줄 금지) — 네모 어법은 밑줄 모드에서 첫 토큰만 밑줄돼 깨진다 */
const MARKER_ONLY_SUBTYPES = [
  "SENTENCE_INSERT",
  "IRRELEVANT",
  "SENTENCE_ORDER",
  "GRAMMAR_CHOICE_COMBO",
];

/** 발문·지문·선지 공통 — 마커/밑줄/빈칸을 exam-report 와 같은 관용으로 그린다 */
function renderExamText(text: string, subType: string | null | undefined) {
  const sub = subType ?? "";
  return renderFormatted(text, {
    underlineMarkedWords: UNDERLINE_SUBTYPES.includes(sub),
    highlightMarkers:
      UNDERLINE_SUBTYPES.includes(sub) || MARKER_ONLY_SUBTYPES.includes(sub),
    subType: sub,
  });
}

// ── 표시 헬퍼 ───────────────────────────────────────────────────────────────

/** 학생 입력 표시 줄 — 빈 배열이면 호출부가 「미입력」으로 그린다 */
function describeInput(q: ReviewQuestion): string[] {
  const input = q.input;
  if (!input) return [];
  const lines: string[] = [];
  // 선지 표기는 화면 렌더축(원형숫자)으로 — 저장 라벨((A)(B))을 그대로 쓰면
  // 지문 마커·선지 목록과 매칭되지 않는다. 위치를 못 구하면 저장 라벨 폴백.
  const label = (token: string) => {
    const idx = choiceIndexOf(token);
    return idx != null ? choiceOrdinal(idx) : choiceLabelOf(q.optionLabels, token);
  };
  if (input.choice) lines.push(label(input.choice));
  if (input.choices && input.choices.length > 0) {
    lines.push(input.choices.map(label).join(", "));
  }
  if (input.texts) {
    const labelByKey = new Map((q.answerFields ?? []).map((f) => [f.key, f.label] as const));
    for (const [key, value] of Object.entries(input.texts)) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const label = labelByKey.get(key);
      lines.push(label ? `${label} ${trimmed}` : trimmed);
    }
  }
  return lines;
}

/** 정답 표시 줄 — 선지형은 라벨, 서답형은 필드별 모범답(+허용 변형 수) */
function describeAnswer(q: ReviewQuestion): string[] {
  // 정답 표기도 같은 축으로 — correctChoices 는 정규화 토큰("1".."12")이라
  // 위치를 바로 얻을 수 있다. 없으면 저장 라벨(correctChoiceLabels) 폴백.
  if (q.correctChoices && q.correctChoices.length > 0) {
    return [
      q.correctChoices
        .map((t) => {
          const idx = choiceIndexOf(t);
          return idx != null ? choiceOrdinal(idx) : t;
        })
        .join(", "),
    ];
  }
  if (q.correctChoiceLabels && q.correctChoiceLabels.length > 0) {
    return [q.correctChoiceLabels.join(", ")];
  }
  if (q.answerFields && q.answerFields.length > 0) {
    return q.answerFields.map((f) => {
      const head = f.answers[0] ?? "";
      const extra = f.answers.length > 1 ? ` (외 ${f.answers.length - 1}개 허용)` : "";
      const label = q.answerFields && q.answerFields.length > 1 ? `${f.label} ` : "";
      return `${label}${head}${extra}`;
    });
  }
  return [];
}

/** 학생이 고른 선지 토큰 집합 — "③"·"(c)"·"3" 을 전부 "3" 으로 정규화 */
function chosenTokens(q: ReviewQuestion): Set<string> {
  const raw = [
    ...(q.input?.choice ? [q.input.choice] : []),
    ...(q.input?.choices ?? []),
  ];
  const out = new Set<string>();
  for (const token of raw) {
    const index = choiceIndexOf(token);
    if (index != null) out.add(String(index + 1));
  }
  return out;
}

/**
 * 문항 → 변형 시드 1건. passageId 결손은 빈 문자열 — 자격 판정이 걸러낸다.
 * 정답·학생 답 표기는 describeAnswer/describeInput 이 이미 원형숫자로 통일하므로
 * 생성 페이지(스트립·원본 모달·프롬프트)도 같은 축을 받는다.
 */
function toVariantSeedQuestion(q: ReviewQuestion): VariantSeedQuestion {
  return {
    questionId: q.questionId,
    orderLabel: `${q.orderNum}번`,
    subType: q.subType,
    typeLabel: q.typeLabel,
    difficulty: q.difficulty ?? null,
    passageId: q.passageId ?? q.passage?.id ?? "",
    passageTitle: q.passage?.title ?? null,
    questionText: q.questionText ?? q.brief,
    correctText: describeAnswer(q).join(" / ") || null,
    studentText: describeInput(q).join(" / ") || null,
    keyPoints: q.explanation?.keyPoints ?? [],
  };
}

/** 타일 필터 축 — 상태 5종 + 전체 + 「오답만」(오답·부분점수 합집합) */
type TileFilter = EffectiveStatusKind | "ALL" | "WRONG_ONLY";

const STATUS_ORDER: EffectiveStatusKind[] = [
  "CORRECT",
  "WRONG",
  "PARTIAL",
  "NEEDS_REVIEW",
  "UNKNOWN",
];

/** 틀린 문항 = 오답 + 부분점수 — 변형 생성 대상 모집단과 같은 정의 */
function isWrongish(status: EffectiveStatusKind): boolean {
  return status === "WRONG" || status === "PARTIAL";
}

// ── 본체 ────────────────────────────────────────────────────────────────────

interface SubmissionDetailModalProps {
  /** null 이면 닫힘 */
  submissionId: string | null;
  onClose: () => void;
  /** 채점/판정 변경 후 부모 목록 갱신 트리거 */
  onMutated: () => void;
}

export function SubmissionDetailModal({
  submissionId,
  onClose,
  onMutated,
}: SubmissionDetailModalProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<SubmissionReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState(false);
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const [filter, setFilter] = useState<TileFilter>("ALL");
  /** 선택 문항 — null 이면 상세 자리에 안내문(SITTING_DETAIL_COPY.PICK_QUESTION) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 대리입력 중 ESC·백드롭 닫기를 가로챈 확인 카드(검수 [83]) */
  const [closeGuardOpen, setCloseGuardOpen] = useState(false);
  /** 응시 1건당 자동 선택 1회 — 사용자가 해제한 뒤 되살아나지 않게 한다 */
  const autoPickedRef = useRef(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSubmissionReviewDetail(id);
      if (result.success) setDetail(result.detail);
      else setError(result.error);
    } catch {
      setError("제출 상세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 대상이 바뀌면 선택·필터·모드를 전부 초기화한다(이전 응시의 잔상 방지)
    setDetail(null);
    setError(null);
    setEntryMode(false);
    setSelectedId(null);
    setFilter("ALL");
    setCloseGuardOpen(false);
    autoPickedRef.current = false;
    if (!submissionId) return;
    void load(submissionId);
  }, [submissionId, load]);

  // 재채점 확인 AlertDialog 가 열려 있는 동안의 ESC 가드.
  // WideModal 은 document 레벨 keydown(버블)으로 닫히므로, 가드가 없으면 ESC
  // 한 번에 확인창과 모달이 함께 닫힌다. 캡처 단계에서 가로채 확인창만 닫는다
  // (ModalCloseGuardCard 선례 — wide-modal.tsx:120).
  useEffect(() => {
    if (!regradeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setRegradeOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [regradeOpen]);

  /** 뮤테이션 공통 후처리 — 상세 재적재 + 부모 목록 갱신 + 브리지 경고 표출 */
  const afterMutation = useCallback(
    (result: SubmissionMutationResult) => {
      if (result.syncWarning) toast.info(result.syncWarning);
      if (submissionId) void load(submissionId);
      onMutated();
    },
    [submissionId, load, onMutated],
  );

  function handleEntrySaved(result: SubmissionMutationResult) {
    const remaining = (result.needsReviewCount ?? 0) + (result.unansweredCount ?? 0);
    if (result.status === "GRADED") {
      toast.success("답안 저장과 채점이 완료되었습니다.");
    } else {
      toast.success(`답안을 저장했습니다. 확정이 필요한 문항 ${remaining}개가 남아 있습니다.`);
    }
    setEntryMode(false);
    afterMutation(result);
  }

  async function handleRegrade() {
    if (!submissionId) return;
    setRegrading(true);
    try {
      const result = await regradeSubmission(submissionId);
      if (!result.success) {
        toast.error(result.error ?? "재채점에 실패했습니다.");
        return;
      }
      toast.success(
        result.status === "GRADED"
          ? "재채점이 완료되었습니다."
          : "재채점했습니다. 확정이 필요한 문항이 남아 있습니다.",
      );
      afterMutation(result);
    } finally {
      setRegrading(false);
    }
  }

  const questions = useMemo<ReviewQuestion[]>(
    () => (detail?.questions ?? []) as ReviewQuestion[],
    [detail],
  );

  const countByStatus = useMemo(() => {
    const out: Record<EffectiveStatusKind, number> = {
      CORRECT: 0,
      WRONG: 0,
      PARTIAL: 0,
      NEEDS_REVIEW: 0,
      UNKNOWN: 0,
    };
    for (const q of questions) out[q.effectiveStatus] += 1;
    return out;
  }, [questions]);

  const wrongQuestions = useMemo(
    () => questions.filter((q) => isWrongish(q.effectiveStatus)),
    [questions],
  );

  // 검수 [80]: 문항 미선택 상태에서 좌측 하단 ~290px 가 죽은 공간이 된다.
  // 적재 직후 첫 오답(없으면 첫 문항)을 자동 선택해 ③ 패널이 처음부터 채워지게
  // 한다. 응시 1건당 1회만 — 이후 사용자가 타일을 눌러 해제하면 그대로 둔다.
  useEffect(() => {
    if (autoPickedRef.current || questions.length === 0) return;
    autoPickedRef.current = true;
    setSelectedId((wrongQuestions[0] ?? questions[0]).questionId);
  }, [questions, wrongQuestions]);

  const visibleQuestions = useMemo(() => {
    if (filter === "ALL") return questions;
    if (filter === "WRONG_ONLY") return wrongQuestions;
    return questions.filter((q) => q.effectiveStatus === filter);
  }, [questions, wrongQuestions, filter]);

  const selected = useMemo(
    () => questions.find((q) => q.questionId === selectedId) ?? null,
    [questions, selectedId],
  );

  // 변형 자격 판정 — 문항 1개분과 오답 일괄분을 각각 미리 계산해 사유 툴팁에 쓴다
  const singleVariant = useMemo(
    () => filterVariantQuestions(selected ? [toVariantSeedQuestion(selected)] : []),
    [selected],
  );
  const bulkVariant = useMemo(
    () => filterVariantQuestions(wrongQuestions.map(toVariantSeedQuestion)),
    [wrongQuestions],
  );

  /**
   * 변형 생성 진입 — 리치 시드는 sessionStorage, 핵심 파라미터는 URL 로 이중화한다.
   * 시드가 유실돼도 지문·유형·난이도 프리필은 URL 만으로 살아남는다(§8.2).
   */
  const openVariant = useCallback(
    (seeds: VariantSeedQuestion[], reason: VariantBlockReason | null) => {
      if (!detail) return;
      if (reason || seeds.length === 0) {
        toast.error(VARIANT_DISABLED_REASONS[reason ?? "NO_QUESTIONS"]);
        return;
      }
      const seedId = saveVariantSeed({
        origin: "submission",
        studentId: detail.studentId,
        studentName: detail.studentName,
        examTitle: detail.examTitle,
        createdAt: new Date().toISOString(),
        questions: seeds,
      });
      const from =
        typeof window === "undefined"
          ? undefined
          : window.location.pathname + window.location.search;
      router.push(
        buildVariantGenerateHref({
          seedId,
          questions: seeds,
          studentId: detail.studentId,
          from,
        }),
      );
    },
    [detail, router],
  );

  /**
   * 검수 [83]: 대리입력 중에는 ESC·백드롭 한 번에 입력분(TeacherEntry 로컬 state)이
   * 전량 사라졌다. 저장 전 데이터가 있는 동안에는 확인 카드를 먼저 띄운다.
   * WideModal 의 ESC·백드롭이 모두 onClose 를 부르므로 여기서 한 번에 가로챈다.
   */
  const requestClose = useCallback(() => {
    if (entryMode) {
      setCloseGuardOpen(true);
      return;
    }
    onClose();
  }, [entryMode, onClose]);

  const reviewable =
    detail != null && (detail.status === "SUBMITTED" || detail.status === "GRADED");
  const busy = loading || regrading;
  const summary = detail?.scoreSummary ?? null;
  const scorePct =
    summary && summary.totalScore != null && summary.maxScore != null && summary.maxScore > 0
      ? (summary.totalScore / summary.maxScore) * 100
      : null;
  const accuracyPct =
    questions.length > 0 ? (countByStatus.CORRECT / questions.length) * 100 : null;

  if (!submissionId) return null;

  return (
    <>
      <WideModal
        open
        onClose={requestClose}
        icon={ClipboardList}
        title={detail ? `${detail.studentName} · ${detail.examTitle}` : "채점 검토"}
        description={
          detail
            ? [
                detail.mode ? `${MODE_LABELS[detail.mode] ?? detail.mode} 응시` : null,
                detail.submittedAt ? `제출 ${formatDateTime(detail.submittedAt)}` : "미제출",
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        maxWidthClassName="max-w-[min(1720px,96vw)]"
        bodyClassName="p-0"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-slate-400">
              <Info className="size-3.5 shrink-0 text-slate-300" aria-hidden />
              <span className="truncate">{SITTING_DETAIL_COPY.FOOTER_HINT}</span>
            </p>
            <button
              type="button"
              onClick={requestClose}
              className="h-9 shrink-0 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        }
      >
        {loading && !detail ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : error && !detail ? (
          <div className="flex flex-col items-center gap-3 py-24">
            <p className="text-[13px] text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => submissionId && void load(submissionId)}
              className="h-9 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              다시 불러오기
            </button>
          </div>
        ) : detail ? (
          // 검수 [48]: 높이를 브레이크포인트 무관 고정(h-[min(80vh,900px)])으로
          // 두면 세로 940px 미만 뷰포트에서 WideModal 본문 스크롤 + 패널 내부
          // 스크롤의 이중 스크롤이 생기고 우측 레일 CTA 가 화면 밖으로 밀린다.
          // lg 미만은 question-detail-view 와 같이 자연 높이 + 단일 스크롤로 접고,
          // lg 이상에서만 2열 고정 높이를 쓴다(헤더·푸터 몫 16rem 을 뺀다).
          <div className="grid h-auto grid-cols-1 lg:h-[min(80vh,900px)] lg:max-h-[calc(100dvh-16rem)] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1">
            {/* ── 좌: 요약 · 문항 타일 · 선택 문항 상세 ───────────────────── */}
            <div className="flex min-h-0 flex-col gap-4 p-4 sm:p-5 lg:overflow-y-auto">
              {/* 재적재 실패 — 이미 그린 내용을 지우지 않되 실패를 숨기지도 않는다 */}
              {error ? (
                <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
                  <Info className="size-3.5 shrink-0" aria-hidden />
                  {error} 이전 데이터 표시 중
                </p>
              ) : null}

              {/* ① 요약 스트립 */}
              <section className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="min-w-[9rem]">
                  <p className="text-[12px] font-semibold text-slate-400">점수</p>
                  {summary && summary.totalScore != null && summary.maxScore != null ? (
                    <p className="mt-0.5 flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-[30px] font-bold leading-none tabular-nums",
                          scorePct != null ? scoreText(scorePct) : "text-slate-800",
                        )}
                      >
                        {summary.totalScore}
                      </span>
                      <span className="text-[14px] font-semibold tabular-nums text-slate-400">
                        / {summary.maxScore}점
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-[15px] font-semibold text-slate-300">채점 전</p>
                  )}
                </div>

                {/* 정오 분포 — 검수 [25]: 이 자리만 「미확정」이라는 제3의 낱말을
                    썼고, 그 수치는 사실 검토 대기 + 미입력의 합집합
                    (_submission-review-core.ts:261 unknownCount)이었다. 배너·필터
                    칩과 같은 두 버킷으로 쪼개 한 모달 안의 어휘를 한 벌로 만든다
                    (합산 라벨을 새로 만들지 않으므로 신규 리터럴도 없다). */}
                {summary ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <DistDot tone={VERDICT_TONE.CORRECT} count={summary.correctCount} />
                    <DistDot tone={VERDICT_TONE.WRONG} count={summary.wrongCount} />
                    <DistDot tone={VERDICT_TONE.PARTIAL} count={summary.partialCount} />
                    <DistDot
                      tone={VERDICT_TONE.NEEDS_REVIEW}
                      count={detail.needsReviewCount}
                    />
                    <DistDot tone={VERDICT_TONE.UNKNOWN} count={detail.unansweredCount} />
                  </div>
                ) : null}

                {accuracyPct != null ? (
                  <AccuracyRing
                    pct={accuracyPct}
                    correct={countByStatus.CORRECT}
                    total={questions.length}
                  />
                ) : null}

                {/* 타임라인 — 응시 시작·제출·채점(KST 절대 시각) */}
                <dl className="ml-auto flex flex-col gap-0.5">
                  <TimelineRow label="응시 시작" at={detail.startedAt} />
                  <TimelineRow label="제출" at={detail.submittedAt} />
                  <TimelineRow label="채점" at={detail.gradedAt} />
                </dl>
              </section>

              {/* ② 문항 타일 그리드 */}
              <section className="rounded-xl border border-slate-200 bg-white">
                <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
                  <h3 className="text-[13px] font-semibold text-slate-700">
                    {SITTING_DETAIL_COPY.QUESTIONS_TITLE}
                  </h3>
                  <span className="text-[12px] tabular-nums text-slate-400">
                    {questions.length}문항
                  </span>
                </header>
                <div className="flex flex-wrap items-center gap-1.5 px-3.5 pt-3">
                  <FilterChip
                    label={`전체 ${questions.length}`}
                    count={0}
                    active={filter === "ALL"}
                    onClick={() => setFilter("ALL")}
                  />
                  {STATUS_ORDER.filter((s) => countByStatus[s] > 0).map((s) => (
                    <FilterChip
                      key={s}
                      label={`${VERDICT_TONE[s].label} ${countByStatus[s]}`}
                      count={0}
                      active={filter === s}
                      onClick={() => setFilter(s)}
                    />
                  ))}
                  {/* 검수 [28]/[57]/[138]: 부분점수가 0건이면 「오답 n」 칩과
                      「오답만 n」 토글의 대상 집합·숫자가 완전히 같아져 같은 줄에
                      같은 숫자의 버튼이 둘이 됐다. 부분점수가 실제로 있을 때만
                      노출하고, 라벨도 합집합임이 드러나게 두 톤 라벨을 잇는다. */}
                  {countByStatus.PARTIAL > 0 || filter === "WRONG_ONLY" ? (
                    <span className="ml-auto">
                      <FilterChip
                        label={`${VERDICT_TONE.WRONG.label}·${VERDICT_TONE.PARTIAL.label}만 ${wrongQuestions.length}`}
                        count={0}
                        active={filter === "WRONG_ONLY"}
                        onClick={() =>
                          setFilter((v) => (v === "WRONG_ONLY" ? "ALL" : "WRONG_ONLY"))
                        }
                      />
                    </span>
                  ) : null}
                </div>
                <div className="p-3.5">
                  {visibleQuestions.length === 0 ? (
                    // 검수 [88]/[101]: 빈 상태는 CardEmpty 1종만(스펙 §1.1)
                    <CardEmpty text="이 조건에 해당하는 문항이 없습니다." />
                  ) : (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                      {visibleQuestions.map((q) => {
                        const tone = VERDICT_TONE[q.effectiveStatus];
                        const active = q.questionId === selectedId;
                        return (
                          <li key={q.questionId}>
                            <button
                              type="button"
                              aria-pressed={active}
                              // 토글 해제 금지 — 첫 문항이 자동 선택되므로 사용자의
                              // 첫 클릭(1번 타일)이 상세를 사라지게 만들었다. 이 모달의
                              // 본체는 상세 패널이라 빈 상태로 되돌릴 이유가 없다.
                              onClick={() => setSelectedId(q.questionId)}
                              title={`${q.orderNum}번 · ${tone.label} · ${q.typeLabel} · ${q.points}점`}
                              className={cn(
                                // 검수 [137]: 타일은 칩·배지가 아니므로 11px 하한
                                // 위반이다. 12px 로 올리고 높이를 5.25rem 으로 키워
                                // 3줄이 눌리지 않게 한다.
                                "flex h-[5.25rem] w-full flex-col items-start justify-between rounded-lg border px-2.5 py-2 text-left transition-shadow",
                                tone.tile,
                                active
                                  ? "ring-2 ring-blue-500 ring-offset-1"
                                  : "hover:shadow-sm",
                              )}
                            >
                              <span className="flex w-full items-center justify-between gap-1">
                                <span className="text-[13px] font-bold tabular-nums">
                                  {q.orderNum}
                                </span>
                                <VerdictGlyph status={q.effectiveStatus} />
                              </span>
                              {/* opacity 대신 명시 색 — 대비를 흐리지 않는다 */}
                              <span className="w-full truncate text-[12px] font-medium">
                                {q.typeLabel}
                              </span>
                              <span className="text-[12px] font-medium tabular-nums">
                                {q.points}점
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>

              {/* ③ 선택 문항 상세 — 대리입력 모드면 이 자리만 갈아끼운다(①② 유지) */}
              {entryMode ? (
                <section className="rounded-xl border border-blue-200 bg-white p-4">
                  <p className="mb-3 text-[13px] font-semibold text-blue-700">답안 대리입력</p>
                  <TeacherEntry
                    detail={detail}
                    busy={busy}
                    onSaved={handleEntrySaved}
                    onCancel={() => setEntryMode(false)}
                  />
                </section>
              ) : selected ? (
                <QuestionDetailPanel
                  key={selected.questionId}
                  submissionId={detail.submissionId}
                  q={selected}
                  reviewable={reviewable}
                  busy={busy}
                  onMutated={afterMutation}
                  variantReason={singleVariant.reason}
                  onVariant={() => openVariant(singleVariant.usable, singleVariant.reason)}
                />
              ) : (
                // 검수 [88]/[101]: 점선 상자는 CardEmpty/TabEmpty 2종 계약 밖의
                // 3번째 빈 상태 양식이었다 — 같은 파일의 필터 0건과 한 벌로 통일
                <div className="rounded-xl border border-slate-200 bg-white">
                  <CardEmpty text={SITTING_DETAIL_COPY.PICK_QUESTION} />
                </div>
              )}
            </div>

            {/* ── 우: 채점 상태 · 액션 · 오답 일괄 변형 ────────────────────── */}
            <aside className="flex min-h-0 flex-col gap-3 border-t border-slate-200 bg-white p-4 lg:border-l lg:border-t-0 lg:overflow-y-auto">
              <p className="text-[13px] font-semibold text-slate-700">
                {SITTING_DETAIL_COPY.ACTIONS_TITLE}
              </p>

              {/* 확정 필요 배너 — 남은 개수를 숨기지 않는다 */}
              {reviewable && detail.needsReviewCount + detail.unansweredCount > 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-rose-400" aria-hidden />
                  <p className="text-[12px] leading-relaxed text-rose-600">
                    확정이 필요한 문항이 남아 있습니다. ({VERDICT_TONE.NEEDS_REVIEW.label}{" "}
                    {detail.needsReviewCount} · {VERDICT_TONE.UNKNOWN.label}{" "}
                    {detail.unansweredCount}) 전 문항을 확정하면 채점이 완료됩니다.
                  </p>
                </div>
              ) : reviewable ? (
                // 검수 [34]/[58]: 배너 3종이 모두 0건인 정상 응시가 기본값이라
                // 레일이 통째로 비어 「로딩 실패했나」로 읽혔다. 스펙 §7.3 이 정한
                // 채점 상태(검토 대기·미입력·삭제 문항)를 0건일 때도 slate 중립
                // 톤으로 상시 렌더해 「지금 채점이 깨끗하다」를 화면에 남긴다.
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-slate-500">채점 상태</p>
                  <dl className="mt-1.5 flex flex-col gap-1">
                    <RailStat
                      label={VERDICT_TONE.NEEDS_REVIEW.label}
                      count={detail.needsReviewCount}
                    />
                    <RailStat
                      label={VERDICT_TONE.UNKNOWN.label}
                      count={detail.unansweredCount}
                    />
                    <RailStat label="삭제 문항" count={detail.droppedQuestionCount} />
                  </dl>
                </div>
              ) : null}

              {/* 삭제 문항 고지 — slate(계약: 앰버 금지).
                  위 「채점 상태」 요약이 뜨는 경우엔 같은 수치를 이미 싣고 있으므로
                  그때는 생략한다(같은 값 2회 노출 방지) */}
              {detail.droppedQuestionCount > 0 &&
              !(reviewable && detail.needsReviewCount + detail.unansweredCount === 0) ? (
                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                  <p className="text-[12px] leading-relaxed text-slate-600">
                    시험지에서 삭제된 문항 {detail.droppedQuestionCount}개는 채점에서
                    제외되었습니다.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setEntryMode((v) => !v)}
                  disabled={busy}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-md border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
                    entryMode
                      ? "border-blue-600 bg-blue-50/60 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <PenLine className="size-4" aria-hidden />
                  {entryMode ? "검토 화면으로" : "답안 대리입력"}
                </button>
                {reviewable ? (
                  <button
                    type="button"
                    onClick={() => setRegradeOpen(true)}
                    disabled={busy}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    {regrading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <RefreshCw className="size-4" aria-hidden />
                    )}
                    재채점
                  </button>
                ) : null}
                {/* 검수 [84]: status 만 보고 활성화하면 리포트 미연결 응시에서
                    reportLinkFor 가 리포트 허브로 폴백해 학생·응시 문맥을 통째로
                    잃는다. 응시 기록 표(sittings-table-card)와 같은 관용으로
                    미연결은 비활성 + 사유, 활성은 `?from=` 을 실어 되돌아온다. */}
                {detail.status === "GRADED" ? (
                  detail.reportStudentId && detail.reportAnalysisId ? (
                    <Link
                      href={reportLinkFor(detail)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        const base = reportLinkFor(detail);
                        const from = window.location.pathname + window.location.search;
                        router.push(
                          `${base}${base.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`,
                        );
                      }}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                    >
                      <FileChartColumn className="size-4" aria-hidden />
                      리포트 열기
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title={EXAM_ROW_DISABLED_REASONS.NO_REPORT}
                      className="flex h-9 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-300"
                    >
                      <FileChartColumn className="size-4" aria-hidden />
                      리포트 열기
                    </button>
                  )
                ) : null}
              </div>

              {/* 오답 일괄 변형(§8) — 불가 사유는 침묵 대신 화면 문장으로.
                  검수 [34]/[58]/[81]: mt-auto 가 이 CTA 를 레일 바닥으로 밀어
                  액션 그룹과 500px 넘게 벌어져 있었다 — 바로 아래에 붙인다. */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => openVariant(bulkVariant.usable, bulkVariant.reason)}
                  disabled={bulkVariant.reason != null}
                  title={
                    bulkVariant.reason
                      ? VARIANT_DISABLED_REASONS[bulkVariant.reason]
                      : undefined
                  }
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Wand2 className="size-4" aria-hidden />
                  {/* 검수 [140]: 비활성인데 「(3)」이 붙어 있으면 왜 안 눌리는지
                      알 수 없다 — 개수는 실제 생성 가능할 때만 붙인다 */}
                  {VARIANT_COPY.BULK}
                  {bulkVariant.reason ? "" : ` (${bulkVariant.usable.length})`}
                </button>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-500">
                  {/* 사유를 툴팁에만 두면 터치 기기에서 도달 불가 */}
                  {bulkVariant.reason
                    ? VARIANT_DISABLED_REASONS[bulkVariant.reason]
                    : VARIANT_COPY.AFTER_GENERATE_HINT}
                </p>
              </div>
            </aside>
          </div>
        ) : null}
      </WideModal>

      {/* 대리입력 중 닫기 확인(검수 [83]) — 저장 전 답안 유실 방지 */}
      <ModalCloseGuardCard
        open={closeGuardOpen}
        message="답안 대리입력을 저장하지 않았습니다. 닫으면 입력한 내용이 사라집니다."
        onStay={() => setCloseGuardOpen(false)}
        onDiscard={() => {
          setCloseGuardOpen(false);
          onClose();
        }}
      />

      {/* 재채점 confirm — 열려 있는 동안 ESC 는 위 캡처 가드가 가로챈다 */}
      <AlertDialog open={regradeOpen} onOpenChange={setRegradeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 재채점</AlertDialogTitle>
            <AlertDialogDescription>
              현재 문항 원본을 기준으로 전 문항을 다시 채점합니다. 강사가 수동으로 확정한
              판정은 유지됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9">취소</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                setRegradeOpen(false);
                void handleRegrade();
              }}
            >
              재채점하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── 요약 스트립 조각 ────────────────────────────────────────────────────────

/** 레일 「채점 상태」 한 줄 — 0건도 숨기지 않는다(깨끗함 자체가 정보다) */
function RailStat({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[12px] text-slate-500">{label}</dt>
      <dd
        className={cn(
          "text-[13px] font-semibold tabular-nums",
          count > 0 ? "text-slate-700" : "text-slate-400",
        )}
      >
        {count}
      </dd>
    </div>
  );
}

function DistDot({ tone, count }: { tone: VerdictTone; count: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
      <span className="text-[12px] font-medium text-slate-500">{tone.label}</span>
      <span className="text-[14px] font-bold tabular-nums text-slate-800">{count}</span>
    </span>
  );
}

/** 정답률 링 92px — 분모(문항 수)를 숫자로 함께 보여준다(비율 단독 노출 금지) */
function AccuracyRing({
  pct,
  correct,
  total,
}: {
  pct: number;
  correct: number;
  total: number;
}) {
  const value = Math.max(0, Math.min(100, pct));
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  return (
    // 검수 [87]: 링에 화면상 라벨이 없어 바로 옆 「점수」와 같은 숫자가 두 번
    // 나오는 것처럼 보였다. 점수(배점 기준)와 정답률(문항 수 기준)은 배점이
    // 불균일한 시험지에서 갈라지는 다른 지표이므로 캡션을 명시한다.
    <div className="flex shrink-0 flex-col items-center gap-1">
      <p className="text-[12px] font-semibold text-slate-400">정답률</p>
      <div
        className="relative flex size-[92px] items-center justify-center"
        role="img"
        aria-label={`정답률 ${Math.round(value)}% — ${total}문항 중 ${correct}문항 정답`}
      >
        <svg viewBox="0 0 92 92" className="size-[92px] -rotate-90" aria-hidden>
          <circle
            cx="46"
            cy="46"
            r={radius}
            fill="none"
            strokeWidth="7"
            className="stroke-slate-100"
          />
          <circle
            cx="46"
            cy="46"
            r={radius}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            className={scoreText(value)}
          />
        </svg>
        <span className="absolute flex flex-col items-center leading-none">
          <span className={cn("text-[17px] font-bold tabular-nums", scoreText(value))}>
            {Math.round(value)}%
          </span>
          {/* 검수 [49]/[137]: 11px slate-400 은 명도대비 2.6:1 로 AA 미달 */}
          <span className="mt-1 text-[12px] tabular-nums text-slate-500">
            {correct}/{total}
          </span>
        </span>
      </div>
    </div>
  );
}

function TimelineRow({ label, at }: { label: string; at: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      {/* 「응시 시작」이 w-[52px] 안에서 "응시 시 / 작" 으로 쪼개지던 것 수리 —
          폭을 라벨에 맞추고 줄바꿈을 금지한다 */}
      {/* 검수 [49]: 11.5px slate-400 은 타이포 하한·명도대비(AA) 동시 미달 */}
      <dt className="w-[62px] shrink-0 whitespace-nowrap text-[12px] text-slate-500">{label}</dt>
      <dd className="text-[12px] tabular-nums text-slate-600">
        {at ? fmtAt(at) : <span className="text-slate-300">—</span>}
      </dd>
    </div>
  );
}

// ── ③ 선택 문항 상세 ───────────────────────────────────────────────────────

function QuestionDetailPanel({
  submissionId,
  q,
  reviewable,
  busy,
  onMutated,
  variantReason,
  onVariant,
}: {
  submissionId: string;
  q: ReviewQuestion;
  reviewable: boolean;
  busy: boolean;
  onMutated: (result: SubmissionMutationResult) => void;
  /** null 이면 변형 가능 — 아니면 사유 툴팁 + 비활성 */
  variantReason: VariantBlockReason | null;
  onVariant: () => void;
}) {
  // 문항이 바뀌면 패널이 key 로 리마운트되므로 접힘 상태는 자연히 초기화된다
  const [passageOpen, setPassageOpen] = useState(false);

  const stem = q.questionText ?? q.brief;
  const options = q.options ?? [];
  const correctTokens = new Set(q.correctChoices ?? []);
  const chosen = chosenTokens(q);
  const answerLines = describeAnswer(q);
  const inputLines = describeInput(q);
  const difficultyLabel = getQuestionDifficultyLabel(q.difficulty);

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      {/* 헤더 — 번호·유형·난이도·배점·판정 */}
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[12px] font-bold tabular-nums text-slate-700">
          {q.orderNum}번
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-slate-600">
          {q.typeLabel}
        </span>
        {difficultyLabel ? (
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {difficultyLabel}
          </span>
        ) : null}
        <span className="text-[12px] tabular-nums text-slate-500">{q.points}점</span>
        <span className="ml-auto flex items-center gap-2">
          {q.manualStatus ? (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
              수동확정
            </span>
          ) : null}
          <VerdictChip status={q.effectiveStatus} />
          {/* 검수 [24]: 문항 단위 변형 CTA 가 선지→지문→해설→획득 점수→판정
              세그먼트를 전부 지난 패널 맨 밑에 있어 첫 화면에서 도달 불가였다.
              헤더 줄 우측으로 올려 스크롤과 무관하게 항상 보이게 한다.
              위계: 레일 일괄 CTA = primary(solid), 이 문항 단위 = secondary. */}
          <button
            type="button"
            onClick={onVariant}
            disabled={variantReason != null}
            title={variantReason ? VARIANT_DISABLED_REASONS[variantReason] : undefined}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 px-3 text-[13px] font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300"
          >
            <Wand2 className="size-3.5" aria-hidden />
            {VARIANT_COPY.ONE}
          </button>
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {/* 발문 — 시험 본문이라 EXAM_FONT. 마커·밑줄은 exam-report 와 같은
            정본 렌더러로 그린다(검수 [11]: `__(A) that__` 원문 노출 수리) */}
        {stem ? (
          <p
            className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800"
            style={{ fontFamily: EXAM_FONT }}
          >
            {renderExamText(stem, q.subType)}
          </p>
        ) : null}

        {/* 선지 — 정답 emerald, 학생이 고른 오답 rose. 원문이 없으면 요약 폴백 */}
        {options.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {options.map((opt, index) => {
              const token = String(index + 1);
              const isCorrect = correctTokens.has(token);
              const isChosen = chosen.has(token);
              return (
                <li
                  key={`${token}-${opt.label}`}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border px-3 py-2",
                    isCorrect
                      ? "border-emerald-200 bg-emerald-50/70"
                      : isChosen
                        ? "border-rose-200 bg-rose-50/60"
                        : "border-slate-200 bg-white",
                  )}
                >
                  {/* 라벨은 **위치 기준 원형숫자**로 통일한다 — 지문 마커는
                      renderExamText 가 ①②③ 로 그리는데 선지만 저장 라벨((A)(B))을
                      쓰면 같은 화면에서 서로 매칭되지 않는다(2026-07-26 사용자 제보).
                      원본 라벨은 title 로 남겨 추적 가능하게. */}
                  <span
                    className="shrink-0 text-[14px] font-semibold text-slate-500"
                    style={{ fontFamily: EXAM_FONT }}
                    title={opt.label || undefined}
                  >
                    {choiceOrdinal(index)}
                  </span>
                  <span
                    className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-slate-700"
                    style={{ fontFamily: EXAM_FONT }}
                  >
                    {renderExamText(opt.text, q.subType)}
                  </span>
                  {isCorrect ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      정답
                    </span>
                  ) : null}
                  {isChosen ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        isCorrect ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
                      )}
                    >
                      학생 선택
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <dl className="flex flex-col gap-2">
            <div className="flex gap-2.5">
              <dt className="w-[68px] shrink-0 text-[12px] font-medium leading-5 text-slate-400">
                정답
              </dt>
              <dd className="min-w-0 text-[13.5px] text-slate-800">
                {answerLines.length > 0 ? (
                  answerLines.map((line, i) => (
                    <p key={i} style={{ fontFamily: EXAM_FONT }}>
                      {line}
                    </p>
                  ))
                ) : (
                  <span className="text-[12px] text-slate-400">
                    {q.manualReason
                      ? `수동 채점 문항 — ${q.manualReason}`
                      : "수동 채점 문항입니다."}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex gap-2.5">
              <dt className="w-[68px] shrink-0 text-[12px] font-medium leading-5 text-slate-400">
                학생 입력
              </dt>
              <dd className="min-w-0 text-[13.5px] text-slate-800">
                {inputLines.length > 0 ? (
                  inputLines.map((line, i) => (
                    <p key={i} className="break-words" style={{ fontFamily: EXAM_FONT }}>
                      {line}
                    </p>
                  ))
                ) : (
                  <span className="text-slate-300">{VERDICT_TONE.UNKNOWN.label}</span>
                )}
              </dd>
            </div>
          </dl>
        )}

        {/* 서답형은 선지 원문이 있어도 학생 입력을 따로 보여야 한다 */}
        {options.length > 0 && inputLines.length === 0 && chosen.size === 0 ? (
          <p className="text-[12.5px] text-slate-400">
            학생 답: <span className="text-slate-300">{VERDICT_TONE.UNKNOWN.label}</span>
          </p>
        ) : null}

        {/* 지문 원문 — 길어서 기본 접힘 */}
        {q.passage?.content ? (
          <div className="rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setPassageOpen((v) => !v)}
              aria-expanded={passageOpen}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <span className="min-w-0 truncate text-[12.5px] font-semibold text-slate-600">
                {SITTING_DETAIL_COPY.PASSAGE_TOGGLE}
                {q.passage.title ? (
                  <span className="ml-1.5 font-medium text-slate-400">{q.passage.title}</span>
                ) : null}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-slate-300 transition-transform",
                  passageOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {passageOpen ? (
              <p
                className="whitespace-pre-wrap border-t border-slate-100 px-3 py-3 text-[13.5px] leading-relaxed text-slate-700"
                style={{ fontFamily: EXAM_FONT }}
              >
                {/* 발문과 같은 원본 문자열 축 — 같은 렌더러를 적용한다(검수 [11]) */}
                {renderExamText(q.passage.content, q.subType)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 해설 · 출제 포인트 · 오답 선지 해설 */}
        {q.explanation ? (
          <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            {q.explanation.content ? (
              <div>
                <p className="mb-1 text-[12px] font-semibold text-slate-500">해설</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">
                  {q.explanation.content}
                </p>
              </div>
            ) : null}
            {q.explanation.keyPoints.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {q.explanation.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-slate-600">
                    <span className="text-slate-300" aria-hidden>
                      ·
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
            {q.explanation.wrongOptions.length > 0 ? (
              <div>
                <p className="mb-1 text-[12px] font-semibold text-slate-500">
                  {SITTING_DETAIL_COPY.WRONG_OPTIONS}
                </p>
                <ul className="flex flex-col gap-1">
                  {q.explanation.wrongOptions.map((w) => (
                    <li key={w.label} className="flex gap-2 text-[12.5px] leading-relaxed">
                      <span className="shrink-0 font-semibold text-slate-500">{w.label}</span>
                      <span className="min-w-0 text-slate-600">{w.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* 획득 점수 */}
        <p className="flex items-baseline gap-2 text-[13px]">
          <span className="text-[12px] font-medium text-slate-400">획득 점수</span>
          <span className="font-semibold tabular-nums text-slate-800">
            {q.effectiveEarnedPoints != null ? (
              `${q.effectiveEarnedPoints} / ${q.points}점`
            ) : (
              <span className="font-normal text-slate-300">확정 전</span>
            )}
          </span>
        </p>

        {/* 수동확정 세그먼트 — 드로어 ReviewQuestionCard 로직 이식(색축만 갱신) */}
        <VerdictControls
          submissionId={submissionId}
          q={q}
          reviewable={reviewable}
          busy={busy}
          onMutated={onMutated}
        />

        {/* 변형 생성 CTA(§8)는 헤더 줄로 이동 — 검수 [24] */}
      </div>
    </section>
  );
}

// ── 수동확정 세그먼트 ───────────────────────────────────────────────────────

type ManualVerdict = "CORRECT" | "WRONG" | "PARTIAL";

function VerdictControls({
  submissionId,
  q,
  reviewable,
  busy,
  onMutated,
}: {
  submissionId: string;
  q: ReviewQuestion;
  reviewable: boolean;
  busy: boolean;
  onMutated: (result: SubmissionMutationResult) => void;
}) {
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialValue, setPartialValue] = useState("");
  const [saving, setSaving] = useState<ManualVerdict | null>(null);

  // 확정 대상 = 기계채점 불가(NEEDS_REVIEW)·미입력(UNKNOWN), 또는 이미 수동확정한
  // 문항(재확정 허용 — 서버가 manualStatus 를 항상 우선 적용한다)
  const show =
    reviewable &&
    (q.effectiveStatus === "NEEDS_REVIEW" ||
      q.effectiveStatus === "UNKNOWN" ||
      q.manualStatus != null);
  const disabled = busy || saving != null;

  async function resolve(status: ManualVerdict, earnedPoints?: number) {
    setSaving(status);
    try {
      const result = await resolveNeedsReview(submissionId, q.questionId, {
        status,
        ...(earnedPoints != null ? { earnedPoints } : {}),
      });
      if (!result.success) {
        toast.error(result.error ?? "수동 판정 저장에 실패했습니다.");
        return;
      }
      setPartialOpen(false);
      setPartialValue("");
      onMutated(result);
    } finally {
      setSaving(null);
    }
  }

  function submitPartial() {
    const value = Number(partialValue);
    if (!Number.isFinite(value)) {
      toast.error("부분점수를 숫자로 입력해 주세요.");
      return;
    }
    if (value < 0 || value > q.points) {
      toast.error(`부분점수는 0점부터 ${q.points}점 사이로 입력해 주세요.`);
      return;
    }
    void resolve("PARTIAL", value);
  }

  if (!show) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-[12px] font-semibold text-slate-500">판정 확정</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["CORRECT", VERDICT_TONE.CORRECT.label, "border-emerald-500 text-emerald-700"],
            ["WRONG", VERDICT_TONE.WRONG.label, "border-rose-500 text-rose-700"],
          ] as const
        ).map(([status, label, activeClass]) => (
          <button
            key={status}
            type="button"
            disabled={disabled}
            onClick={() => void resolve(status)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
              q.manualStatus === status
                ? activeClass
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {saving === status ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPartialOpen((v) => !v)}
          className={cn(
            "inline-flex h-9 items-center rounded-md border bg-white px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
            q.manualStatus === "PARTIAL" || partialOpen
              ? "border-blue-600 text-blue-700"
              : "border-slate-200 text-slate-600 hover:bg-slate-50",
          )}
        >
          {VERDICT_TONE.PARTIAL.label}
        </button>
      </div>
      {partialOpen ? (
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={q.points}
            step={0.5}
            value={partialValue}
            onChange={(e) => setPartialValue(e.target.value)}
            placeholder={`0 ~ ${q.points}`}
            className="h-9 w-28 bg-white text-[13px] tabular-nums"
            disabled={disabled}
          />
          <span className="text-[12px] text-slate-400">/ {q.points}점</span>
          <button
            type="button"
            disabled={disabled || partialValue.trim() === ""}
            onClick={submitPartial}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {saving === "PARTIAL" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            확정
          </button>
        </div>
      ) : null}
    </div>
  );
}
