"use client";

// 문항 검수 액션 클러스터 — generate-page-client.tsx 에서 추출. 단건 검수완료/
// 검수취소/삭제(handleApproveQuestion·handleUnapproveQuestion·handleDeleteQuestion)와
// 일괄 검수완료/삭제(handleBatchApproveQuestions·handleBatchDeleteQuestions),
// 낙관 검수상태 반영(applyReviewState), 삭제 톰스톤(markQuestionDeletedLocally·
// deletedQuestionIds·deletedQuestionSignatures)을 담당한다.
// 코드는 바이트 동일 이동(무회귀).

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  approveWorkbenchQuestion,
  bulkApproveWorkbenchQuestions,
  bulkDeleteWorkbenchQuestions,
  deleteWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import { type QuestionCardItem } from "@/components/workbench/question-card";
import { questionSignature, type QueueItem } from "./generate-page-types";

interface UseQuestionReviewActionsParams {
  savedQuestions: QuestionCardItem[];
  setSavedQuestions: Dispatch<SetStateAction<QuestionCardItem[]>>;
  setDetailQuestion: Dispatch<SetStateAction<QuestionCardItem | null>>;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  loadSavedQuestions: () => Promise<void>;
}

export function useQuestionReviewActions({
  savedQuestions,
  setSavedQuestions,
  setDetailQuestion,
  setSessionQueue,
  loadSavedQuestions,
}: UseQuestionReviewActionsParams) {
  // ── Deleted-question tombstones ──
  // The 현재 세션 cards are derived from AI jobs that re-poll every 5s, and the
  // job's questionIds survive even after we delete the underlying Question rows.
  // We keep a client-side tombstone set so deleted questions stay hidden in this
  // session instead of flickering back in on the next poll.
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Companion signature tombstones — a session card may resolve to its saved row
  // by signature (legacy jobs without aligned questionIds) rather than by id, so
  // the id set alone can't always hide it after deletion.
  const [deletedQuestionSignatures, setDeletedQuestionSignatures] = useState<
    Set<string>
  >(() => new Set());
  const [deletingQuestions, setDeletingQuestions] = useState(false);

  // Signature of a saved question, matching the session-queue card signature so
  // a deleted question can be tombstoned by signature as well as by id.
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

  // 로컬에서 문제를 삭제 처리(tombstone) — 5초 세션-큐 폴링이 되살리지 못하게
  // id/시그니처로 숨기고, 저장 목록·상세 모달에서도 제거한다. 실제 삭제와,
  // "이미 삭제된 좀비 문제"를 검수하려다 실패한 경우 모두 같은 정리 경로를 쓴다.
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

  const applyReviewState = useCallback(
    (questionIds: string[], approved: boolean) => {
      if (questionIds.length === 0) return;
      const set = new Set(questionIds);
      setSavedQuestions((prev) =>
        prev.map((q) => (set.has(q.id) ? { ...q, approved } : q)),
      );
      setDetailQuestion((prev) =>
        prev && set.has(prev.id) ? { ...prev, approved } : prev,
      );
      setSessionQueue((prev) =>
        prev.map((item) => {
          if (!item.questionIds?.some((id) => id && set.has(id))) return item;
          const questions = item.questions.map((q, qi) => {
            const id = item.questionIds?.[qi];
            return id && set.has(id) ? { ...q, approved } : q;
          });
          return {
            ...item,
            questions,
            status: questions.every((q) => q.approved)
              ? "reviewed"
              : item.status === "reviewed"
                ? "done"
                : item.status,
          };
        }),
      );
    },
    [setSessionQueue],
  );

  // 서버가 "문제를 찾을 수 없습니다"로 거절하면, 그 문제는 이미 삭제된 좀비다
  // (세션 큐 폴링 직전에 지워졌거나 다른 기기에서 삭제됨). 로컬에서 카드를
  // 정리하고 목록을 새로고침해, 같은 좀비를 다시 검수하려는 일을 막는다.
  const isMissingQuestionError = (error?: string) =>
    typeof error === "string" && error.includes("찾을 수 없");

  const handleApproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await approveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          loadSavedQuestions();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수완료 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], true);
      toast.success("검수완료 처리됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions, applyReviewState, markQuestionDeletedLocally],
  );

  const handleUnapproveQuestion = useCallback(
    async (questionId: string) => {
      const result = await unapproveWorkbenchQuestion(questionId);
      if (!result.success) {
        if (isMissingQuestionError(result.error)) {
          markQuestionDeletedLocally(questionId);
          loadSavedQuestions();
          toast.error("이미 삭제된 문제예요. 목록에서 정리했어요.");
        } else {
          toast.error(result.error || "검수취소 처리에 실패했습니다.");
        }
        return;
      }
      applyReviewState([questionId], false);
      toast.success("검수취소 처리됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions, applyReviewState, markQuestionDeletedLocally],
  );

  const handleDeleteQuestion = useCallback(
    async (questionId: string) => {
      if (!questionId) return;
      if (!confirm("이 문제를 삭제하시겠습니까?")) return;
      const result = await deleteWorkbenchQuestion(questionId);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      setSavedQuestions((prev) => prev.filter((q) => q.id !== questionId));
      setDetailQuestion((prev) => (prev?.id === questionId ? null : prev));
      toast.success("삭제됐습니다.");
      loadSavedQuestions();
    },
    [loadSavedQuestions],
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
        loadSavedQuestions();
      } else if (!result.success) {
        toast.error(result.error || "일괄 검수완료 처리에 실패했습니다.");
      }
    },
    [applyReviewState, loadSavedQuestions],
  );

  const handleBatchDeleteQuestions = useCallback(
    async (questionIds: string[]): Promise<boolean> => {
      // Confirmation is handled by the in-app AlertDialog in BottomQueueSection
      // before this runs — no native window.confirm here.
      const ids = [...new Set(questionIds)].filter(Boolean);
      if (ids.length === 0 || deletingQuestions) return false;

      setDeletingQuestions(true);
      try {
        const result = await bulkDeleteWorkbenchQuestions(ids);
        if (!result.success) {
          toast.error(result.error || "문제 삭제에 실패했습니다.");
          return false;
        }

        // Tombstone ONLY the rows the server actually deleted — never the full
        // request. On a partial delete (cross-academy / already-gone ids) the
        // survivors must stay visible, and loadSavedQuestions() reconciles them.
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
        setDetailQuestion((prev) =>
          prev && deletedSet.has(prev.id) ? null : prev,
        );

        if (result.deleted === 0) {
          toast.error("삭제된 문제가 없습니다.");
        } else if (result.deleted === result.requested) {
          toast.success(`${result.deleted}개 문제를 삭제했습니다.`);
        } else {
          toast.warning(
            `${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`,
          );
        }
        loadSavedQuestions();
        return true;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "문제 삭제에 실패했습니다.",
        );
        return false;
      } finally {
        setDeletingQuestions(false);
      }
    },
    [deletingQuestions, loadSavedQuestions, savedQuestions, savedQuestionSig],
  );

  return {
    deletedQuestionIds,
    deletedQuestionSignatures,
    markQuestionDeletedLocally,
    handleApproveQuestion,
    handleUnapproveQuestion,
    handleDeleteQuestion,
    handleBatchApproveQuestions,
    handleBatchDeleteQuestions,
  };
}
