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

import { beginPanelDrag, endPanelDrag } from "./panel-drag-freeze";
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

/**
 * 오버라이드 드래그(§11.5 F-6, 26-09-08) — 훅의 spec 에 **없는** 요소를 같은
 * 핸들·같은 고속 경로(`[data-panel-key]` 조회 → rAF → pointerup 1회 커밋)로 끈다.
 *
 * 왜: 스튜디오 조판 중엔 우측 aside 가 flex-1 잔여라 dossier 폭을 바꿔도 화면이
 * 안 움직인다(flex-basis 0 에 style.width 가 묻힘). 그때 핸들이 조절해야 할 것은
 * **중앙 열**인데, 그 폭은 훅 상태가 아니라 호스트 상태다. spec 을 추가하면
 * 비조판 레이아웃(dossier 스펙·storageKey)까지 흔들리므로, 저장·클램프 책임을
 * 호스트에 두고 훅은 드래그 기계만 빌려 준다(additive — 기존 호출부 무회귀).
 *
 * 계약:
 * - 시작 폭은 앵커 요소의 실측 폭(getBoundingClientRect)이다 — 호스트의 표시
 *   클램프(창 축소 시 비영속 클램프)와 저장값이 어긋나도 끌리는 건 보이는 폭.
 * - 앵커가 없으면 드래그는 무동작(폭을 알 수 없고 쓸 곳도 없다). 클릭-닫기는
 *   onClick 별도 경로라 그대로 동작한다.
 * - range 는 호출 시점 값이다(호스트가 컨테이너 폭·다른 패널 폭으로 계산).
 *   max < min 이면 min 으로 고정된다(clampNumber 계약).
 */
export interface PanelResizeOverride {
  /** 끌 요소의 `data-panel-key`(훅 spec 밖의 키) */
  key: string;
  /** 핸들이 요소의 오른쪽에 있으면 1(오른쪽으로 끌면 넓어짐), 왼쪽이면 -1 */
  sign: 1 | -1;
  range: { min: number; max: number };
  /** pointerup 에 1회 — 호스트가 state·영속화를 맡는다 */
  onCommit: (width: number) => void;
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
  const elementRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const suppressClickRef = useRef(false);
  const [state, setState] = useState<StoredState>(() => readStored(storageKey, panels));
  // 관찰된 컨테이너 폭 — 클램프는 이 값 기준의 '표시 시점' 변환으로만 적용한다.
  // (과거: 옵저버가 state.widths 를 직접 깎아 localStorage 까지 영속 → 좁은 창을
  //  한 번 지나가면 사용자가 맞춘 폭이 편도 하향되는 결함. 저장값은 드래그로만 변경.)
  const [containerWidth, setContainerWidth] = useState(0);
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

  useEffect(() => () => observerRef.current?.disconnect(), []);

  // 컨테이너는 콜백 ref 로 받는다 — 소비자가 조기 return 뷰(컨테이너 미렌더)로
  // 먼저 마운트됐다가 나중에 본 뷰를 그려도 부착 시점에 관찰이 시작된다.
  // (마운트 1회 effect 방식은 그 경로에서 옵저버가 영영 붙지 않았다.)
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    elementRef.current = el;
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) {
      setContainerWidth(0);
      return;
    }
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? el.clientWidth);
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

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
    (
      event: ReactPointerEvent<HTMLElement>,
      key: string,
      override?: PanelResizeOverride,
    ) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // 오버라이드면 spec 을 찾지 않는다(훅 밖 키) — 앵커 실측이 시작 폭이다.
      const spec = override ? null : panelsRef.current.find((p) => p.key === key);
      if (!override && !spec) return;
      const overrideEl = override
        ? (elementRef.current?.querySelector<HTMLElement>(
            `[data-panel-key="${override.key}"]`,
          ) ?? null)
        : null;
      // 앵커 없는 오버라이드는 무동작(PanelResizeOverride 계약) — 캡처 전에 나간다.
      if (override && !overrideEl) return;
      const overrideStart = overrideEl
        ? overrideEl.getBoundingClientRect().width
        : 0;
      suppressClickRef.current = false;
      const startX = event.clientX;
      const startWidths = { ...state.widths };
      const containerWidth =
        elementRef.current?.getBoundingClientRect().width ?? 0;
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      let didDrag = false;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 이벤트가 끊기지 않고,
      // 아래의 body pointer-events:none 과 조합해도 move 가 계속 들어온다.
      const handleEl = event.currentTarget as HTMLElement;
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // ── 드래그 고속 경로 (2026-08-11 — "핸들이 전역에서 버벅" 실사용 지적) ──
      // 매 pointermove 의 setState 는 소비 화면 전체(워크벤치는 카드 수백 장)를
      // 프레임마다 리렌더시킨다. 컨테이너 안에 `[data-panel-key]` 앵커가 있으면
      // 드래그 중에는 그 요소들의 style.width 에 rAF 코얼레싱으로 직접 쓰고,
      // 놓을 때 한 번만 setState 로 커밋한다(리렌더 0회). 앵커가 없는 기존
      // 소비처는 종전 setState 경로 그대로(무회귀). 접힌 패널은 언마운트라
      // 앵커가 없을 수 있다 — 드래그 대상 패널의 앵커만 있으면 고속 경로.
      // 오버라이드는 자기 앵커 하나만 끈다 — spec 패널(tree/dossier)의 style.width
      // 는 건드리지 않는다(비조판 폭·저장값 무회귀).
      const panelEls: Record<string, HTMLElement> = {};
      if (override && overrideEl) {
        panelEls[override.key] = overrideEl;
      } else if (elementRef.current) {
        for (const p of panelsRef.current) {
          const found = elementRef.current.querySelector<HTMLElement>(
            `[data-panel-key="${p.key}"]`,
          );
          if (found) panelEls[p.key] = found;
        }
      }
      const dragKey = override ? override.key : key;
      const fastPath = Boolean(panelEls[dragKey]);
      let latestWidths: Record<string, number> | null = null;
      let rafId: number | null = null;
      const flush = () => {
        // 다음 무브가 새 프레임을 잡을 수 있게 먼저 해제한다.
        rafId = null;
        if (!latestWidths) return;
        for (const [k, el] of Object.entries(panelEls)) {
          if (latestWidths[k] !== undefined) el.style.width = `${latestWidths[k]}px`;
        }
      };

      const onMove = (move: globalThis.PointerEvent) => {
        const deltaX = move.clientX - startX;
        if (!didDrag) {
          if (Math.abs(deltaX) < DRAG_THRESHOLD) return;
          didDrag = true;
          suppressClickRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          // 드래그 중 hover 스타일 재평가 차단 — 폭이 프레임마다 바뀌면 커서
          // 아래 요소가 계속 바뀌어 카드 수백 장의 hover 인밸리데이션이
          // 레이아웃 스래시에 얹힌다. 캡처 덕에 move 수신에는 영향 없다.
          document.body.style.pointerEvents = "none";
          // 이웃 패널 안의 ResizeObserver(조판 fitZoom 등)를 드래그 동안 동결 — panel-drag-freeze.ts
          beginPanelDrag();
        }
        move.preventDefault();
        if (override) {
          // 훅 상태는 손대지 않는다 — 클램프는 호스트가 준 range 하나뿐.
          const w = Math.round(
            clampNumber(
              overrideStart + deltaX * override.sign,
              override.range.min,
              override.range.max,
            ),
          );
          latestWidths = { [override.key]: w };
          if (rafId === null) rafId = requestAnimationFrame(flush);
          return;
        }
        if (!spec) return;
        const next = {
          ...startWidths,
          [key]: startWidths[key] + deltaX * spec.sign,
        };
        const clamped = clampAll(
          next,
          panelsRef.current,
          containerWidth,
          minCenter,
        );
        if (fastPath) {
          latestWidths = clamped;
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          setState((cur) => ({ ...cur, widths: clamped }));
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (fastPath && latestWidths) {
          flush();
          const committed = latestWidths;
          if (override) {
            // 오버라이드 커밋 1회 — 훅 state(저장값) 는 무변경, 호스트가 받는다.
            override.onCommit(committed[override.key]);
          } else {
            // 커밋 1회 — 저장·클램프 규칙은 종전과 동일.
            setState((cur) => ({ ...cur, widths: { ...cur.widths, ...committed } }));
          }
        }
        if (didDrag) {
          document.body.style.cursor = prevCursor;
          document.body.style.userSelect = prevSelect;
          document.body.style.pointerEvents = prevPointerEvents;
          // 최종 폭이 DOM·커밋에 반영된 뒤 동결 해제 → 관찰자들이 마지막 값으로 1회 적용
          endPanelDrag();
        }
        try {
          handleEl.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [state.widths, minCenter],
  );

  // 표시용 폭 = 저장 선호폭을 현재 컨테이너 기준으로 클램프(비영속) — 창이
  // 다시 넓어지면 선호폭이 그대로 복원된다. 미관측(0)이면 저장값 그대로.
  const widths = useMemo(() => {
    const clamped = clampAll(state.widths, panels, containerWidth, minCenter);
    return Object.fromEntries(
      panels.map((p) => [p.key, state.collapsed[p.key] ? 0 : clamped[p.key]]),
    ) as Record<string, number>;
  }, [panels, state, containerWidth, minCenter]);

  return {
    containerRef,
    /** 접힘이면 0 으로 치환된 표시용 폭 */
    widths,
    /** 관찰된 컨테이너 폭(미관측 0) — 오버라이드 range 계산용(additive, §11.5) */
    containerWidth,
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
  overrideKey,
  overrideSign,
  overrideRange,
  onOverrideCommit,
  dragDisabled,
}: {
  /** 세로 라벨 텍스트 (예: "대상 선택") */
  label: string;
  panelKey: string;
  collapsed: boolean;
  /** 핸들 기준 패널 위치 — 화살표 방향 결정 */
  side: "left" | "right";
  startResize: (
    e: ReactPointerEvent<HTMLElement>,
    key: string,
    override?: PanelResizeOverride,
  ) => void;
  toggleCollapsed: (key: string) => void;
  expand: (key: string) => void;
  className?: string;
  /**
   * 오버라이드 드래그(PanelResizeOverride 참조) — 4개가 **한 벌**이다: overrideKey
   * 와 onOverrideCommit 이 둘 다 있을 때만 드래그가 다른 요소로 간다. 클릭-닫기·
   * 접힘 펼치기는 panelKey 그대로(collapse 대상은 여전히 spec 패널).
   */
  overrideKey?: string;
  overrideSign?: 1 | -1;
  overrideRange?: { min: number; max: number };
  onOverrideCommit?: (width: number) => void;
  /**
   * 드래그 이동 여유가 0 인 상태(예: 조판 중 중앙 열 range.max === min)를 **표시**
   * 한다(additive, §11.9-④ 후속). 드래그는 시작하지 않고 aria-disabled·기본 커서·
   * 사유 툴팁만 — 클릭-닫기는 그대로 살아 있다(사용자가 패널을 접을 길은 남긴다).
   */
  dragDisabled?: boolean;
}) {
  const closeArrow = side === "left" ? "<" : ">";
  const openArrow = side === "left" ? ">" : "<";
  const override: PanelResizeOverride | undefined =
    overrideKey && onOverrideCommit
      ? {
          key: overrideKey,
          sign: overrideSign ?? 1,
          range: overrideRange ?? { min: 0, max: Number.POSITIVE_INFINITY },
          onCommit: onOverrideCommit,
        }
      : undefined;
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
      // dragDisabled 면 pointerdown 을 아예 안 잡는다 — startResize 의 클릭 억제
      // 가드를 타지 않아 클릭-닫기가 그대로 발화한다.
      onPointerDown={
        dragDisabled ? undefined : (e) => startResize(e, panelKey, override)
      }
      onClick={() => toggleCollapsed(panelKey)}
      title={
        dragDisabled
          ? "화면이 좁아 넓힐 수 없습니다 · 클릭하여 닫기"
          : "드래그하여 폭 조절 · 클릭하여 닫기"
      }
      aria-label={`${label} 패널 닫기`}
      aria-expanded
      aria-disabled={dragDisabled || undefined}
      className={cn(
        "group/phandle mx-0.5 flex h-full min-h-0 w-4 shrink-0 touch-none select-none flex-col items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600 active:bg-blue-100",
        dragDisabled ? "cursor-default" : "cursor-col-resize",
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
