// ============================================================================
// 시험지 인쇄 포털(#exam-print-host) 소유 기록 — React 무의존. usePrintPortal(포털을 세우고 걷는 쪽)과
// 인쇄 잡(새 인쇄 요청을 시작하는 쪽)이 같이 쓴다.
//
// 왜 있나(26-09-30 PRINT-R7): 포털은 beforeprint 에서 서고 afterprint 에서 걷힌다. afterprint 가 끝내 오지 않으면
// (모바일 비차단 인쇄 뒤 afterprint 누락, 누가 만들고 버린 주인 없는 호스트) 호스트가 남는다. 종전 판정 (3)
// 「호스트가 이미 있으면 비켜선다」는 그 남은 호스트 하나 때문에 이후 **모든** 포털을 영구히 막았다 — 네이티브
// 인쇄는 앞 2쪽만, 버튼 인쇄는 printed 로 기록되면서 남은 호스트의 옛 내용을 찍었다(FAULT=host-preexists 실측).
// 그래서 「이미 있는 호스트」를 둘로 가른다:
//   · 이번 인쇄 사건(같은 beforeprint Event 객체)에 선 포털 → "same-print": 호출자는 비켜선다(판정 (3) —
//     두 인스턴스가 한 인쇄에 두 시험지를 옮기지 않게).
//   · 그 밖(지난 인쇄의 잔재 · 주인 없는 호스트) → 치운다. 주인이 살아 있으면 주인의 원복(루트 원위치)을 부르고,
//     주인이 없으면 호스트를 떼고 body 클래스를 지운다. 그 뒤 호출자는 판정을 그대로 이어 간다.
// 한 번의 beforeprint 디스패치 동안 모든 리스너는 **같은 Event 객체**를 받는다(DOM 명세 — 사건 하나를 리스너마다
// 넘긴다). 그래서 사건 동일성으로 「이번 인쇄」를 가른다. 마이크로태스크로 표시를 지우는 방식은 쓸 수 없다 —
// 브라우저가 쏜 사건은 리스너 사이마다 마이크로태스크 체크포인트가 돌아 둘째 리스너가 표시를 못 본다.
// ============================================================================

/** 인쇄하는 동안 루트를 옮겨 담는 body 직속 호스트(print-styles.tsx 가 이 id 만 남기고 나머지를 숨긴다) */
export const EXAM_PRINT_HOST_ID = "exam-print-host";
/** 포털이 서 있는 동안 body 에 붙는 클래스(print-styles.tsx `body.exam-print-active > *:not(#exam-print-host)`) */
export const EXAM_PRINT_BODY_CLASS = "exam-print-active";

export interface PrintPortalClaim {
  /** 이 포털의 호스트 요소 */
  host: HTMLElement;
  /** 포털을 세운 beforeprint 사건(사건 밖에서 세웠으면 null) */
  event: Event | null;
  /** 주인의 원복 — 루트 원위치 · 호스트 제거 · body 클래스 해제 · 전 쪽 마운트 해제. 여러 번 불려도 안전해야 한다 */
  release: () => void;
}

// 문서 전체에서 포털은 한 번에 하나다(판정 (3)). 모듈 단위 기록.
let claim: PrintPortalClaim | null = null;

/** 포털을 세운 직후 주인이 부른다. */
export function claimPrintPortal(next: PrintPortalClaim): void {
  claim = next;
}

/** 주인이 포털을 걷을 때 부른다 — 그 호스트의 기록일 때만 지운다(다른 주인의 기록은 건드리지 않는다). */
export function dropPrintPortalClaim(host: HTMLElement | null): void {
  if (claim && host && claim.host === host) claim = null;
}

/** 지금 기록된 포털(테스트 · 진단용) */
export function currentPrintPortalClaim(): PrintPortalClaim | null {
  return claim;
}

/**
 * 지금 문서가 **인쇄 레이아웃으로 그려지는 중**인가 — 포털을 지금 걷으면 인쇄물에서 시험지가 빠지는 구간.
 * 26-09-30 PH-R1 실측(헤드리스 Chromium printToPDF, 랜딩 PC 데모): beforeprint 리스너 안에서는 false, 그 뒤 인쇄 레이아웃이
 * 매체 질의를 다시 평가하며 true(이때 폭 질의 change 가 발화해 DemoGate 가 데모를 언마운트한다) — 그 언마운트 cleanup 시점도
 * true — afterprint 에서 false. 모바일 비차단 print() 가 돌아온 뒤처럼 화면이 다시 상호작용 중이면 false(원복해야 하는 구간).
 * matchMedia 가 없는 환경은 false(종전 동작 = 즉시 원복).
 */
export function isPrintLayoutActive(
  win: { matchMedia?: (query: string) => { matches: boolean } } | undefined = typeof window === "undefined"
    ? undefined
    : window,
): boolean {
  try {
    return typeof win?.matchMedia === "function" && win.matchMedia("print").matches === true;
  } catch {
    return false;
  }
}

export type StalePrintPortalResult = "clear" | "same-print" | "healed";

function detach(node: HTMLElement) {
  const parent = node.parentNode;
  if (parent) parent.removeChild(node);
}

/**
 * 남은 포털을 치운다.
 * @param event 지금 디스패치 중인 beforeprint 사건. 인쇄 사건 밖(새 인쇄 요청 시작 등)이면 null — 그때 남아 있는
 *   호스트는 정의상 전부 지난 인쇄의 잔재다.
 * @returns "same-print" 이번 사건에 이미 선 포털이 있다(호출자는 비켜선다) · "healed" 남은 포털을 치웠다 · "clear" 없음
 */
export function settleStalePrintPortal(
  doc: Document = document,
  event: Event | null = null,
): StalePrintPortalResult {
  let result: StalePrintPortalResult = "clear";
  // 기록은 남았는데 호스트가 문서에서 사라진 경우(남이 떼어 냄) — 주인 원복으로 루트를 제자리에 돌려놓는다.
  if (claim && !claim.host.isConnected) {
    const stale = claim;
    claim = null;
    stale.release();
    result = "healed";
  }
  // 호스트가 여럿 남았을 수도 있다 — 하나씩 치운다(치운 호스트는 문서에서 빠지므로 다음 조회는 다음 것).
  for (let guard = 0; guard < 16; guard += 1) {
    const host = doc.getElementById(EXAM_PRINT_HOST_ID);
    if (!host) return result;
    if (claim && claim.host === host) {
      if (event !== null && claim.event === event) return "same-print";
      const stale = claim;
      claim = null;
      stale.release();
    }
    // 주인 없는 호스트이거나 주인 원복이 떼지 못했다 — 직접 뗀다.
    if (host.isConnected) detach(host);
    doc.body?.classList.remove(EXAM_PRINT_BODY_CLASS);
    result = "healed";
  }
  return result;
}
