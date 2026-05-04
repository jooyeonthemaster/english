"use client";

import { useState, useCallback } from "react";

/**
 * Hook for managing multi-select state over a list of items.
 *
 * @param getDisplayedIds - Callback that returns the currently displayed item IDs
 *                          (needed for shift-select range and selectAll).
 */
export function useSelection(getDisplayedIds: () => string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  /** Toggle selection for a single item. Supports shift-click range selection. */
  const toggleSelect = useCallback(
    (id: string, shiftKey = false) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId) {
          const ids = getDisplayedIds();
          const a = ids.indexOf(lastSelectedId);
          const b = ids.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a < b ? [a, b] : [b, a];
            for (let i = lo; i <= hi; i++) next.add(ids[i]);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
      setLastSelectedId(id);
    },
    [lastSelectedId, getDisplayedIds],
  );

  /** Toggle between select-all and deselect-all. */
  const selectAll = useCallback(() => {
    const ids = getDisplayedIds();
    setSelectedIds((prev) =>
      prev.size === ids.length ? new Set() : new Set(ids),
    );
  }, [getDisplayedIds]);

  /** Clear the entire selection. */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    setSelectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
  };
}
