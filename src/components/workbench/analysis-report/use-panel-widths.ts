import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

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

/**
 * 3분할 레이아웃(좌측 학습활동 레일 · 중앙 캔버스 · 우측 속성 패널)의 폭 상태 + 드래그 리사이즈.
 * 폭은 localStorage에 영속되며, 드래그 중에는 widthDragging=true로 트랜지션을 끈다.
 */
export function usePanelWidths() {
  // 폭 드래그 중에는 너비 트랜지션을 꺼서(여닫힘 애니메이션과 충돌 방지) 즉각 반응하게 한다.
  const [widthDragging, setWidthDragging] = useState(false);
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
  const startWidthDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, side: "rail" | "panel" | "activity") => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startRail = railWidth;
      const startPanel = panelWidth;
      const startActivity = activityWidth;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setWidthDragging(true);

      const move = (moveEvent: PointerEvent) => {
        moveEvent.preventDefault();
        const delta = moveEvent.clientX - startX;
        // 학습 활동 패널은 창 왼쪽에 있어 핸들이 오른쪽 모서리 → 오른쪽 드래그가 폭 증가(+delta).
        if (side === "rail") setRailWidth(clampRailWidth(startRail + delta));
        else if (side === "activity") setActivityWidth(clampActivityWidth(startActivity + delta));
        else setPanelWidth(clampPanelWidth(startPanel - delta));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        setWidthDragging(false);
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [railWidth, panelWidth, activityWidth],
  );

  return { railWidth, panelWidth, activityWidth, widthDragging, startWidthDrag };
}
