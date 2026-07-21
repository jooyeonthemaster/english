"use client";

// 문항 검수 액션 클러스터 — generate-page-client.tsx 에서 추출. 단건 검수완료/
// 검수취소(handleApproveQuestion·handleUnapproveQuestion)와 낙관 검수상태 반영
// (applyReviewState), 삭제 후 로컬 정리(markQuestionDeletedLocally)를 담당한다.
// U10 데드코드 절제: 소비처 0 이던 handleDeleteQuestion·handleBatchApproveQuestions·
// handleBatchDeleteQuestions 와 deletedQuestionIds/deletedQuestionSignatures
// 톰스톤 상태(값 읽는 곳 0)를 제거했다. custom/similar 페이지의 동명 심볼은
// 각 페이지의 로컬 구현으로 별개 배선이다.

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  approveWorkbenchQuestion,
  unapproveWorkbenchQuestion,
} from "@/actions/workbench";
import { type QuestionCardItem } from "@/components/workbench/question-card";
import { type QueueItem } from "./generate-page-types";

interface UseQuestionReviewActionsParams {
  setSavedQuestions: Dispatch<SetStateAction<QuestionCardItem[]>>;
  setDetailQuestion: Dispatch<SetStateAction<QuestionCardItem | null>>;
  setSessionQueue: Dispatch<SetStateAction<QueueItem[]>>;
  loadSavedQuestions: () => Promise<void>;
}

export function useQuestionReviewActions({
  setSavedQuestions,
  setDetailQuestion,
  setSessionQueue,
  loadSavedQuestions,
}: UseQuestionReviewActionsParams) {
  // 로컬에서 문제를 삭제 처리 — 저장 목록·상세 모달에서 제거한다. 실제 삭제와,
  // "이미 삭제된 좀비 문제"를 검수하려다 실패한 경우 모두 같은 정리 경로를 쓴다.
  // (과거의 id/시그니처 톰스톤 세트 기록은 U10 절제로 제거 — 이 페이지에서
  // 톰스톤 값을 읽는 소비처가 0이었다.)
  // 의존성의 setState 디스패처들은 전부 useState 원본 세터라 항등 안정 —
  // 메모이제이션 동작은 종전과 동일하다.
  const markQuestionDeletedLocally = useCallback(
    (deletedId: string) => {
      setSavedQuestions((prev) => prev.filter((q) => q.id !== deletedId));
      setDetailQuestion((prev) => (prev?.id === deletedId ? null : prev));
    },
    [setSavedQuestions, setDetailQuestion],
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
    [setSavedQuestions, setDetailQuestion, setSessionQueue],
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

  return {
    markQuestionDeletedLocally,
    handleApproveQuestion,
    handleUnapproveQuestion,
  };
}
