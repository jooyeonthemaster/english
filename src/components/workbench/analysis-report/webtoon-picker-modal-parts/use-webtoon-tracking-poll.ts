import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { isTrackingActive, type TrackedItem } from "./webtoon-picker-utils";

const POLL_INTERVAL_MS = 2500;

/**
 * 진행 중 웹툰 폴링 — 완료/실패 시 추적 목록에서 제거하고 갤러리를 새로고침한다.
 *
 * `reload`·`onCompleted` 는 호스트가 useCallback 으로 고정해 넘겨야 한다. 매 렌더
 * 새 함수면 effect 가 매번 재무장돼(cleanup 이 타이머를 지움) 입력 중 재렌더마다
 * 폴링이 2.5초씩 밀린다.
 */
export function useWebtoonTrackingPoll({
  open,
  tracking,
  setTracking,
  reload,
  onCompleted,
}: {
  open: boolean;
  tracking: TrackedItem[];
  setTracking: Dispatch<SetStateAction<TrackedItem[]>>;
  /** 완료본을 목록에 반영한다 — placeholder 제거보다 먼저 끝나야 깜빡임이 없다. */
  reload: () => Promise<void>;
  /** 완료 토스트 직후 호출 — 호스트가 보관함 탭으로 전환한다. */
  onCompleted: () => void;
}): void {
  // tick 은 비동기로 최신 추적 목록을 읽는다. 렌더 중 ref 쓰기 대신 커밋 뒤 동기화
  // (폴링 effect 보다 먼저 선언돼 같은 커밋에서 먼저 실행된다).
  const trackingRef = useRef<TrackedItem[]>(tracking);
  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const active = tracking.filter(isTrackingActive);
    if (active.length === 0) {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (pollTimer.current) return;

    // 모달이 닫히거나(effect cleanup) 폴링이 진행되는 동안 닫히면, await 이후 tick 이
    // 타이머를 재무장하거나 토스트/state 를 건드리지 않도록 cancelled 로 차단한다.
    let cancelled = false;

    const tick = async () => {
      pollTimer.current = null;
      if (cancelled) return;
      const ids = trackingRef.current.filter(isTrackingActive).map((t) => t.id);
      if (ids.length === 0) return;
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/webtoons/${id}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => (d?.ok ? (d.webtoon as { id: string; status: string }) : null))
            .catch(() => null),
        ),
      );
      if (cancelled) return;

      const statusById = new Map(
        results.filter(Boolean).map((w) => [w!.id, w!.status]),
      );
      const doneIds = new Set(
        [...statusById].filter(([, s]) => s === "COMPLETED").map(([id]) => id),
      );
      const failedIds = new Set(
        [...statusById].filter(([, s]) => s === "FAILED").map(([id]) => id),
      );

      // 완료본을 먼저 목록에 반영한 뒤 placeholder 를 제거해야 카드가 "잠깐 사라졌다"
      // 다시 나타나는 깜빡임이 없다. (제거→로드 순서면 로드(약 0.6s) 동안 카드가 빈다)
      if (doneIds.size > 0) {
        await reload();
        if (cancelled) return;
        toast.success("웹툰 생성이 완료되었습니다.");
        onCompleted();
      }
      if (failedIds.size > 0) {
        toast.error("일부 웹툰 생성이 실패했습니다. 크레딧은 환불됩니다.");
      }

      // 상태가 실제로 바뀐 게 있을 때만 갱신(불필요한 매 틱 재렌더 방지). 해결된 항목 제거.
      const changed =
        doneIds.size > 0 ||
        failedIds.size > 0 ||
        trackingRef.current.some((t) => {
          const s = statusById.get(t.id);
          return !!s && s !== t.status;
        });
      if (changed) {
        setTracking((prev) =>
          prev
            .map((t) => {
              const s = statusById.get(t.id);
              return s ? { ...t, status: s as TrackedItem["status"] } : t;
            })
            .filter(isTrackingActive),
        );
      }

      const remaining = ids.filter(
        (id) => !doneIds.has(id) && !failedIds.has(id),
      );
      if (!cancelled && remaining.length > 0) {
        pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [open, tracking, setTracking, reload, onCompleted]);
}
