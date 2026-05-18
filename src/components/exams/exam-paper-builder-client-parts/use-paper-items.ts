"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  BuilderQuestion,
  DropPlacement,
  PaperItem,
} from "../paper-builder/types";
import {
  makePaperItem,
  reindexItems,
} from "../paper-builder/paper-item-utils";

// ---------------------------------------------------------------------------
// 시험지 빌더의 paperItems 상태 + mutation 헬퍼들을 한 곳에 묶은 훅.
// 메인 컴포넌트는 markDirty 콜백만 전달하면 된다.
// ---------------------------------------------------------------------------

export function usePaperItems(markDirty: () => void) {
  const [paperItems, setPaperItems] = useState<PaperItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const activeItem = useMemo(
    () => paperItems.find((item) => item.localId === activeItemId) || paperItems[0] || null,
    [paperItems, activeItemId],
  );

  const totalPoints = useMemo(
    () => paperItems.reduce((sum, item) => sum + item.points, 0),
    [paperItems],
  );

  function toggleQuestion(question: BuilderQuestion) {
    setPaperItems((current) => {
      const exists = current.some((item) => item.questionId === question.id);
      if (exists) {
        const next = reindexItems(current.filter((item) => item.questionId !== question.id));
        if (activeItem?.questionId === question.id) setActiveItemId(next[0]?.localId || null);
        return next;
      }
      const nextItem = makePaperItem(question, current.length + 1, current);
      setActiveItemId(nextItem.localId);
      return [...current, nextItem];
    });
    markDirty();
  }

  function selectAllFiltered(filteredQuestions: BuilderQuestion[]) {
    setPaperItems((current) => {
      const existing = new Set(current.map((item) => item.questionId));
      const additions = filteredQuestions
        .filter((question) => !existing.has(question.id))
        .slice(0, 80)
        .reduce<PaperItem[]>((acc, question) => {
          const next = makePaperItem(question, current.length + acc.length + 1, [...current, ...acc]);
          acc.push(next);
          return acc;
        }, []);
      if (additions[0]) setActiveItemId(additions[0].localId);
      return reindexItems([...current, ...additions]);
    });
    markDirty();
  }

  function clearPaper() {
    setPaperItems([]);
    setActiveItemId(null);
    markDirty();
  }

  function updateItem(localId: string, patch: Partial<PaperItem>) {
    setPaperItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
    markDirty();
  }

  function tryToggleKeepWithPrev(localId: string) {
    const current = paperItems.find((item) => item.localId === localId);
    if (!current) return;

    if (current.keepWithPrev) {
      updateItem(localId, { keepWithPrev: false });
      return;
    }

    const itemIndex = paperItems.findIndex((item) => item.localId === localId);
    if (itemIndex <= 0) {
      toast.error("앞 문항이 없어서 강제 배치할 수 없습니다.");
      return;
    }

    updateItem(localId, { keepWithPrev: true });
  }

  function updateGroupPassage(
    groupId: string | null,
    patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">,
  ) {
    if (!groupId) return;
    setPaperItems((current) =>
      current.map((item) => (item.groupId === groupId ? { ...item, ...patch } : item)),
    );
    markDirty();
  }

  function removeItem(localId: string) {
    setPaperItems((current) => {
      const next = reindexItems(current.filter((item) => item.localId !== localId));
      setActiveItemId(next[0]?.localId || null);
      return next;
    });
    markDirty();
  }

  function moveItemToDropTarget(sourceLocalId: string, targetLocalId: string, placement: DropPlacement) {
    if (sourceLocalId === targetLocalId) return;
    setPaperItems((current) => {
      const sourceIndex = current.findIndex((item) => item.localId === sourceLocalId);
      if (sourceIndex < 0) return current;
      const sourceItem = current[sourceIndex];
      const withoutSource = current.filter((item) => item.localId !== sourceLocalId);
      const targetIndex = withoutSource.findIndex((item) => item.localId === targetLocalId);
      if (targetIndex < 0) return current;
      const next = [...withoutSource];
      next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceItem);
      return reindexItems(next);
    });
    setActiveItemId(sourceLocalId);
    markDirty();
  }

  function ungroupItem(localId: string) {
    setPaperItems((current) =>
      current.map((item) =>
        item.localId === localId
          ? {
            ...item,
            groupId: `single:${item.localId}`,
            includePassage: Boolean(item.passageContent),
          }
          : item,
      ),
    );
    markDirty();
  }

  function regroupByPassage() {
    setPaperItems((current) => {
      if (current.length === 0) return current;

      const groupKey = (item: PaperItem) =>
        item.sourceQuestion.passage
          ? `passage:${item.sourceQuestion.passage.id}`
          : `solo:${item.questionId}`;

      const firstSeen = new Map<string, number>();
      current.forEach((item, index) => {
        const key = groupKey(item);
        if (!firstSeen.has(key)) firstSeen.set(key, index);
      });

      const sorted = [...current]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const keyA = groupKey(a.item);
          const keyB = groupKey(b.item);
          const orderA = firstSeen.get(keyA) ?? 0;
          const orderB = firstSeen.get(keyB) ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return a.index - b.index;
        })
        .map(({ item }) => item);

      const seen = new Set<string>();
      const grouped = sorted.map((item) => {
        const groupId = groupKey(item);
        const includePassage = Boolean(item.sourceQuestion.passage && !seen.has(groupId));
        seen.add(groupId);
        return { ...item, groupId, includePassage };
      });

      return reindexItems(grouped);
    });
    markDirty();
  }

  return {
    paperItems,
    setPaperItems,
    activeItemId,
    setActiveItemId,
    activeItem,
    totalPoints,
    toggleQuestion,
    selectAllFiltered,
    clearPaper,
    updateItem,
    tryToggleKeepWithPrev,
    updateGroupPassage,
    removeItem,
    moveItemToDropTarget,
    ungroupItem,
    regroupByPassage,
  };
}
