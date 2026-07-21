"use client";

// 컬렉션(폴더)·지문 벌크 조작 클러스터 — generate-page-client.tsx 에서 추출.
// 폴더 생성/이름변경/복사/이동/폴더에서 빼기/삭제와 지문 일괄 삭제, 그리고
// 특정 지문만 제자리 병합(patchPassages)을 담당한다. 낙관 업데이트 + undo
// 토스트 로직 포함 — 코드는 바이트 동일 이동(무회귀).

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  addPassagesToCollection,
  bulkDeleteWorkbenchPassages,
  createPassageCollection,
  removePassagesFromCollection,
  updatePassageCollection,
} from "@/actions/workbench";
import {
  type PassageItem,
  type PassageCollectionItem,
} from "./generate-page-types";
import { isDraftPseudoId } from "@/lib/extraction/draft-passage-id";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";

const UNDO_TOAST_DURATION = 8000;

interface UsePassageCollectionsParams {
  academyId: string;
  subjectScope?: "KOREAN";
  loadPassages: () => Promise<void>;
  passages: PassageItem[];
  setPassages: Dispatch<SetStateAction<PassageItem[]>>;
  collections: PassageCollectionItem[];
  setCollections: Dispatch<SetStateAction<PassageCollectionItem[]>>;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  selectedCollectionId: string;
  selectedPassage: PassageItem | null;
  setSelectedPassage: Dispatch<SetStateAction<PassageItem | null>>;
  setAnalysisData: Dispatch<SetStateAction<any>>;
  setDetailPassage: Dispatch<SetStateAction<PassageItem | null>>;
}

export function usePassageCollections({
  academyId,
  subjectScope,
  loadPassages,
  passages,
  setPassages,
  collections,
  setCollections,
  selectedIds,
  setSelectedIds,
  selectedCollectionId,
  selectedPassage,
  setSelectedPassage,
  setAnalysisData,
  setDetailPassage,
}: UsePassageCollectionsParams) {
  const [passageBulkAction, setPassageBulkAction] = useState<
    "move" | "remove" | "delete" | null
  >(null);
  const [deletingDetailId, setDeletingDetailId] = useState<string | null>(null);

  // 특정 지문만 다시 받아 기존 배열에 제자리 병합한다. loadPassages 와 달리
  // 로딩 상태를 켜지 않아 그리드 전체가 "새로고침"되는 느낌 없이 해당 카드만
  // 분석 완료 모습으로 바뀐다. 목록에 없는 지문은 건드리지 않는다.
  const patchPassages = useCallback(
    async (passageIds: string[]) => {
      if (passageIds.length === 0) return;
      try {
        const params = new URLSearchParams({
          academyId,
          passageIds: passageIds.join(","),
          // 목록과 같은 과목 스코프로 조회 — 국어 라우트에서 국어 지문 patch 가
          // 기본(영어) 스코프에 걸러지지 않게 한다.
          ...(subjectScope === "KOREAN" ? { scope: "KOREAN" } : {}),
        });
        const response = await fetch(`/api/passages/list?${params}`);
        const data = await response.json();
        const fetched: PassageItem[] = data.passages || [];
        if (fetched.length === 0) return;
        const byId = new Map(fetched.map((p) => [p.id, p]));
        setPassages((prev) => prev.map((p) => byId.get(p.id) ?? p));
      } catch {
        /* ignore — 다음 전체 로드에서 따라잡는다 */
      }
    },
    [academyId],
  );

  const handleCreatePassageCollection = useCallback(
    async (name: string, parentId?: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      const result = await createPassageCollection({
        name: trimmed,
        parentId: parentId || undefined,
        // 국어 생성 페이지에서 만든 폴더는 subject=KOREAN 으로 저장 — 미전달이면
        // subject null(영어 간주)로 저장돼 영어 지문 관리에 나타나고 정작 국어
        // 목록에서는 사라진다(passage-list-client·question-bank-client 와 동일 패턴).
        ...(subjectScope === "KOREAN" ? { subject: "KOREAN" as const } : {}),
      });
      if (!result.success) {
        toast.error(result.error || "폴더 생성 실패");
        return null;
      }

      const created: PassageCollectionItem = {
        id: result.id,
        parentId: parentId || null,
        name: trimmed,
        _count: { items: 0 },
      };
      setCollections((prev) =>
        [...prev.filter((collection) => collection.id !== result.id), created]
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      toast.success(`"${trimmed}" 폴더를 만들었습니다.`);
      void loadPassages();
      return result.id;
    },
    [loadPassages, subjectScope],
  );

  const handleRenamePassageCollection = useCallback(
    async (collectionId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      // 낙관적 갱신 후 서버 반영(실패 시 토스트). 폴더 카운트/멤버십엔 영향 없음.
      setCollections((prev) =>
        prev
          .map((c) => (c.id === collectionId ? { ...c, name: trimmed } : c))
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      const result = await updatePassageCollection(collectionId, {
        name: trimmed,
      });
      if (!result?.success) {
        toast.error(result?.error || "폴더 이름 변경 실패");
        void loadPassages();
      }
    },
    [loadPassages],
  );

  // 상위(↑) 버튼이 "전체 지문"(루트)일 때 카드를 떨어뜨리면 현재 폴더에서 빼낸다.
  const handleRemovePassagesFromFolder = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || !collectionId || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const result = await removePassagesFromCollection(collectionId, ids);
        if (!result.success) {
          toast.error(result.error || "폴더에서 빼기 실패");
          return;
        }
        toast.success(`${ids.length}개 지문을 폴더에서 뺐습니다.`);
        void loadPassages();
      } finally {
        setPassageBulkAction(null);
      }
    },
    [passageBulkAction, loadPassages],
  );

  const handleCopySelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const selectedPassages = passages.filter((passage) =>
          selectedIds.has(passage.id),
        );
        const idsToAdd = ids.filter(
          (id) =>
            !selectedPassages
              .find((passage) => passage.id === id)
              ?.collectionItems?.some(
                (item) => item.collectionId === collectionId,
              ),
        );
        if (idsToAdd.length === 0) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }

        const result = await addPassagesToCollection(collectionId, idsToAdd);
        if (!result.success) {
          toast.error(result.error || "폴더에 복사하지 못했습니다.");
          return;
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          idsToAdd.length > 1 ? `${idsToAdd.length}개 지문이` : "지문이";

        const undoFolderCopy = async () => {
          setPassageBulkAction("move");
          try {
            const undoResult = await removePassagesFromCollection(
              collectionId,
              idsToAdd,
            );
            if (!undoResult.success) {
              toast.error(
                undoResult.error || "폴더 복사를 실행 취소하지 못했습니다.",
              );
              return;
            }
            await loadPassages();
            toast.success("폴더 복사를 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 복사를 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };

        // 선택한 것 중 이미 이 폴더에 있어 새로 담지 않은(중복 제외) 개수.
        const skippedCopy = ids.length - idsToAdd.length;
        const skippedCopySuffix =
          skippedCopy > 0 ? ` · 이미 들어있던 ${skippedCopy}개 제외` : "";
        toast.success(
          `${countLabel} "${folderName}"에 복사되었습니다${skippedCopySuffix}`,
          {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () => void undoFolderCopy(),
            },
          },
        );
        setSelectedIds(new Set());
        await loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더에 복사하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages, selectedIds],
  );

  const handleMovePassagesToCollection = useCallback(
    async (
      passageIds: string[],
      collectionId: string,
      keepFolderIds: string[] = [],
    ) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const keepSet = new Set(keepFolderIds);
        const selectedPassages = passages.filter((passage) =>
          idSet.has(passage.id),
        );
        const previousMembership = new Map<string, string[]>();
        for (const passage of selectedPassages) {
          for (const item of passage.collectionItems ?? []) {
            const list = previousMembership.get(item.collectionId) ?? [];
            list.push(passage.id);
            previousMembership.set(item.collectionId, list);
          }
        }
        // Keep the item in folders the user ticked — only remove from the rest.
        const sourceCollectionIds = [...previousMembership.keys()].filter(
          (id) => id !== collectionId && !keepSet.has(id),
        );
        const targetExistingIds = new Set(
          previousMembership.get(collectionId) ?? [],
        );
        const idsToAdd = ids.filter((id) => !targetExistingIds.has(id));
        const hasFolderChanges =
          idsToAdd.length > 0 || sourceCollectionIds.length > 0;

        if (!hasFolderChanges) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }

        const removeResults = await Promise.all(
          sourceCollectionIds.map((sourceId) =>
            removePassagesFromCollection(
              sourceId,
              previousMembership.get(sourceId) ?? [],
            ),
          ),
        );
        const failedRemove = removeResults.find((result) => !result.success);
        if (failedRemove) {
          toast.error(
            failedRemove.error || "폴더 이동 중 일부 제거에 실패했습니다.",
          );
          return;
        }

        if (idsToAdd.length > 0) {
          const addResult = await addPassagesToCollection(
            collectionId,
            idsToAdd,
          );
          if (!addResult.success) {
            toast.error(addResult.error || "폴더로 이동하지 못했습니다.");
            return;
          }
        }

        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel = ids.length > 1 ? `${ids.length}개 지문이` : "지문이";

        const undoFolderMove = async () => {
          setPassageBulkAction("move");
          try {
            const undoResults = await Promise.all([
              ...(idsToAdd.length > 0
                ? [removePassagesFromCollection(collectionId, idsToAdd)]
                : []),
              ...sourceCollectionIds.map((sourceId) =>
                addPassagesToCollection(
                  sourceId,
                  previousMembership.get(sourceId) ?? [],
                ),
              ),
            ]);
            const failedUndo = undoResults.find((result) => !result.success);
            if (failedUndo) {
              toast.error(
                failedUndo.error || "폴더 이동을 실행 취소하지 못했습니다.",
              );
              return;
            }

            await loadPassages();
            toast.success("폴더 이동을 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 이동을 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };

        // 끌어온 것 중 이미 이 폴더에 있어 새로 담지 않은(중복 제외) 개수.
        const skippedMove = ids.length - idsToAdd.length;
        const skippedMoveSuffix =
          skippedMove > 0 ? ` · 이미 들어있던 ${skippedMove}개 제외` : "";
        toast.success(
          `${countLabel} "${folderName}"(으)로 이동되었습니다${skippedMoveSuffix}`,
          {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () => void undoFolderMove(),
            },
          },
        );
        setPassages((prev) =>
          prev.map((passage) => {
            if (!idSet.has(passage.id)) return passage;
            const collectionItems = (passage.collectionItems ?? []).filter(
              (item) => !sourceCollectionIds.includes(item.collectionId),
            );
            if (
              !collectionItems.some(
                (item) => item.collectionId === collectionId,
              )
            ) {
              collectionItems.push({ collectionId });
            }
            return { ...passage, collectionItems };
          }),
        );
        setCollections((prev) =>
          prev.map((collection) => {
            const removed = sourceCollectionIds.includes(collection.id)
              ? (previousMembership
                  .get(collection.id)
                  ?.filter((id) => idSet.has(id)).length ?? 0)
              : 0;
            const added = collection.id === collectionId ? idsToAdd.length : 0;
            if (removed === 0 && added === 0) return collection;
            return {
              ...collection,
              _count: {
                ...collection._count,
                items: Math.max(0, collection._count.items - removed + added),
              },
            };
          }),
        );
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        dispatchGenerateTourMilestone("passage-folder-drop-completed");
        void loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더로 이동하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleMoveSelectedPassagesToCollection = useCallback(
    async (collectionId: string) => {
      await handleMovePassagesToCollection([...selectedIds], collectionId);
    },
    [handleMovePassagesToCollection, selectedIds],
  );

  // Copy (add to target, keep in current folders) by explicit ids — powers the
  // 복사 option of the drag chooser. Mirrors the move handler's optimistic
  // updates but only adds (never removes from sources).
  const handleCopyPassagesToCollection = useCallback(
    async (passageIds: string[], collectionId: string) => {
      const ids = Array.from(new Set(passageIds)).filter(
        (id) => !isDraftPseudoId(id),
      );
      if (ids.length === 0 || passageBulkAction) return;
      setPassageBulkAction("move");
      try {
        const idSet = new Set(ids);
        const targetPassages = passages.filter((passage) =>
          idSet.has(passage.id),
        );
        const idsToAdd = ids.filter(
          (id) =>
            !targetPassages
              .find((passage) => passage.id === id)
              ?.collectionItems?.some(
                (item) => item.collectionId === collectionId,
              ),
        );
        if (idsToAdd.length === 0) {
          toast.info("이미 이 폴더에 들어있는 지문입니다.");
          return;
        }
        const addResult = await addPassagesToCollection(collectionId, idsToAdd);
        if (!addResult.success) {
          toast.error(addResult.error || "폴더에 복사하지 못했습니다.");
          return;
        }
        const folderName =
          collections.find((collection) => collection.id === collectionId)
            ?.name || "폴더";
        const countLabel =
          idsToAdd.length > 1 ? `${idsToAdd.length}개 지문이` : "지문이";
        const undoFolderCopy = async () => {
          setPassageBulkAction("move");
          try {
            const undo = await removePassagesFromCollection(
              collectionId,
              idsToAdd,
            );
            if (!undo.success) {
              toast.error(undo.error || "폴더 복사를 실행 취소하지 못했습니다.");
              return;
            }
            await loadPassages();
            toast.success("폴더 복사를 실행 취소했습니다.");
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "폴더 복사를 실행 취소하지 못했습니다.",
            );
          } finally {
            setPassageBulkAction(null);
          }
        };
        // 끌어온 것 중 이미 이 폴더에 있어 새로 담지 않은(중복 제외) 개수.
        const skippedCopy = ids.length - idsToAdd.length;
        const skippedCopySuffix =
          skippedCopy > 0 ? ` · 이미 들어있던 ${skippedCopy}개 제외` : "";
        toast.success(
          `${countLabel} "${folderName}"에 복사되었습니다${skippedCopySuffix}`,
          {
            duration: UNDO_TOAST_DURATION,
            action: { label: "실행 취소", onClick: () => void undoFolderCopy() },
          },
        );
        setPassages((prev) =>
          prev.map((passage) => {
            if (!idSet.has(passage.id)) return passage;
            const collectionItems = passage.collectionItems ?? [];
            if (
              collectionItems.some((item) => item.collectionId === collectionId)
            ) {
              return passage;
            }
            return {
              ...passage,
              collectionItems: [...collectionItems, { collectionId }],
            };
          }),
        );
        setCollections((prev) =>
          prev.map((collection) =>
            collection.id === collectionId
              ? {
                  ...collection,
                  _count: {
                    ...collection._count,
                    items: collection._count.items + idsToAdd.length,
                  },
                }
              : collection,
          ),
        );
        setSelectedIds((prev) => {
          if (!ids.some((id) => prev.has(id))) return prev;
          return new Set([...prev].filter((id) => !idSet.has(id)));
        });
        void loadPassages();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "폴더에 복사하지 못했습니다.",
        );
      } finally {
        setPassageBulkAction(null);
      }
    },
    [collections, loadPassages, passageBulkAction, passages],
  );

  const handleRemoveSelectedPassagesFromCollection = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
    const collectionId = selectedCollectionId;
    if (!collectionId || ids.length === 0 || passageBulkAction) return;

    setPassageBulkAction("remove");
    try {
      const idSet = new Set(ids);
      const idsToRemove = passages
        .filter(
          (passage) =>
            idSet.has(passage.id) &&
            passage.collectionItems?.some(
              (item) => item.collectionId === collectionId,
            ),
        )
        .map((passage) => passage.id);

      if (idsToRemove.length === 0) {
        toast.info("이 폴더에서 제거할 지문이 없습니다.");
        return;
      }

      const result = await removePassagesFromCollection(
        collectionId,
        idsToRemove,
      );
      if (!result.success) {
        toast.error(result.error || "폴더에서 삭제하지 못했습니다.");
        return;
      }

      const undoFolderRemove = async () => {
        setPassageBulkAction("remove");
        try {
          const undoResult = await addPassagesToCollection(
            collectionId,
            idsToRemove,
          );
          if (!undoResult.success) {
            toast.error(
              undoResult.error || "폴더 삭제를 실행 취소하지 못했습니다.",
            );
            return;
          }
          await loadPassages();
          toast.success("폴더 삭제를 실행 취소했습니다.");
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "폴더 삭제를 실행 취소하지 못했습니다.",
          );
        } finally {
          setPassageBulkAction(null);
        }
      };

      toast.success(`${idsToRemove.length}개 지문을 폴더에서 삭제했습니다.`, {
        duration: UNDO_TOAST_DURATION,
        action: {
          label: "실행 취소",
          onClick: () => void undoFolderRemove(),
        },
      });
      setSelectedIds(new Set());
      await loadPassages();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "폴더에서 삭제하지 못했습니다.",
      );
    } finally {
      setPassageBulkAction(null);
    }
  }, [
    loadPassages,
    passageBulkAction,
    passages,
    selectedCollectionId,
    selectedIds,
  ]);

  const handleDeleteSelectedPassages = useCallback(async () => {
    const ids = [...selectedIds].filter((id) => !isDraftPseudoId(id));
    if (ids.length === 0 || passageBulkAction) return;
    if (!window.confirm(`${ids.length}개 지문을 삭제하시겠습니까?`)) return;

    setPassageBulkAction("delete");
    try {
      const result = await bulkDeleteWorkbenchPassages(ids);
      if (!result.success) {
        toast.error(result.error || "삭제에 실패했습니다.");
        return;
      }
      if (result.deleted === 0) {
        toast.error("삭제된 지문이 없습니다.");
      } else if (result.deleted === result.requested) {
        toast.success(`${result.deleted}개 지문을 삭제했습니다.`);
      } else {
        toast.warning(
          `${result.deleted}개 삭제됨, ${result.requested - result.deleted}개 누락`,
        );
      }

      setPassages((prev) =>
        prev.filter((passage) => !ids.includes(passage.id)),
      );
      setSelectedIds(new Set());
      if (selectedPassage && ids.includes(selectedPassage.id)) {
        setSelectedPassage(null);
        setAnalysisData(null);
      }
      await loadPassages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setPassageBulkAction(null);
    }
  }, [loadPassages, passageBulkAction, selectedIds, selectedPassage]);

  // 상세 모달에서 단일 지문 삭제 — 확인 후 삭제하고 목록·모달을 정리한다.
  const handleDeleteDetailPassage = useCallback(
    async (passage: PassageItem) => {
      if (deletingDetailId) return;
      if (!window.confirm("이 지문을 삭제하시겠습니까?")) return;

      setDeletingDetailId(passage.id);
      try {
        const result = await bulkDeleteWorkbenchPassages([passage.id]);
        if (!result.success || result.deleted === 0) {
          toast.error(result.error || "삭제에 실패했습니다.");
          return;
        }
        toast.success("지문이 삭제되었습니다.");
        setPassages((prev) => prev.filter((p) => p.id !== passage.id));
        setSelectedIds((prev) => {
          if (!prev.has(passage.id)) return prev;
          const next = new Set(prev);
          next.delete(passage.id);
          return next;
        });
        setDetailPassage(null);
        await loadPassages();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      } finally {
        setDeletingDetailId(null);
      }
    },
    [deletingDetailId, loadPassages],
  );

  return {
    patchPassages,
    passageBulkAction,
    deletingDetailId,
    handleCreatePassageCollection,
    handleRenamePassageCollection,
    handleRemovePassagesFromFolder,
    handleCopySelectedPassagesToCollection,
    handleMovePassagesToCollection,
    handleMoveSelectedPassagesToCollection,
    handleCopyPassagesToCollection,
    handleRemoveSelectedPassagesFromCollection,
    handleDeleteSelectedPassages,
    handleDeleteDetailPassage,
  };
}
