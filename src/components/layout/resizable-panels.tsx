"use client";

// ============================================================================
// 리사이저블 패널 프리미티브 — 시험지 빌더 핸들 패턴의 범용 추출본
//
// 시험지 빌더(exam-paper-builder-client)의 "드래그하여 폭 조절 · 클릭하여
// 닫기" 핸들을 headless 훅 + 표준 핸들 버튼으로 일반화한다. 컨테이너는
// CSS Grid 로 조립하고, 사이드 패널 폭(px)만 훅이 관리한다(중앙은 1fr).
//
// 계약:
// - 패널은 최대 2개(좌측 배치 기준 sign=1 / 우측 배치 기준 sign=-1).
// - 중앙(flex) 최소폭 minCenter 를 항상 보장 — 초과분은 뒤 패널부터 줄인다.
// - 드래그 4px 임계값으로 click(접기 토글)과 drag(폭 조절)를 판별.
// - storageKey 지정 시 localStorage 에 폭·접힘 상태 영속화.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD = 4;
export const PANEL_HANDLE_WIDTH = 20;

export interface PanelSpec {
  key: string;
  min: number;
  max: number;
  defaultWidth: number;
  /** 핸들이 패널의 오른쪽에 있으면 1(오른쪽으로 끌면 넓어짐), 왼쪽이면 -1 */
  sign: 1 | -1;
}

interface StoredState {
  widths: Record<string, number>;
  collapsed: Record<string, boolean>;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampAll(
  widths: Record<string, number>,
  panels: PanelSpec[],
  containerWidth: number,
  minCenter: number,
): Record<string, number> {
  if (containerWidth <= 0) return widths;
  const available = Math.max(0, containerWidth - PANEL_HANDLE_WIDTH * panels.length);
  const next: Record<string, number> = {};
  for (const p of panels) {
    next[p.key] = clampNumber(widths[p.key] ?? p.defaultWidth, p.min, p.max);
  }
  // 중앙 최소폭 보장 — 초과분은 뒤 패널부터 줄인다(시험지 빌더 계약과 동일)
  let center = available - panels.reduce((sum, p) => sum + next[p.key], 0);
  if (center < minCenter) {
    for (let i = panels.length - 1; i >= 0 && center < minCenter; i--) {
      const p = panels[i];
      const give = Math.min(next[p.key] - p.min, minCenter - center);
      if (give > 0) {
        next[p.key] -= give;
        center += give;
      }
    }
  }
  for (const p of panels) next[p.key] = Math.round(next[p.key]);
  return next;
}

function readStored(storageKey: string | undefined, panels: PanelSpec[]): StoredState {
  const fallback: StoredState = {
    widths: Object.fromEntries(panels.map((p) => [p.key, p.defaultWidth])),
    collapsed: Object.fromEntries(panels.map((p) => [p.key, false])),
  };
  if (!storageKey || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return {
      widths: {
        ...fallback.widths,
        ...(typeof parsed.widths === "object" && parsed.widths ? parsed.widths : {}),
      },
      collapsed: {
        ...fallback.collapsed,
        ...(typeof parsed.collapsed === "object" && parsed.collapsed
          ? parsed.collapsed
          : {}),
      },
    };
  } catch {
    return fallback;
  }
}

export function useResizablePanels({
  panels,
  minCenter,
  storageKey,
}: {
  panels: PanelSpec[];
  /** 중앙(1fr) 영역 최소 보장폭 */
  minCenter: number;
  storageKey?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const [state, setState] = useState<StoredState>(() => readStored(storageKey, panels));
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* 저장 실패해도 세션 내 리사이즈는 동작 */
    }
  }, [state, storageKey]);

  // 컨테이너 폭 변화 시 재클램프
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setState((cur) => {
        const widths = clampAll(cur.widths, panelsRef.current, width, minCenter);
        const same = panelsRef.current.every((p) => widths[p.key] === cur.widths[p.key]);
        return same ? cur : { ...cur, widths };
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [minCenter]);

  const toggleCollapsed = useCallback((key: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setState((cur) => ({
      ...cur,
      collapsed: { ...cur.collapsed, [key]: !cur.collapsed[key] },
    }));
  }, []);

  const expand = useCallback((key: string) => {
    setState((cur) => ({ ...cur, collapsed: { ...cur.collapsed, [key]: false } }));
  }, []);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>, key: string) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const spec = panelsRef.current.find((p) => p.key === key);
      if (!spec) return;
      suppressClickRef.current = false;
      const startX = event.clientX;
      const startWidths = { ...state.widths };
      const containerWidth =
        containerRef.current?.getBoundingClientRect().width ?? 0;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      let didDrag = false;

      const onMove = (move: globalThis.PointerEvent) => {
        const deltaX = move.clientX - startX;
        if (!didDrag) {
          if (Math.abs(deltaX) < DRAG_THRESHOLD) return;
          didDrag = true;
          suppressClickRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }
        move.preventDefault();
        const next = {
          ...startWidths,
          [key]: startWidths[key] + deltaX * spec.sign,
        };
        setState((cur) => ({
          ...cur,
          widths: clampAll(next, panelsRef.current, containerWidth, minCenter),
        }));
      };
      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (didDrag) {
          document.body.style.cursor = prevCursor;
          document.body.style.userSelect = prevSelect;
        }
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [state.widths, minCenter],
  );

  const widths = useMemo(
    () =>
      Object.fromEntries(
        panels.map((p) => [p.key, state.collapsed[p.key] ? 0 : state.widths[p.key]]),
      ) as Record<string, number>,
    [panels, state],
  );

  return {
    containerRef,
    /** 접힘이면 0 으로 치환된 표시용 폭 */
    widths,
    collapsed: state.collapsed,
    startResize,
    toggleCollapsed,
    expand,
  };
}

/**
 * 표준 패널 핸들 — 펼침: 드래그(폭)+클릭(접기), 접힘: 클릭(펼치기)만.
 * 시험지 빌더의 lhandle/ehandle 시각 문법(세로 라벨+화살표+grip)을 따른다.
 */
export function PanelHandle({
  label,
  panelKey,
  collapsed,
  side,
  startResize,
  toggleCollapsed,
  expand,
  className,
}: {
  /** 세로 라벨 텍스트 (예: "대상 선택") */
  label: string;
  panelKey: string;
  collapsed: boolean;
  /** 핸들 기준 패널 위치 — 화살표 방향 결정 */
  side: "left" | "right";
  startResize: (e: ReactPointerEvent<HTMLElement>, key: string) => void;
  toggleCollapsed: (key: string) => void;
  expand: (key: string) => void;
  className?: string;
}) {
  const closeArrow = side === "left" ? "<" : ">";
  const openArrow = side === "left" ? ">" : "<";
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => expand(panelKey)}
        title={`${label} 열기`}
        aria-label={`${label} 패널 열기`}
        aria-expanded={false}
        className={cn(
          "group/phandle mx-0.5 flex h-full min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600",
          className,
        )}
      >
        <span>{openArrow}</span>
        <span style={{ writingMode: "vertical-rl" }}>{label}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onPointerDown={(e) => startResize(e, panelKey)}
      onClick={() => toggleCollapsed(panelKey)}
      title="드래그하여 폭 조절 · 클릭하여 닫기"
      aria-label={`${label} 패널 닫기`}
      aria-expanded
      className={cn(
        "group/phandle mx-0.5 flex h-full min-h-0 w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100",
        className,
      )}
    >
      <span>{closeArrow}</span>
      <span style={{ writingMode: "vertical-rl" }}>{label}</span>
      <GripVertical
        className="h-3 w-3 opacity-40 transition-opacity group-hover/phandle:opacity-70"
        aria-hidden
      />
    </button>
  );
}
