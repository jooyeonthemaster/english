// 패널 드래그 동결(26-09-08) — 전역 드래그 성능 계약(직접 DOM + rAF + 포인터 캡처 + 커밋 1회)의 마지막 조각.
//
// 핸들 쪽은 매 프레임 setState 없이 style.width 만 쓰지만, 폭이 바뀌는 **이웃 패널 안의 ResizeObserver**
// (시험지 빌더 그리드 폭·미리보기 fitZoom·툴바 compact 라벨)가 프레임마다 setState 를 쏘면 무거운 조판이
// 드래그 내내 리렌더된다(실측 1920: 33ms 초과 프레임 13개·최대 100ms·조판 DOM 변이 115건).
// 그래서 드래그 중엔 body 에 표식을 세우고, 관찰자는 마지막 값만 들고 있다가 놓을 때 1회 적용한다.
//
// 사용: 핸들 = beginPanelDrag()/endPanelDrag() · 관찰자 = deferWhileDragging(apply) 로 감싼 observe() 호출.
// 표식은 dataset(문자열)이라 React 렌더와 무관하고, 종료 이벤트는 window 커스텀 이벤트 1개다.

export const PANEL_RESIZE_END_EVENT = "smoat:panel-resize-end";

export function isPanelDragging(): boolean {
  return typeof document !== "undefined" && document.body.dataset.panelDragging === "1";
}

export function beginPanelDrag(): void {
  document.body.dataset.panelDragging = "1";
}

/** 놓을 때 — 표식을 내린 **뒤** 이벤트를 쏜다(관찰자가 pending 을 즉시 적용할 수 있게). */
export function endPanelDrag(): void {
  delete document.body.dataset.panelDragging;
  window.dispatchEvent(new Event(PANEL_RESIZE_END_EVENT));
}

/**
 * ResizeObserver 콜백 래퍼 — 드래그 중엔 마지막 값만 보관하고, 드래그가 끝나면 그 값으로 1회 apply.
 * 드래그가 아닐 땐 즉시 apply(무회귀). dispose 로 종료 리스너를 뗀다.
 */
export function deferWhileDragging<T>(apply: (value: T) => void): {
  observe: (value: T) => void;
  dispose: () => void;
} {
  let pending: { value: T } | null = null;
  const onEnd = () => {
    if (!pending) return;
    const { value } = pending;
    pending = null;
    apply(value);
  };
  window.addEventListener(PANEL_RESIZE_END_EVENT, onEnd);
  return {
    observe: (value: T) => {
      if (isPanelDragging()) {
        pending = { value };
        return;
      }
      apply(value);
    },
    dispose: () => {
      window.removeEventListener(PANEL_RESIZE_END_EVENT, onEnd);
      pending = null;
    },
  };
}
