"use client";

// ============================================================================
// 학생 시험 리포트 — 문항 상세보기(AI 0콜)
//
// 정오표 행의 '상세보기' → 서비스가 생성한 원본 문항을 시험지 생성 페이지와 동일한
// 렌더러(QuestionCard)로 그대로 띄운다. 좌: 문항(지문 포함) / 우: 채점·해설·출제분석
// 레일. 원본(review)이 없는 사진 업로드 리포트는 분석·발문만으로 우아하게 강등한다.
//
// 데이터는 전부 이미 저장/재조회된 값이다(LLM 호출 없음):
//  - 문항 전문/선지/지문/해설 = review(ExamReviewQuestion, INTERNAL 재조회)
//  - 출제 분석(의도/개념/함정) = analysis(QuestionAnalysis, examAnalysis 저장분)
//  - 학생 선택답/정답/판정 = response(StudentResponse) + examMap 정답
// 강사/원장 전용 화면이므로 정답·해설을 즉시 노출한다(학생 공개면 미사용).
// ============================================================================

import { useEffect, useRef } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Info,
  Loader2,
  Lightbulb,
  RefreshCw,
  Route,
  Target,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  QuestionCard,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import type {
  ExamMapEntry,
  QuestionAnalysis,
  StudentResponse,
} from "@/lib/exam-report/types";
import type { ExamReviewQuestion } from "@/components/exam-report/ui-contracts";
import { KIND_LABEL, STATUS_STYLE, choiceToCircled } from "./grading-shared";

interface QuestionDetailViewProps {
  entry: ExamMapEntry;
  response: StudentResponse;
  analysis: QuestionAnalysis | null;
  review: ExamReviewQuestion | null;
  reviewLoading: boolean;
  /** 페이로드 판별자 — INTERNAL(원본 재사용 가능) / OTHER(사진 업로드 등 강등) / null(프리페치 실패). */
  reviewSource: "INTERNAL" | "OTHER" | null;
  /** 프리페치가 실패(404/500/네트워크)했는가 — 정상 강등(OTHER)과 구분해 재시도 안내. */
  reviewError: boolean;
  /** 원본 재조회 재시도(프리페치 실패 복구). */
  onRetry?: () => void;
  position: { index: number; total: number };
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

/** Rich HTML → 평문(태그 제거·엔티티 복원·줄바꿈 보존). */
function stripHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** JSON 문자열 배열/배열 → 트림된 string[]. */
function parseStringArray(value: unknown): string[] {
  let arr: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [trimmed];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0);
}

/** ExamReviewQuestion → QuestionCard 입력(해설은 우측 레일에서 별도 노출 → 카드에선 제거). */
function toCardItem(review: ExamReviewQuestion): QuestionCardItem {
  return {
    id: review.questionId,
    type: review.type,
    subType: review.subType,
    questionText: review.questionText,
    options: review.options,
    correctAnswer: review.correctAnswer,
    difficulty: review.difficulty,
    tags: review.tags,
    aiGenerated: review.aiGenerated,
    approved: review.approved,
    createdAt: review.createdAt as unknown as Date,
    structuredData: review.structuredData,
    passage: review.passage,
    // 해설은 우측 '해설' 카드가 원본으로 노출하므로 카드 내부 토글은 숨긴다.
    explanation: null,
    setId: review.setId,
    setLabel: review.setLabel,
  };
}

export function QuestionDetailView({
  entry,
  response,
  analysis,
  review,
  reviewLoading,
  reviewSource,
  reviewError,
  onRetry,
  position,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: QuestionDetailViewProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // 오픈 시 패널로 초기 포커스, 언마운트 시 직전 포커스 요소로 복귀(WCAG 2.4.3).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // ESC 닫기 + ←/→ 문항 이동(입력 필드 제외) + Tab 포커스 트랩(배경 이탈 방지).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (activeEl === first || activeEl === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (!typing && e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (!typing && e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const status = STATUS_STYLE[response.status];
  const studentChoice = response.chosenChoice ?? response.aiRead?.chosenChoice ?? null;
  const studentAnswerText = response.studentAnswer ?? response.aiRead?.writtenAnswer ?? null;
  const correctText =
    entry.correctAnswer == null || entry.correctAnswer === ""
      ? "—"
      : entry.kind === "MC"
        ? choiceToCircled(entry.correctAnswer)
        : entry.correctAnswer;
  const difficultyLabel =
    (review?.difficulty && DIFFICULTY_LABEL[review.difficulty.toUpperCase()]) ??
    null;

  const explanationText = stripHtml(review?.explanation?.content) || analysis?.explanation || "";
  const keyPoints = parseStringArray(review?.explanation?.keyPoints);
  const keyConcepts = analysis?.keyConcepts ?? [];
  const traps = analysis?.trapDesign ?? [];
  const hasAnalysis =
    analysis != null &&
    analysis.analysisStatus === "OK" &&
    (analysis.intent ||
      analysis.examPoint ||
      analysis.solvingStrategy ||
      analysis.difficultyRationale ||
      traps.length > 0);

  const card = review ? toCardItem(review) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.number}번 문항 상세`}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 flex h-full max-h-[92vh] w-full max-w-[min(96vw,1600px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none"
      >
        {/* ── 헤더: 번호·유형·메타 · 판정 · 네비·닫기 ── */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-slate-100 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-2 text-[15px] font-extrabold tabular-nums text-white">
              {entry.number}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="truncate text-[15px] font-bold leading-tight text-slate-900">
                {entry.typeLabel || "문항"}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <MetaChip>{KIND_LABEL[entry.kind]}</MetaChip>
                {entry.points != null && (
                  <MetaChip>
                    <span className="tabular-nums">{entry.points}</span>점
                  </MetaChip>
                )}
                {difficultyLabel && <MetaChip>{difficultyLabel}</MetaChip>}
                {review?.setLabel && <MetaChip>{review.setLabel}</MetaChip>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold",
                status.bg,
                status.text,
              )}
            >
              <span className="text-[13px] leading-none">{status.symbol}</span>
              {status.label}
            </span>

            <div className="flex items-center gap-0.5">
              <NavButton
                label="이전 문항"
                disabled={!hasPrev}
                onClick={onPrev}
              >
                <ChevronLeft className="h-4 w-4" />
              </NavButton>
              <span className="w-14 text-center text-[12px] font-semibold tabular-nums text-slate-400">
                {position.index + 1} / {position.total}
              </span>
              <NavButton label="다음 문항" disabled={!hasNext} onClick={onNext}>
                <ChevronRight className="h-4 w-4" />
              </NavButton>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ── 본문: 좌 문항 / 우 채점·해설·분석 레일 ── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_366px] lg:overflow-hidden">
          {/* 좌: 실제 문항(시험지 생성 페이지와 동일 렌더러) */}
          <div className="min-w-0 overflow-y-auto px-5 py-5 lg:border-r lg:border-slate-100">
            {reviewLoading ? (
              <LoadingBlock />
            ) : card ? (
              <div className="mx-auto max-w-3xl">
                <QuestionCard
                  q={card}
                  num={position.index + 1}
                  readonly
                  hideReviewStatusStamp
                  suppressUnapprovedBorder
                  answerReveal="show-all"
                  passageDefaultOpen
                />
              </div>
            ) : (
              <DegradedBlock
                brief={entry.brief}
                reviewSource={reviewSource}
                reviewError={reviewError}
                onRetry={onRetry}
              />
            )}
          </div>

          {/* 우: 채점 + 해설 + 출제 분석 */}
          <aside className="flex min-w-0 flex-col gap-3 bg-slate-50/50 px-4 py-4 lg:overflow-y-auto">
            {/* 채점 카드 */}
            <RailCard title="채점" icon={<Target className="h-3.5 w-3.5" />}>
              <dl className="flex flex-col gap-2 text-[13px]">
                <ScoreRow label="학생 답">
                  {studentChoice ? (
                    <span className="font-bold text-slate-900">
                      {choiceToCircled(studentChoice)}
                    </span>
                  ) : studentAnswerText ? (
                    <span className="whitespace-pre-line break-keep font-medium text-slate-800">
                      {studentAnswerText}
                    </span>
                  ) : (
                    <span className="text-slate-400">미입력</span>
                  )}
                </ScoreRow>
                <ScoreRow label="정답">
                  <span className="font-bold text-emerald-700">{correctText}</span>
                </ScoreRow>
                <ScoreRow label="판정">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-bold",
                      status.text,
                    )}
                  >
                    <span>{status.symbol}</span>
                    {status.label}
                  </span>
                </ScoreRow>
                {entry.points != null && (
                  <ScoreRow label="배점">
                    <span className="tabular-nums font-semibold text-slate-700">
                      {response.status === "PARTIAL" && response.earnedPoints != null
                        ? `${response.earnedPoints} / ${entry.points}`
                        : response.status === "CORRECT"
                          ? `${entry.points} / ${entry.points}`
                          : `0 / ${entry.points}`}
                      <span className="ml-0.5 text-[11px] font-medium text-slate-400">점</span>
                    </span>
                  </ScoreRow>
                )}
              </dl>
            </RailCard>

            {/* 해설 카드 */}
            {(explanationText || keyPoints.length > 0) && (
              <RailCard title="해설" icon={<BookOpen className="h-3.5 w-3.5" />}>
                {explanationText && (
                  <p className="whitespace-pre-line break-keep text-[12.5px] leading-relaxed text-slate-700">
                    {explanationText}
                  </p>
                )}
                {keyPoints.length > 0 && (
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {keyPoints.map((kp, i) => (
                      <li
                        key={i}
                        className="border-l-2 border-blue-300 pl-2 text-[12px] leading-relaxed text-slate-600 break-keep"
                      >
                        {kp}
                      </li>
                    ))}
                  </ul>
                )}
              </RailCard>
            )}

            {/* 출제 분석 카드 */}
            {hasAnalysis && analysis && (
              <RailCard title="출제 분석" icon={<Info className="h-3.5 w-3.5" />}>
                <div className="flex flex-col gap-3">
                  {analysis.intent && (
                    <AnalysisRow icon={<Target className="h-3 w-3" />} label="출제 의도">
                      {analysis.intent}
                    </AnalysisRow>
                  )}
                  {analysis.examPoint && (
                    <AnalysisRow icon={<Lightbulb className="h-3 w-3" />} label="출제 포인트">
                      {analysis.examPoint}
                    </AnalysisRow>
                  )}
                  {analysis.solvingStrategy && (
                    <AnalysisRow icon={<Route className="h-3 w-3" />} label="접근 전략">
                      {analysis.solvingStrategy}
                    </AnalysisRow>
                  )}
                  {analysis.difficultyRationale && (
                    <AnalysisRow icon={<Gauge className="h-3 w-3" />} label="난이도 근거">
                      {analysis.difficultyRationale}
                    </AnalysisRow>
                  )}
                  {keyConcepts.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                        핵심 개념
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keyConcepts.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-slate-600"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {traps.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
                        오답 함정
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {traps.map((t, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-100"
                          >
                            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded bg-rose-50 text-[11px] font-bold text-rose-600">
                              {choiceToCircled(t.choice)}
                            </span>
                            <span className="text-[12px] leading-relaxed text-slate-600 break-keep">
                              {t.why}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </RailCard>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── 하위 프리미티브 ─────────────────────────────────────────────────────────

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">
      {children}
    </span>
  );
}

function NavButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:text-slate-200 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function RailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="mb-2.5 flex items-center gap-1.5 text-slate-400">
        {icon}
        <h3 className="text-[10.5px] font-bold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ScoreRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function AnalysisRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="whitespace-pre-line break-keep text-[12.5px] leading-relaxed text-slate-700">
        {children}
      </p>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-slate-400">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-[12.5px]">원본 문항을 불러오는 중…</p>
    </div>
  );
}

function DegradedBlock({
  brief,
  reviewSource,
  reviewError,
  onRetry,
}: {
  brief: string;
  reviewSource: "INTERNAL" | "OTHER" | null;
  reviewError: boolean;
  onRetry?: () => void;
}) {
  // 세 갈래: 프리페치 실패(재시도) / 서비스 미생성 시험지(강등) / INTERNAL 원본 삭제.
  const message = reviewError
    ? "원본 문항을 불러오지 못했습니다. 일시적인 문제일 수 있습니다."
    : reviewSource === "OTHER"
      ? "원본 문항 미리보기는 서비스에서 생성·배포한 시험지에서만 제공됩니다. 우측의 채점·분석 정보는 그대로 확인할 수 있습니다."
      : "이 문항의 원본을 찾지 못했습니다. 문항이 수정·삭제되었을 수 있습니다.";
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 py-4">
      {brief && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">
            발문
          </p>
          <p className="whitespace-pre-line break-keep text-[13px] leading-relaxed text-slate-700">
            {brief}
          </p>
        </div>
      )}
      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[12px] leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="break-keep">{message}</p>
          {reviewError && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
