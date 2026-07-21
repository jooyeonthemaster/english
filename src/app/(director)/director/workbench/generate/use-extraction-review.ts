"use client";

// 추출 검수 클러스터 — generate-page-client.tsx 에서 추출. 검수완료 토글
// (handleToggleExtractionReview)·일괄 검수완료(handleBulkCompleteExtractionReview)
// 와 검수 상태 낙관 패치(patchExtractionReviewState), 검수 진행중 표시 상태
// (reviewActionPassageIds·reviewBulkActionRunning)를 담당한다.
// 코드는 바이트 동일 이동(무회귀).

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { type PassageItem } from "./generate-page-types";
import { fetchReviewAction, isAbortError } from "./generate-page-client-lib";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";

interface UseExtractionReviewParams {
  patchPassages: (passageIds: string[]) => Promise<void>;
  setPassages: Dispatch<SetStateAction<PassageItem[]>>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  setDetailPassage: Dispatch<SetStateAction<PassageItem | null>>;
  setContentModalPassage: Dispatch<SetStateAction<PassageItem | null>>;
  setAnalysisModalPassage: Dispatch<SetStateAction<any>>;
}

export function useExtractionReview({
  patchPassages,
  setPassages,
  setSelectedIds,
  setDetailPassage,
  setContentModalPassage,
  setAnalysisModalPassage,
}: UseExtractionReviewParams) {
  const [reviewActionPassageIds, setReviewActionPassageIds] = useState<
    Set<string>
  >(() => new Set());
  const [reviewBulkActionRunning, setReviewBulkActionRunning] = useState(false);

  const patchExtractionReviewState = useCallback(
    (
      updates: Array<{
        passageId: string;
        draft: PassageItem["extractionReviewDraft"];
      }>,
    ) => {
      if (updates.length === 0) return;
      const byPassageId = new Map(
        updates.map((update) => [update.passageId, update.draft]),
      );
      const applyReviewState = <
        T extends {
          id?: string;
          extractionReviewDraft?: PassageItem["extractionReviewDraft"];
        } | null,
      >(
        current: T,
      ): T =>
        current?.id && byPassageId.has(current.id)
          ? // 캐스트 사유: 제네릭 T 스프레드 결과({...T, 필드 교체})를 TS가 T 로
            // 되돌려 좁히지 못한다 — 런타임은 동일 형태 객체라 안전.
            ({
              ...current,
              extractionReviewDraft: byPassageId.get(current.id) ?? null,
            } as T)
          : current;

      setPassages((prev) =>
        prev.map((passage) =>
          byPassageId.has(passage.id)
            ? {
                ...passage,
                extractionReviewDraft: byPassageId.get(passage.id) ?? null,
              }
            : passage,
        ),
      );
      setDetailPassage((prev) => applyReviewState(prev));
      setContentModalPassage((prev) => applyReviewState(prev));
      // 타입 주석 사유: 부모 상태가 useState<any> 라 SetStateAction<any> 는
      // updater 파라미터에 문맥 타입을 주지 못한다(noImplicitAny) — 명시.
      setAnalysisModalPassage((prev: any) => applyReviewState(prev));
    },
    [],
  );

  const handleToggleExtractionReview = useCallback(
    async (passage: PassageItem) => {
      const draft = passage.extractionReviewDraft;
      if (!draft) return;

      const isReviewed = draft.reviewStatus === "COMMITTED";

      setReviewActionPassageIds((prev) => {
        const next = new Set(prev);
        next.add(passage.id);
        return next;
      });

      try {
        if (isReviewed) {
          // 검수취소는 비파괴적으로 — 지문(Passage)은 문제생성 목록에 그대로
          // 두고 검수 상태만 REVIEWED 로 되돌린다(점 초록→빨강).
          const res = await fetchReviewAction(
            `/api/extraction/m1-passages/${draft.id}/uncommit`,
            {
              method: "POST",
              credentials: "include",
            },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error ?? "검수를 취소하지 못했습니다.");
          }
          const reviewedAt = new Date().toISOString();
          patchExtractionReviewState([
            {
              passageId: passage.id,
              draft: {
                ...draft,
                reviewStatus: "REVIEWED",
                confirmedAt: null,
                updatedAt: reviewedAt,
              },
            },
          ]);
          toast.success("검수완료를 취소했습니다.");
        } else {
          const res = await fetchReviewAction(
            "/api/extraction/m1-passages/promote",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              // 사용자가 '검수완료'로 표시 — 명시적으로 검수완료 처리.
              body: JSON.stringify({ draftIds: [draft.id], markReviewed: true }),
            },
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data?.error ?? "검수완료로 표시하지 못했습니다.");
          }
          const promoted = data?.summary?.promoted ?? 0;
          const skipped = data?.summary?.skipped ?? 0;
          if (promoted + skipped <= 0) {
            throw new Error("검수 처리에 실패했습니다.");
          }
          const reviewedAt = new Date().toISOString();
          patchExtractionReviewState([
            {
              passageId: passage.id,
              draft: {
                ...draft,
                reviewStatus: "COMMITTED",
                confirmedAt: reviewedAt,
                updatedAt: reviewedAt,
              },
            },
          ]);
          toast.success("검수완료로 표시했습니다.");
          void patchPassages([passage.id]);
        }
      } catch (err) {
        toast.error(
          isAbortError(err)
            ? "검수 처리 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
            : err instanceof Error
              ? err.message
              : "검수 상태를 변경하지 못했습니다.",
        );
      } finally {
        setReviewActionPassageIds((prev) => {
          if (!prev.has(passage.id)) return prev;
          const next = new Set(prev);
          next.delete(passage.id);
          return next;
        });
      }
    },
    [patchExtractionReviewState, patchPassages],
  );

  const handleBulkCompleteExtractionReview = useCallback(
    async (targetPassages: PassageItem[]) => {
      if (reviewBulkActionRunning) return;

      const reviewDraftPassages = targetPassages.filter(
        (passage) => passage.extractionReviewDraft,
      );
      const pendingPassages = reviewDraftPassages.filter(
        (passage) =>
          passage.extractionReviewDraft?.reviewStatus !== "COMMITTED",
      );
      const alreadyCommittedCount =
        reviewDraftPassages.length - pendingPassages.length;

      if (pendingPassages.length === 0) {
        window.alert(
          alreadyCommittedCount > 0
            ? `선택한 ${alreadyCommittedCount}개 자료가 이미 모두 검수완료되어 있습니다.`
            : "선택한 지문 중 검수할 추출 자료가 없습니다.",
        );
        return;
      }

      const ok =
        alreadyCommittedCount > 0
          ? window.confirm(
              `선택한 ${reviewDraftPassages.length}개 중 ${alreadyCommittedCount}개는 이미 검수완료되어 있습니다.\n` +
                `검수 필요한 ${pendingPassages.length}개만 검수완료 처리할까요?`,
            )
          : window.confirm(
              `선택한 ${pendingPassages.length}개 지문을 검수완료로 표시할까요?`,
            );
      if (!ok) return;

      const draftIds = pendingPassages
        .map((passage) => passage.extractionReviewDraft?.id)
        .filter((id): id is string => Boolean(id));
      if (draftIds.length === 0) return;

      setReviewBulkActionRunning(true);
      setReviewActionPassageIds((prev) => {
        const next = new Set(prev);
        pendingPassages.forEach((passage) => next.add(passage.id));
        return next;
      });

      try {
        const res = await fetchReviewAction(
          "/api/extraction/m1-passages/promote",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            // 사용자가 '검수완료'로 일괄 표시 — 명시적으로 검수완료 처리.
            body: JSON.stringify({ draftIds, markReviewed: true }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "검수완료 처리에 실패했습니다.");
        }

        const promoted = data?.summary?.promoted ?? 0;
        const skipped = data?.summary?.skipped ?? 0;
        const failed = data?.summary?.failed ?? 0;
        if (promoted + skipped <= 0) {
          throw new Error("검수완료 처리에 실패했습니다.");
        }

        const reviewedAt = new Date().toISOString();
        patchExtractionReviewState(
          pendingPassages.map((passage) => ({
            passageId: passage.id,
            draft: passage.extractionReviewDraft
              ? {
                  ...passage.extractionReviewDraft,
                  reviewStatus: "COMMITTED",
                  confirmedAt: reviewedAt,
                  updatedAt: reviewedAt,
                }
              : null,
          })),
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          pendingPassages.forEach((passage) => next.delete(passage.id));
          return next;
        });
        dispatchGenerateTourMilestone("passage-review-completed");
        void patchPassages(pendingPassages.map((passage) => passage.id));
        if (failed > 0) {
          toast.warning(
            `${promoted}개 검수완료, ${skipped + failed}개 건너뜀/실패`,
          );
        } else {
          toast.success(
            `${promoted + skipped}개 지문을 검수완료로 표시했습니다.`,
          );
        }
      } catch (err) {
        toast.error(
          isAbortError(err)
            ? "검수완료 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
            : err instanceof Error
              ? err.message
              : "검수완료 처리에 실패했습니다.",
        );
      } finally {
        setReviewBulkActionRunning(false);
        setReviewActionPassageIds((prev) => {
          const next = new Set(prev);
          pendingPassages.forEach((passage) => next.delete(passage.id));
          return next;
        });
      }
    },
    [patchExtractionReviewState, patchPassages, reviewBulkActionRunning],
  );

  return {
    reviewActionPassageIds,
    reviewBulkActionRunning,
    handleToggleExtractionReview,
    handleBulkCompleteExtractionReview,
  };
}
