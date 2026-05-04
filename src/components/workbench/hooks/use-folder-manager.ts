// @ts-nocheck
"use client";
import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CollectionItem, CollectionActions } from "../shared/types";

interface UseFolderManagerOptions {
  initialCollections: CollectionItem[];
  initialMembership: Record<string, Set<string>>;
  actions: CollectionActions;
  entityLabel: string; // "문제" | "지문"
}

export function useFolderManager({
  initialCollections,
  initialMembership,
  actions,
  entityLabel,
}: UseFolderManagerOptions) {
  const router = useRouter();

  // ─── Core state ───
  const [collections, setCollections] = useState<CollectionItem[]>(initialCollections || []);
  const [membership, setMembership] = useState<Record<string, Set<string>>>(initialMembership || {});
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // ─── Derived: child folders of current active folder ───
  const childFolders = useMemo(() => {
    return collections.filter((c) => c.parentId === activeFolder);
  }, [collections, activeFolder]);

  // ─── Derived: breadcrumb path (walk up parentId chain) ───
  const breadcrumbPath = useMemo(() => {
    if (!activeFolder) return [];
    const path: CollectionItem[] = [];
    let current = collections.find((c) => c.id === activeFolder);
    while (current) {
      path.unshift(current);
      current = current.parentId ? collections.find((c) => c.id === current!.parentId) : undefined;
    }
    return path;
  }, [activeFolder, collections]);

  // ─── Filter items by active folder ───
  const filterByActiveFolder = useCallback(<T extends { id: string }>(items: T[]): T[] => {
    if (activeFolder === null) return items; // root = all
    if (activeFolder === "__uncategorized__") {
      const allMemberIds = new Set<string>();
      Object.values(membership).forEach((ids) => ids.forEach((id) => allMemberIds.add(id)));
      return items.filter((item) => !allMemberIds.has(item.id));
    }
    const ids = membership[activeFolder];
    if (!ids) return [];
    return items.filter((item) => ids.has(item.id));
  }, [activeFolder, membership]);

  // ─── CRUD: Create folder ───
  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const result = await actions.create({ name: newFolderName.trim(), parentId: activeFolder || undefined });
    if (result.success) {
      setCollections((prev) => [...prev, {
        id: result.id!,
        parentId: activeFolder,
        name: newFolderName.trim(),
        description: null,
        color: null,
        _count: { items: 0, children: 0 },
      }]);
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success("폴더가 생성되었습니다.");
    }
  }, [newFolderName, activeFolder, actions]);

  // ─── CRUD: Rename folder ───
  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return;
    await actions.update(id, { name: name.trim() });
    setCollections((prev) => prev.map((c) => c.id === id ? { ...c, name: name.trim() } : c));
  }, [actions]);

  // ─── CRUD: Delete folder ───
  const handleDeleteFolder = useCallback(async (id: string) => {
    if (!confirm(`이 폴더를 삭제하시겠습니까? (${entityLabel}은(는) 삭제되지 않습니다)`)) return;
    const result = await actions.delete(id);
    if (result.success) {
      setCollections((prev) => prev.filter((c) => c.id !== id));
      setMembership((prev) => { const next = { ...prev }; delete next[id]; return next; });
      if (activeFolder === id) setActiveFolder(null);
      toast.success("폴더가 삭제되었습니다.");
    }
  }, [actions, activeFolder, entityLabel]);

  // ─── Add items to folder ───
  const handleAddToFolder = useCallback(async (collectionId: string, itemIds: string[]) => {
    if (itemIds.length === 0) return;
    const result = await actions.addItems(collectionId, itemIds);
    if (result.success) {
      setMembership((prev) => {
        const next = { ...prev };
        const existing = next[collectionId] ? new Set(next[collectionId]) : new Set<string>();
        itemIds.forEach((id) => existing.add(id));
        next[collectionId] = existing;
        return next;
      });
      setCollections((prev) => prev.map((c) =>
        c.id === collectionId ? { ...c, _count: { ...c._count, items: (membership[collectionId]?.size || 0) + itemIds.length } } : c
      ));
      toast.success(`${itemIds.length}개 ${entityLabel}이(가) 폴더에 추가되었습니다.`);
    }
    return result;
  }, [actions, membership, entityLabel]);

  // ─── Remove items from folder ───
  const handleRemoveFromFolder = useCallback(async (itemIds: string[]) => {
    if (!activeFolder || itemIds.length === 0) return;
    const result = await actions.removeItems(activeFolder, itemIds);
    if (result.success) {
      setMembership((prev) => {
        const next = { ...prev };
        const existing = new Set(next[activeFolder!]);
        itemIds.forEach((id) => existing.delete(id));
        next[activeFolder!] = existing;
        return next;
      });
      toast.success(`${itemIds.length}개 ${entityLabel}이(가) 폴더에서 제거되었습니다.`);
    }
    return result;
  }, [actions, activeFolder, entityLabel]);

  // ─── Drag to folder (move by default, copy with shift) ───
  const handleDragToFolder = useCallback(async (itemId: string, folderId: string, copy: boolean, selectedIds: Set<string>) => {
    // If dragged item is part of selection, move ALL selected items
    const idsToMove = selectedIds.has(itemId) ? [...selectedIds] : [itemId];

    try {
      if (!copy) {
        // Remove from all current folders first
        const removePromises: Promise<any>[] = [];
        for (const [colId, ids] of Object.entries(membership)) {
          if (colId !== folderId) {
            const toRemove = idsToMove.filter((id) => ids.has(id));
            if (toRemove.length > 0) {
              removePromises.push(actions.removeItems(colId, toRemove));
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
          const existing = next[folderId] ? new Set(next[folderId]) : new Set<string>();
          idsToMove.forEach((id) => existing.add(id));
          next[folderId] = existing;
          return next;
        });
      }

      await actions.addItems(folderId, idsToMove);

      const folderName = collections.find((c) => c.id === folderId)?.name || "폴더";
      const countLabel = idsToMove.length > 1 ? `${idsToMove.length}개 ${entityLabel}가` : `${entityLabel}가`;
      toast.success(copy ? `${countLabel} "${folderName}"에 복사되었습니다` : `${countLabel} "${folderName}"(으)로 이동되었습니다`);

      // Update collection counts
      setCollections((prev) => prev.map((c) => {
        const newCount = membership[c.id]?.size || 0;
        return { ...c, _count: { ...c._count, items: c.id === folderId ? newCount + idsToMove.length : newCount } };
      }));

      return { success: true, movedIds: idsToMove };
    } catch {
      toast.error("폴더 작업 중 오류가 발생했습니다.");
      return { success: false, movedIds: [] };
    }
  }, [membership, collections, actions, entityLabel]);

  return {
    // State
    collections,
    membership,
    activeFolder,
    setActiveFolder,
    showNewFolder,
    setShowNewFolder,
    newFolderName,
    setNewFolderName,

    // Derived
    childFolders,
    breadcrumbPath,

    // Methods
    filterByActiveFolder,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleAddToFolder,
    handleRemoveFromFolder,
    handleDragToFolder,
  };
}
