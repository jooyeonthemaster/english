"use client";

import { useCallback, useState } from "react";

import type { PassageItem } from "../generate-page-types";
import {
  adjustHighlights,
  adjustRange,
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
  /** 여러 행을 한 번에 제거 (전체선택 후 일괄 삭제). */
  removeRows: (localIds: string[]) => void;
  clear: () => void;
  /**
   * 행 전체를 이 지문들로 교체하고 만들어진 localId 를 **동기 반환**한다
   * (클래스 스튜디오 직행 발사 §3.10.18 E18-c ③). 이전 rows 를 읽지 않으므로
   * clear()+loadPassages() 조합의 스테일 클로저 교착이 성립하지 않는다.
   */
  replaceWithPassages: (passages: PassageItem[]) => string[];
  /** 변형본 저장 직후 — 행을 새 Passage 로 재바인딩. */
  rebindToVariant: (
    localId: string,
    next: { passageId: string; title: string; content: string; variantOfId: string },
  ) => void;
  /**
   * 전체 변형본을 "새 행"으로 추가한다(원본 행은 그대로). 이미 저장된 Passage 라
   * dirty 가 아니며, variantOfId 로 원본 계보를 단다. 중복 id 는 건너뛴다.
   * 추가된 행의 localId 를 반환(없으면 null) — 호출 측이 후처리할 수 있게.
   */
  addVariantRow: (next: {
    passageId: string;
    title: string;
    content: string;
    variantOfId: string;
  }) => string | null;
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
            // AI 변형/앞 맥락 추가는 단일 구간 변경 — 하이라이트처럼 출제
            // 범위도 오프셋을 보정해 유지한다 (겹치면 살아남은 구간만).
            range: adjustRange(r.content, content, r.range),
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

  const removeRows = useCallback((localIds: string[]) => {
    if (localIds.length === 0) return;
    const drop = new Set(localIds);
    setRows((prev) => prev.filter((r) => !drop.has(r.localId)));
  }, []);

  const clear = useCallback(() => setRows([]), []);

  /**
   * 행 전체를 이 지문들로 **교체**하고 만들어진 localId 를 즉시 돌려준다
   * (클래스 스튜디오 직행 발사 — docs/class-studio-spec.md §3.10.18 E18-c ③).
   *
   * ⚠ `clear()` + `loadPassages()` 조합으로 대체하면 안 된다(적대 검수 확정
   *   critical): clear 는 setRows 를 **큐잉만** 하고, loadPassages 는 deps
   *   [rows] 클로저의 **직전 커밋 rows** 로 중복 제거를 한다. 그래서 같은
   *   지문을 두 번째로 적재하면 전건 skip → `newRows.length > 0` 가드에 걸려
   *   setRows 가 아예 안 불리고, 행은 clear 결과인 빈 배열로 커밋된다.
   *   호출부가 passageId→localId 역조회로 기다리면 영원히 오지 않아 CTA 가
   *   조용히 죽는다(재발사가 한 번 걸러 한 번씩 무반응).
   *
   * 이 함수는 이전 rows 를 읽지 않으므로 그 계열 결함이 성립할 수 없고,
   * localId 를 동기 반환하므로 호출부에 역조회 핸드셰이크 자체가 필요 없다.
   * 반환 순서 = 입력 순서(발사 대상 순서 계약).
   */
  const replaceWithPassages = useCallback((passages: PassageItem[]) => {
    const next = passages.map((p) => makeWorkspaceRow(p));
    setRows(next);
    return next.map((r) => r.localId);
  }, []);

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

  // 전체 변형본을 새 행으로 추가 — loadPassages 와 동일한 순수성 규칙:
  // dedupe·localId 생성은 updater 밖(rows 클로저)에서, setRows 는 순수 append.
  const addVariantRow = useCallback(
    (next: {
      passageId: string;
      title: string;
      content: string;
      variantOfId: string;
    }): string | null => {
      const existing = new Set(
        rows.flatMap((r) => [r.passageId, r.variantOfId]).filter(Boolean),
      );
      if (existing.has(next.passageId)) return null;
      const localId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `ws-${Math.random().toString(36).slice(2)}`;
      const row: WorkspaceRow = {
        localId,
        passageId: next.passageId,
        variantOfId: next.variantOfId,
        title: next.title,
        content: next.content,
        savedContent: next.content,
        range: null,
        override: null,
        collapsed: false,
        highlights: [],
        past: [],
        future: [],
      };
      setRows((prev) => {
        // 순수·멱등: prev 기준 재-dedupe (StrictMode 리플레이 안전).
        if (prev.some((r) => r.passageId === next.passageId)) return prev;
        return [...prev, row];
      });
      return localId;
    },
    [rows],
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
    removeRows,
    clear,
    replaceWithPassages,
    rebindToVariant,
    addVariantRow,
  };
}
