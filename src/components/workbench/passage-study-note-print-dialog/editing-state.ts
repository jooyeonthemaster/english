"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import type { PageCategory, StudyNoteBlock } from "./types";

export interface EditingState {
  categoriesEnabled: Record<PageCategory, boolean>;
  hiddenBlockIds: Set<string>;
  blockOrder: string[];
}

export type EditingAction =
  | { type: "reset"; blocks: StudyNoteBlock[] }
  | { type: "toggleCategory"; category: PageCategory }
  | { type: "toggleHidden"; blockId: string }
  | { type: "restoreAll" }
  | { type: "moveBlock"; sourceId: string; targetId: string; placement: "before" | "after" };

const ALL_CATEGORIES_ON: Record<PageCategory, boolean> = {
  summary: true,
  body: true,
  vocab: true,
  grammar: true,
  syntax: true,
  exam: true,
};

function initialState(blocks: StudyNoteBlock[]): EditingState {
  return {
    categoriesEnabled: { ...ALL_CATEGORIES_ON },
    hiddenBlockIds: new Set<string>(),
    blockOrder: blocks.map((b) => b.id),
  };
}

function reducer(state: EditingState, action: EditingAction): EditingState {
  switch (action.type) {
    case "reset":
      return initialState(action.blocks);
    case "toggleCategory":
      return {
        ...state,
        categoriesEnabled: {
          ...state.categoriesEnabled,
          [action.category]: !state.categoriesEnabled[action.category],
        },
      };
    case "toggleHidden": {
      const next = new Set(state.hiddenBlockIds);
      if (next.has(action.blockId)) next.delete(action.blockId);
      else next.add(action.blockId);
      return { ...state, hiddenBlockIds: next };
    }
    case "restoreAll":
      if (state.hiddenBlockIds.size === 0) return state;
      return { ...state, hiddenBlockIds: new Set<string>() };
    case "moveBlock": {
      const { sourceId, targetId, placement } = action;
      if (sourceId === targetId) return state;
      const filtered = state.blockOrder.filter((id) => id !== sourceId);
      const targetIndex = filtered.indexOf(targetId);
      if (targetIndex === -1) return state;
      const insertAt = placement === "before" ? targetIndex : targetIndex + 1;
      const next = [
        ...filtered.slice(0, insertAt),
        sourceId,
        ...filtered.slice(insertAt),
      ];
      return { ...state, blockOrder: next };
    }
    default:
      return state;
  }
}

export function useEditingState(blocks: StudyNoteBlock[]) {
  const [state, dispatch] = useReducer(reducer, blocks, initialState);

  const blocksKey = useMemo(() => blocks.map((b) => b.id).join("|"), [blocks]);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    dispatch({ type: "reset", blocks });
    // intentionally depend on blocksKey only — `blocks` reference identity changes
    // every render even when contents are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);

  const effectiveBlocks = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    const ordered: StudyNoteBlock[] = [];
    for (const id of state.blockOrder) {
      const block = byId.get(id);
      if (!block) continue;
      if (!state.categoriesEnabled[block.category]) continue;
      if (state.hiddenBlockIds.has(id)) continue;
      ordered.push(block);
    }
    return ordered;
  }, [blocks, state]);

  const hiddenBlocks = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]));
    return state.blockOrder
      .filter((id) => state.hiddenBlockIds.has(id))
      .map((id) => byId.get(id))
      .filter((b): b is StudyNoteBlock => !!b);
  }, [blocks, state.blockOrder, state.hiddenBlockIds]);

  return { state, dispatch, effectiveBlocks, hiddenBlocks };
}
