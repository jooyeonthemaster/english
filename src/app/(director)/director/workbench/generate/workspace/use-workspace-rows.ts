"use client";

import { useCallback, useRef, useState } from "react";

import type { PassageItem } from "../generate-page-types";
import {
  makeWorkspaceRow,
  type RowOverride,
  type RowRange,
  type WorkspaceRow,
} from "./workspace-types";

// ============================================================================
// 워크스페이스 행 상태 — 불러오기/편집/범위/오버라이드/접기 CRUD.
// ============================================================================

export interface WorkspaceRowsApi {
  rows: WorkspaceRow[];
  /** 선택한 지문들을 워크스페이스로 불러온다. 이미 있는 지문은 건너뛰고 개수를 반환. */
  loadPassages: (passages: PassageItem[]) => { added: number; skipped: number };
  updateRow: (localId: string, patch: Partial<WorkspaceRow>) => void;
  setContent: (localId: string, content: string) => void;
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
  // updater 밖에서 dedupe/카운트를 계산하기 위한 최신 rows 참조 —
  // updater 내부에서 외부 변수를 mutate 하면 React 순수성 계약을 깨고
  // (StrictMode 이중 호출·지연 실행 시) 카운트가 0/2배로 어긋난다.
  const rowsRef = useRef<WorkspaceRow[]>(rows);
  rowsRef.current = rows;

  const loadPassages = useCallback((passages: PassageItem[]) => {
    const existing = new Set(
      rowsRef.current
        .flatMap((r) => [r.passageId, r.variantOfId])
        .filter(Boolean),
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
  }, []);

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
            ? // 본문이 바뀌면 기존 범위 오프셋은 신뢰할 수 없다 → 해제.
              { ...r, content, range: null }
            : r,
        ),
      );
    },
    [],
  );

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
    setRange,
    setOverride,
    toggleCollapsed,
    setAllCollapsed,
    removeRow,
    clear,
    rebindToVariant,
  };
}
