// @ts-nocheck
"use client";
import { useState, useCallback, useRef } from "react";

export function useSelection(itemIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastSelectedRef = useRef<string | null>(null);

  const toggleSelect = useCallback((id: string, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedRef.current) {
        // Range selection
        const lastIdx = itemIds.indexOf(lastSelectedRef.current);
        const currIdx = itemIds.indexOf(id);
        if (lastIdx !== -1 && currIdx !== -1) {
          const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
          for (let i = start; i <= end; i++) {
            next.add(itemIds[i]);
          }
          return next;
        }
      }
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      lastSelectedRef.current = id;
      return next;
    });
  }, [itemIds]);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === itemIds.length) return new Set();
      return new Set(itemIds);
    });
  }, [itemIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected: selectedIds.size === itemIds.length && itemIds.length > 0,
  };
}
