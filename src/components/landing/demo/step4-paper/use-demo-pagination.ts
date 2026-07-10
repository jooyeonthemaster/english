"use client";

// Step4 데모 페이지네이션 하네스 — 워크벤치 빌더의 파생 계산만 얇게 재현한다.
// (buildGroups → paginateGroups → 높이 산식; exam-paper-builder-client.tsx:1285-1338 미러)
// 서버 액션·빌더 상태 훅(usePaperItems)은 일절 끌어오지 않는다.
import { useMemo, useState } from "react";
import {
  buildGroups,
  makePaperItem,
  reindexItems,
} from "@/components/exams/paper-builder/paper-item-utils";
import { paginateGroups } from "@/components/exams/paper-builder/pagination";
import {
  PAPER_SIZE_SPECS,
  PREVIEW_PAGE_WIDTH,
} from "@/components/exams/paper-builder/constants";
import type {
  BuilderQuestion,
  DropPlacement,
  PaginationSettings,
  PaperItem,
} from "@/components/exams/paper-builder/types";

const PREVIEW_PAGE_GAP = 20; // builder-constants.PREVIEW_PAGE_GAP 와 동일 상수

// 워크벤치 기본 조판 설정(saved-template-settings DEFAULT_TEMPLATE_SETTINGS 미러):
// clean 템플릿 · A4 · 2단 · comfortable · plain 지문 스타일.
export const DEMO_PAGINATION_SETTINGS: PaginationSettings = {
  paperSize: "A4",
  columns: 2,
  density: "comfortable",
  passageStyle: "plain",
  showAnswerSpace: true,
  showPassageTitle: true,
  showQuestionMeta: false,
  template: "clean",
};

export function useDemoPagination(sourceQuestions: BuilderQuestion[]) {
  const initialItems = useMemo(
    () =>
      sourceQuestions.map((question, index) =>
        makePaperItem(question, index + 1, []),
      ),
    [sourceQuestions],
  );

  const [items, setItems] = useState<PaperItem[]>(initialItems);
  const [removed, setRemoved] = useState<PaperItem[]>([]);

  const { pages, overflowItems } = useMemo(
    () => paginateGroups(buildGroups(items), DEMO_PAGINATION_SETTINGS),
    [items],
  );

  const singlePageHeight =
    PREVIEW_PAGE_WIDTH * PAPER_SIZE_SPECS.A4.heightRatio;
  const previewContentHeight =
    pages.length > 0
      ? pages.length * singlePageHeight + (pages.length - 1) * PREVIEW_PAGE_GAP
      : 0;

  const removeItem = (localId: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (!target) return prev;
      setRemoved((r) => [...r, target]);
      return reindexItems(prev.filter((item) => item.localId !== localId));
    });
  };

  const restoreItem = (localId: string) => {
    setRemoved((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (!target) return prev;
      setItems((current) => reindexItems([...current, target]));
      return prev.filter((item) => item.localId !== localId);
    });
  };

  // 인라인 텍스트 편집(발문·선지·헤더 등) — 실제 빌더의 updateItem 계약을
  // 로컬 상태로 구현. 수정 즉시 재페이지네이션된다.
  const updateItem = (localId: string, patch: Partial<PaperItem>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.localId === localId ? { ...item, ...patch } : item,
      ),
    );
  };

  // 지문 묶음(groupId) 단위 지문 제목/본문 편집 — 같은 그룹 전 항목에 반영.
  const updateGroupPassage = (
    groupId: string | null,
    patch: Pick<Partial<PaperItem>, "passageTitle" | "passageContent">,
  ) => {
    if (!groupId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.groupId === groupId ? { ...item, ...patch } : item,
      ),
    );
  };

  const moveItemToDropTarget = (
    sourceLocalId: string,
    targetLocalId: string,
    placement: DropPlacement,
  ) => {
    setItems((prev) => {
      const sourceIndex = prev.findIndex((i) => i.localId === sourceLocalId);
      if (sourceIndex < 0) return prev;
      const without = prev.filter((i) => i.localId !== sourceLocalId);
      const targetIndex = without.findIndex((i) => i.localId === targetLocalId);
      if (targetIndex < 0) return prev;
      const insertAt = placement === "before" ? targetIndex : targetIndex + 1;
      const next = [...without];
      next.splice(insertAt, 0, prev[sourceIndex]);
      return reindexItems(next);
    });
  };

  const reset = () => {
    setItems(initialItems);
    setRemoved([]);
  };

  return {
    items,
    removed,
    pages,
    overflowItemIds: overflowItems,
    singlePageHeight,
    previewContentHeight,
    removeItem,
    restoreItem,
    updateItem,
    updateGroupPassage,
    moveItemToDropTarget,
    reset,
  };
}
