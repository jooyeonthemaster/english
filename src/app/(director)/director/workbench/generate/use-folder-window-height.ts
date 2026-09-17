import { useState } from "react";
import type React from "react";
import {
  FOLDER_WINDOW_DEFAULT_HEIGHT,
  FOLDER_WINDOW_HEIGHT_STORAGE_KEY,
  FOLDER_WINDOW_MAX_HEIGHT,
  FOLDER_WINDOW_MIN_HEIGHT,
} from "./passage-card-grid-constants";

/**
 * 폴더 창 높이/접힘 상태 + 리사이즈/리셋 핸들러. 높이는 localStorage 영속.
 *
 * 성능 계약(2026-08-11 개정 — "핸들이 전역에서 버벅인다" 실사용 지적):
 * 드래그 중에는 **React 를 거치지 않는다.** 매 pointermove 의 setState 는 호스트
 * (지문함 그리드 — 카드 수백 장)를 프레임마다 통째로 리렌더시켜 드래그가 뚝뚝
 * 끊겼다. 이제 이동 중에는 `[data-folder-window]` 요소의 style.height 에 rAF
 * 코얼레싱으로 직접 쓰고, 포인터를 놓을 때 한 번만 setState + 영속한다.
 * 창 요소를 못 찾으면(레거시 마크업) 종전 setState 경로로 폴백 — 동작 동일.
 */
export function useFolderWindowHeight(initialCollapsed = false) {
  // initialCollapsed(additive, 기본 false = 기존 호스트 동작 그대로): 세로 공간이
  // 귀한 임베드(클래스 스튜디오 워크벤치)가 폴더 창을 접힌 채로 시작해 카드
  // 행에 자리를 양보한다 — 펼치기는 한 클릭(2026-08-11 "카드 6장" 지시).
  const [folderWindowCollapsed, setFolderWindowCollapsed] =
    useState(initialCollapsed);
  const [folderWindowHeight, setFolderWindowHeight] = useState<number>(() => {
    if (typeof window === "undefined") return FOLDER_WINDOW_DEFAULT_HEIGHT;
    try {
      const raw = window.localStorage.getItem(FOLDER_WINDOW_HEIGHT_STORAGE_KEY);
      if (!raw) return FOLDER_WINDOW_DEFAULT_HEIGHT;
      const n = parseInt(raw, 10);
      if (Number.isNaN(n)) return FOLDER_WINDOW_DEFAULT_HEIGHT;
      return Math.min(
        FOLDER_WINDOW_MAX_HEIGHT,
        Math.max(FOLDER_WINDOW_MIN_HEIGHT, n),
      );
    } catch {
      return FOLDER_WINDOW_DEFAULT_HEIGHT;
    }
  });

  const beginFolderWindowResize = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = folderWindowHeight;
    let latest = startHeight;

    // 포인터 캡처 — 손가락/커서가 얇은 바를 벗어나도 이 요소가 계속 이벤트를
    // 받아 드래그가 끊기지 않는다. 터치에서 특히 중요.
    const handle = event.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
    }

    // 드래그 대상 창 실체 — 핸들에서 가장 가까운 조상 범위 안의
    // [data-folder-window] (한 화면에 그리드가 여럿이어도 자기 창만 잡는다).
    let windowEl: HTMLElement | null = null;
    for (
      let scope: HTMLElement | null = handle.parentElement;
      scope && !windowEl;
      scope = scope.parentElement
    ) {
      windowEl = scope.querySelector<HTMLElement>("[data-folder-window]");
    }

    const prevPointerEvents = document.body.style.pointerEvents;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    // 드래그 중 hover 스타일 재평가 차단 — 창 높이가 바뀌면 아래 카드들이
    // 밀리며 커서 아래 요소가 계속 바뀐다(캡처 덕에 move 수신은 유지).
    document.body.style.pointerEvents = "none";

    // rAF 코얼레싱 — 고주사율 포인터가 프레임당 여러 번 발화해도 스타일 기록은
    // 프레임당 1회.
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      if (windowEl) windowEl.style.height = `${latest}px`;
    };

    const onMove = (ev: PointerEvent) => {
      latest = Math.min(
        FOLDER_WINDOW_MAX_HEIGHT,
        Math.max(FOLDER_WINDOW_MIN_HEIGHT, startHeight + (ev.clientY - startY)),
      );
      if (windowEl) {
        if (rafId === null) rafId = requestAnimationFrame(flush);
      } else {
        // 폴백(레거시) — 창 요소를 못 찾으면 종전대로 상태 갱신
        setFolderWindowHeight(latest);
      }
    };

    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.pointerEvents = prevPointerEvents;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // 터치 제스처가 OS 에 의해 취소될 때(pointercancel)도 동일하게 정리.
      window.removeEventListener("pointercancel", onUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (windowEl) windowEl.style.height = `${latest}px`;
      // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회.
      setFolderWindowHeight(latest);
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      try {
        window.localStorage.setItem(
          FOLDER_WINDOW_HEIGHT_STORAGE_KEY,
          String(latest),
        );
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const resetFolderWindowHeight = () => {
    setFolderWindowHeight(FOLDER_WINDOW_DEFAULT_HEIGHT);
    try {
      window.localStorage.setItem(
        FOLDER_WINDOW_HEIGHT_STORAGE_KEY,
        String(FOLDER_WINDOW_DEFAULT_HEIGHT),
      );
    } catch {
      /* ignore */
    }
  };

  return {
    folderWindowHeight,
    folderWindowCollapsed,
    setFolderWindowCollapsed,
    beginFolderWindowResize,
    resetFolderWindowHeight,
  };
}
