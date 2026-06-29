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
 * (passage-card-grid 에서 추출 — 동작 동일)
 */
export function useFolderWindowHeight() {
  const [folderWindowCollapsed, setFolderWindowCollapsed] = useState(false);
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

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      latest = Math.min(
        FOLDER_WINDOW_MAX_HEIGHT,
        Math.max(FOLDER_WINDOW_MIN_HEIGHT, startHeight + (ev.clientY - startY)),
      );
      setFolderWindowHeight(latest);
    };

    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
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
