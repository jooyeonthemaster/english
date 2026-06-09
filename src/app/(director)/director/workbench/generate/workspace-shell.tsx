"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";

/**
 * Resizable / collapsible two-pane workspace shell that mirrors the
 * passage-analysis (학습지생성) form-section chrome: a rounded card with a
 * header row, a horizontally split body whose LEFT pane (학습지 관리) can be
 * resized and collapsed, a flex-1 RIGHT pane (작업대), and a bottom handle
 * that resizes the overall body height.
 */

const LEFT_PANE_STORAGE_KEY = "smoat:generate:left-pane-width";
const LEFT_PANE_OPEN_STORAGE_KEY = "smoat:generate:left-pane-open";
const LEFT_PANE_MIN = 380;
const LEFT_PANE_DEFAULT = 560;
const LEFT_PANE_MAX_RATIO = 0.55;
const RIGHT_PANE_MIN = 420;
const HANDLE_HIT_WIDTH = 12;
const DRAG_THRESHOLD = 4;

const BODY_STORAGE_KEY = "smoat:generate:body-height";
const BODY_MIN = 460;
const BODY_DEFAULT = 600;
const BODY_MAX = 1300;

const BODY_COLLAPSED_STORAGE_KEY = "smoat:generate:body-collapsed";

function readStoredLeftPaneWidth(): number {
  if (typeof window === "undefined") return LEFT_PANE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(LEFT_PANE_STORAGE_KEY);
    if (!raw) return LEFT_PANE_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return LEFT_PANE_DEFAULT;
    return Math.max(LEFT_PANE_MIN, n);
  } catch {
    return LEFT_PANE_DEFAULT;
  }
}

function readStoredLeftPaneOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LEFT_PANE_OPEN_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function readStoredBodyHeight(): number {
  if (typeof window === "undefined") return BODY_DEFAULT;
  try {
    const raw = window.localStorage.getItem(BODY_STORAGE_KEY);
    if (!raw) return BODY_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return BODY_DEFAULT;
    return Math.min(BODY_MAX, Math.max(BODY_MIN, n));
  } catch {
    return BODY_DEFAULT;
  }
}

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BODY_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

interface WorkspaceShellProps {
  header: ReactNode;
  /** LEFT pane content — the 학습지 관리 panel. */
  left: ReactNode;
  /** RIGHT pane content — the 문제 생성 작업대. */
  right: ReactNode;
  /** Vertical label shown on the left collapse/resize handle. */
  leftLabel?: string;
  /**
   * 증가할 때마다 왼쪽 패널을 접는다 — "선택 지문 불러오기" 직후 지문 목록이
   * 옆으로 샤라락 접히며 작업 공간이 넓어지는 UX 용. 0이면 무시.
   */
  leftCollapseSignal?: number;
}

export function WorkspaceShell({
  header,
  left,
  right,
  leftLabel = "지문",
  leftCollapseSignal = 0,
}: WorkspaceShellProps) {
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(
    readStoredLeftPaneWidth,
  );
  const [leftPaneOpen, setLeftPaneOpen] = useState<boolean>(
    readStoredLeftPaneOpen,
  );
  const [bodyHeight, setBodyHeight] = useState<number>(readStoredBodyHeight);
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);

  const updateCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(BODY_COLLAPSED_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  // 불러오기 직후 지문 목록을 접어 작업 공간을 넓힌다 (영구 저장은 하지 않음 —
  // 다음 방문 때는 사용자가 저장해둔 열림 상태를 따른다).
  useEffect(() => {
    if (leftCollapseSignal > 0) setLeftPaneOpen(false);
  }, [leftCollapseSignal]);

  const toggleLeftPaneOpen = useCallback(() => {
    setLeftPaneOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LEFT_PANE_OPEN_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const handleCloseLeftPanePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startWidth = leftPaneWidth;
      const containerWidth =
        splitContainerRef.current?.getBoundingClientRect().width ?? 0;
      const ratioCap =
        containerWidth > 0
          ? Math.floor(containerWidth * LEFT_PANE_MAX_RATIO)
          : Number.POSITIVE_INFINITY;
      const maxWidth = Math.max(
        LEFT_PANE_MIN,
        Math.min(ratioCap, containerWidth - RIGHT_PANE_MIN - HANDLE_HIT_WIDTH),
      );
      let didDrag = false;
      let latest = startWidth;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        if (!didDrag) {
          if (Math.abs(delta) < DRAG_THRESHOLD) return;
          didDrag = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }
        latest = Math.min(maxWidth, Math.max(LEFT_PANE_MIN, startWidth + delta));
        setLeftPaneWidth(latest);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (didDrag) {
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          try {
            window.localStorage.setItem(LEFT_PANE_STORAGE_KEY, String(latest));
          } catch {
            /* ignore */
          }
        } else {
          toggleLeftPaneOpen();
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [leftPaneWidth, toggleLeftPaneOpen],
  );

  const resetLeftPaneWidth = useCallback(() => {
    setLeftPaneWidth(LEFT_PANE_DEFAULT);
    try {
      window.localStorage.setItem(
        LEFT_PANE_STORAGE_KEY,
        String(LEFT_PANE_DEFAULT),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const beginBodyResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = bodyHeight;
      let latest = startHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        latest = Math.min(
          BODY_MAX,
          Math.max(BODY_MIN, startHeight + (ev.clientY - startY)),
        );
        setBodyHeight(latest);
      };
      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(BODY_STORAGE_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [bodyHeight],
  );

  const resetBodyHeight = useCallback(() => {
    setBodyHeight(BODY_DEFAULT);
    try {
      window.localStorage.setItem(BODY_STORAGE_KEY, String(BODY_DEFAULT));
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
        {header}
        {collapsed ? (
          <button
            type="button"
            onClick={() => updateCollapsed(false)}
            aria-expanded={false}
            title="펼치기"
            className="ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
            <span>펼치기</span>
          </button>
        ) : null}
      </div>

      {!collapsed ? (
      <>
      <div className="px-4 pt-4 pb-3">
        <div
          ref={splitContainerRef}
          className="flex w-full min-w-0 max-w-full flex-row gap-0 overflow-hidden"
          style={{ height: `${bodyHeight}px` }}
        >
          {/* LEFT: 학습지 관리 panel (collapsible / resizable) */}
          {leftPaneOpen ? (
            <>
              <div
                className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200"
                style={{ width: `min(${leftPaneWidth}px, 55%)` }}
              >
                {left}
              </div>
              <button
                type="button"
                onPointerDown={handleCloseLeftPanePointerDown}
                onDoubleClick={resetLeftPaneWidth}
                title="클릭하여 닫기 · 좌우로 드래그하여 너비 조절 · 더블 클릭하여 초기화"
                className="group/lhandle mx-1 flex w-4 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100"
              >
                <span>{"<"}</span>
                <span style={{ writingMode: "vertical-rl" }}>{leftLabel} 닫기</span>
                <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleLeftPaneOpen}
              title="클릭하여 지문 패널 열기"
              className="mx-1 flex min-h-0 w-4 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600"
            >
              <span>{">"}</span>
              <span style={{ writingMode: "vertical-rl" }}>{leftLabel} 열기</span>
            </button>
          )}

          {/* RIGHT: 문제 생성 작업대 */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200">
            {right}
          </div>
        </div>
      </div>

      {/* Body vertical resize handle */}
      <div className="relative pb-2.5">
        <div
          onPointerDown={beginBodyResize}
          onDoubleClick={resetBodyHeight}
          role="separator"
          aria-orientation="horizontal"
          title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
          className="group/fhandle flex h-3 cursor-row-resize select-none items-center justify-center"
        >
          <div className="h-0.5 w-24 rounded-full bg-slate-200 transition-colors group-hover/fhandle:bg-blue-400 group-active/fhandle:bg-blue-500" />
        </div>
        <button
          type="button"
          onClick={() => updateCollapsed(true)}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-expanded
          title="접기"
          className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex cursor-pointer items-center gap-1 text-[11.5px] font-medium text-blue-400 transition-colors hover:text-blue-600"
        >
          <ChevronUp className="size-3.5" aria-hidden="true" />
          <span>접기</span>
        </button>
      </div>
      </>
      ) : null}
    </section>
  );
}
