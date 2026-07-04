"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
} from "lucide-react";

/**
 * Resizable / collapsible two-pane workspace shell that mirrors the
 * passage-analysis (학습지생성) form-section chrome: a rounded card with a
 * header row, a horizontally split body whose LEFT pane (학습지 관리) can be
 * resized and collapsed, a flex-1 RIGHT pane (워크스페이스), and a bottom handle
 * that resizes the overall body height.
 */

const LEFT_PANE_STORAGE_KEY = "smoat:generate:left-pane-width";
const LEFT_PANE_OPEN_STORAGE_KEY = "smoat:generate:left-pane-open";
const LEFT_PANE_MIN = 380;
const LEFT_PANE_DEFAULT = 560;
const LEFT_PANE_MAX_RATIO = 0.55;
// 우측은 [워크스페이스 ≥240 + 설정 300~360] 2분할 — 둘 다 기능하는 최소폭.
const RIGHT_PANE_MIN = 560;
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
  /** LEFT pane content — optional collapsible workspace/tool panel. */
  left: ReactNode;
  /** RIGHT pane content — main work surface. */
  right: ReactNode;
  /** Vertical label shown on the left collapse/resize handle. */
  leftLabel?: string;
  /** 증가할 때마다 왼쪽 패널을 접는다. 0이면 무시. */
  leftCollapseSignal?: number;
  /** 증가할 때마다 왼쪽 패널을 편다. */
  leftOpenSignal?: number;
  /** false이면 왼쪽 패널과 여닫기 핸들을 모두 숨긴다. */
  leftActive?: boolean;
  /**
   * 우측 패널 최소폭 — 워크스페이스+설정 2분할이면 560, 설정 단독이면
   * 더 좁아도 되므로 호출부에서 상태에 맞게 내려준다.
   */
  rightPaneMin?: number;
  /** 모바일(<lg)에서 상단 헤더 행(제목/설명)을 숨긴다 — 상단 앱바·스테퍼와 중복될 때. */
  hideHeaderOnMobile?: boolean;
}

export function WorkspaceShell({
  header,
  left,
  right,
  leftLabel = "지문",
  leftCollapseSignal = 0,
  leftOpenSignal = 0,
  leftActive = true,
  rightPaneMin = RIGHT_PANE_MIN,
  hideHeaderOnMobile = false,
}: WorkspaceShellProps) {
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(
    readStoredLeftPaneWidth,
  );
  const [leftPaneOpen, setLeftPaneOpen] = useState<boolean>(
    readStoredLeftPaneOpen,
  );
  // 드래그 리사이즈 중에는 width 트랜지션을 꺼서 손을 따라오게 한다.
  const [leftDragging, setLeftDragging] = useState(false);
  const [bodyHeight, setBodyHeight] = useState<number>(readStoredBodyHeight);
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);
  const leftPaneVisible = leftActive && leftPaneOpen;

  const updateCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(BODY_COLLAPSED_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  // 호출부 신호로 왼쪽 패널을 임시 접는다 (영구 저장은 하지 않음 —
  // 다음 방문 때는 사용자가 저장해둔 열림 상태를 따른다).
  useEffect(() => {
    if (leftCollapseSignal > 0) setLeftPaneOpen(false);
  }, [leftCollapseSignal]);

  useEffect(() => {
    if (leftOpenSignal > 0) setLeftPaneOpen(true);
  }, [leftOpenSignal]);

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
        Math.min(ratioCap, containerWidth - rightPaneMin - HANDLE_HIT_WIDTH),
      );
      let didDrag = false;
      let latest = startWidth;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        if (!didDrag) {
          if (Math.abs(delta) < DRAG_THRESHOLD) return;
          didDrag = true;
          setLeftDragging(true);
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
          setLeftDragging(false);
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
    [leftPaneWidth, toggleLeftPaneOpen, rightPaneMin],
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
      <div
        className={
          "flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-4 py-3" +
          (hideHeaderOnMobile ? " max-lg:hidden" : "")
        }
      >
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

      {/* 접기/펼치기 — grid-template-rows 트랜지션으로 높이가 부드럽게
          접힌다 (height:auto 는 직접 애니메이션이 안 되는 것의 우회). */}
      <div
        className="grid transition-[grid-template-rows] duration-500 ease-in-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
        aria-hidden={collapsed}
      >
      <div className="min-h-0 overflow-hidden">
      {/* 모바일(<lg)은 좌우 여백을 바짝 줄여 본문 폭을 확보한다. */}
      <div className="px-1.5 pt-4 pb-2 lg:px-4 lg:pb-3">
        <div
          ref={splitContainerRef}
          className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden max-lg:!h-auto lg:flex-row lg:gap-0"
          style={
            {
              height: `${bodyHeight}px`,
              // 워크스페이스 본문(고정) 높이를 자손에게 노출 — 지문 카드가 이 값에
              // 맞춰 스스로 높이를 바운드해, 본문이 길어도 카드 안에서 스크롤되고
              // 하단 '문제 생성' 버튼이 항상 보이게 한다.
              "--ws-body-h": `${bodyHeight}px`,
            } as CSSProperties
          }
        >
          {/* LEFT: optional panel (collapsible / resizable) —
              닫기는 unmount 가 아니라 width 트랜지션으로 스르륵 접힌다.
              드래그 리사이즈 중에는 트랜지션을 꺼서 손을 즉시 따라온다. */}
          <div
            className={
              "flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-lg max-lg:!w-full " +
              (leftPaneVisible ? "border border-slate-200 " : "border-0 ") +
              (leftDragging
                ? ""
                : "transition-[width] duration-500 ease-in-out")
            }
            style={{
              // 저장된 폭(기본 560)이 작은 컨테이너에서 우측 패널을
              // RIGHT_PANE_MIN 미만으로 밀어내지 않게 렌더 폭도 클램프.
              width: leftPaneVisible
                ? `min(${leftPaneWidth}px, ${LEFT_PANE_MAX_RATIO * 100}%, calc(100% - ${rightPaneMin + HANDLE_HIT_WIDTH + 8}px))`
                : "0px",
            }}
            aria-hidden={!leftPaneVisible}
          >
            {leftPaneVisible ? left : null}
          </div>
          {leftActive ? (
            leftPaneOpen ? (
              <button
                type="button"
                onPointerDown={handleCloseLeftPanePointerDown}
                onDoubleClick={resetLeftPaneWidth}
                title="클릭하여 닫기 · 좌우로 드래그하여 너비 조절 · 더블 클릭하여 초기화"
                className="group/lhandle mx-0.5 hidden w-5 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1.5 rounded-md py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100 lg:flex"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span style={{ writingMode: "vertical-rl" }}>
                  {leftLabel} 닫기
                </span>
                <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover/lhandle:opacity-70" />
              </button>
            ) : (
              <button
                type="button"
                // onClick 대신 pointerdown — 닫기 핸들과 같은 자리에 스왑되므로,
                // 닫기 직후 브라우저가 쏘는 잔여 click 이 이 버튼에 떨어져
                // 곧바로 다시 열리는 사고를 막는다 (click 은 무시됨).
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  toggleLeftPaneOpen();
                }}
                title={`클릭하여 ${leftLabel} 열기`}
                className="mx-0.5 hidden min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1.5 rounded-md py-1 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 lg:flex"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span style={{ writingMode: "vertical-rl" }}>
                  {leftLabel} 열기
                </span>
              </button>
            )
          ) : null}

          {/* RIGHT: main work surface */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 max-lg:!min-h-[55vh] max-lg:!flex-none">
            {right}
          </div>
        </div>
      </div>

      {/* Body vertical resize handle — 모바일(<lg)은 리사이즈·접기가 의미
          없으므로 행 전체를 숨겨 하단 여백을 아낀다. */}
      <div className="relative pb-2.5 max-lg:hidden">
        <div
          onPointerDown={beginBodyResize}
          onDoubleClick={resetBodyHeight}
          role="separator"
          aria-orientation="horizontal"
          title="드래그하여 높이 조절 · 더블 클릭하여 초기화"
          className="group/fhandle hidden h-3 cursor-row-resize select-none items-center justify-center lg:flex"
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
      </div>
      </div>
    </section>
  );
}
