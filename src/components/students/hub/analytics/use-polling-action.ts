"use client";

// ============================================================================
// 분석 탭 공용 폴링 훅 — 규칙 R6 의 단일 정본
// (docs/director-console-v3-design.md §D1-2, study-analytics-tab 인라인
// 폴링 이펙트의 추출 — 동작 계약 동일)
//
// 계약: 즉시 1회 로드 → intervalMs 주기 재로드(문서 비가시 시 중단, 재가시
// 시 즉시 1회) + refresh() 수동 갱신(reloadTick) + stale-on-error(실패 시
// 이전 data 유지, error 만 세팅 — 성공 시 error 해제·fetchedAt 갱신).
// 인터벌 기본 15초 — 시험 탭만 60초 예외(R6 성문화, 호출부가 지정).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

/** 호출부 로드 결과 — 서버 액션 응답을 이 형태로 정규화해 넘긴다 */
export type PollingLoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function usePollingAction<T>(
  load: () => Promise<PollingLoadResult<T>>,
  /** 로드 정체성(학생 id 등) — 바뀌면 즉시 재로드·인터벌 재시작 */
  deps: readonly unknown[],
  { intervalMs = 15_000 }: { intervalMs?: number } = {},
): {
  data: T | null;
  error: string | null;
  fetchedAt: number | null;
  /** 수동 갱신 — 즉시 1회 로드 + 인터벌 재시작 */
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // 최신 load 클로저 참조 — 호출부가 매 렌더 새 함수를 넘겨도 이펙트를
  // 재구동하지 않고 항상 최신 클로저를 부른다(재구동 조건은 deps·reloadTick 만)
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await loadRef.current();
      if (cancelled) return;
      if (res.ok) {
        setData(res.data);
        setError(null);
        setFetchedAt(Date.now());
      } else {
        // stale-on-error — 이전 data 를 유지한 채 실패 배지만 띄운다
        setError(res.error);
      }
    };
    void run();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // deps 는 호출부 소유의 로드 정체성 — load 자체는 ref 로 우회한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadTick, intervalMs]);

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  return { data, error, fetchedAt, refresh };
}
