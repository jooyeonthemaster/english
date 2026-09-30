// ============================================================================
// 인쇄 진입점 누름 무장(26-09-30 PRINT-RESPONSE · CC-2 / PRINT-R4) — React 무의존.
//
// 문제: 빠른 경로는 Safari 사용자 활성화를 지키려고 click 태스크 하나 안에서 전 쪽 flushSync · 가드 · print() 를
// 끝낸다. 그 태스크 동안 페인트가 없어 「준비 중」이 한 번도 안 보이고, 느린 CPU 에서는 클릭 뒤 수 초 동안 화면이
// 반응 없이 멈춘다(개발 서버 CPU 4× 실측 9~10초).
// 대책: 사람의 누름(pointerdown → click)에는 수십~백여 ms 가 있고 그 사이 렌더링 기회가 돈다(실측 5~7프레임).
// 누르는 순간 상태 표시줄 · 버튼을 「준비 중」으로 **무장**해 그 사이에 페인트하고, 인쇄는 지금처럼 click 태스크
// 안에서 부른다(제스처 그대로). 멈춘 동안에는 마지막으로 페인트된 「준비 중」과 컴포지터 스피너가 보인다.
//
// 무장은 표시일 뿐이다 — 버튼을 disabled 로 만들지 않는다(그러면 뒤따를 click 이 사라진다). 호스트 컴포넌트를 다시
// 그리지 않도록 무장 상태는 작은 외부 스토어에 두고 표시줄 · 버튼만 구독한다(빌더 전체 재렌더 = 수백 ms).
// 인쇄로 이어지지 않은 누름은 **타이머 없이** 입력 사건으로 푼다(엔진 3종 실측 — scratchpad order-probe):
//   · mouse · 키보드: click 은 떼는 사건과 같은 태스크에서 온다(pointerup→click · keydown Enter→click ·
//     keyup Space→click). 떼는 사건 뒤 첫 프레임에 아직 소비되지 않았으면 해제한다.
//   · touch · pen: click 이 다음 태스크(제스처 인식 뒤)에 온다 — Chromium 은 pointerup 뒤 rAF 가 click 보다 먼저
//     돈다. 그래서 프레임으로 풀지 않고 떼는 점이 버튼 밖 · pointercancel · contextmenu(길게 누름) · 다른 곳 click 으로 푼다.
//   · 공통: 다른 곳의 새 pointerdown · 창 blur · 탭 숨김 · 표시줄 [취소].
// 소비는 컨트롤러가 인쇄 잡을 시작할 때 — 리스너만 떼고 표시는 잡의 다음 상태가 같은 커밋에서 이어받는다.
// ============================================================================

import type { ExamPrintMode } from "@/lib/exams/print-event-meta";

export type PrintArmIntent = "mouse" | "touch" | "key-enter" | "key-space";

/** React PointerEvent · KeyboardEvent(또는 DOM 사건)의 무장에 필요한 면 */
export interface PrintArmEventLike {
  type: string;
  pointerType?: string;
  button?: number;
  isPrimary?: boolean;
  key?: string;
  repeat?: boolean;
  currentTarget?: unknown;
  /** React 합성 사건의 원본 — 무장한 그 사건을 해제 판정에서 다시 세지 않는다 */
  nativeEvent?: unknown;
}

/** 진입점(툴바 · 메뉴 · 모바일 바 · 상태 표시줄 버튼)이 쓰는 무장 면 — 컨트롤러가 준다 */
export interface ExamPrintArming {
  /** 진입점의 onPointerDown · onKeyDown 에서 부른다. 무장했으면 true */
  arm: (mode: ExamPrintMode, event: PrintArmEventLike) => boolean;
  /** 무장된 모드(없으면 null) — useSyncExternalStore 로 구독한다 */
  get: () => ExamPrintMode | null;
  subscribe: (listener: () => void) => () => void;
}

/** 누름 → 무장 의도. null = 무장하지 않는다(보조 버튼 · 비주 포인터 · 비활성 버튼 · 반복 키 · 다른 키) */
export function printArmIntent(event: PrintArmEventLike): PrintArmIntent | null {
  const target = event.currentTarget as { disabled?: unknown } | null | undefined;
  if (target?.disabled === true) return null;
  if (event.type === "pointerdown") {
    if (event.isPrimary === false) return null;
    if ((event.button ?? 0) !== 0) return null;
    return event.pointerType === "mouse" ? "mouse" : "touch"; // pen · 모르는 종류는 touch 처럼(사건으로만 푼다)
  }
  if (event.type === "keydown" && !event.repeat) {
    if (event.key === "Enter") return "key-enter";
    if (event.key === " " || event.key === "Spacebar") return "key-space";
  }
  return null;
}

export interface PrintArmStore {
  get: () => ExamPrintMode | null;
  set: (mode: ExamPrintMode | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createPrintArmStore(): PrintArmStore {
  let current: ExamPrintMode | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (mode) => {
      if (mode === current) return;
      current = mode;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type Listener = (event: Event) => void;
interface ListenerTarget {
  addEventListener: (type: string, fn: Listener, capture?: boolean) => void;
  removeEventListener: (type: string, fn: Listener, capture?: boolean) => void;
}
export interface ArmWatchWindow extends ListenerTarget {
  requestAnimationFrame: (fn: () => void) => number;
  cancelAnimationFrame: (id: number) => void;
}
export interface ArmWatchDocument extends ListenerTarget {
  visibilityState?: string;
}

export interface WatchArmedGestureOptions {
  win: ArmWatchWindow;
  doc?: ArmWatchDocument | null;
  intent: PrintArmIntent;
  /** 누른 진입점 — touch 의 떼는 점이 그 안인지 본다 */
  trigger?: unknown;
  /** 무장한 원본 사건 — 같은 사건을 다시 받으면 무시한다 */
  source?: unknown;
  /** 인쇄로 이어지지 않고 누름이 끝났다(한 번만) */
  onEnd: () => void;
}

/** touch 의 떼는 점이 진입점 안인가(문서에서 떨어졌거나 잴 수 없으면 밖으로 친다) */
function pointInside(trigger: unknown, event: Event): boolean {
  const el = trigger as { isConnected?: boolean; getBoundingClientRect?: () => DOMRect } | null;
  const { clientX, clientY } = event as PointerEvent;
  if (!el?.getBoundingClientRect || el.isConnected === false) return false;
  if (typeof clientX !== "number" || typeof clientY !== "number") return false;
  const r = el.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

const isSpace = (event: Event) => {
  const key = (event as KeyboardEvent).key;
  return key === " " || key === "Spacebar";
};

/**
 * 무장된 누름이 인쇄 없이 끝나는지 지켜본다. 돌려주는 함수 = 소비(리스너 · 예약 프레임 해제, onEnd 없음).
 * 리스너는 창 캡처 단계에 단다 — 무장한 사건 자신은 이미 창 캡처를 지났으므로 다시 받지 않는다. click 만 버블 단계:
 * 진입점의 click 핸들러가 먼저(React 루트) 인쇄를 시작해 이 리스너를 떼고, 다른 곳의 click 만 여기까지 온다.
 */
export function watchArmedGesture({ win, doc, intent, trigger, source, onEnd }: WatchArmedGestureOptions): () => void {
  let settled = false;
  let frame: number | null = null;
  const attached: Array<[ListenerTarget, string, Listener, boolean]> = [];

  const dispose = () => {
    if (settled) return;
    settled = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    for (const [target, type, fn, capture] of attached) target.removeEventListener(type, fn, capture);
  };
  const end = () => {
    if (settled) return;
    dispose();
    onEnd();
  };
  // click 이 떼는 사건과 같은 태스크에서 오는 입력 — 그 태스크가 끝난 뒤(다음 프레임)에도 소비되지 않았으면 해제
  const endAfterThisTask = () => {
    if (settled || frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      end();
    });
  };
  const on = (target: ListenerTarget, type: string, fn: Listener, capture = true) => {
    target.addEventListener(type, fn, capture);
    attached.push([target, type, fn, capture]);
  };

  on(win, "pointercancel", end);
  // 창 자신의 blur 만(다른 창 · 앱으로 전환). 요소 사이 포커스 이동의 blur 는 창 캡처 단계를 지나므로 걸러야 한다 —
  // 메뉴 항목을 누르면 [다운로드] 버튼이 blur 된다(26-09-30 실측: 이것으로 PDF · PDF 해설 무장이 즉시 풀렸다).
  on(win, "blur", (event) => ((event.target as unknown) === win ? end() : undefined), false);
  if (doc) on(doc, "visibilitychange", () => (doc.visibilityState === "hidden" ? end() : undefined));
  // 새 누름 — 다른 곳이면 해제. 같은 진입점이면 그 핸들러가 곧바로 다시 무장한다.
  on(win, "pointerdown", (event) => (event === source ? undefined : end()));
  on(win, "click", end, false);
  if (intent === "mouse") {
    on(win, "pointerup", endAfterThisTask);
  } else if (intent === "touch") {
    on(win, "contextmenu", end);
    on(win, "pointerup", (event) => (pointInside(trigger, event) ? undefined : end()));
  } else if (intent === "key-enter") {
    endAfterThisTask(); // click 은 이 keydown 과 같은 태스크
  } else {
    on(win, "keyup", (event) => (isSpace(event) ? endAfterThisTask() : undefined));
  }
  return dispose;
}
