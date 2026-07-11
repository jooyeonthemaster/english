"use client";

// ============================================================================
// 채점 검토 드로어 (V4 소유) — 할당 테이블 행 클릭 진입
//
// getSubmissionReviewDetail(W5) 로드 →
//  ① 헤더(학생·상태·점수 요약) + 삭제 문항 고지 배너(slate — 앰버 금지)
//  ② 문항 정오 그리드(클릭 시 해당 문항 카드로 스크롤)
//  ③ 문항 상세 리스트(ReviewQuestionCard — NEEDS_REVIEW 수동확정 포함)
//  ④ 지면 응시 강사 대리입력 모드(TeacherEntry — saveTeacherEntry)
//  ⑤ 재채점(regradeSubmission — confirm) / GRADED 리포트 만들기(리포트 학생 연결 시
//     학생 워크스페이스 딥링크, 미연결 시 허브 폴백 — reportLinkFor)
// 모든 뮤테이션 성공 후 상세를 재적재하고 부모(할당 테이블)에 통지한다.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileChartColumn, Info, Loader2, PenLine, RefreshCw } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getSubmissionReviewDetail,
  regradeSubmission,
  type SubmissionMutationResult,
  type SubmissionReviewDetail,
} from "@/actions/exams/submission-review";
import { reportLinkFor } from "./assignment-table";
import { ReviewQuestionCard } from "./review-question-card";
import {
  AssignmentStatusChip,
  EFFECTIVE_STATUS_META,
  EffectiveStatusIcon,
  MODE_LABELS,
} from "./shared";
import { TeacherEntry } from "./teacher-entry";

interface ReviewDrawerProps {
  /** null 이면 닫힘 */
  submissionId: string | null;
  onClose: () => void;
  /** 채점/판정 변경 후 부모 목록 갱신 트리거 */
  onMutated: () => void;
}

export function ReviewDrawer({ submissionId, onClose, onMutated }: ReviewDrawerProps) {
  const [detail, setDetail] = useState<SubmissionReviewDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState(false);
  const [regradeOpen, setRegradeOpen] = useState(false);
  const [regrading, setRegrading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    if (!submissionId) {
      setDetail(null);
      setError(null);
      setEntryMode(false);
      return;
    }
    setDetail(null);
    setEntryMode(false);
    void load(submissionId);
  }, [submissionId, load]);

  /** 뮤테이션 공통 후처리 — 상세 재적재 + 부모 목록 갱신 + 브리지 경고 표출 */
  function afterMutation(result: SubmissionMutationResult) {
    if (result.syncWarning) toast.info(result.syncWarning);
    if (submissionId) void load(submissionId);
    onMutated();
  }

  function handleEntrySaved(result: SubmissionMutationResult) {
    const remaining = (result.needsReviewCount ?? 0) + (result.unansweredCount ?? 0);
    if (result.status === "GRADED") {
      toast.success("답안 저장과 채점이 완료되었습니다.");
    } else {
      toast.success(
        `답안을 저장했습니다. 확정이 필요한 문항 ${remaining}개가 남아 있습니다.`,
      );
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

  function scrollToQuestion(orderNum: number) {
    const container = scrollRef.current;
    if (!container) return;
    const target = container.querySelector(`[data-review-q="${orderNum}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const reviewable =
    detail != null && (detail.status === "SUBMITTED" || detail.status === "GRADED");
  const busy = loading || regrading;

  return (
    <Sheet open={submissionId != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 sm:w-[640px] sm:max-w-[640px]"
      >
        <SheetHeader className="border-b border-[#E5E8EB] pb-3">
          <SheetTitle className="text-[#191F28]">채점 검토</SheetTitle>
          {detail ? (
            <SheetDescription asChild>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-[#4E5968]">
                  <span className="font-semibold text-[#191F28]">
                    {detail.studentName}
                  </span>
                  <AssignmentStatusChip status={detail.status} />
                  {detail.mode && (
                    <span className="text-xs text-[#8B95A1]">
                      {MODE_LABELS[detail.mode] ?? detail.mode} 응시
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-[#8B95A1]">{detail.examTitle}</p>
                <p className="mt-1.5 text-sm tabular-nums text-[#4E5968]">
                  {detail.scoreSummary.totalScore != null &&
                  detail.scoreSummary.maxScore != null
                    ? `${detail.scoreSummary.totalScore} / ${detail.scoreSummary.maxScore}점 · `
                    : ""}
                  정답 {detail.scoreSummary.correctCount} · 오답{" "}
                  {detail.scoreSummary.wrongCount}
                  {detail.scoreSummary.partialCount > 0 &&
                    ` · 부분 ${detail.scoreSummary.partialCount}`}
                  {detail.scoreSummary.unknownCount > 0 &&
                    ` · 미확정 ${detail.scoreSummary.unknownCount}`}
                </p>
              </div>
            </SheetDescription>
          ) : (
            <SheetDescription>
              문항별 채점 결과를 확인하고 검토 대기 문항을 확정합니다.
            </SheetDescription>
          )}
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {loading && <DrawerSkeleton />}

          {!loading && error && (
            <div className="rounded-xl border border-[#E5E8EB] bg-white p-6 text-center">
              <p className="text-sm text-[#4E5968]">{error}</p>
              <Button
                variant="outline"
                className="mt-3 h-11 border-[#E5E8EB] px-4 text-[#4E5968]"
                onClick={() => submissionId && void load(submissionId)}
              >
                다시 불러오기
              </Button>
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {/* 삭제 문항 고지 — slate 배너(계약: 앰버 금지) */}
              {detail.droppedQuestionCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <p className="text-xs leading-relaxed text-slate-600">
                    시험지에서 삭제된 문항 {detail.droppedQuestionCount}개는 채점에서
                    제외되었습니다.
                  </p>
                </div>
              )}

              {/* 잔여 확정 필요 고지 */}
              {reviewable && detail.needsReviewCount + detail.unansweredCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-rose-400" />
                  <p className="text-xs leading-relaxed text-rose-600">
                    확정이 필요한 문항이 남아 있습니다. (검토 대기{" "}
                    {detail.needsReviewCount} · 미입력 {detail.unansweredCount}) 전
                    문항을 확정하면 채점이 완료됩니다.
                  </p>
                </div>
              )}

              {/* 액션 바: 대리입력 토글 · 재채점 · 리포트 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  onClick={() => setEntryMode((v) => !v)}
                  disabled={busy}
                  className={cn(
                    "h-11 border-[#E5E8EB] px-4",
                    entryMode ? "border-[#3182F6] text-[#3182F6]" : "text-[#4E5968]",
                  )}
                >
                  <PenLine className="size-4" />
                  {entryMode ? "검토 화면으로" : "답안 대리입력"}
                </Button>
                {reviewable && (
                  <Button
                    variant="outline"
                    onClick={() => setRegradeOpen(true)}
                    disabled={busy}
                    className="h-11 border-[#E5E8EB] px-4 text-[#4E5968]"
                  >
                    {regrading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    재채점
                  </Button>
                )}
                {detail.status === "GRADED" && (
                  <Button
                    asChild
                    variant="outline"
                    className="ml-auto h-11 border-[#E5E8EB] px-4 text-[#3182F6] hover:bg-blue-50 hover:text-[#3182F6]"
                  >
                    <Link href={reportLinkFor(detail)}>
                      <FileChartColumn className="size-4" />
                      리포트 만들기
                    </Link>
                  </Button>
                )}
              </div>

              {entryMode ? (
                <TeacherEntry
                  detail={detail}
                  busy={busy}
                  onSaved={handleEntrySaved}
                  onCancel={() => setEntryMode(false)}
                />
              ) : (
                <>
                  {/* 문항 정오 그리드 */}
                  <div className="rounded-xl border border-[#E5E8EB] bg-white p-3">
                    <p className="text-xs font-medium text-[#6B7684]">문항별 정오</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detail.questions.map((q) => (
                        <button
                          key={q.questionId}
                          type="button"
                          onClick={() => scrollToQuestion(q.orderNum)}
                          aria-label={`${q.orderNum}번 · ${EFFECTIVE_STATUS_META[q.effectiveStatus].label} — 문항 상세로 이동`}
                          className="flex size-11 flex-col items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white transition-colors hover:bg-slate-50"
                        >
                          <span className="text-[10px] font-semibold tabular-nums leading-none text-slate-500">
                            {q.orderNum}
                          </span>
                          <EffectiveStatusIcon status={q.effectiveStatus} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 문항 상세 리스트 */}
                  <div className="space-y-2">
                    {detail.questions.map((q) => (
                      <ReviewQuestionCard
                        key={q.questionId}
                        submissionId={detail.submissionId}
                        q={q}
                        reviewable={reviewable}
                        busy={busy}
                        onMutated={afterMutation}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* 재채점 confirm */}
        <AlertDialog open={regradeOpen} onOpenChange={setRegradeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>전체 재채점</AlertDialogTitle>
              <AlertDialogDescription>
                현재 문항 원본을 기준으로 전 문항을 다시 채점합니다. 강사가 수동으로
                확정한 판정은 유지됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">취소</AlertDialogCancel>
              <AlertDialogAction
                className="h-11 bg-[#3182F6] text-white hover:bg-[#1B64DA]"
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
      </SheetContent>
    </Sheet>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
