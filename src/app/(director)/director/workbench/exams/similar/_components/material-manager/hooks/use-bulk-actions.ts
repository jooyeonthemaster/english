import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { M1PassageDraftSnapshot } from "@/lib/extraction/types";

import type { M1PassageDraftWithJob } from "../types";

type SetDrafts = Dispatch<SetStateAction<M1PassageDraftWithJob[]>>;

const UNDO_TOAST_DURATION = 8000;

interface DraftRestoreSnapshot {
  draft: M1PassageDraftWithJob;
  index: number;
}

function restoreDraftsIntoList(
  current: M1PassageDraftWithJob[],
  snapshots: DraftRestoreSnapshot[],
) {
  const next = [...current];
  const existingIds = new Set(next.map((draft) => draft.id));
  for (const { draft, index } of snapshots.sort((a, b) => a.index - b.index)) {
    if (existingIds.has(draft.id)) continue;
    next.splice(Math.min(index, next.length), 0, draft);
    existingIds.add(draft.id);
  }
  return next;
}

interface UseBulkActionsParams {
  drafts: M1PassageDraftWithJob[];
  setDrafts: SetDrafts;
  setError: Dispatch<SetStateAction<string | null>>;
  refreshQueueDrawer: () => void;
}

/**
 * Owns the bulk draft action handlers (delete-many, rerestore-many,
 * promote-many). Pulled out of `useDraftActions` so each hook stays under
 * the 500-line guideline and the single-draft handlers can be reused
 * independently.
 *
 * The caller passes the action target ids + a clearActionSelection callback
 * with each invocation; this hook does not own selection state.
 */
export function useBulkActions(params: UseBulkActionsParams) {
  const { drafts, setDrafts, setError, refreshQueueDrawer } = params;

  const [bulkActionRunning, setBulkActionRunning] = useState<
    "delete" | "rerestore" | "promote" | null
  >(null);

  const bulkDelete = useCallback(
    async (
      actionTargetIds: Set<string>,
      clearActionSelection: () => void,
    ) => {
      if (actionTargetIds.size === 0 || bulkActionRunning) return;
      const ids = [...actionTargetIds];
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm(
              `선택한 ${ids.length}개 자료를 삭제할까요? 삭제 직후 실행 취소할 수 있습니다.`,
            );
      if (!ok) return;

      setBulkActionRunning("delete");
      setError(null);
      const idSet = new Set(ids);
      const deletedSnapshots = drafts
        .map((draft, index) => ({ draft, index }))
        .filter(({ draft }) => idSet.has(draft.id));

      try {
        const res = await fetch("/api/extraction/m1-passages/delete-many", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftIds: ids }),
        });
        if (!res.ok) {
          throw new Error("삭제 요청이 실패했습니다.");
        }
        const data = (await res.json()) as {
          requested: number;
          deleted: number;
        };

        // Only remove drafts that were actually deleted from the server.
        // If `deleted < requested`, some weren't owned by this academy or
        // already gone — they stay in local state until the next refresh.
        setDrafts((current) => current.filter((d) => !idSet.has(d.id)));
        clearActionSelection();
        refreshQueueDrawer();

        if (data.deleted === data.requested) {
          toast.success(`${data.deleted}개 자료를 삭제했습니다.`, {
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
                      body: JSON.stringify({ draftIds: ids }),
                    },
                  );
                  if (!restoreRes.ok) {
                    toast.error("삭제를 실행 취소하지 못했습니다.");
                    return;
                  }
                  const restoreData = (await restoreRes.json()) as {
                    restored: number;
                  };
                  if (restoreData.restored === 0) {
                    toast.error("복원할 자료가 없습니다.");
                    return;
                  }
                  setDrafts((current) =>
                    restoreDraftsIntoList(current, deletedSnapshots),
                  );
                  refreshQueueDrawer();
                  toast.success(`${restoreData.restored}개 자료를 복원했습니다.`);
                })();
              },
            },
          });
        } else if (data.deleted === 0) {
          toast.error("삭제에 실패했습니다.");
        } else {
          toast.warning(
            `${data.deleted}개 삭제됨, ${data.requested - data.deleted}개 누락`,
            data.deleted > 0
              ? {
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
                            body: JSON.stringify({
                              draftIds: deletedSnapshots.map(
                                ({ draft }) => draft.id,
                              ),
                            }),
                          },
                        );
                        if (!restoreRes.ok) {
                          toast.error("삭제를 실행 취소하지 못했습니다.");
                          return;
                        }
                        const restoreData = (await restoreRes.json()) as {
                          restored: number;
                        };
                        setDrafts((current) =>
                          restoreDraftsIntoList(current, deletedSnapshots),
                        );
                        refreshQueueDrawer();
                        toast.success(
                          `${restoreData.restored}개 자료를 복원했습니다.`,
                        );
                      })();
                    },
                  },
                }
              : undefined,
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "삭제 요청에 실패했습니다.",
        );
      } finally {
        setBulkActionRunning(null);
      }
    },
    [bulkActionRunning, drafts, setDrafts, refreshQueueDrawer, setError],
  );

  const bulkRerestore = useCallback(
    async (
      actionTargetIds: Set<string>,
      clearActionSelection: () => void,
    ) => {
      if (actionTargetIds.size === 0 || bulkActionRunning) return;
      const ids = [...actionTargetIds];
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm(
              `선택한 ${ids.length}개 자료의 AI 복원을 다시 실행할까요? 크레딧이 차감됩니다.`,
            );
      if (!ok) return;

      setBulkActionRunning("rerestore");
      setError(null);

      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(
            "/api/extraction/m1-passages/" + id + "/rerestore",
            { method: "POST", credentials: "include" },
          );
          if (!res.ok) throw new Error(`rerestore failed for ${id}`);
          return (await res.json()) as { draft: M1PassageDraftSnapshot };
        }),
      );

      let success = 0;
      let failed = 0;
      const updates: M1PassageDraftSnapshot[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          success += 1;
          updates.push(r.value.draft);
        } else {
          failed += 1;
        }
      }

      if (updates.length > 0) {
        const updateMap = new Map(updates.map((d) => [d.id, d]));
        setDrafts((current) =>
          current.map((item) => {
            const u = updateMap.get(item.id);
            return u ? { ...item, ...u } : item;
          }),
        );
      }

      clearActionSelection();
      refreshQueueDrawer();
      setBulkActionRunning(null);

      if (failed === 0) {
        toast.success(`${success}개 자료의 AI 복원을 다시 실행했습니다.`);
      } else if (success === 0) {
        toast.error(`복원 재실행에 모두 실패했습니다.`);
      } else {
        toast.warning(`${success}개 성공, ${failed}개 실패`);
      }
    },
    [bulkActionRunning, setDrafts, refreshQueueDrawer, setError],
  );

  const bulkPromote = useCallback(
    async (
      actionTargetIds: Set<string>,
      clearActionSelection: () => void,
    ) => {
      if (actionTargetIds.size === 0 || bulkActionRunning) return;

      // Partition the selection by current review status so we can skip
      // already-committed drafts and ask the user about a mixed selection.
      const draftById = new Map(drafts.map((d) => [d.id, d]));
      const committedIds: string[] = [];
      const pendingIds: string[] = [];
      for (const id of actionTargetIds) {
        const draft = draftById.get(id);
        if (draft?.reviewStatus === "COMMITTED") committedIds.push(id);
        else pendingIds.push(id);
      }

      let ids: string[];
      if (typeof window === "undefined") {
        ids = [...actionTargetIds];
      } else if (pendingIds.length === 0) {
        window.alert(
          `선택한 ${committedIds.length}개 자료가 이미 모두 검수완료되어 있습니다.`,
        );
        return;
      } else if (committedIds.length > 0) {
        const ok = window.confirm(
          `선택한 ${actionTargetIds.size}개 중 ${committedIds.length}개는 이미 검수완료되어 있습니다.\n` +
            `검수 필요한 ${pendingIds.length}개만 검수완료 처리할까요?`,
        );
        if (!ok) return;
        ids = pendingIds;
      } else {
        const ok = window.confirm(
          `선택한 ${pendingIds.length}개 자료를 검수완료로 표시할까요?`,
        );
        if (!ok) return;
        ids = pendingIds;
      }

      setBulkActionRunning("promote");
      setError(null);

      try {
        const res = await fetch("/api/extraction/m1-passages/promote", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // 사람이 누른 '검수완료' 액션 — 명시적으로 검수완료 처리.
          body: JSON.stringify({ draftIds: ids, markReviewed: true }),
        });
        if (!res.ok) throw new Error("검수 처리 요청이 실패했습니다.");
        const data = (await res.json()) as {
          summary: { promoted: number; skipped: number; failed: number };
          outcomes: Array<{
            draftId: string;
            status: string;
            passageId?: string;
          }>;
        };
        const promotedPassageByDraft = new Map<string, string | undefined>();
        for (const o of data.outcomes) {
          if (o.status === "promoted")
            promotedPassageByDraft.set(o.draftId, o.passageId);
        }
        if (promotedPassageByDraft.size > 0) {
          const nowIso = new Date().toISOString();
          setDrafts((current) =>
            current.map((d) => {
              if (!promotedPassageByDraft.has(d.id)) return d;
              const passageId = promotedPassageByDraft.get(d.id);
              return {
                ...d,
                reviewStatus: "COMMITTED",
                savedPassageId: passageId ?? d.savedPassageId,
                confirmedAt: d.confirmedAt ?? nowIso,
              };
            }),
          );
        }
        clearActionSelection();
        refreshQueueDrawer();

        const { promoted, skipped, failed } = data.summary;
        const promotedIds = [...promotedPassageByDraft.keys()];
        const undoPromote = async () => {
          const results = await Promise.allSettled(
            promotedIds.map(async (id) => {
              const res = await fetch(
                "/api/extraction/m1-passages/" + id + "/unpromote",
                { method: "POST", credentials: "include" },
              );
              if (!res.ok) throw new Error("unpromote failed");
              return id;
            }),
          );
          const restoredIds = results
            .filter((result): result is PromiseFulfilledResult<string> =>
              result.status === "fulfilled",
            )
            .map((result) => result.value);
          if (restoredIds.length > 0) {
            const restoredIdSet = new Set(restoredIds);
            setDrafts((current) =>
              current.map((d) =>
                restoredIdSet.has(d.id)
                  ? {
                      ...d,
                      reviewStatus: "REVIEWED",
                      savedPassageId: null,
                      confirmedAt: null,
                    }
                  : d,
              ),
            );
            refreshQueueDrawer();
          }
          if (restoredIds.length === promotedIds.length) {
            toast.success("검수완료를 실행 취소했습니다.");
          } else if (restoredIds.length === 0) {
            toast.error("검수완료를 실행 취소하지 못했습니다.");
          } else {
            toast.warning(
              `${restoredIds.length}개 실행 취소, ${
                promotedIds.length - restoredIds.length
              }개 실패`,
            );
          }
        };
        const undoOptions =
          promotedIds.length > 0
            ? {
                duration: UNDO_TOAST_DURATION,
                action: {
                  label: "실행 취소",
                  onClick: () => void undoPromote(),
                },
              }
            : undefined;
        if (failed === 0 && skipped === 0) {
          toast.success(
            `${promoted}개 자료를 검수완료로 표시했습니다.`,
            undoOptions,
          );
        } else if (promoted === 0) {
          toast.error(
            "처리된 자료가 없습니다. (이미 검수되었거나 출처/본문이 없는 자료)",
          );
        } else {
          toast.warning(
            `${promoted}개 검수완료, ${skipped + failed}개 건너뜀/실패`,
            undoOptions,
          );
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "검수 처리 요청에 실패했습니다.",
        );
      } finally {
        setBulkActionRunning(null);
      }
    },
    [bulkActionRunning, drafts, setDrafts, refreshQueueDrawer, setError],
  );

  return {
    bulkActionRunning,
    bulkDelete,
    bulkRerestore,
    bulkPromote,
  };
}
