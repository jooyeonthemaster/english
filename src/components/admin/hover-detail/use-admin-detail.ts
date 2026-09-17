"use client";

import { useCallback, useState } from "react";
import type { AdminDetail } from "@/lib/admin-detail-types";

// 같은 대상을 호버→클릭할 때 두 번 조회하지 않도록 짧게 캐시한다.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<AdminDetail> }>();

/** 데이터를 바꾼 뒤 호출 — 다음 열람 때 캐시 대신 새로 조회한다. */
export function invalidateAdminDetailCache(cacheKey: string) {
  cache.delete(cacheKey);
}

function fetchCached(cacheKey: string, load: () => Promise<AdminDetail>) {
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = load();
  cache.set(cacheKey, { at: Date.now(), promise });
  promise.catch(() => cache.delete(cacheKey));
  return promise;
}

/**
 * 상세 데이터 소스. static(이미 가진 행 데이터) 이면 조회 없이 바로 쓰고,
 * load 가 있으면 처음 열릴 때 서버에서 가져온다.
 */
export function useAdminDetail(
  staticDetail: AdminDetail | null | undefined,
  load: (() => Promise<AdminDetail>) | undefined,
  cacheKey: string | undefined,
) {
  const [loaded, setLoaded] = useState<AdminDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ensure = useCallback(() => {
    if (!load) return;
    setError(null);
    setLoading(true);
    const run = cacheKey ? fetchCached(cacheKey, load) : load();
    run
      .then((d) => setLoaded(d))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [load, cacheKey]);

  return {
    detail: load ? loaded : (staticDetail ?? null),
    error,
    loading: load ? loading : false,
    ensure,
  };
}
