"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "./use-is-mobile";

export const DEFAULT_MOBILE_PAGE_SIZE = 10;

/**
 * 모바일 전용 클라이언트 페이지네이션.
 * - 데스크톱(lg 이상)에선 useIsMobile 이 항상 false 라 전체(items)를 그대로 반환.
 * - 모바일에선 pageSize(기본 10)개씩 잘라 현재 페이지 분량만 반환.
 * - resetKey 가 바뀌면(폴더 이동·검색·필터 등) 1페이지로 되돌리고, 목록이 줄어
 *   현재 페이지가 범위를 벗어나면 마지막 페이지로 보정한다.
 */
export function useMobilePagination<T>(
  items: T[],
  opts?: { pageSize?: number; resetKey?: unknown },
) {
  const pageSize = opts?.pageSize ?? DEFAULT_MOBILE_PAGE_SIZE;
  const resetKey = opts?.resetKey;
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const visibleItems = useMemo(
    () =>
      isMobile
        ? items.slice((page - 1) * pageSize, page * pageSize)
        : items,
    [isMobile, items, page, pageSize],
  );

  return { isMobile, page, setPage, totalPages, visibleItems };
}
