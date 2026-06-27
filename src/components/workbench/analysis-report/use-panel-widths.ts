import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  ACTIVITY_WIDTH_DEFAULT,
  ACTIVITY_WIDTH_STORAGE_KEY,
  clampActivityWidth,
  clampPanelWidth,
  clampRailWidth,
  PANEL_WIDTH_DEFAULT,
  PANEL_WIDTH_STORAGE_KEY,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_STORAGE_KEY,
  readStoredWidth,
} from "./editor-storage";

// 이 픽셀 이하의 이동은 '클릭(여닫기)'으로 간주 — 같은 핸들이 클릭=토글, 드래그=폭조절.
const WIDTH_DRAG_THRESHOLD = 4;

/**
 * 3분할 레이아웃(좌측 학습활동 레일 · 중앙 캔버스 · 우측 속성 패널)의 폭 상태 + 드래그 리사이즈.
 * 폭은 localStorage에 영속되며, 드래그 중에는 widthDragging=true로 트랜지션을 끈다.
 *
 * 여닫기 탭과 폭조절 핸들을 한 요소로 합칠 수 있도록(시험지 생성 UI와 동일), 드래그가
 * 임계값을 넘으면 `consumeWidthDragClick()` 이 true 를 돌려 직후의 click(토글)을 막는다.
 */
export function usePanelWidths() {
  // 폭 드래그 중에는 너비 트랜지션을 꺼서(여닫힘 애니메이션과 충돌 방지) 즉각 반응하게 한다.
  const [widthDragging, setWidthDragging] = useState(false);
  // 드래그로 폭을 바꾼 직후 발생하는 click 이 패널을 토글하지 않도록 막는 플래그.
  const suppressClickRef = useRef(false);
  const [railWidth, setRailWidth] = useState(() =>
    readStoredWidth(RAIL_WIDTH_STORAGE_KEY, RAIL_WIDTH_DEFAULT, clampRailWidth),
  );
  const [panelWidth, setPanelWidth] = useState(() =>
    readStoredWidth(PANEL_WIDTH_STORAGE_KEY, PANEL_WIDTH_DEFAULT, clampPanelWidth),
  );
  const [activityWidth, setActivityWidth] = useState(() =>
    readStoredWidth(ACTIVITY_WIDTH_STORAGE_KEY, ACTIVITY_WIDTH_DEFAULT, clampActivityWidth),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(railWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [railWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [panelWidth]);
  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_WIDTH_STORAGE_KEY, String(activityWidth));
    } catch {
      // 편의 설정이라 실패해도 현재 세션 동작엔 영향 없음.
    }
  }, [activityWidth]);

  // 좌/우 패널 폭 드래그 — 포인터 이벤트로 col-resize (exam paper builder 와 동일한 UX).
  // pointerdown 에서 preventDefault 하지 않아 이어지는 click(토글)이 살아 있고,
  // 임계값을 넘겨 움직였을 때만 폭을 조절하며 그 직후의 click 은 억제한다.
  const startWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, side: "rail" | "panel" | "activity") => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      suppressClickRef.current = false;
      const startX = event.clientX;
      const startRail = railWidth;
      const startPanel = panelWidth;
      const startActivity = activityWidth;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      let didDrag = false;

      const move = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        if (!didDrag) {
          if (Math.abs(delta) < WIDTH_DRAG_THRESHOLD) return;
          didDrag = true;
          suppressClickRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          setWidthDragging(true);
        }
        moveEvent.preventDefault();
        // 학습 활동 패널은 창 왼쪽에 있어 핸들이 오른쪽 모서리 → 오른쪽 드래그가 폭 증가(+delta).
        if (side === "rail") setRailWidth(clampRailWidth(startRail + delta));
        else if (side === "activity") setActivityWidth(clampActivityWidth(startActivity + delta));
        else setPanelWidth(clampPanelWidth(startPanel - delta));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (didDrag) {
          document.body.style.cursor = prevCursor;
          document.body.style.userSelect = prevSelect;
          setWidthDragging(false);
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [railWidth, panelWidth, activityWidth],
  );

  // 토글 핸들의 onClick 에서 호출 — 직전에 드래그(폭조절)했으면 true(토글 생략).
  const consumeWidthDragClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return true;
    }
    return false;
  }, []);

  return { railWidth, panelWidth, activityWidth, widthDragging, startWidthDrag, consumeWidthDragClick };
}
