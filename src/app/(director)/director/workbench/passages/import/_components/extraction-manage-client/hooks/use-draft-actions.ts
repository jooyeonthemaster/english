import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob } from "../types";

type SetDrafts = Dispatch<SetStateAction<M1PassageDraftWithJob[]>>;
type SetSelectedDraftDetail = Dispatch<
  SetStateAction<M1PassageDraftWithJob | null>
>;

const UNDO_TOAST_DURATION = 8000;

interface UseDraftActionsParams {
  drafts: M1PassageDraftWithJob[];
  setDrafts: SetDrafts;
  setSelectedDraftDetail: SetSelectedDraftDetail;
  closeDraftDetail: () => void;
  setError: Dispatch<SetStateAction<string | null>>;
  refreshQueueDrawer: () => void;
}

/**
 * Owns the per-draft CRUD handlers. Mutates the drafts list passed in via
 * `setDrafts`, surfaces toasts on success/failure, and lets the caller wire
 * optimistic UI through the rollback patterns inside each handler.
 *
 * Bulk handlers live in `useBulkActions` to keep both hooks under the
 * 500-line guideline.
 */
export function useDraftActions(params: UseDraftActionsParams) {
  const {
    drafts,
    setDrafts,
    setSelectedDraftDetail,
    closeDraftDetail,
    setError,
    refreshQueueDrawer,
  } = params;

  const [savingId, setSavingId] = useState<string | null>(null);
  const [rerestoringId, setRerestoringId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [unpromotingId, setUnpromotingId] = useState<string | null>(null);

  const renameJob = useCallback(
    async (targetJobId: string, nextName: string | null) => {
      // Capture rollback snapshot first
      let previousDisplayName: string | null = null;
      let previousOriginalName: string | null = null;
      setDrafts((current) => {
        const probe = current.find((d) => d.job?.id === targetJobId);
        if (probe?.job) {
          previousDisplayName = probe.job.displayName ?? null;
          previousOriginalName = probe.job.originalFileName ?? null;
        }
        // Optimistic update on every draft from this job
        return current.map((d) =>
          d.job?.id === targetJobId
            ? { ...d, job: { ...d.job, displayName: nextName } }
            : d,
        );
      });

      if (nextName === previousDisplayName) return;

      try {
        const res = await fetch("/api/extraction/jobs/" + targetJobId, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: nextName }),
        });
        if (!res.ok) throw new Error("작업 이름을 저장하지 못했습니다.");
        const data = (await res.json()) as {
          job: {
            id: string;
            displayName: string | null;
            originalFileName: string | null;
          };
        };
        // Sync from server response (covers max-length truncation etc.)
        setDrafts((current) =>
          current.map((d) =>
            d.job?.id === data.job.id
              ? {
                  ...d,
                  job: {
                    ...d.job,
                    displayName: data.job.displayName,
                    originalFileName: data.job.originalFileName,
                  },
                }
              : d,
          ),
        );
        toast.success("작업 이름이 저장되었습니다.");
        refreshQueueDrawer();
      } catch (err) {
        // Rollback to previous values
        setDrafts((current) =>
          current.map((d) =>
            d.job?.id === targetJobId
              ? {
                  ...d,
                  job: {
                    ...d.job,
                    displayName: previousDisplayName,
                    originalFileName: previousOriginalName,
                  },
                }
              : d,
          ),
        );
        toast.error(
          err instanceof Error
            ? err.message
            : "작업 이름을 저장하지 못했습니다.",
        );
      }
    },
    [setDrafts, refreshQueueDrawer],
  );

  const renameSourceMaterial = useCallback(
    async (sourceMaterialId: string, customLabel: string) => {
      const trimmed = customLabel.trim();
      const next = trimmed.length > 0 ? trimmed : null;

      let previousLabel: string | null = null;
      setDrafts((current) => {
        const probe = current.find(
          (d) => d.sourceMaterial?.id === sourceMaterialId,
        );
        if (probe?.sourceMaterial) {
          previousLabel = probe.sourceMaterial.customLabel ?? null;
        }
        return current.map((d) =>
          d.sourceMaterial?.id === sourceMaterialId
            ? {
                ...d,
                sourceMaterial: { ...d.sourceMaterial, customLabel: next },
              }
            : d,
        );
      });

      if (next === previousLabel) return;

      try {
        const res = await fetch(
          "/api/extraction/source-materials/" + sourceMaterialId,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customLabel: next }),
          },
        );
        if (!res.ok) throw new Error("시험지 이름을 저장하지 못했습니다.");
        const data = (await res.json()) as {
          sourceMaterial: { id: string; customLabel: string | null };
        };
        setDrafts((current) =>
          current.map((d) =>
            d.sourceMaterial?.id === data.sourceMaterial.id
              ? {
                  ...d,
                  sourceMaterial: {
                    id: data.sourceMaterial.id,
                    customLabel: data.sourceMaterial.customLabel,
                  },
                }
              : d,
          ),
        );
        toast.success("시험지 이름이 저장되었습니다.");
      } catch (err) {
        setDrafts((current) =>
          current.map((d) =>
            d.sourceMaterial?.id === sourceMaterialId
              ? {
                  ...d,
                  sourceMaterial: {
                    ...d.sourceMaterial,
                    customLabel: previousLabel,
                  },
                }
              : d,
          ),
        );
        toast.error(
          err instanceof Error
            ? err.message
            : "시험지 이름을 저장하지 못했습니다.",
        );
      }
    },
    [setDrafts],
  );

  const updateDraftText = useCallback(
    (id: string, teacherText: string) => {
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === id ? { ...draft, teacherText } : draft,
        ),
      );
      setSelectedDraftDetail((current) =>
        current?.id === id ? { ...current, teacherText } : current,
      );
    },
    [setDrafts, setSelectedDraftDetail],
  );

  const updateDraftTitle = useCallback(
    async (id: string, newTitle: string | null) => {
      let previousTitle: string | null | undefined;
      let teacherText: string | undefined;
      setDrafts((current) => {
        const target = current.find((d) => d.id === id);
        if (!target) return current;
        previousTitle = target.title ?? null;
        teacherText = target.teacherText;
        if ((target.title ?? null) === newTitle) return current;
        return current.map((d) =>
          d.id === id ? { ...d, title: newTitle } : d,
        );
      });
      if (teacherText === undefined) return;
      if (previousTitle === newTitle) return;

      try {
        const res = await fetch("/api/extraction/m1-passages/" + id, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle, teacherText }),
        });
        if (!res.ok) throw new Error("제목 저장에 실패했습니다.");
        const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
        setDrafts((current) =>
          current.map((d) =>
            d.id === data.draft.id ? { ...d, ...data.draft } : d,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === data.draft.id
            ? { ...current, ...data.draft }
            : current,
        );
      } catch (err) {
        // Rollback
        setDrafts((current) =>
          current.map((d) =>
            d.id === id ? { ...d, title: previousTitle ?? null } : d,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === id
            ? { ...current, title: previousTitle ?? null }
            : current,
        );
        toast.error(
          err instanceof Error ? err.message : "제목 저장에 실패했습니다.",
        );
      }
    },
    [setDrafts, setSelectedDraftDetail],
  );

  const saveDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
      setSavingId(draft.id);
      setError(null);
      try {
        const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: draft.title ?? null,
            teacherText: draft.teacherText,
          }),
        });
        if (!res.ok) throw new Error("수정 내용을 저장하지 못했습니다.");
        const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
        setDrafts((current) =>
          current.map((item) =>
            item.id === data.draft.id ? { ...item, ...data.draft } : item,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === data.draft.id
            ? { ...current, ...data.draft }
            : current,
        );
        toast.success("저장되었습니다.");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "수정 내용을 저장하지 못했습니다.",
        );
      } finally {
        setSavingId(null);
      }
    },
    [setDrafts, setSelectedDraftDetail, setError],
  );

  const rerestoreDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
      setRerestoringId(draft.id);
      setError(null);
      try {
        const res = await fetch(
          "/api/extraction/m1-passages/" + draft.id + "/rerestore",
          { method: "POST", credentials: "include" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "AI 복원을 다시 실행하지 못했습니다.");
        }
        const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
        setDrafts((current) =>
          current.map((item) =>
            item.id === data.draft.id ? { ...item, ...data.draft } : item,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === data.draft.id
            ? { ...current, ...data.draft }
            : current,
        );
        refreshQueueDrawer();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "AI 복원을 다시 실행하지 못했습니다.",
        );
      } finally {
        setRerestoringId(null);
      }
    },
    [setDrafts, setSelectedDraftDetail, setError, refreshQueueDrawer],
  );

  const undoPromoteDraft = useCallback(
    async (draftId: string, successMessage = "검수가 취소되었습니다.") => {
      setUnpromotingId(draftId);
      setError(null);

      try {
        const res = await fetch(
          "/api/extraction/m1-passages/" + draftId + "/unpromote",
          { method: "POST", credentials: "include" },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "검수를 취소하지 못했습니다.");
        }
        setDrafts((current) =>
          current.map((d) =>
            d.id === draftId
              ? {
                  ...d,
                  reviewStatus: "REVIEWED",
                  savedPassageId: null,
                  confirmedAt: null,
                }
              : d,
          ),
        );
        setSelectedDraftDetail((current) =>
          current?.id === draftId
            ? {
                ...current,
                reviewStatus: "REVIEWED",
                savedPassageId: null,
                confirmedAt: null,
              }
            : current,
        );
        refreshQueueDrawer();
        toast.success(successMessage);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "검수를 취소하지 못했습니다.";
        setError(message);
        toast.error(message);
      } finally {
        setUnpromotingId(null);
      }
    },
    [setDrafts, setSelectedDraftDetail, setError, refreshQueueDrawer],
  );

  const promoteDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
      setPromotingId(draft.id);
      setError(null);
      try {
        const res = await fetch("/api/extraction/m1-passages/promote", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftIds: [draft.id] }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "검수완료로 표시하지 못했습니다.");
        }
        const data = (await res.json()) as {
          summary: { promoted: number; skipped: number; failed: number };
          outcomes: Array<{
            draftId: string;
            status: string;
            reason?: string;
            passageId?: string;
          }>;
        };
        const outcome = data.outcomes.find((o) => o.draftId === draft.id);
        if (outcome?.status === "promoted") {
          // Keep the draft visible in 자료 관리; flip it to COMMITTED so the
          // card shows the "검수완료" badge and drops the red "needs review"
          // border. Server fetch returns COMMITTED rows too.
          setDrafts((current) =>
            current.map((d) =>
              d.id === draft.id
                ? {
                    ...d,
                    reviewStatus: "COMMITTED",
                    savedPassageId: outcome.passageId ?? d.savedPassageId,
                    confirmedAt: d.confirmedAt ?? new Date().toISOString(),
                  }
                : d,
            ),
          );
          setSelectedDraftDetail((current) =>
            current?.id === draft.id
              ? {
                  ...current,
                  reviewStatus: "COMMITTED",
                  savedPassageId: outcome.passageId ?? current.savedPassageId,
                  confirmedAt: current.confirmedAt ?? new Date().toISOString(),
                }
              : current,
          );
          refreshQueueDrawer();
          toast.success("검수완료로 표시했습니다.", {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () =>
                void undoPromoteDraft(
                  draft.id,
                  "검수완료를 실행 취소했습니다.",
                ),
            },
          });
        } else {
          const label =
            outcome?.reason === "already_promoted"
              ? "이미 검수가 완료된 자료입니다."
              : outcome?.reason === "no_source_material"
                ? "출처가 연결되지 않아 검수할 수 없습니다."
                : outcome?.reason === "empty_content"
                  ? "본문이 비어 있어 검수할 수 없습니다."
                  : "검수 처리에 실패했습니다.";
          toast.error(label);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "검수 처리에 실패했습니다.");
      } finally {
        setPromotingId(null);
      }
    },
    [
      setDrafts,
      setSelectedDraftDetail,
      setError,
      refreshQueueDrawer,
      undoPromoteDraft,
    ],
  );

  const unpromoteDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("검수를 취소하시겠습니까?");
      if (!ok) return;

      // Optimistic rollback snapshot
      const prev = {
        reviewStatus: draft.reviewStatus,
        savedPassageId: draft.savedPassageId,
        confirmedAt: draft.confirmedAt,
      };

      try {
        await undoPromoteDraft(draft.id);
      } catch (err) {
        // Restore optimistic state (none changed before await — rollback is
        // defensive in case future code optimistically updates first).
        setDrafts((current) =>
          current.map((d) => (d.id === draft.id ? { ...d, ...prev } : d)),
        );
        setSelectedDraftDetail((current) =>
          current?.id === draft.id ? { ...current, ...prev } : current,
        );
        const message =
          err instanceof Error ? err.message : "검수를 취소하지 못했습니다.";
        setError(message);
        toast.error(message);
      }
    },
    [setDrafts, setSelectedDraftDetail, setError, undoPromoteDraft],
  );

  const deleteDraft = useCallback(
    async (draft: M1PassageDraftSnapshot) => {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("이 추출 지문을 삭제할까요?");
      if (!ok) return;

      setDeletingDraftId(draft.id);
      setError(null);
      const deletedDraft =
        (drafts.find((item) => item.id === draft.id) ??
          draft) as M1PassageDraftWithJob;
      const deletedIndex = Math.max(
        0,
        drafts.findIndex((item) => item.id === draft.id),
      );
      try {
        const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("지문을 삭제하지 못했습니다.");
        setDrafts((current) => current.filter((item) => item.id !== draft.id));
        closeDraftDetail();
        refreshQueueDrawer();
        toast.success("삭제되었습니다.", {
          duration: UNDO_TOAST_DURATION,
          action: {
            label: "실행 취소",
            onClick: () => {
              void (async () => {
                const restoreRes = await fetch(
                  "/api/extraction/m1-passages/restore-many",
                  {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ draftIds: [draft.id] }),
                  },
                );
                if (!restoreRes.ok) {
                  toast.error("삭제를 실행 취소하지 못했습니다.");
                  return;
                }
                setDrafts((current) => {
                  if (current.some((item) => item.id === deletedDraft.id)) {
                    return current;
                  }
                  const next = [...current];
                  next.splice(Math.min(deletedIndex, next.length), 0, deletedDraft);
                  return next;
                });
                refreshQueueDrawer();
                toast.success("삭제를 실행 취소했습니다.");
              })();
            },
          },
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "지문을 삭제하지 못했습니다.",
        );
      } finally {
        setDeletingDraftId(null);
      }
    },
    [drafts, setDrafts, closeDraftDetail, refreshQueueDrawer, setError],
  );

  return {
    savingId,
    rerestoringId,
    deletingDraftId,
    promotingId,
    unpromotingId,
    renameJob,
    renameSourceMaterial,
    updateDraftText,
    updateDraftTitle,
    saveDraft,
    rerestoreDraft,
    promoteDraft,
    unpromoteDraft,
    deleteDraft,
  };
}
