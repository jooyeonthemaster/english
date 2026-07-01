"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { CollectionItem } from "@/components/workbench/shared/types";

// ---------------------------------------------------------------------------
// Types for the server-action functions the hook delegates to
// ---------------------------------------------------------------------------

interface FolderActions {
  createCollection: (data: {
    name: string;
    parentId?: string;
  }) => Promise<{ success: boolean; id?: string }>;
  updateCollection: (
    id: string,
    data: { name: string },
  ) => Promise<{ success?: boolean }>;
  deleteCollection: (id: string) => Promise<{ success: boolean }>;
  addToCollection: (
    collectionId: string,
    itemIds: string[],
  ) => Promise<{ success: boolean; addedIds?: string[] }>;
  removeFromCollection: (
    collectionId: string,
    itemIds: string[],
  ) => Promise<{ success: boolean; removedIds?: string[] }>;
}

interface UseFolderManagerOptions {
  initialCollections: CollectionItem[];
  initialMembership: Record<string, Set<string>>;
  actions: FolderActions;
  /** Label used in toast messages (e.g. "지문" or "문제") */
  itemLabel: string;
  /** questionId → setId 역참조. 있으면 폴더 카운트에서 세트 멤버를 "세트 1개"로 센다
   *  (일반 문제와 동일 시각 단위). 미지정(지문/추출 폴더 등)이면 raw 멤버 수로 폴백. */
  questionSetIdOf?: (itemId: string) => string | null | undefined;
}

const UNDO_TOAST_DURATION = 8000;

function cloneMembership(
  source: Record<string, Set<string>>,
): Record<string, Set<string>> {
  const next: Record<string, Set<string>> = {};
  for (const [collectionId, ids] of Object.entries(source)) {
    next[collectionId] = new Set(ids);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFolderManager({
  initialCollections,
  initialMembership,
  actions,
  itemLabel,
  questionSetIdOf,
}: UseFolderManagerOptions) {
  // ─── State ───
  const [collections, setCollections] = useState<CollectionItem[]>(
    initialCollections || [],
  );
  const [membership, setMembership] = useState<Record<string, Set<string>>>(
    initialMembership || {},
  );
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const creatingFolderRef = useRef(false);

  // ─── Derived state ───

  /** Child folders of the current active folder. */
  const childFolders = useMemo(
    () => collections.filter((c) => c.parentId === activeFolder),
    [collections, activeFolder],
  );

  /** Breadcrumb path from root to the active folder. */
  const breadcrumbPath = useMemo(() => {
    if (!activeFolder) return [];
    const path: CollectionItem[] = [];
    let current = collections.find((c) => c.id === activeFolder);
    while (current) {
      path.unshift(current);
      current = current.parentId
        ? collections.find((c) => c.id === current!.parentId)
        : undefined;
    }
    return path;
  }, [activeFolder, collections]);

  /** Name of the currently active folder (or null at root). */
  const activeFolderName = activeFolder
    ? collections.find((c) => c.id === activeFolder)?.name || "폴더"
    : null;

  const filterByActiveFolder = useCallback(
    <T extends { id: string }>(items: T[]): T[] => {
      if (!activeFolder) return items;
      const ids = membership[activeFolder];
      if (!ids) return [];
      return items.filter((item) => ids.has(item.id));
    },
    [activeFolder, membership],
  );

  // 폴더 카운트 = 일반 문제(setId 없음) + 서로 다른 세트(distinct setId). questionSetIdOf 미지정 시
  // 기존처럼 raw 멤버 수(지문/추출 폴더 등 세트 개념이 없는 표면은 그대로).
  const countItems = useCallback(
    (ids: Set<string> | undefined): number => {
      if (!ids) return 0;
      if (!questionSetIdOf) return ids.size;
      let regular = 0;
      const sets = new Set<string>();
      for (const id of ids) {
        const setId = questionSetIdOf(id);
        if (setId) sets.add(setId);
        else regular += 1;
      }
      return regular + sets.size;
    },
    [questionSetIdOf],
  );

  const syncCollectionCounts = useCallback(
    (nextMembership: Record<string, Set<string>>) => {
      setCollections((prev) =>
        prev.map((c) => ({
          ...c,
          _count: {
            ...c._count,
            items: countItems(nextMembership[c.id]),
          },
        })),
      );
    },
    [countItems],
  );

  const applyMembershipSnapshot = useCallback(
    (nextMembership: Record<string, Set<string>>) => {
      setMembership(nextMembership);
      syncCollectionCounts(nextMembership);
    },
    [syncCollectionCounts],
  );

  // ─── CRUD handlers ───

  const handleCreateFolder = useCallback(async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName || creatingFolderRef.current) return false;
    creatingFolderRef.current = true;
    try {
      const result = await actions.createCollection({
        name: trimmedName,
        parentId: activeFolder || undefined,
      });
      if (result.success) {
        setCollections((prev) => [
          ...prev,
          {
            id: result.id!,
            parentId: activeFolder,
            name: trimmedName,
            description: null,
            color: null,
            createdAt: new Date().toISOString(),
            _count: { items: 0, children: 0 },
          },
        ]);
        setNewFolderName("");
        setShowNewFolder(false);
        toast.success("폴더가 생성되었습니다.");
      }
      return result.success;
    } finally {
      creatingFolderRef.current = false;
    }
  }, [newFolderName, activeFolder, actions]);

  const handleRenameFolder = useCallback(
    async (id: string, name: string) => {
      if (!name.trim()) return;
      await actions.updateCollection(id, { name: name.trim() });
      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)),
      );
    },
    [actions],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (
        !confirm(
          `이 폴더를 삭제하시겠습니까? (${itemLabel}은(는) 삭제되지 않습니다)`,
        )
      )
        return;
      const result = await actions.deleteCollection(id);
      if (result.success) {
        setCollections((prev) => prev.filter((c) => c.id !== id));
        setMembership((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (activeFolder === id) setActiveFolder(null);
        toast.success("폴더가 삭제되었습니다.");
      }
    },
    [actions, activeFolder, itemLabel],
  );

  // ─── Membership handlers ───

  const handleAddToFolder = useCallback(
    async (collectionId: string, selectedIds: Set<string>) => {
      if (selectedIds.size === 0) return;
      const ids = [...selectedIds];
      const existingIds = membership[collectionId] ?? new Set<string>();
      const idsToAdd = ids.filter((id) => !existingIds.has(id));
      if (idsToAdd.length === 0) {
        toast.info("이미 이 폴더에 들어있는 자료입니다.");
        return false;
      }

      const result = await actions.addToCollection(collectionId, idsToAdd);
      if (result.success) {
        // Trust the server's report of what was ACTUALLY inserted so the
        // folder count never drifts from the DB (the client's idsToAdd guess
        // can be stale if another tab already added some of them).
        const addedIds = result.addedIds ?? idsToAdd;
        if (addedIds.length === 0) {
          toast.info("이미 이 폴더에 들어있는 자료입니다.");
          return false;
        }
        const nextMembership = { ...membership };
        const existing = nextMembership[collectionId]
          ? new Set(nextMembership[collectionId])
          : new Set<string>();
        addedIds.forEach((id) => existing.add(id));
        nextMembership[collectionId] = existing;
        applyMembershipSnapshot(nextMembership);

        const undoAddToFolder = async () => {
          const undoResult = await actions.removeFromCollection(
            collectionId,
            addedIds,
          );
          if (!undoResult.success) {
            toast.error("폴더 추가를 실행 취소하지 못했습니다.");
            return;
          }
          const revertedMembership = cloneMembership(nextMembership);
          const reverted = new Set(revertedMembership[collectionId] ?? []);
          addedIds.forEach((id) => reverted.delete(id));
          revertedMembership[collectionId] = reverted;
          applyMembershipSnapshot(revertedMembership);
          toast.success("폴더 추가를 실행 취소했습니다.");
        };

        toast.success(
          `${addedIds.length}개 ${itemLabel}이(가) 폴더에 추가되었습니다.`,
          {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () => void undoAddToFolder(),
            },
          },
        );
        return true;
      }
      return false;
    },
    [actions, membership, itemLabel, applyMembershipSnapshot],
  );

  const handleRemoveFromFolder = useCallback(
    async (selectedIds: Set<string>) => {
      if (!activeFolder || selectedIds.size === 0) return false;
      const folderId = activeFolder;
      const ids = [...selectedIds];
      const existingIds = membership[folderId] ?? new Set<string>();
      const result = await actions.removeFromCollection(folderId, ids);
      if (result.success) {
        // Reconcile against what the server actually removed so the folder
        // count matches the DB (items not in this folder are never counted).
        const idsToRemove =
          result.removedIds ?? ids.filter((id) => existingIds.has(id));
        const nextMembership = cloneMembership(membership);
        const existing = new Set(nextMembership[folderId] ?? []);
        idsToRemove.forEach((id) => existing.delete(id));
        nextMembership[folderId] = existing;
        applyMembershipSnapshot(nextMembership);

        const undoRemoveFromFolder = async () => {
          if (idsToRemove.length === 0) return;
          const undoResult = await actions.addToCollection(
            folderId,
            idsToRemove,
          );
          if (!undoResult.success) {
            toast.error("폴더 제거를 실행 취소하지 못했습니다.");
            return;
          }
          const revertedMembership = cloneMembership(nextMembership);
          const reverted = new Set(revertedMembership[folderId] ?? []);
          idsToRemove.forEach((id) => reverted.add(id));
          revertedMembership[folderId] = reverted;
          applyMembershipSnapshot(revertedMembership);
          toast.success("폴더 제거를 실행 취소했습니다.");
        };

        toast.success(
          `${idsToRemove.length}개 ${itemLabel}이(가) 폴더에서 제거되었습니다.`,
          idsToRemove.length > 0
            ? {
                duration: UNDO_TOAST_DURATION,
                action: {
                  label: "실행 취소",
                  onClick: () => void undoRemoveFromFolder(),
                },
              }
            : undefined,
        );
        return true;
      }
      return false;
    },
    [actions, activeFolder, membership, itemLabel, applyMembershipSnapshot],
  );

  // ─── Drag to folder handler ───

  const handleDragToFolder = useCallback(
    async (
      itemId: string | string[],
      folderId: string,
      copy: boolean,
      selectedIds: Set<string>,
    ) => {
      // If dragged item is part of selection, move ALL selected items
      const draggedIds = Array.isArray(itemId) ? itemId : [itemId];
      const shouldUseSelection = draggedIds.some((id) => selectedIds.has(id));
      const idsToMove = shouldUseSelection
        ? [...selectedIds]
        : Array.from(new Set(draggedIds));
      if (idsToMove.length === 0) return false;

      const targetExisting = membership[folderId] ?? new Set<string>();
      const idsToAdd = idsToMove.filter((id) => !targetExisting.has(id));
      const hasFolderChanges =
        idsToAdd.length > 0 ||
        (!copy &&
          Object.entries(membership).some(
            ([colId, ids]) =>
              colId !== folderId && idsToMove.some((id) => ids.has(id)),
          ));

      if (!hasFolderChanges) {
        toast.info("이미 이 폴더에 들어있는 자료입니다.");
        return false;
      }

      try {
        const previousMembership = cloneMembership(membership);

        // Remove from every other folder (move only), capturing what the
        // server ACTUALLY removed per folder so the snapshot matches the DB.
        const removedByCol: Record<string, string[]> = {};
        if (!copy) {
          const removeOps: { colId: string; toRemove: string[] }[] = [];
          for (const [colId, ids] of Object.entries(membership)) {
            if (colId !== folderId) {
              const toRemove = idsToMove.filter((id) => ids.has(id));
              if (toRemove.length > 0) removeOps.push({ colId, toRemove });
            }
          }
          const removeResults = await Promise.all(
            removeOps.map((op) =>
              actions.removeFromCollection(op.colId, op.toRemove),
            ),
          );
          removeOps.forEach((op, i) => {
            const r = removeResults[i];
            removedByCol[op.colId] = r?.success
              ? (r.removedIds ?? op.toRemove)
              : [];
          });
        }

        // Add to the target folder, using the server's real insert list.
        let addedIds: string[] = [];
        if (idsToAdd.length > 0) {
          const addResult = await actions.addToCollection(folderId, idsToAdd);
          addedIds = addResult.success ? (addResult.addedIds ?? idsToAdd) : [];
        }

        // Build the next snapshot from the actual server deltas so every
        // folder badge (and the optimistic grid mask) matches the DB exactly.
        const nextMembership = cloneMembership(membership);
        for (const [colId, removed] of Object.entries(removedByCol)) {
          const set = new Set(nextMembership[colId] ?? []);
          removed.forEach((id) => set.delete(id));
          nextMembership[colId] = set;
        }
        const targetNext = new Set(nextMembership[folderId] ?? []);
        addedIds.forEach((id) => targetNext.add(id));
        nextMembership[folderId] = targetNext;
        applyMembershipSnapshot(nextMembership);

        const folderName =
          collections.find((c) => c.id === folderId)?.name || "폴더";
        // Count distinct items whose membership actually changed (added to the
        // target and/or removed from a source) so the toast matches reality.
        const changedIds = new Set<string>(addedIds);
        if (!copy) {
          for (const removed of Object.values(removedByCol)) {
            removed.forEach((id) => changedIds.add(id));
          }
        }
        const toastCount = changedIds.size;
        if (toastCount === 0) {
          toast.info("이미 이 폴더에 들어있는 자료입니다.");
          return false;
        }
        const countLabel =
          toastCount > 1
            ? `${toastCount}개 ${itemLabel}이(가)`
            : `${itemLabel}이(가)`;

        const undoFolderMove = async () => {
          try {
            const folderIds = new Set([
              ...Object.keys(previousMembership),
              ...Object.keys(nextMembership),
            ]);
            const undoPromises: Promise<unknown>[] = [];
            for (const colId of folderIds) {
              const before = previousMembership[colId] ?? new Set<string>();
              const after = nextMembership[colId] ?? new Set<string>();
              const toRemove = [...after].filter((id) => !before.has(id));
              const toAdd = [...before].filter((id) => !after.has(id));
              if (toRemove.length > 0) {
                undoPromises.push(
                  actions.removeFromCollection(colId, toRemove),
                );
              }
              if (toAdd.length > 0) {
                undoPromises.push(actions.addToCollection(colId, toAdd));
              }
            }
            await Promise.all(undoPromises);
            applyMembershipSnapshot(previousMembership);
            toast.success(
              copy
                ? "폴더 복사를 실행 취소했습니다."
                : "폴더 이동을 실행 취소했습니다.",
            );
          } catch {
            toast.error("폴더 작업을 실행 취소하지 못했습니다.");
          }
        };

        toast.success(
          copy
            ? `${countLabel} "${folderName}"에 복사되었습니다`
            : `${countLabel} "${folderName}"(으)로 이동되었습니다`,
          {
            duration: UNDO_TOAST_DURATION,
            action: {
              label: "실행 취소",
              onClick: () => void undoFolderMove(),
            },
          },
        );

        return true;
      } catch {
        toast.error("폴더 작업 중 오류가 발생했습니다.");
        return false;
      }
    },
    [membership, collections, actions, itemLabel, applyMembershipSnapshot],
  );

  // ─── Navigation ───

  /** Navigate into a folder. */
  const navigateToFolder = useCallback((folderId: string | null) => {
    setActiveFolder(folderId);
  }, []);

  /** Go back to parent folder. */
  const navigateUp = useCallback(() => {
    if (!activeFolder) return;
    const currentFolder = collections.find((c) => c.id === activeFolder);
    setActiveFolder(currentFolder?.parentId || null);
  }, [activeFolder, collections]);

  return {
    // State
    collections,
    membership,
    activeFolder,
    showNewFolder,
    newFolderName,

    // Setters
    setCollections,
    setMembership,
    setActiveFolder,
    setShowNewFolder,
    setNewFolderName,

    // Derived
    childFolders,
    breadcrumbPath,
    activeFolderName,
    filterByActiveFolder,

    // Actions
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleAddToFolder,
    handleRemoveFromFolder,
    handleDragToFolder,
    navigateToFolder,
    navigateUp,
  };
}
