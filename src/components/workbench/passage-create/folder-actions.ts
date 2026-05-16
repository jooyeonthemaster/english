"use client";

import { toast } from "sonner";
import {
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
  removePassagesFromCollection,
} from "@/actions/workbench";
import type { PassageCollection } from "./types";

interface CreateFolderArgs {
  newFolderName: string;
  setCollections: React.Dispatch<React.SetStateAction<PassageCollection[]>>;
  setNewFolderName: (v: string) => void;
  setShowNewFolder: (v: boolean) => void;
}

export async function handleCreateFolder({
  newFolderName,
  setCollections,
  setNewFolderName,
  setShowNewFolder,
}: CreateFolderArgs) {
  if (!newFolderName.trim()) return;
  const result = await createPassageCollection({ name: newFolderName.trim() });
  if (result.success) {
    setCollections((prev) => [{ id: result.id!, name: newFolderName.trim(), description: null, color: null, _count: { items: 0 } }, ...prev]);
    setNewFolderName("");
    setShowNewFolder(false);
    toast.success("폴더가 생성되었습니다.");
  } else {
    toast.error(result.error || "폴더 생성 실패");
  }
}

interface RenameFolderArgs {
  id: string;
  editingFolderName: string;
  setCollections: React.Dispatch<React.SetStateAction<PassageCollection[]>>;
  setEditingFolderId: (v: string | null) => void;
}

export async function handleRenameFolder({
  id,
  editingFolderName,
  setCollections,
  setEditingFolderId,
}: RenameFolderArgs) {
  if (!editingFolderName.trim()) return;
  const result = await updatePassageCollection(id, { name: editingFolderName.trim() });
  if (result.success) {
    setCollections((prev) => prev.map((c) => c.id === id ? { ...c, name: editingFolderName.trim() } : c));
    setEditingFolderId(null);
    toast.success("폴더 이름이 변경되었습니다.");
  }
}

interface DeleteFolderArgs {
  id: string;
  filterCollection: string;
  setCollections: React.Dispatch<React.SetStateAction<PassageCollection[]>>;
  setFilterCollection: (v: string) => void;
}

export async function handleDeleteFolder({
  id,
  filterCollection,
  setCollections,
  setFilterCollection,
}: DeleteFolderArgs) {
  if (!confirm("이 폴더를 삭제하시겠습니까? (지문은 삭제되지 않습니다)")) return;
  const result = await deletePassageCollection(id);
  if (result.success) {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (filterCollection === id) setFilterCollection("");
    toast.success("폴더가 삭제되었습니다.");
  }
}

interface AddToFolderArgs {
  collectionId: string;
  selectedIds: Set<string>;
  setAddingToFolder: (v: boolean) => void;
  setCollections: React.Dispatch<React.SetStateAction<PassageCollection[]>>;
  setCollectionPassageIds: React.Dispatch<React.SetStateAction<Map<string, Set<string>>>>;
  clearSelection: () => void;
}

export async function handleAddToFolder({
  collectionId,
  selectedIds,
  setAddingToFolder,
  setCollections,
  setCollectionPassageIds,
  clearSelection,
}: AddToFolderArgs) {
  if (selectedIds.size === 0) return;
  setAddingToFolder(true);
  const result = await addPassagesToCollection(collectionId, [...selectedIds]);
  if (result.success) {
    setCollections((prev) => prev.map((c) =>
      c.id === collectionId ? { ...c, _count: { items: c._count.items + selectedIds.size } } : c
    ));
    // Invalidate cached IDs for this collection so next filter refetches
    setCollectionPassageIds((prev) => { const next = new Map(prev); next.delete(collectionId); return next; });
    toast.success(`${selectedIds.size}개 지문이 폴더에 추가되었습니다.`);
    clearSelection();
  } else {
    toast.error(result.error || "추가 실패");
  }
  setAddingToFolder(false);
}

interface MoveToFolderArgs {
  collectionId: string;
  selectedIds: Set<string>;
  collections: PassageCollection[];
  collectionPassageIds: Map<string, Set<string>>;
  setAddingToFolder: (v: boolean) => void;
  setCollections: React.Dispatch<React.SetStateAction<PassageCollection[]>>;
  setCollectionPassageIds: React.Dispatch<React.SetStateAction<Map<string, Set<string>>>>;
  clearSelection: () => void;
}

/**
 * Cut + paste semantics: removes the selected passages from any collection
 * we know they're currently in (via the cached membership map), then adds
 * them to the target. `removePassagesFromCollection` is idempotent so we
 * can safely fire it for every cached collection without worrying about
 * partial membership data.
 */
export async function handleMoveToFolder({
  collectionId,
  selectedIds,
  collections,
  collectionPassageIds,
  setAddingToFolder,
  setCollections,
  setCollectionPassageIds,
  clearSelection,
}: MoveToFolderArgs) {
  if (selectedIds.size === 0) return;
  setAddingToFolder(true);

  const ids = [...selectedIds];
  const idSet = new Set(ids);
  const sourceCollectionIds: string[] = [];
  for (const [colId, memberIds] of collectionPassageIds.entries()) {
    if (colId === collectionId) continue;
    const hasAny = ids.some((id) => memberIds.has(id));
    if (hasAny) sourceCollectionIds.push(colId);
  }

  try {
    await Promise.all(
      sourceCollectionIds.map((colId) => removePassagesFromCollection(colId, ids)),
    );
    const result = await addPassagesToCollection(collectionId, ids);
    if (!result.success) {
      throw new Error(result.error || "이동 실패");
    }

    // Update counts: subtract from each source, add to target.
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id === collectionId) {
          return { ...c, _count: { items: c._count.items + ids.length } };
        }
        if (sourceCollectionIds.includes(c.id)) {
          const sourceSet = collectionPassageIds.get(c.id);
          const overlap = sourceSet
            ? ids.filter((id) => sourceSet.has(id)).length
            : 0;
          return {
            ...c,
            _count: { items: Math.max(0, c._count.items - overlap) },
          };
        }
        return c;
      }),
    );

    // Invalidate cached membership for affected collections so the next
    // filter refetches authoritative IDs.
    setCollectionPassageIds((prev) => {
      const next = new Map(prev);
      next.delete(collectionId);
      sourceCollectionIds.forEach((id) => next.delete(id));
      return next;
    });

    const sourceCount = sourceCollectionIds.length;
    toast.success(
      sourceCount > 0
        ? `${ids.length}개 지문을 폴더로 이동했습니다 (이전 폴더에서 제거됨).`
        : `${ids.length}개 지문이 폴더에 추가되었습니다.`,
    );
    clearSelection();
    void collections;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "이동 실패");
  } finally {
    setAddingToFolder(false);
  }
}
