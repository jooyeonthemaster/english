"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  BuilderQuestion,
  DropPlacement,
  InsertablePaperBlockType,
  PaperItem,
} from "../paper-builder/types";
import {
  clonePaperItem,
  makeCustomPaperBlock,
  makePaperItem,
  reindexItems,
} from "../paper-builder/paper-item-utils";
import { shouldIncludeSourcePassageByDefault } from "../paper-builder/passage-policy";
import { normalizePassageText } from "../paper-builder/text-normalization";

// ---------------------------------------------------------------------------
// 시험지 빌더의 paperItems 상태 + mutation 헬퍼들을 한 곳에 묶은 훅.
// 메인 컴포넌트는 markDirty 콜백만 전달하면 된다.
// ---------------------------------------------------------------------------

export type ShuffleOptions = {
  // 같은 지문에 묶인 문항을 한 덩어리로 함께 이동시킬지 여부.
  keepGroups: boolean;
  // 섹션/구분선 등 문항이 아닌 블록을 자리에 고정할지 여부.
  anchorBlocks: boolean;
};

export function usePaperItems(
  markDirty: () => void,
  initialItems: PaperItem[] = [],
  autoPointTotal: number | null = null,
) {
  const [initialPaperItems] = useState(() => reindexItems(initialItems));
  const [paperItems, setPaperItems] = useState<PaperItem[]>(
    initialPaperItems,
  );
  const [activeItemId, setActiveItemId] = useState<string | null>(
    initialPaperItems[0]?.localId || null,
  );
  const [history, setHistory] = useState<{
    past: PaperItem[][];
    future: PaperItem[][];
  }>({ past: [], future: [] });

  // Latest-value mirrors for synchronous reads inside event handlers. React
  // state setters MUST be pure — the old code nested setHistory()/setActiveItemId()
  // inside the setPaperItems() updater, so StrictMode's double-invoke (and any
  // concurrent re-entry) ran those nested setters twice and pushed duplicate
  // history entries, corrupting undo/redo after a few edits. commit/undo/redo now
  // compute the next state from these refs and call each setter once with a plain
  // value. Refs are updated synchronously here (for back-to-back calls in one
  // tick) and re-synced from state via effects (for any other state path).
  const itemsRef = useRef(paperItems);
  const historyRef = useRef(history);
  const activeItemIdRef = useRef(activeItemId);
  const autoPointTotalRef = useRef(autoPointTotal);
  useEffect(() => { itemsRef.current = paperItems; }, [paperItems]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { activeItemIdRef.current = activeItemId; }, [activeItemId]);
  useEffect(() => { autoPointTotalRef.current = autoPointTotal; }, [autoPointTotal]);

  const activeItem = useMemo(
    () => paperItems.find((item) => item.localId === activeItemId) || paperItems[0] || null,
    [paperItems, activeItemId],
  );

  const totalPoints = useMemo(
    () =>
      paperItems.reduce(
        (sum, item) => sum + (item.blockType === "question" ? item.points : 0),
        0,
      ),
    [paperItems],
  );

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // Point activeItemId at `fallback` only if the current active item is gone.
  function reconcileActiveId(nextItems: PaperItem[], explicit?: string | null | undefined) {
    if (explicit !== undefined) {
      activeItemIdRef.current = explicit;
      setActiveItemId(explicit);
      return;
    }
    const active = activeItemIdRef.current;
    if (active && !nextItems.some((item) => item.localId === active)) {
      const fallback = nextItems[0]?.localId || null;
      activeItemIdRef.current = fallback;
      setActiveItemId(fallback);
    }
  }

  function distributeItemsToTotal(
    current: PaperItem[],
    targetTotal: number,
  ): {
    ok: boolean;
    items: PaperItem[];
    changed: boolean;
    editableCount: number;
    message?: string;
  } {
    const normalizedTarget = Math.round(targetTotal);
    if (!Number.isFinite(normalizedTarget) || normalizedTarget < 1) {
      return {
        ok: false,
        items: current,
        changed: false,
        editableCount: 0,
        message: "총점은 1점 이상으로 입력해주세요.",
      };
    }

    const questionItems = current.filter((item) => item.blockType === "question");
    if (questionItems.length === 0) {
      return { ok: true, items: current, changed: false, editableCount: 0 };
    }

    const lockedQuestions = questionItems.filter((item) => item.locked);
    const editableQuestions = questionItems.filter((item) => !item.locked);
    const lockedTotal = lockedQuestions.reduce((sum, item) => sum + item.points, 0);

    if (editableQuestions.length === 0) {
      const currentTotal = questionItems.reduce((sum, item) => sum + item.points, 0);
      return currentTotal === normalizedTarget
        ? { ok: true, items: current, changed: false, editableCount: 0 }
        : {
            ok: false,
            items: current,
            changed: false,
            editableCount: 0,
            message: "잠긴 문항만 있어서 배점을 다시 나눌 수 없습니다.",
          };
    }

    const minTotal = lockedTotal + editableQuestions.length;
    const maxTotal = lockedTotal + editableQuestions.length * 100;
    if (normalizedTarget < minTotal) {
      return {
        ok: false,
        items: current,
        changed: false,
        editableCount: editableQuestions.length,
        message: `현재 문항 구성에서는 최소 ${minTotal}점 이상이어야 합니다.`,
      };
    }
    if (normalizedTarget > maxTotal) {
      return {
        ok: false,
        items: current,
        changed: false,
        editableCount: editableQuestions.length,
        message: `문항당 최대 100점 기준으로 최대 ${maxTotal}점까지 가능합니다.`,
      };
    }

    const distributableTotal = normalizedTarget - lockedTotal;
    const basePoints = Math.floor(distributableTotal / editableQuestions.length);
    const remainder = distributableTotal % editableQuestions.length;
    let editableIndex = 0;
    let changed = false;

    const items = current.map((item) => {
      if (item.blockType !== "question" || item.locked) return item;
      const points = basePoints + (editableIndex < remainder ? 1 : 0);
      editableIndex += 1;
      if (item.points === points) return item;
      changed = true;
      return { ...item, points };
    });

    return { ok: true, items, changed, editableCount: editableQuestions.length };
  }

  function commitItems(
    updater: (current: PaperItem[]) => PaperItem[],
    getNextActiveId?: () => string | null | undefined,
    options: { skipAutoDistribution?: boolean } = {},
  ): boolean {
    const current = itemsRef.current;
    const rawNext = updater(current);
    if (rawNext === current) return false;
    let next = reindexItems(rawNext);
    const activeAutoPointTotal = autoPointTotalRef.current;
    if (!options.skipAutoDistribution && activeAutoPointTotal !== null) {
      const distributed = distributeItemsToTotal(next, activeAutoPointTotal);
      if (distributed.ok) {
        next = distributed.items;
      } else if (distributed.message) {
        toast.error(distributed.message);
      }
    }
    const nextHistory = {
      past: [...historyRef.current.past, current].slice(-80),
      future: [] as PaperItem[][],
    };
    itemsRef.current = next;
    historyRef.current = nextHistory;
    setPaperItems(next);
    setHistory(nextHistory);
    reconcileActiveId(next, getNextActiveId?.());
    markDirty();
    return true;
  }

  function undo() {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const current = itemsRef.current;
    const previous = past[past.length - 1];
    const nextHistory = {
      past: past.slice(0, -1),
      future: [current, ...future].slice(0, 80),
    };
    itemsRef.current = previous;
    historyRef.current = nextHistory;
    setPaperItems(previous);
    setHistory(nextHistory);
    reconcileActiveId(previous);
    markDirty();
  }

  function redo() {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const current = itemsRef.current;
    const next = future[0];
    const nextHistory = {
      past: [...past, current].slice(-80),
      future: future.slice(1),
    };
    itemsRef.current = next;
    historyRef.current = nextHistory;
    setPaperItems(next);
    setHistory(nextHistory);
    reconcileActiveId(next);
    markDirty();
  }

  function toggleQuestion(question: BuilderQuestion) {
    let nextActiveId: string | null | undefined;
    commitItems((current) => {
      const exists = current.some((item) => item.questionId === question.id);
      if (exists) {
        const locked = current.find(
          (item) => item.questionId === question.id && item.locked,
        );
        if (locked) {
          nextActiveId = locked.localId;
          setActiveItemId(locked.localId);
          toast.error("잠긴 문항은 먼저 잠금 해제해야 제외할 수 있습니다.");
          return current;
        }
        const next = current.filter((item) => item.questionId !== question.id);
        if (activeItem?.questionId === question.id) nextActiveId = next[0]?.localId || null;
        return next;
      }
      const nextItem = makePaperItem(question, current.length + 1, current);
      nextActiveId = nextItem.localId;
      return [...current, nextItem];
    }, () => nextActiveId);
  }

  function addQuestion(question: BuilderQuestion) {
    let nextActiveId: string | null | undefined;
    commitItems((current) => {
      const existing = current.find(
        (item) => item.blockType === "question" && item.questionId === question.id,
      );
      if (existing) {
        nextActiveId = existing.localId;
        setActiveItemId(existing.localId);
        return current;
      }

      const nextItem = makePaperItem(question, current.length + 1, current);
      nextActiveId = nextItem.localId;
      return [...current, nextItem];
    }, () => nextActiveId);
  }

  function addDuplicateQuestion(question: BuilderQuestion) {
    addQuestion(question);
  }

  function addQuestionAtDropTarget(
    question: BuilderQuestion,
    targetLocalId: string | null,
    placement: DropPlacement,
  ) {
    let nextActiveId: string | null | undefined;

    commitItems((current) => {
      const existing = current.find(
        (item) => item.blockType === "question" && item.questionId === question.id,
      );
      if (existing?.locked) {
        nextActiveId = existing.localId;
        setActiveItemId(existing.localId);
        toast.error("잠긴 문항은 먼저 잠금 해제해야 이동할 수 있습니다.");
        return current;
      }

      const itemToInsert =
        existing ?? makePaperItem(question, current.length + 1, current);
      nextActiveId = itemToInsert.localId;

      if (targetLocalId === itemToInsert.localId) {
        setActiveItemId(itemToInsert.localId);
        return current;
      }

      const withoutSource = existing
        ? current.filter((item) => item.localId !== existing.localId)
        : current;
      const targetIndex = targetLocalId
        ? withoutSource.findIndex((item) => item.localId === targetLocalId)
        : -1;

      const next = [...withoutSource];
      const insertIndex =
        targetIndex >= 0
          ? targetIndex + (placement === "after" ? 1 : 0)
          : next.length;
      next.splice(insertIndex, 0, itemToInsert);
      return next;
    }, () => nextActiveId);
  }

  // 선택한 문항을 드롭 지점에 한 덩어리로 삽입한다.
  // 이미 미리보기에 있는 문항은 복제하지 않고 그 위치로 이동시키며, 잠긴 문항은 건너뛴다.
  function addQuestionsAtDropTarget(
    questionList: BuilderQuestion[],
    targetLocalId: string | null,
    placement: DropPlacement,
  ) {
    if (questionList.length === 0) return;
    if (questionList.length === 1) {
      addQuestionAtDropTarget(questionList[0], targetLocalId, placement);
      return;
    }

    let nextActiveId: string | null | undefined;
    commitItems((current) => {
      let lockedSkipped = false;
      const movedExistingIds = new Set<string>();
      const itemsToInsert: PaperItem[] = [];

      for (const question of questionList) {
        const existing = current.find(
          (item) => item.blockType === "question" && item.questionId === question.id,
        );
        if (existing?.locked) {
          lockedSkipped = true;
          continue;
        }
        if (existing) {
          movedExistingIds.add(existing.localId);
          itemsToInsert.push(existing);
        } else {
          itemsToInsert.push(
            makePaperItem(
              question,
              current.length + itemsToInsert.length + 1,
              current,
            ),
          );
        }
      }

      if (itemsToInsert.length === 0) {
        if (lockedSkipped) {
          toast.error("잠긴 문항은 먼저 잠금 해제해야 이동할 수 있습니다.");
        }
        return current;
      }
      if (lockedSkipped) {
        toast.error("잠긴 문항은 제외하고 추가했습니다.");
      }

      const withoutMoved = current.filter(
        (item) => !movedExistingIds.has(item.localId),
      );
      const targetIndex = targetLocalId
        ? withoutMoved.findIndex((item) => item.localId === targetLocalId)
        : -1;
      const insertIndex =
        targetIndex >= 0
          ? targetIndex + (placement === "after" ? 1 : 0)
          : withoutMoved.length;

      const next = [...withoutMoved];
      next.splice(insertIndex, 0, ...itemsToInsert);
      nextActiveId = itemsToInsert[itemsToInsert.length - 1].localId;
      return next;
    }, () => nextActiveId);
  }

  function selectAllFiltered(filteredQuestions: BuilderQuestion[]) {
    let nextActiveId: string | null | undefined;
    commitItems((current) => {
      const existing = new Set(
        current
          .filter((item) => item.blockType === "question")
          .map((item) => item.questionId),
      );
      const additions = filteredQuestions
        .filter((question) => !existing.has(question.id))
        .slice(0, 80)
        .reduce<PaperItem[]>((acc, question) => {
          const next = makePaperItem(question, current.length + acc.length + 1, [...current, ...acc]);
          acc.push(next);
          return acc;
        }, []);
      if (additions[0]) nextActiveId = additions[0].localId;
      return [...current, ...additions];
    }, () => nextActiveId);
  }

  function clearPaper() {
    commitItems(() => [], () => null);
  }

  function replacePaperItems(
    nextItems: PaperItem[],
    nextActiveItemId: string | null = null,
    options: { markAsDirty?: boolean } = {},
  ) {
    const normalizedItems = reindexItems(nextItems);
    const nextHistory = { past: [] as PaperItem[][], future: [] as PaperItem[][] };
    const normalizedActiveId =
      nextActiveItemId &&
      normalizedItems.some((item) => item.localId === nextActiveItemId)
        ? nextActiveItemId
        : normalizedItems[0]?.localId ?? null;

    itemsRef.current = normalizedItems;
    historyRef.current = nextHistory;
    activeItemIdRef.current = normalizedActiveId;
    setPaperItems(normalizedItems);
    setHistory(nextHistory);
    setActiveItemId(normalizedActiveId);

    if (options.markAsDirty) markDirty();
  }

  function updateItem(localId: string, patch: Partial<PaperItem>) {
    commitItems((current) =>
      current.map((item) => {
        if (item.localId !== localId) return item;
        if (item.locked && patch.locked !== false) return item;
        return { ...item, ...patch };
      }),
    );
  }

  function distributeTotalPoints(targetTotal: number): boolean {
    const distributed = distributeItemsToTotal(itemsRef.current, targetTotal);
    if (!distributed.ok) {
      if (distributed.message) toast.error(distributed.message);
      return false;
    }

    if (distributed.changed) {
      commitItems(() => distributed.items, undefined, { skipAutoDistribution: true });
      toast.success(`${distributed.editableCount}개 문항에 총 ${Math.round(targetTotal)}점을 나눴습니다.`);
    }
    return true;
  }

  function insertBlock(blockType: InsertablePaperBlockType) {
    const nextBlock = makeCustomPaperBlock(blockType, paperItems.length + 1);
    commitItems((current) => {
      const activeIndex = activeItemId
        ? current.findIndex((item) => item.localId === activeItemId)
        : -1;
      const next = [...current];
      next.splice(activeIndex >= 0 ? activeIndex + 1 : current.length, 0, nextBlock);
      return next;
    }, () => nextBlock.localId);
  }

  function insertImageBlock(dataUrl: string, imageAlt = "삽입 이미지") {
    const nextBlock = {
      ...makeCustomPaperBlock("image", paperItems.length + 1),
      imageDataUrl: dataUrl,
      imageAlt,
    };
    commitItems((current) => {
      const activeIndex = activeItemId
        ? current.findIndex((item) => item.localId === activeItemId)
        : -1;
      const next = [...current];
      next.splice(activeIndex >= 0 ? activeIndex + 1 : current.length, 0, nextBlock);
      return next;
    }, () => nextBlock.localId);
  }

  function duplicateItem(localId: string) {
    let duplicateId: string | null = null;
    commitItems((current) => {
      const index = current.findIndex((item) => item.localId === localId);
      if (index < 0) return current;
      const item = current[index];
      if (item.blockType === "question") {
        toast.error("같은 문제는 시험지에 한 번만 넣을 수 있습니다.");
        return current;
      }
      const duplicate = clonePaperItem(item, current.length + 1);
      duplicateId = duplicate.localId;
      const next = [...current];
      next.splice(index + 1, 0, duplicate);
      return next;
    }, () => duplicateId);
  }

  function toggleLockItem(localId: string) {
    commitItems((current) =>
      current.map((item) =>
        item.localId === localId ? { ...item, locked: !item.locked } : item,
      ),
    );
  }

  function tryToggleKeepWithPrev(localId: string) {
    const current = paperItems.find((item) => item.localId === localId);
    if (!current) return;
    if (current.locked) {
      toast.error("잠긴 블록은 먼저 잠금 해제해야 편집할 수 있습니다.");
      return;
    }

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
    commitItems((current) =>
      current.map((item) =>
        item.groupId === groupId && !item.locked
          ? {
              ...item,
              ...patch,
              passageContent:
                patch.passageContent !== undefined
                  ? normalizePassageText(patch.passageContent)
                  : item.passageContent,
          }
          : item,
      ),
    );
  }

  function removeItem(localId: string) {
    let nextActiveId: string | null | undefined;
    commitItems((current) => {
      const target = current.find((item) => item.localId === localId);
      if (target?.locked) {
        toast.error("잠긴 블록은 먼저 잠금 해제해야 삭제할 수 있습니다.");
        return current;
      }
      const next = current.filter((item) => item.localId !== localId);
      nextActiveId = next[0]?.localId || null;
      return next;
    }, () => nextActiveId);
  }

  function moveItemToDropTarget(sourceLocalId: string, targetLocalId: string, placement: DropPlacement) {
    if (sourceLocalId === targetLocalId) return;
    commitItems((current) => {
      const sourceIndex = current.findIndex((item) => item.localId === sourceLocalId);
      if (sourceIndex < 0) return current;
      const sourceItem = current[sourceIndex];
      if (sourceItem.locked) {
        toast.error("잠긴 블록은 먼저 잠금 해제해야 이동할 수 있습니다.");
        return current;
      }
      const withoutSource = current.filter((item) => item.localId !== sourceLocalId);
      const targetIndex = withoutSource.findIndex((item) => item.localId === targetLocalId);
      if (targetIndex < 0) return current;
      const next = [...withoutSource];
      next.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, sourceItem);
      return next;
    }, () => sourceLocalId);
  }

  function ungroupItem(localId: string) {
    commitItems((current) =>
      current.map((item) =>
        item.localId === localId && !item.locked && item.blockType === "question"
          ? {
            ...item,
            groupId: `single:${item.localId}`,
            includePassage: shouldIncludeSourcePassageByDefault(item.sourceQuestion),
          }
          : item,
      ),
    );
  }

  function shuffleQuestions(options: ShuffleOptions) {
    const { keepGroups, anchorBlocks } = options;
    commitItems((current) => {
      if (current.length < 2) {
        toast.error("셔플링할 문항이 충분하지 않습니다.");
        return current;
      }

      // 1) 연속된 같은 지문 묶음을 하나의 이동 단위로 만든다.
      //    지문 묶음 유지가 꺼져 있으면 모든 항목을 개별 단위로 취급한다.
      const units: PaperItem[][] = [];
      for (const item of current) {
        const last = units[units.length - 1];
        const sameGroup =
          keepGroups &&
          item.blockType === "question" &&
          Boolean(item.groupId) &&
          last !== undefined &&
          last[0].blockType === "question" &&
          last[0].groupId === item.groupId;
        if (sameGroup) {
          last.push(item);
        } else {
          units.push([item]);
        }
      }

      // 2) 잠긴 항목이 포함된 단위와(원하면) 문항이 아닌 블록은 자리에 고정한다.
      const isAnchored = (unit: PaperItem[]) =>
        unit.some((it) => it.locked) ||
        (anchorBlocks && unit.every((it) => it.blockType !== "question"));

      const movableIndices: number[] = [];
      units.forEach((unit, index) => {
        if (!isAnchored(unit)) movableIndices.push(index);
      });

      if (movableIndices.length < 2) {
        toast.error("셔플링할 수 있는 문항이 부족합니다. 잠금/고정 설정을 확인하세요.");
        return current;
      }

      // 3) 이동 가능한 단위만 Fisher-Yates로 섞되, 순서가 실제로 바뀌도록 보장한다.
      const movableUnits = movableIndices.map((index) => units[index]);
      const originalKey = movableUnits.map((unit) => unit[0].localId).join("|");
      for (let attempt = 0; attempt < 6; attempt += 1) {
        for (let i = movableUnits.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [movableUnits[i], movableUnits[j]] = [movableUnits[j], movableUnits[i]];
        }
        const nextKey = movableUnits.map((unit) => unit[0].localId).join("|");
        if (nextKey !== originalKey) break;
      }

      // 4) 고정 단위는 제자리에 두고, 이동 단위만 섞인 순서로 되돌려 채운다.
      const result = [...units];
      movableIndices.forEach((targetIndex, k) => {
        result[targetIndex] = movableUnits[k];
      });

      toast.success(`${movableUnits.length}개 항목을 셔플링했습니다.`);
      return result.flat();
    });
  }

  function regroupByPassage() {
    commitItems((current) => {
      if (current.length === 0) return current;

      const groupKey = (item: PaperItem) =>
        item.blockType !== "question"
          ? `block:${item.localId}`
          : item.sourceQuestion.passage
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
        if (item.locked || item.blockType !== "question") return item;
        const groupId = groupKey(item);
        const includePassage = !seen.has(groupId) && shouldIncludeSourcePassageByDefault(item.sourceQuestion);
        seen.add(groupId);
        return { ...item, groupId, includePassage };
      });

      return grouped;
    });
  }

  return {
    paperItems,
    activeItemId,
    setActiveItemId,
    activeItem,
    totalPoints,
    canUndo,
    canRedo,
    undo,
    redo,
    addQuestion,
    addDuplicateQuestion,
    addQuestionAtDropTarget,
    addQuestionsAtDropTarget,
    toggleQuestion,
    selectAllFiltered,
    clearPaper,
    replacePaperItems,
    updateItem,
    distributeTotalPoints,
    insertBlock,
    insertImageBlock,
    duplicateItem,
    toggleLockItem,
    tryToggleKeepWithPrev,
    updateGroupPassage,
    removeItem,
    moveItemToDropTarget,
    ungroupItem,
    regroupByPassage,
    shuffleQuestions,
  };
}
