"use client";

import { useState, useMemo, useCallback } from "react";
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

  // ─── CRUD handlers ───

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const result = await actions.createCollection({
      name: newFolderName.trim(),
      parentId: activeFolder || undefined,
    });
    if (result.success) {
      setCollections((prev) => [
        ...prev,
        {
          id: result.id!,
          parentId: activeFolder,
          name: newFolderName.trim(),
          description: null,
          color: null,
          _count: { items: 0, children: 0 },
        },
      ]);
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success("폴더가 생성되었습니다.");
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
      const result = await actions.addToCollection(collectionId, ids);
      if (result.success) {
        setMembership((prev) => {
          const next = { ...prev };
          const existing = next[collectionId]
            ? new Set(next[collectionId])
            : new Set<string>();
          ids.forEach((id) => existing.add(id));
          next[collectionId] = existing;
          return next;
        });
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  _count: {
                    ...c._count,
                    items:
                      (membership[collectionId]?.size || 0) + ids.length,
                  },
                }
              : c,
          ),
        );
        toast.success(
          `${ids.length}개 ${itemLabel}이(가) 폴더에 추가되었습니다.`,
        );
        return true;
      }
      return false;
    },
    [actions, membership, itemLabel],
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
      itemId: string,
      folderId: string,
      copy: boolean,
      selectedIds: Set<string>,
    ) => {
      // If dragged item is part of selection, move ALL selected items
      const idsToMove = selectedIds.has(itemId)
        ? [...selectedIds]
        : [itemId];

      try {
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

          // Update local membership: remove from all others, add to target
          setMembership((prev) => {
            const next: Record<string, Set<string>> = {};
            for (const [colId, ids] of Object.entries(prev)) {
              if (colId === folderId) {
                next[colId] = new Set(ids);
                idsToMove.forEach((id) => next[colId].add(id));
              } else {
                const updated = new Set(ids);
                idsToMove.forEach((id) => updated.delete(id));
                next[colId] = updated;
              }
            }
            if (!next[folderId]) next[folderId] = new Set(idsToMove);
            return next;
          });
        } else {
          // Copy: just add to target
          setMembership((prev) => {
            const next = { ...prev };
            const existing = next[folderId]
              ? new Set(next[folderId])
              : new Set<string>();
            idsToMove.forEach((id) => existing.add(id));
            next[folderId] = existing;
            return next;
          });
        }

        await actions.addToCollection(folderId, idsToMove);

        const folderName =
          collections.find((c) => c.id === folderId)?.name || "폴더";
        const countLabel =
          idsToMove.length > 1
            ? `${idsToMove.length}개 ${itemLabel}이(가)`
            : `${itemLabel}이(가)`;
        toast.success(
          copy
            ? `${countLabel} "${folderName}"에 복사되었습니다`
            : `${countLabel} "${folderName}"(으)로 이동되었습니다`,
        );

        // Update collection counts
        setCollections((prev) =>
          prev.map((c) => {
            const newCount = membership[c.id]?.size || 0;
            return {
              ...c,
              _count: {
                ...c._count,
                items:
                  c.id === folderId
                    ? newCount + idsToMove.length
                    : newCount,
              },
            };
          }),
        );

        return true;
      } catch {
        toast.error("폴더 작업 중 오류가 발생했습니다.");
        return false;
      }
    },
    [membership, collections, actions, itemLabel],
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
