"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Sparkles, X, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  QuestionCard,
  ReviewStatusStamp,
  type QuestionCardItem,
} from "@/components/workbench/question-card";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { EditQuestionDialog } from "@/components/workbench/question-bank-client/edit-question-dialog";
import { useQuestionEditor } from "@/components/workbench/question-bank-client/use-question-editor";
import {
  approveWorkbenchQuestion,
  bulkApproveWorkbenchQuestions,
  bulkDeleteWorkbenchQuestions,
  deleteWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";

// ── 경계: 문제 생성(기본 UI)의 재사용 가능 컴포넌트를 import 만 한다(무수정). 하단 생성/검수 결과를
//    문제 생성과 "동일하게" 맞추기 위해 BottomQueueSection·QuestionCard·타입을 차용. 동형 문항도 실제
//    Question 이라 검수/삭제/편집은 공유 워크벤치 액션이 그대로 통한다. 동형 생성 엔진은 무관. ──
import { BottomQueueSection } from "../../generate/bottom-queue-section";
import { questionSignature, type QueueItem } from "../../generate/generate-page-types";

import {
  SimilarQuestionAnalysisModal,
  type QAnalysis,
} from "./similar-question-analysis-modal";

type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

// 진행 상태 폴링용 최소 형태(작업 큐 카드는 결과 카드와 중복이라 노출하지 않음 — 헤더 배지로만 표시).
interface SimilarQuestionJob {
  id: string;
  status: JobStatus;
}

// question-generations API 응답(원시) → 공유 QuestionCardItem(+ 동형 고유 analysis 는 structuredData 에 보존).
interface RawSimilarQuestion {
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
  createdAt: string;
  passage: QuestionCardItem["passage"];
  explanation: QuestionCardItem["explanation"];
  structuredData: unknown;
}

function toCardItem(raw: RawSimilarQuestion): QuestionCardItem {
  return { ...raw, createdAt: new Date(raw.createdAt) };
}

const POLL_INTERVAL_MS = 3000;
const EMPTY_QUEUE: QueueItem[] = [];
const ZERO_QUEUE_COUNTS = { generating: 0, done: 0, error: 0 };

function isActive(status: JobStatus): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

const isMissingQuestionError = (error?: string) =>
  typeof error === "string" && error.includes("찾을 수 없");

// 동형 문항의 structuredData 에서 원본 분석(QAnalysis)을 추출(분석 정보 모달용).
function extractSimilarAnalysis(structuredData: unknown): QAnalysis | null {
  if (structuredData && typeof structuredData === "object" && "_similarSourceAnalysis" in structuredData) {
    return (structuredData as { _similarSourceAnalysis?: QAnalysis | null })._similarSourceAnalysis ?? null;
  }
  return null;
}

export function SimilarQuestionJobsPanel({ refreshKey }: { refreshKey: number }) {
  const [jobs, setJobs] = useState<SimilarQuestionJob[]>([]);
  const [savedQuestions, setSavedQuestions] = useState<QuestionCardItem[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<Set<string>>(() => new Set());
  const [deletedQuestionSignatures, setDeletedQuestionSignatures] = useState<Set<string>>(
    () => new Set(),
  );
  const [deletingQuestions, setDeletingQuestions] = useState(false);
  const [detailQuestion, setDetailQuestion] = useState<QuestionCardItem | null>(null);
  const [analysisModal, setAnalysisModal] = useState<QAnalysis | null>(null);
  const jobLoadSeq = useRef(0);
  const qLoadSeq = useRef(0);
  const wasActiveRef = useRef(false);
  const bottomQueueBoundaryRef = useRef<HTMLElement>(null);

  const loadJobs = useCallback(async () => {
    const seq = ++jobLoadSeq.current;
    const res = await fetch("/api/similar-exams/question-generation-jobs?limit=12", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { jobs: SimilarQuestionJob[] };
    if (seq !== jobLoadSeq.current) return;
    setJobs(data.jobs ?? []);
  }, []);

  const loadSaved = useCallback(async () => {
    const seq = ++qLoadSeq.current;
    const res = await fetch("/api/similar-exams/question-generations?limit=100", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      if (seq === qLoadSeq.current) setLoadingSaved(false);
      return;
    }
    const data = (await res.json()) as { questions: RawSimilarQuestion[] };
    if (seq !== qLoadSeq.current) return;
    setSavedQuestions((data.questions ?? []).map(toCardItem));
    setLoadingSaved(false);
  }, []);

  useEffect(() => {
    setLoadingSaved(true);
    void loadJobs();
    void loadSaved();
  }, [loadJobs, loadSaved, refreshKey]);

  const hasActiveJobs = useMemo(() => jobs.some((j) => isActive(j.status)), [jobs]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = setInterval(() => {
      void loadJobs();
      void loadSaved();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJobs, loadJobs, loadSaved]);

  // active→비active 전이(막 모든 잡 완료): 리드 스큐 보정으로 1회 추가 로드.
  useEffect(() => {
    const justFinished = wasActiveRef.current && !hasActiveJobs;
    wasActiveRef.current = hasActiveJobs;
    if (!justFinished) return;
    const timer = setTimeout(() => {
      void loadJobs();
      void loadSaved();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [hasActiveJobs, loadJobs, loadSaved]);

  // ── 검수/삭제(공유 워크벤치 액션 재사용) + 로컬 상태 동기화 ──
  const savedQuestionSig = useCallback(
    (q: QuestionCardItem) =>
      questionSignature({
        passageId: q.passage?.id,
        subType: q.subType,
        questionText: q.questionText,
        correctAnswer: q.correctAnswer,
        options: q.options,
      }),
    [],
  );

  const reloadSaved = useCallback(() => {
    void loadSaved();
  }, [loadSaved]);

  const markQuestionDeletedLocally = useCallback(
    (deletedId: string) => {
      let deletedSig: string | null = null;
      setSavedQuestions((prev) => {
        const target = prev.find((q) => q.id === deletedId);
        if (target) deletedSig = savedQuestionSig(target);
        return prev.filter((q) => q.id !== deletedId);
      });
      setDeletedQuestionIds((prev) => {
        if (prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.add(deletedId);
        return next;
      });
      if (deletedSig) {
        setDeletedQuestionSignatures((prev) => {
          if (prev.has(deletedSig as string)) return prev;
          const next = new Set(prev);
          next.add(deletedSig as string);
          return next;
        });
      }
      setDetailQuestion((prev) => (prev?.id === deletedId ? null : prev));
    },
    [savedQuestionSig],
  );

  const editor = useQuestionEditor(markQuestionDeletedLocally);

  const applyReviewState = useCallback((questionIds: string[], approved: boolean) => {
    if (questionIds.length === 0) return;
    const set = new Set(questionIds);
    setSavedQuestions((prev) => prev.map((q) => (set.has(q.id) ? { ...q, approved } : q)));
    setDetailQuestion((prev) => (prev && set.has(prev.id) ? { ...prev, approved } : prev));
  }, []);

  const handleApproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await approveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          reloadSaved();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수완료 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], true);
      toast.success("검수완료 처리됐습니다.");
      reloadSaved();
    },
    [applyReviewState, markQuestionDeletedLocally, reloadSaved],
  );

  const handleUnapproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await unapproveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          reloadSaved();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수취소 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], false);
      toast.success("검수취소 처리됐습니다.");
      reloadSaved();
    },
    [applyReviewState, markQuestionDeletedLocally, reloadSaved],
  );

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!questionId) return;
      const result = await deleteWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      markQuestionDeletedLocally(questionId);
      toast.success("삭제됐습니다.");
      reloadSaved();
    },
    [markQuestionDeletedLocally, reloadSaved],
  );

  const handleBatchApproveQuestions = useCallback(
    async (questionIds: string[]) => {
      if (questionIds.length === 0) return;
      const result = await bulkApproveWorkbenchQuestions(questionIds);
      if (result.success && result.approvedIds.length > 0) {
        const failed = Math.max(0, result.requested - result.approved);
        applyReviewState(result.approvedIds, true);
        toast.success(
          `${result.approved}개 문제가 검수완료 처리됐습니다.${failed > 0 ? ` (${failed}개 건너뜀)` : ""}`,
        );
        reloadSaved();
      } else if (!result.success) {
        toast.error(result.error || "일괄 검수완료 처리에 실패했습니다.");
      }
    },
    [applyReviewState, reloadSaved],
  );

  const handleBatchDeleteQuestions = useCallback(
    async (questionIds: string[]): Promise<boolean> => {
      const ids = [...new Set(questionIds)].filter(Boolean);
      if (ids.length === 0 || deletingQuestions) return false;

      setDeletingQuestions(true);
      try {
        const result = await bulkDeleteWorkbenchQuestions(ids);
        if (!result.success) {
          toast.error(result.error || "문제 삭제에 실패했습니다.");
          return false;
        }
        const deletedIds = result.deletedIds ?? [];
        const deletedSet = new Set(deletedIds);
        const deletedSigs = savedQuestions
          .filter((q) => deletedSet.has(q.id))
          .map(savedQuestionSig);
        setDeletedQuestionIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.add(id));
          return next;
        });
        if (deletedSigs.length > 0) {
          setDeletedQuestionSignatures((prev) => {
            const next = new Set(prev);
            deletedSigs.forEach((sig) => next.add(sig));
            return next;
          });
        }
        setSavedQuestions((prev) => prev.filter((q) => !deletedSet.has(q.id)));
        setDetailQuestion((prev) => (prev && deletedSet.has(prev.id) ? null : prev));

        if (result.deleted === 0) {
          toast.error("삭제된 문제가 없습니다.");
        } else if (result.deleted === result.requested) {
          toast.success(`${result.deleted}개 문제를 삭제했습니다.`);
        } else {
          toast.warning(`${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`);
        }
        reloadSaved();
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "문제 삭제에 실패했습니다.");
        return false;
      } finally {
        setDeletingQuestions(false);
      }
    },
    [deletingQuestions, reloadSaved, savedQuestions, savedQuestionSig],
  );

  const detailAnalysis = useMemo(
    () => extractSimilarAnalysis(detailQuestion?.structuredData),
    [detailQuestion],
  );

  return (
    <>
      {/* 생성/검수 결과 — 기본 문제 생성과 동일한 공유 BottomQueueSection(단일 컨테이너) */}
      <section
        ref={bottomQueueBoundaryRef}
        className="relative rounded-lg border border-slate-200 bg-white shadow-sm"
      >
        <BottomQueueSection
          marqueeBoundaryRef={bottomQueueBoundaryRef}
          sessionQueue={EMPTY_QUEUE}
          filteredQueue={EMPTY_QUEUE}
          queueFilter="all"
          setQueueFilter={() => {}}
          queueCounts={ZERO_QUEUE_COUNTS}
          autoCount={0}
          savedQuestions={savedQuestions}
          loadingSavedQuestions={loadingSaved}
          setDetailQuestion={setDetailQuestion}
          onApproveQuestion={handleApproveQuestion}
          onUnapproveQuestion={handleUnapproveQuestion}
          onBatchApproveQuestions={handleBatchApproveQuestions}
          onBatchDeleteQuestions={handleBatchDeleteQuestions}
          deletedQuestionIds={deletedQuestionIds}
          deletedQuestionSignatures={deletedQuestionSignatures}
          batchDeleting={deletingQuestions}
          onDeleteQuestion={handleDeleteQuestion}
          onEditQuestion={editor.openEditor}
          renderCardDetailExtra={(q) => {
            const a = extractSimilarAnalysis(q.structuredData);
            if (!a) return null;
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnalysisModal(a);
                }}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                <Sparkles className="h-3 w-3" />
                분석 정보
              </button>
            );
          }}
        />
      </section>

      {/* 문제 상세 모달 — 기본 문제 생성과 동일 구성 + 동형 고유 '분석 정보' 버튼. */}
      {detailQuestion && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setDetailQuestion(null)}
          />
          <div className="relative z-10 mx-4 my-4 flex w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
              <h2 className="text-[15px] font-bold text-slate-800">문제 상세</h2>
              <div className="flex shrink-0 items-center gap-2">
                {detailAnalysis ? (
                  <button
                    type="button"
                    onClick={() => setAnalysisModal(detailAnalysis)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50/60 px-2.5 text-[11px] font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    분석 정보
                  </button>
                ) : null}
                {detailQuestion.approved ? (
                  <button
                    type="button"
                    onClick={() => handleUnapproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    검수취소
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApproveQuestion(detailQuestion.id)}
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-green-200 bg-green-50/60 px-2.5 text-[11px] font-semibold text-green-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    검수완료
                  </button>
                )}
                <button
                  onClick={() => setDetailQuestion(null)}
                  className="flex size-8 items-center justify-center rounded-lg hover:bg-slate-100"
                  aria-label="닫기"
                >
                  <X className="size-4 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 overflow-hidden">
              <div className="overflow-y-auto border-r border-slate-200">
                {detailQuestion.passage ? (
                  <div className="px-6 py-5">
                    <InteractivePassageView
                      content={detailQuestion.passage.content}
                      analysisData={null}
                      layout="vertical"
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    지문 없음
                  </div>
                )}
              </div>
              <div className="relative overflow-hidden">
                <div className="h-full overflow-y-auto px-6 py-5">
                  <QuestionCard q={detailQuestion} num={1} readonly hideReviewStatusStamp />
                </div>
                <ReviewStatusStamp
                  approved={detailQuestion.approved}
                  className="absolute right-9 top-9 z-10 origin-top-right scale-125"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <EditQuestionDialog
        open={editor.editDialogOpen}
        onOpenChange={(open) => {
          if (!open) editor.closeEditor();
          else editor.setEditDialogOpen(true);
        }}
        loading={editor.questionLoading}
        loadError={editor.questionLoadError}
        editingQuestion={editor.editingQuestion}
        editingQuestionId={editor.editingQuestionId}
        onClose={editor.closeEditor}
        onDeleted={editor.handleEditorDeleted}
        onRetry={editor.openEditor}
        onSaved={reloadSaved}
        onApproved={reloadSaved}
      />

      {analysisModal ? (
        <SimilarQuestionAnalysisModal
          analysis={analysisModal}
          onClose={() => setAnalysisModal(null)}
        />
      ) : null}
    </>
  );
}
