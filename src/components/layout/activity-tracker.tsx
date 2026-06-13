"use client";

// ============================================================================
// ActivityTracker — 페이지 이동을 배치로 /api/track에 보고하는 무화면 컴포넌트.
//
// 비용 원칙(Vercel egress 사고 교훈):
//   - 폴링 없음. 라우트 변경 시 큐에 쌓고, 15초 간격(큐가 있을 때만) 또는
//     탭 이탈(pagehide/visibilitychange) 시 sendBeacon으로 한 번에 전송.
//   - 같은 경로 연속 재렌더는 큐에 넣지 않는다.
// 탭 단위 sessionId(sessionStorage)를 함께 보내 관리자 화면에서 한 세션의
// 이동 경로(여정)를 이어 볼 수 있게 한다.
// ============================================================================

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const FLUSH_INTERVAL_MS = 15_000;
const FLUSH_AT_COUNT = 20;
const SESSION_KEY = "nara-activity-session";

interface QueuedView {
  path: string;
  ts: number;
}

function getTabSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

export function ActivityTracker() {
  const pathname = usePathname();
  const queueRef = useRef<QueuedView[]>([]);
  const lastPathRef = useRef<string | null>(null);

  // refs만 만지므로 의존성 없는 안정 함수 — 리스너는 1회만 등록된다
  const flush = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length === 0) return;
    queueRef.current = [];

    const payload = JSON.stringify({
      sessionId: getTabSessionId(),
      events: queue,
    });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        if (navigator.sendBeacon("/api/track", blob)) return;
      }
      void fetch("/api/track", {
        method: "POST",
        body: payload,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    } catch {
      // 추적 실패는 조용히 무시 — 사용자 흐름에 영향 금지
    }
  }, []);

  useEffect(() => {
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;
    queueRef.current.push({ path: pathname, ts: Date.now() });
    if (queueRef.current.length >= FLUSH_AT_COUNT) flush();
  }, [pathname, flush]);

  useEffect(() => {
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  return null;
}
