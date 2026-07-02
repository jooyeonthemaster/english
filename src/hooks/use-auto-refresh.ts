import { useEffect, useRef } from "react";

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * 목록을 주기적으로 다시 불러오는 훅.
 * - 기본 10분 간격.
 * - `paused`가 true이거나 탭이 백그라운드일 때는 해당 틱을 건너뜀
 *   (관리자가 특정 글을 읽거나 편집 중일 때 새로고침을 막는 용도).
 * - 콜백/일시정지 값은 ref로 최신값을 추적하므로 타이머는 재설정되지 않는다.
 */
export function useAutoRefresh(
  callback: () => void,
  options?: { intervalMs?: number; paused?: boolean },
) {
  const { intervalMs = TEN_MINUTES, paused = false } = options ?? {};

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const id = setInterval(() => {
      // 백그라운드 탭이나 일시정지 상태에서는 새로고침하지 않음
      if (typeof document !== "undefined" && document.hidden) return;
      if (pausedRef.current) return;
      callbackRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
