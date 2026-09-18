"use client";

// 표 컬럼 너비 — 헤더 핸들 드래그로 조절하고 localStorage 에 유지한다.
// 드래그 중에는 래퍼의 CSS 변수만 갱신(행 리렌더 없음), 놓을 때 상태 반영 + 저장.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ALL_COLUMN_DEFS,
  COLUMN_WIDTH_STORAGE_KEY,
  DEFAULT_COLUMN_WIDTHS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  type ColumnId,
  type ColumnWidths,
} from "./columns";

export function useColumnWidths() {
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useState<ColumnWidths>(DEFAULT_COLUMN_WIDTHS);

  // 초기값은 서버/클라 동일(기본값)로 렌더한 뒤, 마운트 후 저장값을 반영해
  // hydration 불일치를 피한다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_WIDTH_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Record<ColumnId, number>>;
      setColWidths((prev) => {
        const next = { ...prev };
        for (const c of ALL_COLUMN_DEFS) {
          const v = saved[c.id];
          if (typeof v === "number" && Number.isFinite(v)) {
            next[c.id] = Math.min(Math.max(v, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH);
          }
        }
        return next;
      });
    } catch {
      /* 저장값이 손상됐으면 기본값 유지 */
    }
  }, []);

  const columnCssVars = useMemo(
    () =>
      Object.fromEntries(
        ALL_COLUMN_DEFS.map((c) => [`--mw-${c.id}`, `${colWidths[c.id]}px`]),
      ) as CSSProperties,
    [colWidths],
  );

  function startColumnResize(e: React.PointerEvent, id: ColumnId) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[id];
    const wrap = tableWrapRef.current;
    let width = startW;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    const prevPointerEvents = document.body.style.pointerEvents;
    // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않고, 아래의
    // body pointer-events:none 과 조합해도 move 가 계속 들어온다.
    const handle = e.currentTarget as HTMLElement;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
    }
    // rAF 코얼레싱 — 고주사율 포인터가 프레임당 여러 번 발화해도 변수 기록은
    // 프레임당 1회(넓은 표의 열 폭 레이아웃 재계산 반복 방지).
    let rafId: number | null = null;
    const flush = () => {
      rafId = null;
      wrap?.style.setProperty(`--mw-${id}`, `${width}px`);
    };
    const onMove = (ev: PointerEvent) => {
      width = Math.min(
        Math.max(startW + (ev.clientX - startX), MIN_COLUMN_WIDTH),
        MAX_COLUMN_WIDTH,
      );
      if (rafId === null) rafId = requestAnimationFrame(flush);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // 터치 제스처가 OS 에 의해 취소될 때(pointercancel)도 동일하게 정리.
      window.removeEventListener("pointercancel", onUp);
      if (rafId !== null) cancelAnimationFrame(rafId);
      flush();
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
      document.body.style.pointerEvents = prevPointerEvents;
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setColWidths((prev) => {
        const next = { ...prev, [id]: width };
        try {
          localStorage.setItem(COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* 저장 실패는 무시 */
        }
        return next;
      });
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    // 드래그 중 hover 스타일 재평가 차단 — 행 hover 인밸리데이션이 레이아웃
    // 재계산에 얹히지 않게 한다(캡처 덕에 move 수신은 유지).
    document.body.style.pointerEvents = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return { tableWrapRef, columnCssVars, startColumnResize };
}
