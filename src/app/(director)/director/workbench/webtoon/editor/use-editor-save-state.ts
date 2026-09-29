"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 미저장 변경 추적 — 마지막으로 서버에 반영된 스냅숏(기준선)과 현재 값을 비교한다.
 *
 * 기준선은 state 여야 한다. 예전엔 ref 에 두고 `[boxes]` memo 로 비교해서, 저장·배포가
 * 성공해 기준선이 바뀌어도 boxes 가 다시 바뀌기 전까지 dirty 가 true 로 남았다
 * (닫기 경고가 계속 뜸). `markSaved` 에는 **실제로 서버에 보낸 값**을 넘긴다 — 저장이
 * 도는 동안 이어진 편집은 그대로 미저장으로 잡힌다.
 * 기준선이 없으면(아직 불러오는 중) dirty 는 false.
 */
export function useSavedBaseline<T>(current: T): {
  dirty: boolean;
  markSaved: (saved: T) => void;
} {
  const [baseline, setBaseline] = useState<string | null>(null);
  const dirty = useMemo(
    () => baseline != null && JSON.stringify(current) !== baseline,
    [current, baseline],
  );
  const markSaved = useCallback((saved: T) => setBaseline(JSON.stringify(saved)), []);
  return { dirty, markSaved };
}

/** 알림 토스트 — 띄운 뒤 `durationMs` 가 지나면 스스로 사라진다(안 그러면 다음 저장 전까지 남는다). */
export function useTransientNotice(
  durationMs = 4000,
): [string | null, (message: string | null) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [notice, durationMs]);
  return [notice, setNotice];
}
