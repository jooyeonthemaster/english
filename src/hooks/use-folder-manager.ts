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
  /**
   * 폴더 배지를 하위 폴더까지 합산한 누적(중복 제거) 수치로 노출할지. 켜면
   * 노출되는 collections/childFolders 각각에 totalItems가 채워진다. 지문/시험지
   * 처럼 별도 카운트 구조를 쓰는 화면은 끈 채로 둔다(직속 수치만 사용).
   */
  cumulativeCounts?: boolean;
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
  cumulativeCounts = false,
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

  /**
   * 폴더별 하위 폴더 누적치. total = 카드 장수(중복 포함, 사용자가 트리를 훑을 때
   * 실제로 보는 수), duplicates = 같은 아이템이 여러 폴더에 복사돼 생긴 중복 건수
   * (total - 고유수). 다대다 멤버십이라 단순 합산(total)과 고유수(distinct)가 다르다.
   * membership이 바뀌면(드래그 이동 등) 자동 재계산돼 배지가 실시간 반영된다.
   */
  const cumulativeById = useMemo(() => {
    if (!cumulativeCounts) return null;
    const childrenOf = new Map<string, string[]>();
    for (const c of collections) {
      if (!c.parentId) continue;
      const siblings = childrenOf.get(c.parentId);
      if (siblings) siblings.push(c.id);
      else childrenOf.set(c.parentId, [c.id]);
    }
    const result: Record<
      string,
      { total: number; duplicates: number; childCount: number }
    > = {};
    for (const root of collections) {
      const seenItems = new Set<string>();
      const visited = new Set<string>();
      let raw = 0; // 폴더별 직속 수의 단순 합(= 카드 장수)
      const stack = [root.id];
      while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id)) continue; // cycle/diamond 가드
        visited.add(id);
        const members = membership[id];
        if (members) {
          raw += members.size;
          for (const item of members) seenItems.add(item);
        }
        const kids = childrenOf.get(id);
        if (kids) for (const k of kids) stack.push(k);
      }
      result[root.id] = {
        total: raw,
        duplicates: raw - seenItems.size,
        childCount: (childrenOf.get(root.id) ?? []).length,
      };
    }
    return result;
  }, [cumulativeCounts, collections, membership]);

  /**
   * 노출용 컬렉션: 누적 모드일 때 totalItems·duplicateCount를 덧붙이고,
   * _count.children을 라이브 트리 기준으로 덮어쓴다. 서버 _count.children은
   * fetch 시점 값이라 세션 중 하위 폴더를 새로 만들면 stale → 누적 배지가 안
   * 켜지는 버그를 막는다(배지 ON 판정은 _count.children에 의존).
   */
  const exposedCollections = useMemo(() => {
    if (!cumulativeById) return collections;
    return collections.map((c) => {
      const agg = cumulativeById[c.id];
      return agg
        ? {
            ...c,
            totalItems: agg.total,
            duplicateCount: agg.duplicates,
            _count: { ...c._count, children: agg.childCount },
          }
        : c;
    });
  }, [collections, cumulativeById]);

  /** Child folders of the current active folder. */
  const childFolders = useMemo(
    () => exposedCollections.filter((c) => c.parentId === activeFolder),
    [exposedCollections, activeFolder],
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

  const syncCollectionCounts = useCallback(
    (nextMembership: Record<string, Set<string>>) => {
      setCollections((prev) =>
        prev.map((c) => ({
          ...c,
          _count: {
            ...c._count,
            items: nextMembership[c.id]?.size ?? 0,
          },
        })),
      );
    },
    [],
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

        // 끌어온/선택한 것 중 이미 폴더에 있어 추가하지 않은(중복 제외) 개수.
        const skippedCount = ids.length - addedIds.length;
        const skippedSuffix =
          skippedCount > 0 ? ` (이미 들어있던 ${skippedCount}개 제외)` : "";
        toast.success(
          `${addedIds.length}개 ${itemLabel}이(가) 폴더에 추가되었습니다.${skippedSuffix}`,
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
      /** Move only: source folders to KEEP the item in (skip removal). */
      keepFolderIds: string[] = [],
    ) => {
      // If dragged item is part of selection, move ALL selected items
      const draggedIds = Array.isArray(itemId) ? itemId : [itemId];
      const shouldUseSelection = draggedIds.some((id) => selectedIds.has(id));
      const idsToMove = shouldUseSelection
        ? [...selectedIds]
        : Array.from(new Set(draggedIds));
      if (idsToMove.length === 0) return false;

      const keepSet = new Set(keepFolderIds);
      const targetExisting = membership[folderId] ?? new Set<string>();
      const idsToAdd = idsToMove.filter((id) => !targetExisting.has(id));

      // 이동(move)은 "지금 보고 있는 폴더"(activeFolder)에서만 항목을 빼고 대상
      // 폴더로 옮긴다. 같은 항목이 다른 폴더(예: 형제 하위폴더)에 복사돼 있어도
      // 그 사본은 건드리지 않는다. 루트(activeFolder=null)에선 빼낼 현재 폴더가
      // 없으므로 추가만 한다.
      const sourceFolder =
        !copy &&
        activeFolder &&
        activeFolder !== folderId &&
        !keepSet.has(activeFolder)
          ? activeFolder
          : null;
      const sourceToRemove = sourceFolder
        ? idsToMove.filter((id) => membership[sourceFolder]?.has(id))
        : [];

      const hasFolderChanges = idsToAdd.length > 0 || sourceToRemove.length > 0;

      if (!hasFolderChanges) {
        toast.info("이미 이 폴더에 들어있는 자료입니다.");
        return false;
      }

      try {
        const previousMembership = cloneMembership(membership);

        // 이동: 지금 보고 있는 폴더에서만 제거(서버가 실제로 지운 목록을 받아
        // 스냅샷이 DB와 정확히 일치하게 한다). 다른 폴더의 사본은 그대로 둔다.
        const removedByCol: Record<string, string[]> = {};
        if (sourceFolder && sourceToRemove.length > 0) {
          const r = await actions.removeFromCollection(
            sourceFolder,
            sourceToRemove,
          );
          removedByCol[sourceFolder] = r?.success
            ? (r.removedIds ?? sourceToRemove)
            : [];
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
        // 끌어온 것 중 이미 대상 폴더에 들어있어 새로 추가하지 않은(중복 제외) 개수.
        // 예: 421개를 끌었는데 41개가 이미 폴더에 있었다면 "이미 들어있던 41개 제외".
        const skippedCount = idsToMove.length - idsToAdd.length;
        const skippedSuffix =
          skippedCount > 0 ? ` · 이미 들어있던 ${skippedCount}개 제외` : "";

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
            ? `${countLabel} "${folderName}"에 복사되었습니다${skippedSuffix}`
            : `${countLabel} "${folderName}"(으)로 이동되었습니다${skippedSuffix}`,
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
    [
      membership,
      collections,
      actions,
      itemLabel,
      applyMembershipSnapshot,
      activeFolder,
    ],
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
    collections: exposedCollections,
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
