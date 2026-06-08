"use client";

import { useCallback, useState } from "react";
import type { M1PassageDraftWithJob } from "@/app/(director)/director/workbench/passages/import/_components/extraction-manage-client/types";
import {
  makeDraftBlock,
  makeEmptyBlock,
  type PassageBlock,
} from "./block-types";

/**
 * Manages the array of passage blocks shown in the center editor. Always keeps
 * at least one block so the editor never renders empty. Draft selection from
 * the left grid toggles a block in/out by its sourceDraftId.
 */
export function usePassageBlocks() {
  const [blocks, setBlocks] = useState<PassageBlock[]>(() => [makeEmptyBlock()]);

  const updateBlock = useCallback(
    (id: string, patch: Partial<PassageBlock>) => {
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      );
    },
    [],
  );

  const addEmptyBlock = useCallback(() => {
    setBlocks((prev) => [...prev, makeEmptyBlock()]);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      // Never leave the editor with zero blocks.
      return next.length > 0 ? next : [makeEmptyBlock()];
    });
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b)),
    );
  }, []);

  const setAllCollapsed = useCallback((collapsed: boolean) => {
    setBlocks((prev) => prev.map((b) => ({ ...b, collapsed })));
  }, []);

  /**
   * Toggle a draft as a block: if a block already came from this draft, remove
   * it; otherwise append it. If the only existing block is empty & untouched,
   * replace it instead of appending (so the first selection fills the starter
   * block rather than leaving a blank one above it).
   */
  const toggleDraftBlock = useCallback((draft: M1PassageDraftWithJob) => {
    setBlocks((prev) => {
      const existing = prev.find((b) => b.sourceDraftId === draft.id);
      if (existing) {
        const next = prev.filter((b) => b.id !== existing.id);
        return next.length > 0 ? next : [makeEmptyBlock()];
      }
      const block = makeDraftBlock(draft);
      const onlyEmptyStarter =
        prev.length === 1 &&
        prev[0].sourceDraftId === null &&
        prev[0].content.trim().length === 0 &&
        prev[0].title.trim().length === 0 &&
        prev[0].imageFile === null;
      return onlyEmptyStarter ? [block] : [...prev, block];
    });
  }, []);

  const reset = useCallback(() => {
    setBlocks([makeEmptyBlock()]);
  }, []);

  return {
    blocks,
    setBlocks,
    updateBlock,
    addEmptyBlock,
    removeBlock,
    toggleCollapse,
    setAllCollapsed,
    toggleDraftBlock,
    reset,
  };
}
