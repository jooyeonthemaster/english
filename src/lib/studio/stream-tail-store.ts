// ============================================================================
// 도시에 큐 스트립 라이브 스트림 스토어 (docs/class-studio-spec.md §3.10.11-b)
//
// 생성 스트리밍(SSE 델타 ~8회/초)의 꼬리 텍스트를 React 상태 트리 **밖**에서
// 나른다 — 델타를 props 로 흘리면 시그니처 메모(queueItemsSig)·memo 방어선
// (PassageDossierAccordion)이 무너져 우측 판 전체가 초당 수 회 재렌더된다
// (§3.10.9 함정 1 계열, sessionQueueSig 가 streamPreview 를 제외하는 것과 같은
// 이유). 대신: 오케스트레이터 effect 가 여기 적재하고, 표시는 QueueStreamLine
// 하나가 키 구독(useSyncExternalStore)으로 그린다 — 델타 리렌더 반경 = 그
// 컴포넌트 1개.
//
// 순수 TS(React 무의존) — 테스트·비 React 소비가 자유롭다.
// ============================================================================

export interface StreamSnapshot {
  /** 스트림 꼬리(슬라이딩 윈도우 ≤420자) — 최신이 문자열 끝 */
  tail: string;
  phase: "thinking" | "generating";
  /** 분석 큐 전용 현재 단계 한글 라벨("어휘"·"실전 워크북" 등) */
  stage?: string;
  /** 스트림 시작 시각(ms epoch) — 경과 표시 재료 */
  startedAt: number;
}

type Listener = () => void;

export interface StreamTailStore {
  /** 키 스냅샷 — 없으면 undefined(대기/종료). 참조는 내용 변화 시에만 교체 */
  get(key: string): StreamSnapshot | undefined;
  /** 내용(tail·phase·stage) 변화 시에만 해당 키 구독자에 notify(멱등 재적재 무소음) */
  set(key: string, snap: StreamSnapshot): void;
  /** alive 에 없는 키 전부 제거 + 제거된 키 구독자 notify(종료 시 라인 소거) */
  prune(alive: ReadonlySet<string>): void;
  /** 키 구독 — useSyncExternalStore 계약(해지 함수 반환) */
  subscribe(key: string, listener: Listener): () => void;
}

export function createStreamTailStore(): StreamTailStore {
  const snapshots = new Map<string, StreamSnapshot>();
  const listeners = new Map<string, Set<Listener>>();

  const notify = (key: string) => {
    const set = listeners.get(key);
    if (!set) return;
    for (const l of [...set]) l();
  };

  return {
    get: (key) => snapshots.get(key),
    set: (key, snap) => {
      const prev = snapshots.get(key);
      if (
        prev &&
        prev.tail === snap.tail &&
        prev.phase === snap.phase &&
        prev.stage === snap.stage
      ) {
        return; // 내용 무변 — 참조 유지(useSyncExternalStore 재렌더 억제)
      }
      snapshots.set(key, snap);
      notify(key);
    },
    prune: (alive) => {
      for (const key of [...snapshots.keys()]) {
        if (alive.has(key)) continue;
        snapshots.delete(key);
        notify(key);
      }
    },
    subscribe: (key, listener) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        // 세대 가드(검수 minor 실증): 해지 → 재구독으로 키에 새 Set 이 생긴 뒤
        // 옛 해지 함수가 한 번 더 불리면, 무가드 삭제는 살아 있는 새 구독자의
        // 맵 엔트리를 통째로 지운다 — 자기 세대일 때만 정리한다(해지 멱등).
        if (listeners.get(key) !== set) return;
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
  };
}
