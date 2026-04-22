"use client";

import { toast } from "sonner";
import {
  createPassageCollection,
  updatePassageCollection,
  deletePassageCollection,
  addPassagesToCollection,
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
  setShowAddToFolder: (v: boolean) => void;
}

export async function handleAddToFolder({
  collectionId,
  selectedIds,
  setAddingToFolder,
  setCollections,
  setCollectionPassageIds,
  clearSelection,
  setShowAddToFolder,
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
    setShowAddToFolder(false);
  } else {
    toast.error(result.error || "추가 실패");
  }
  setAddingToFolder(false);
}
