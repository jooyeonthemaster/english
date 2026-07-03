"use client";

import { useEffect, useRef } from "react";

/**
 * 검색 입력을 "타이핑 즉시(라이브)" 커밋하기 위한 디바운스 훅.
 *
 * 검색 필터바 컴포넌트 내부에서 사용한다. 입력 onChange 마다 표시값은
 * 부모의 onSearchChange 로 즉시 갱신하고, 실제 검색 커밋(commit)은 마지막
 * 입력 후 `delay` ms 가 지나면 한 번만 호출한다. Enter·지우기(X)는 flush 로
 * 디바운스를 건너뛰고 즉시 커밋한다.
 *
 * commit 은 최신 값을 인자로 받으므로, 부모의 상태 갱신이 비동기라서
 * 생기는 stale-closure 문제 없이 정확한 값으로 커밋된다.
 */
export function useSearchDebounce(
  commit: (value: string) => void,
  delay = 250,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // 언마운트 시 예약된 커밋 정리.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /** 입력 중: delay 후 한 번만 커밋(직전 예약은 취소). */
  const schedule = (value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commitRef.current(value), delay);
  };

  /** Enter·지우기 등: 예약을 취소하고 즉시 커밋. */
  const flush = (value: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    commitRef.current(value);
  };

  return { schedule, flush };
}
