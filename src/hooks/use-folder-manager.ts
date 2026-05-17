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
  deleteCollection: (
    id: string,
  ) => Promise<{ success: boolean }>;
  addToCollection: (
    collectionId: string,
    itemIds: string[],
  ) => Promise<{ success: boolean }>;
  removeFromCollection: (
    collectionId: string,
    itemIds: string[],
  ) => Promise<{ success: boolean }>;
}

interface UseFolderManagerOptions {
  initialCollections: CollectionItem[];
  initialMembership: Record<string, Set<string>>;
  actions: FolderActions;
  /** Label used in toast messages (e.g. "지문" or "문제") */
  itemLabel: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFolderManager({
  initialCollections,
  initialMembership,
  actions,
  itemLabel,
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
        prev.map((c) =>
          c.id === id ? { ...c, name: name.trim() } : c,
        ),
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
        const nextMembership = { ...membership };
        const existing = nextMembership[collectionId]
          ? new Set(nextMembership[collectionId])
          : new Set<string>();
        idsToAdd.forEach((id) => existing.add(id));
        nextMembership[collectionId] = existing;
        setMembership(nextMembership);
        syncCollectionCounts(nextMembership);
        toast.success(
          `${idsToAdd.length}개 ${itemLabel}이(가) 폴더에 추가되었습니다.`,
        );
        return true;
      }
      return false;
    },
    [actions, membership, itemLabel, syncCollectionCounts],
  );

  const handleRemoveFromFolder = useCallback(
    async (selectedIds: Set<string>) => {
      if (!activeFolder || selectedIds.size === 0) return false;
      const ids = [...selectedIds];
      const result = await actions.removeFromCollection(activeFolder, ids);
      if (result.success) {
        setMembership((prev) => {
          const next = { ...prev };
          const existing = new Set(next[activeFolder!]);
          ids.forEach((id) => existing.delete(id));
          next[activeFolder!] = existing;
          return next;
        });
        toast.success(
          `${ids.length}개 ${itemLabel}이(가) 폴더에서 제거되었습니다.`,
        );
        return true;
      }
      return false;
    },
    [actions, activeFolder, itemLabel],
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
            ([colId, ids]) => colId !== folderId && idsToMove.some((id) => ids.has(id)),
          ));

      if (!hasFolderChanges) {
        toast.info("이미 이 폴더에 들어있는 자료입니다.");
        return false;
      }

      try {
        const nextMembership: Record<string, Set<string>> = {};
        for (const [colId, ids] of Object.entries(membership)) {
          const nextIds = new Set(ids);
          if (!copy && colId !== folderId) {
            idsToMove.forEach((id) => nextIds.delete(id));
          }
          nextMembership[colId] = nextIds;
        }
        const targetNext = nextMembership[folderId]
          ? new Set(nextMembership[folderId])
          : new Set<string>();
        (copy ? idsToAdd : idsToMove).forEach((id) => targetNext.add(id));
        nextMembership[folderId] = targetNext;

        if (!copy) {
          // Remove from all current folders first
          const removePromises: Promise<unknown>[] = [];
          for (const [colId, ids] of Object.entries(membership)) {
            if (colId !== folderId) {
              const toRemove = idsToMove.filter((id) => ids.has(id));
              if (toRemove.length > 0) {
                removePromises.push(
                  actions.removeFromCollection(colId, toRemove),
                );
              }
            }
          }
          await Promise.all(removePromises);
        }

        if (idsToAdd.length > 0) {
          await actions.addToCollection(folderId, idsToAdd);
        }

        setMembership(nextMembership);
        syncCollectionCounts(nextMembership);

        const folderName =
          collections.find((c) => c.id === folderId)?.name || "폴더";
        const toastCount = copy ? idsToAdd.length : idsToMove.length;
        const countLabel =
          toastCount > 1
            ? `${toastCount}개 ${itemLabel}이(가)`
            : `${itemLabel}이(가)`;
        toast.success(
          copy
            ? `${countLabel} "${folderName}"에 복사되었습니다`
            : `${countLabel} "${folderName}"(으)로 이동되었습니다`,
        );

        return true;
      } catch {
        toast.error("폴더 작업 중 오류가 발생했습니다.");
        return false;
      }
    },
    [membership, collections, actions, itemLabel, syncCollectionCounts],
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
