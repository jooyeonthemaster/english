"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import { encodeOrderList } from "@/lib/exam-forecast/order-list";

// 문항 장바구니 — 고른 순서를 보존한다(인쇄 번호 순서). 저장소는 브라우저 localStorage(편의용).
// useSyncExternalStore: 서버 렌더는 빈 목록, 브라우저에서 저장값으로 맞춘다(다른 탭 변경도 반영).

export interface ForecastSelection {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  addMany: (ids: string[]) => void;
  removeMany: (ids: string[]) => void;
  clear: () => void;
  /** 인쇄 URL 쿼리(q=…) */
  printQuery: string;
  summaries: ForecastQuestionSummary[];
}

const EVENT = "exam-forecast:selection";
const EMPTY = "[]";

function read(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* 저장소 차단 — 이번 화면에서만 유지되지 않는다 */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useForecastSelection(slug: string, all: ForecastQuestionSummary[]): ForecastSelection {
  const key = `exam-forecast:sel:${slug}`;
  const byId = useMemo(() => new Map(all.map((q) => [q.id, q])), [all]);
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener(EVENT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVENT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const ids = useMemo(() => {
    try {
      return (JSON.parse(raw) as string[]).filter((id) => byId.has(id));
    } catch {
      return [];
    }
  }, [raw, byId]);
  const set = useMemo(() => new Set(ids), [ids]);

  return {
    ids,
    has: (id) => set.has(id),
    toggle: (id) => write(key, set.has(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    addMany: (add) => write(key, [...ids, ...add.filter((id) => !set.has(id))]),
    removeMany: (rm) => write(key, ids.filter((id) => !rm.includes(id))),
    clear: () => write(key, []),
    printQuery: encodeOrderList(ids.map((id) => byId.get(id)?.sortOrder).filter((n): n is number => n != null)),
    summaries: ids.map((id) => byId.get(id)).filter((q): q is ForecastQuestionSummary => Boolean(q)),
  };
}
