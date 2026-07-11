"use client";

// ============================================================================
// /t/[token] 태블릿 응시 — 남은 시간 카운트다운 훅
//
// 초기 null → 클라 effect 에서만 계산(SSR hydration 불일치 방지). 만료 통지는
// 인터벌 콜백(외부 시스템 구독) 안에서 1회만 — effect 본문 setState 를 피한다.
// 기준 시각 = 실제 응시 시작(startedAt). ASSIGNED(미시작)·파손 값은 화면 진입
// 시각으로 폴백한다.
// ============================================================================

import { useEffect, useRef, useState } from "react";

export function useCountdown(
  durationMinutes: number | null,
  startedAt: string | null,
  onExpire: () => void,
): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!durationMinutes) return;
    const parsed = startedAt ? Date.parse(startedAt) : Number.NaN;
    const startMs = Number.isFinite(parsed) ? parsed : Date.now();
    const end = startMs + durationMinutes * 60_000;
    let expired = false;
    const update = () => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !expired) {
        expired = true;
        onExpireRef.current();
      }
    };
    const id = setInterval(update, 1000);
    update();
    return () => clearInterval(id);
  }, [durationMinutes, startedAt]);

  return durationMinutes ? remaining : null;
}

/** 초 → "mm:ss" */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
