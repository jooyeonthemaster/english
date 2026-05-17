"use client";

import { useState, useEffect } from "react";
import { getPassageCollections } from "@/actions/workbench";
import type { PassageCollection } from "./types";

interface UseCollectionsStateArgs {
  initialCollections?: PassageCollection[];
  filterCollection: string;
}

/**
 * Groups the 9 contiguous collection-related useState calls and the 2
 * contiguous useEffects that immediately follow them in the original file.
 * Called at the same hook slot as the original first useState so the overall
 * hook call order is preserved.
 */
export function useCollectionsState({ initialCollections, filterCollection }: UseCollectionsStateArgs) {
  const [collections, setCollections] = useState<PassageCollection[]>(initialCollections || []);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showAddToFolder, setShowAddToFolder] = useState(false);
  const [addingToFolder, setAddingToFolder] = useState(false);
  // Cache of passageIds per collection for client-side filtering
  const [collectionPassageIds, setCollectionPassageIds] = useState<Map<string, Set<string>>>(new Map());
  const [loadingCollection, setLoadingCollection] = useState(false);

  // Load collections on mount if not provided
  useEffect(() => {
    if (!initialCollections) {
      getPassageCollections("").then((c) => setCollections(c as PassageCollection[])).catch(() => {});
    }
  }, [initialCollections]);

  // Fetch collection's passage IDs when a folder is selected
  useEffect(() => {
    if (!filterCollection) return;
    if (collectionPassageIds.has(filterCollection)) return; // already cached
    setLoadingCollection(true);
    import("@/actions/workbench").then(({ getPassageCollectionItems }) =>
      getPassageCollectionItems(filterCollection).then((passages) => {
        const ids = new Set(passages.map((p: { id: string }) => p.id));
        setCollectionPassageIds((prev) => new Map(prev).set(filterCollection, ids));
        setLoadingCollection(false);
      })
    ).catch(() => setLoadingCollection(false));
  }, [filterCollection, collectionPassageIds]);

  return {
    collections, setCollections,
    showNewFolder, setShowNewFolder,
    newFolderName, setNewFolderName,
    editingFolderId, setEditingFolderId,
    editingFolderName, setEditingFolderName,
    showAddToFolder, setShowAddToFolder,
    addingToFolder, setAddingToFolder,
    collectionPassageIds, setCollectionPassageIds,
    loadingCollection,
  };
}
