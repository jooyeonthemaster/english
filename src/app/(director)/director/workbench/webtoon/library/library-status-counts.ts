"use client";

import { useEffect, useRef } from "react";
import type { WebtoonRow } from "../webtoon-page-types";

/** 보관함이 실제로 보여주는 웹툰의 상태별 개수 — 호스트 헤더 배지용. */
export interface WebtoonStatusCounts {
  /** PENDING + GENERATING */
  generating: number;
  done: number;
  error: number;
}

export const EMPTY_WEBTOON_STATUS_COUNTS: WebtoonStatusCounts = {
  generating: 0,
  done: 0,
  error: 0,
};

export function countWebtoonStatuses(
  items: readonly WebtoonRow[],
): WebtoonStatusCounts {
  const counts = { ...EMPTY_WEBTOON_STATUS_COUNTS };
  for (const it of items) {
    if (it.status === "PENDING" || it.status === "GENERATING") counts.generating += 1;
    else if (it.status === "COMPLETED") counts.done += 1;
    else if (it.status === "FAILED") counts.error += 1;
  }
  return counts;
}

/**
 * 보관함 목록이 바뀔 때마다 상태별 개수를 호스트에 올린다. 값이 같으면 다시
 * 올리지 않는다 — 생성 중 5초 폴링마다 배열 참조만 바뀌어 무거운 호스트 페이지가
 * 헛렌더되지 않게.
 */
export function useReportStatusCounts(
  items: readonly WebtoonRow[],
  onChange: ((counts: WebtoonStatusCounts) => void) | undefined,
) {
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onChange) return;
    const counts = countWebtoonStatuses(items);
    const key = `${counts.generating}|${counts.done}|${counts.error}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    onChange(counts);
  }, [items, onChange]);
}
