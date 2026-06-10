"use client";

import { useCallback, useState } from "react";

import type { PassageItem } from "../generate-page-types";
import {
  adjustHighlights,
  makeWorkspaceRow,
  type RowHighlight,
  type RowOverride,
  type RowRange,
  type WorkspaceRow,
} from "./workspace-types";

/** undo 스택 상한 — 메모리 폭주 방지. */
const HISTORY_LIMIT = 50;

// ============================================================================
// 워크스페이스 행 상태 — 불러오기/편집/범위/오버라이드/접기 CRUD.
// ============================================================================

export interface WorkspaceRowsApi {
  rows: WorkspaceRow[];
  /** 선택한 지문들을 워크스페이스로 불러온다. 이미 있는 지문은 건너뛰고 개수를 반환. */
  loadPassages: (passages: PassageItem[]) => { added: number; skipped: number };
  updateRow: (localId: string, patch: Partial<WorkspaceRow>) => void;
  setContent: (localId: string, content: string) => void;
  /** 수동 편집 버스트 시작 전 현재 상태를 undo 스택에 저장. */
  pushHistory: (localId: string) => void;
  /** AI 변형 적용 — 히스토리 저장 + 본문 교체 + 하이라이트 추가를 원자적으로. */
  applyAiEdit: (
    localId: string,
    content: string,
    highlight: RowHighlight,
  ) => void;
  undo: (localId: string) => void;
  redo: (localId: string) => void;
  /** AI 하이라이트 표시 지우기 (본문은 그대로). */
  clearHighlights: (localId: string) => void;
  setRange: (localId: string, range: RowRange | null) => void;
  setOverride: (localId: string, override: RowOverride | null) => void;
  toggleCollapsed: (localId: string) => void;
  setAllCollapsed: (collapsed: boolean) => void;
  removeRow: (localId: string) => void;
  clear: () => void;
  /** 변형본 저장 직후 — 행을 새 Passage 로 재바인딩. */
  rebindToVariant: (
    localId: string,
    next: { passageId: string; title: string; content: string; variantOfId: string },
  ) => void;
}

export function useWorkspaceRows(): WorkspaceRowsApi {
  const [rows, setRows] = useState<WorkspaceRow[]>([]);

  // dedupe/카운트는 updater 밖(현재 rows 클로저)에서 계산한다 — updater
  // 내부에서 외부 변수를 mutate 하면 React 순수성 계약을 깨고 (StrictMode
  // 이중 호출·지연 실행 시) 카운트가 0/2배로 어긋난다.
  const loadPassages = useCallback(
    (passages: PassageItem[]) => {
      const existing = new Set(
        rows.flatMap((r) => [r.passageId, r.variantOfId]).filter(Boolean),
      );
      const newRows: WorkspaceRow[] = [];
      let skipped = 0;
      for (const p of passages) {
        if (existing.has(p.id)) {
          skipped += 1;
          continue;
        }
        existing.add(p.id);
        newRows.push(makeWorkspaceRow(p));
      }
      if (newRows.length > 0) {
        setRows((prev) => {
          // 순수·멱등: prev 기준 재-dedupe 만 수행 (StrictMode 리플레이 안전).
          const prevIds = new Set(
            prev.flatMap((r) => [r.passageId, r.variantOfId]).filter(Boolean),
          );
          return [...prev, ...newRows.filter((r) => !prevIds.has(r.passageId))];
        });
      }
      return { added: newRows.length, skipped };
    },
    [rows],
  );

  const updateRow = useCallback(
    (localId: string, patch: Partial<WorkspaceRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const setContent = useCallback(
    (localId: string, content: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.localId === localId
            ? {
                ...r,
                content,
                // 본문이 바뀌면 기존 범위 오프셋은 신뢰할 수 없다 → 해제.
                range: null,
                // 하이라이트는 단일 변경 구간 기준으로 오프셋 보정해 유지.
                highlights: adjustHighlights(r.content, content, r.highlights),
              }
            : r,
        ),
      );
    },
    [],
  );

  const pushHistory = useCallback((localId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.localId === localId
          ? {
              ...r,
              past: [
                ...r.past.slice(-(HISTORY_LIMIT - 1)),
                { content: r.content, highlights: r.highlights },
              ],
              // 새 편집이 시작되면 다시 실행 스택은 무효.
              future: [],
            }
          : r,
      ),
    );
  }, []);

  const applyAiEdit = useCallback(
    (localId: string, content: string, highlight: RowHighlight) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.localId !== localId) return r;
          return {
            ...r,
            content,
            range: null,
            highlights: [
              ...adjustHighlights(r.content, content, r.highlights),
              highlight,
            ],
            past: [
              ...r.past.slice(-(HISTORY_LIMIT - 1)),
              { content: r.content, highlights: r.highlights },
            ],
            future: [],
          };
        }),
      );
    },
    [],
  );

  const undo = useCallback((localId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId || r.past.length === 0) return r;
        const snapshot = r.past[r.past.length - 1];
        return {
          ...r,
          content: snapshot.content,
          highlights: snapshot.highlights,
          range: null,
          past: r.past.slice(0, -1),
          future: [
            { content: r.content, highlights: r.highlights },
            ...r.future.slice(0, HISTORY_LIMIT - 1),
          ],
        };
      }),
    );
  }, []);

  const redo = useCallback((localId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId || r.future.length === 0) return r;
        const snapshot = r.future[0];
        return {
          ...r,
          content: snapshot.content,
          highlights: snapshot.highlights,
          range: null,
          past: [
            ...r.past.slice(-(HISTORY_LIMIT - 1)),
            { content: r.content, highlights: r.highlights },
          ],
          future: r.future.slice(1),
        };
      }),
    );
  }, []);

  const clearHighlights = useCallback((localId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, highlights: [] } : r)),
    );
  }, []);

  const setRange = useCallback((localId: string, range: RowRange | null) => {
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, range } : r)),
    );
  }, []);

  const setOverride = useCallback(
    (localId: string, override: RowOverride | null) => {
      setRows((prev) =>
        prev.map((r) => (r.localId === localId ? { ...r, override } : r)),
      );
    },
    [],
  );

  const toggleCollapsed = useCallback((localId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.localId === localId ? { ...r, collapsed: !r.collapsed } : r,
      ),
    );
  }, []);

  const setAllCollapsed = useCallback((collapsed: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, collapsed })));
  }, []);

  const removeRow = useCallback((localId: string) => {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  }, []);

  const clear = useCallback(() => setRows([]), []);

  const rebindToVariant = useCallback(
    (
      localId: string,
      next: {
        passageId: string;
        title: string;
        content: string;
        variantOfId: string;
      },
    ) => {
      setRows((prev) =>
        prev.map((r) =>
          r.localId === localId
            ? {
                ...r,
                passageId: next.passageId,
                title: next.title,
                content: next.content,
                savedContent: next.content,
                variantOfId: r.variantOfId ?? next.variantOfId,
                range: null,
                // 새 본문(범위 슬라이스 가능) 기준으로 옛 오프셋·히스토리는 무효.
                highlights: [],
                past: [],
                future: [],
              }
            : r,
        ),
      );
    },
    [],
  );

  return {
    rows,
    loadPassages,
    updateRow,
    setContent,
    pushHistory,
    applyAiEdit,
    undo,
    redo,
    clearHighlights,
    setRange,
    setOverride,
    toggleCollapsed,
    setAllCollapsed,
    removeRow,
    clear,
    rebindToVariant,
  };
}
