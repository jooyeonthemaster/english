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

  // 상태 업데이터 안에서 다른 setState 를 호출하지 않는다(불순 업데이터). Next dev 의
  // React StrictMode 는 업데이터를 2번 호출하므로, setItems 안에서 setRemoved 를 부르면
  // removed 에 같은 항목이 두 번 들어가 key 중복("두 자식이 동일 key") 에러가 난다.
  // → target 은 커밋된 상태(closure)에서 찾고, 두 setState 를 각각 한 번씩만 호출한다.
  const removeItem = (localId: string) => {
    const target = items.find((item) => item.localId === localId);
    if (!target) return;
    setItems((prev) => reindexItems(prev.filter((item) => item.localId !== localId)));
    setRemoved((prev) =>
      prev.some((item) => item.localId === localId) ? prev : [...prev, target],
    );
  };

  const restoreItem = (localId: string) => {
    const target = removed.find((item) => item.localId === localId);
    if (!target) return;
    setRemoved((prev) => prev.filter((item) => item.localId !== localId));
    setItems((prev) =>
      prev.some((item) => item.localId === localId)
        ? prev
        : reindexItems([...prev, target]),
    );
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
