"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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
import {
  WorkspaceBodyContext,
  type WorkspaceBodyExpansion,
} from "./workspace-body-context";

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
/**
 * 자동 확장분(WorkspaceBodyContext 로 요청받는다). **두 표면이 같은 값을 쓴다.**
 *  · 지문 행 "비교 모드"(AI 변형 미리보기 열림) — 새 지문과 원문을 동시에 본다.
 *  · 조판대(AI로 지문 만들기) — 조판 결과 밴드가 생겼을 때.
 *
 * 왜 +300 인가 — 조판대 기준 실측(본문 600px · PC 2단 · lg):
 *   좌 컬럼 스크롤 뷰포트
 *     = 600 − 우측 패널 테두리 2 − IntakeSurface 탭 행 44(sm:h-11)
 *       − 출력방식 행 63(pt8+pb8+말풍선[1+4+36+4+1]+hairline 1)
 *       − 조판대 마스트헤드 56(h-14) − 컬럼 헤더 36(h-9) − p-4 32
 *     = **367px**
 *   결과 1건 최소 콘텐츠(빈 발주 밴드 + 완료 밴드 1개, 편 제목 3줄)
 *     = 발주 밴드 165(textarea min-h 120 + hairline 1 + 툴바 pt8+h-9 36)
 *       + space-y-6 24
 *       + 결과 섹션 230(머리 24.5 + 밴드 205.5)
 *     = **419px**  → 기본 높이에서 이미 **52px 이 잘린다**.
 *   자료 1행(41) · 막힌 사유 줄(27.5)까지 붙는 실사용 상태면 487px = 120px 잘림.
 *   +300 이면 뷰포트가 667px 이 되어 419~487px 이 통째로 들어온다(밴드 2개부터는
 *   좌 컬럼 스크롤이 받는다 — 세 번째 스크롤을 만들지 않는다는 조판대 계약).
 */
const BODY_AUTO_EXPAND = 300;
/**
 * 자동 확장의 상한 — 늘어난 본문은 **한 화면(100dvh)** 을 넘지 않는다. 넘겨 봐야
 * 한눈에 들어오지 않고 페이지 스크롤만 길어진다.
 * ⚠️ 사용자가 손으로 끈 높이는 이 상한보다 커도 **절대 줄이지 않는다** — 적용식의
 *   max(bodyHeight, …) 가 그것을 보증한다. 자동 조절이 수동 조작을 이기면 안 된다.
 */
const BODY_EXPAND_VIEWPORT_CAP = "100dvh";

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
  // 본문 세로 드래그 중에는 height 트랜지션을 꺼서 손을 즉시 따라오게 한다.
  const [bodyDragging, setBodyDragging] = useState(false);
  // "비교 모드" 확장을 요청한 지문 행 id 집합 — 하나라도 있으면 본문을 늘린다.
  const [expandIds, setExpandIds] = useState<Set<string>>(() => new Set());
  const bodyExpansion = useMemo<WorkspaceBodyExpansion>(
    () => ({
      requestExpand: (id: string) =>
        setExpandIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        }),
      releaseExpand: (id: string) =>
        setExpandIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        }),
    }),
    [],
  );
  // 사용자가 저장한 기본 높이 + (확장 요청이 있으면) 확장분.
  // **절대 높이를 덮어쓰지 않고 델타만 얹는 모델**이다 — 그래서 사용자가 손으로 끈
  // 값은 언제나 그대로 남고(확장은 늘 그보다 크다), 요청이 풀리면 정확히 그 값으로
  // 되돌아온다. "자동 조절이 수동 조작과 싸우지 않는다"가 구조적으로 보장되는 지점.
  const expandActive = expandIds.size > 0;
  const expandedBodyHeight = bodyHeight + (expandActive ? BODY_AUTO_EXPAND : 0);
  /**
   * 실제로 적용할 높이. --ws-body-h 도 **같은 값**을 노출해 카드 높이 캡
   * (calc(--ws-body-h - 130px))까지 함께 늘어난다.
   *  · 확장 요청 없음 → 사용자 값 px 그대로(기존 동작 무회귀).
   *  · 세로 드래그 중 → 뷰포트 상한을 **끈다**. 상한이 걸린 채로 끌면 포인터를
   *    내려도 높이가 상한에 붙박여 손을 따라오지 않는다(드래그 ↔ 자동확장 충돌).
   *    놓는 순간 상한이 다시 걸리고, 그때는 transition 이 살아 있어(bodyDragging
   *    이 false 로 돌아간다) 450ms 로 부드럽게 정리된다.
   */
  const bodyHeightCss =
    !expandActive || bodyDragging
      ? `${expandedBodyHeight}px`
      : `min(${expandedBodyHeight}px, max(${bodyHeight}px, ${BODY_EXPAND_VIEWPORT_CAP}))`;

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
      setBodyDragging(true);
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
        setBodyDragging(false);
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
    <WorkspaceBodyContext.Provider value={bodyExpansion}>
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
              height: bodyHeightCss,
              // 자동 확장/축소는 부드럽게 애니메이션한다. 단, 세로 드래그
              // 리사이즈 중에는 트랜지션을 꺼 손을 즉시 따라오게 한다.
              transition: bodyDragging
                ? "none"
                : "height 450ms cubic-bezier(0.22, 1, 0.36, 1)",
              // 워크스페이스 본문(고정) 높이를 자손에게 노출 — 지문 카드가 이 값에
              // 맞춰 스스로 높이를 바운드해, 본문이 길어도 카드 안에서 스크롤되고
              // 하단 '문제 생성' 버튼이 항상 보이게 한다. 확장 중이면 확장분 포함
              // (min()/max() 식이 그대로 실린다 — calc() 안에서 정상 평가된다).
              "--ws-body-h": bodyHeightCss,
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

          {/* RIGHT: main work surface — 모바일(<lg)은 높이를 강제하지 않고
              콘텐츠만큼만 차지한다(짧은 보드 아래·사이트 푸터 위 빈 공간 방지).
              워크스페이스 오버레이의 최소 높이는 IntakeSurface 가 자체 보장. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 max-lg:!flex-none">
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
    </WorkspaceBodyContext.Provider>
  );
}
