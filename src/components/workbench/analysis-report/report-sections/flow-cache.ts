import type { FlowItem } from "./types";

/**
 * 섹션(슬롯) 단위 flow 캐시.
 *
 * `reportFlowItems` 는 "보고서 → 문서 전체 JSX 1벌"을 매번 통째로 새로 만든다. 그 결과
 * 어휘 한 행만 고쳐도 전 문서의 `FlowItem.node` 엘리먼트가 **전부 새 객체**가 되고,
 * React 는 서브트리 bailout 을 못 해 측정 클론 · 실제 페이지 · 썸네일 3벌을 통째로 재조정한다
 * (필기 캔버스 수십 개의 ResizeObserver 재부착 + 강제 동기 레이아웃 폭풍이 여기서 나온다).
 *
 * 이 캐시는 "입력(키)이 얕은 비교로 같으면 **직전에 만든 배열을 참조까지 그대로** 돌려준다"
 * 만 한다. 그러면 손대지 않은 섹션의 node 참조가 보존되어 React 가 그 서브트리를 건너뛴다.
 * 절약되는 건 JS 시간보다 **재조정 비용**이다.
 *
 * 계약(불변):
 *  - 순수 조회/저장만 한다. 부수효과가 없으므로 **렌더 중 호출해도 안전**하고
 *    StrictMode 이중 렌더에서도 결과가 동일하다(2회차는 그냥 hit).
 *  - `build()` 는 항상 **동기**로 호출된다(호출부가 클로저로 잡은 `no` 등이 그 시점 값이어야 함).
 *  - 키 비교는 `Object.is` 얕은 비교다. 키에는 안정 참조(예: `report.sections[i]`)와
 *    원시값만 넣어라. 렌더마다 새로 만들어지는 객체를 넣으면 영구 미스가 되어 이득이 0 이 된다.
 *  - **키 누락은 버그(화면이 갱신 안 되는 stale)**, 과잉은 그냥 느린 것뿐이다 →
 *    확신이 없으면 넣어라.
 *  - 슬롯키가 충돌해도 안전 쪽으로 실패한다: 서로 다른 입력이면 키가 달라 miss → 재빌드일 뿐이다.
 */
type CacheEntry = { key: readonly unknown[]; value: unknown };

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

export class SectionFlowCache {
  private readonly store = new Map<string, CacheEntry>();

  /**
   * 임의 값의 슬롯 캐시(FlowItem[] 이 아닌 중간 산출물 — 예: passage study 노트).
   * 키가 얕은 비교로 동일하면 저장된 값을 그대로, 아니면 `build()` 실행 후 저장.
   */
  memo<T>(slotKey: string, key: readonly unknown[], build: () => T): T {
    const hit = this.store.get(slotKey);
    if (hit && sameKey(hit.key, key)) return hit.value as T;
    const value = build();
    this.store.set(slotKey, { key, value });
    return value;
  }

  /**
   * key 가 이전과 얕은 비교로 동일하면 캐시된 FlowItem[] 를 그대로 반환(참조 보존),
   * 아니면 build() 실행 후 저장.
   */
  get(slotKey: string, key: readonly unknown[], build: () => FlowItem[]): FlowItem[] {
    return this.memo(slotKey, key, build);
  }

  /**
   * 이번 렌더에서 안 쓰인 항목 제거(누수 방지).
   * 섹션 삭제 · 목차 끄기 · undo/redo 를 반복하면 죽은 슬롯이 계속 쌓이는데,
   * 슬롯 하나가 수십~수백 개의 React 엘리먼트를 붙잡고 있으므로 반드시 호출해야 한다.
   */
  sweep(usedSlotKeys: Iterable<string>): void {
    const live = new Set(usedSlotKeys);
    for (const slotKey of [...this.store.keys()]) if (!live.has(slotKey)) this.store.delete(slotKey);
  }

  /** 보관 중인 슬롯 수 — 진단/테스트용. */
  get size(): number {
    return this.store.size;
  }
}
