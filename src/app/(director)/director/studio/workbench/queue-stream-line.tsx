"use client";

// ============================================================================
// 큐 스트립 라이브 라인 (docs/class-studio-spec.md §3.10.11-b·c)
//
// 스트림 스토어(stream-tail-store) 키 구독 전용 소형 컴포넌트 — SSE 델타
// (~8회/초) 리렌더가 **이 컴포넌트 안에서만** 일어난다. 부모(큐 스트립·도시에
// 아코디언)는 시그니처 메모로 델타에 무반응(§3.10.9 함정 1 방어선 유지).
//
// 표시: 고정 높이 1줄(CLS 0) — 꼬리 텍스트는 우측 끝 고정(최신이 항상 보임)
// + 좌측 페이드로 절단을 말한다. 델타 전(thinking)은 펄스 문구, 경과시간은
// 1초 interval 로 mm:ss. 스냅샷이 없으면(델타 전·SSE 사망 후 prune) 중립
// 문구로 남는다 — 라인 소거는 부모(스트립 항목 생멸) 소관이다.
// ============================================================================

import { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { StreamTailStore } from "@/lib/studio/stream-tail-store";

function fmtElapsed(fromMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 경과시간 전용 1초 시계 — 라인과 분리해 tail 리렌더와 주기를 섞지 않는다.
 *  export: 스트림 없는 큐 항목(실전 워크북 — §3.10.11-c "스피너+경과만")도
 *  같은 시계를 쓴다(passage-dossier-pane 소비). */
export function ElapsedClock({ fromMs }: { fromMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
      {fmtElapsed(fromMs, now)}
    </span>
  );
}

function QueueStreamLineInner({
  store,
  streamKey,
  fallbackStartedAt,
}: {
  store: StreamTailStore;
  streamKey: string;
  /** 스냅샷 도착 전(thinking 델타조차 없는 초기) 경과 기준 — 항목 startedAt */
  fallbackStartedAt?: number;
}) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(streamKey, listener),
    [store, streamKey],
  );
  const getSnapshot = useCallback(() => store.get(streamKey), [store, streamKey]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // 경과 기준은 둘 중 이른 쪽 — 스냅샷 도착(SSE 시작) 순간 fallback(발사 시각)
  // 에서 갈아타면 mm:ss 가 뒤로 점프한다(검수 실증 — pending 대기가 긴 배치).
  const startedAt =
    snap?.startedAt !== undefined && fallbackStartedAt !== undefined
      ? Math.min(snap.startedAt, fallbackStartedAt)
      : (snap?.startedAt ?? fallbackStartedAt);
  const hasTail = Boolean(snap && snap.tail.trim().length > 0);

  return (
    <div className="flex h-4 min-w-0 items-center gap-1.5">
      {hasTail && snap ? (
        // ⚠ h-full 필수 — items-center 플렉스에서 절대 배치 자식만 가진 이
        //   컨테이너는 auto 높이 = 0 이 되어 overflow-hidden 이 꼬리를 통째로
        //   클리핑한다(검수 critical 실증 — E10 라이브 꼬리가 화면에서 소실).
        <span className="relative h-full min-w-0 flex-1 overflow-hidden">
          {/* 우측 끝 고정 — 최신 델타가 항상 보인다. 좌측 페이드가 절단을 말하고,
              말미 캐럿(caret-blink 기존 자산)이 "지금 타이핑 중"을 말한다 */}
          <span className="absolute right-0 top-0 whitespace-nowrap text-[10.5px] leading-4 text-slate-500">
            {snap.stage ? `[${snap.stage}] ` : ""}
            {snap.tail}
            <span className="line-gap-caret ml-px text-blue-500" aria-hidden="true">
              ▍
            </span>
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-blue-50 to-transparent"
          />
        </span>
      ) : (
        <span className="min-w-0 flex-1 animate-pulse truncate text-[10.5px] leading-4 text-blue-400">
          {/* 스냅샷 부재는 "생각 중" 단정 금지 — SSE 사망 후 prune 된 잡이
              생성 후반일 수 있다(검수 minor). thinking 판정은 스냅샷에만 */}
          {snap
            ? snap.stage
              ? `[${snap.stage}] 생성을 준비하는 중…`
              : "모델이 생각하는 중…"
            : "생성 진행 중…"}
        </span>
      )}
      {startedAt ? <ElapsedClock fromMs={startedAt} /> : null}
    </div>
  );
}

export const QueueStreamLine = memo(QueueStreamLineInner);
