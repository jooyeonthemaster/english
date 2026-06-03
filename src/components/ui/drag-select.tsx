"use client";

import { useCallback, useRef, useState } from "react";

/**
 * DragSelect — 마우스로 영역을 드래그(고무줄/마키 선택)하면 영역에 걸친 카드들이
 * 한꺼번에 선택되는 래퍼.
 *
 * 사용법:
 *   1) 카드 그리드/리스트를 감싸는 컨테이너 `<div className="grid ...">` 를
 *      `<DragSelect className="grid ..." value={selectedIds} onChange={setSelectedIds}>`
 *      로 교체한다.
 *   2) 선택 대상이 되는 각 카드의 루트 엘리먼트에 `data-drag-item-id={id}` 를 붙인다.
 *
 * 동작 규칙:
 *   - 컨테이너 안 어디서든(카드 위 포함) 드래그를 시작하면 마키가 켜진다. 단, 버튼/
 *     링크/입력 등 상호작용 요소 위에서 시작하면 켜지지 않는다(그 동작을 우선).
 *   - 카드의 네이티브 드래그(폴더 이동/문제 추가 등)가 시작되면 마키는 자동 취소된다.
 *     → "영역 선택 우선" 모드에서는 카드가 선택된 상태일 때만 네이티브 드래그를 허용해
 *       미선택 카드 위에서도 마키가 동작하도록 한다(카드 컴포넌트 쪽에서 처리).
 *   - 카드의 일부분이라도 드래그 영역에 겹치면 선택된 것으로 간주한다.
 *   - Shift / Ctrl / Cmd 를 누른 채 드래그하면 기존 선택에 더한다(추가 선택).
 *     그냥 드래그하면 영역에 걸친 카드들로 새로 선택한다.
 *
 * 시작 영역을 카드 그리드보다 넓히려면, DragSelect 의 className 에 `min-h-full` 등을
 * 주고 그 안에 실제 그리드를 자식으로 넣으면 된다(빈 여백에서도 시작 가능).
 */

const DRAG_THRESHOLD = 5; // px — 이만큼 움직여야 마키 시작 (단순 클릭과 구분)

type Rect = { left: number; top: number; width: number; height: number };

interface DragSelectProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 현재 선택된 id 집합 */
  value: Set<string>;
  /** 새 선택 집합으로 갱신 */
  onChange: (next: Set<string>) => void;
  /** true 면 마키 선택 비활성화 */
  disabled?: boolean;
  children: React.ReactNode;
}

const EDGE_ZONE = 56; // px — 이 가장자리 안으로 들어오면 자동 스크롤
const MAX_SCROLL_SPEED = 22; // px/frame

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** 세로 스크롤이 가능한 가장 가까운 조상. 없으면 null(=윈도우 스크롤). */
function getScrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const s = window.getComputedStyle(p);
    if (/(auto|scroll|overlay)/.test(s.overflowY) && p.scrollHeight > p.clientHeight)
      return p;
    p = p.parentElement;
  }
  return null;
}

export function DragSelect({
  value,
  onChange,
  disabled,
  className,
  style,
  children,
  ...rest
}: DragSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || e.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;

      const target = e.target as HTMLElement;
      // 버튼/링크/입력/체크박스 등 "중첩된" 상호작용 요소 위에서 시작하면 마키를 켜지
      // 않는다(그 클릭 동작을 우선). 단, 카드 루트 자체가 role="button" 인 경우(예: 지문
      // 카드)에는 카드 본문 위 시작을 허용해야 하므로, 상호작용 요소가 카드 루트와
      // 동일하면 통과시킨다.
      const interactive = target.closest(
        "button, a, input, textarea, select, label, [role='button'], [contenteditable='true']",
      );
      const card = target.closest("[data-drag-item-id]");
      if (interactive && interactive !== card) return;

      // 이미 draggable한 요소(예: "선택된" 카드) 위에서 시작하면 그 카드의 네이티브
      // 드래그(폴더 이동)를 우선한다 — 마키를 켜지 않는다. (미선택 카드는 draggable
      //  미등록이라 여기 걸리지 않고 아래 마키 로직으로 진행된다.)
      if (target.closest('[draggable="true"]')) return;

      // 텍스트 선택 방지 — mousedown 기본동작을 막는 것이 user-select:none보다 확실.
      // (위에서 draggable 요소는 이미 제외했으므로 네이티브 드래그를 막지 않는다.)
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const base = additive ? new Set(value) : new Set<string>();
      let active = false;
      let lastSent = value;

      // 자동 스크롤: 시작점을 "콘텐츠 기준"으로 고정해, 스크롤되면 선택 박스가 늘어난다.
      const scrollParent = getScrollParent(container);
      const isWindowScroll = !scrollParent;
      const readScroll = () =>
        scrollParent ? scrollParent.scrollTop : window.scrollY;
      const startScroll = readScroll();
      // 가장 최근 포인터 위치(뷰포트 좌표). 자동 스크롤 루프에서도 사용한다.
      let lastClientX = startX;
      let lastClientY = startY;
      let rafId = 0;

      // 스크롤로 인해 이동한 만큼 시작점의 뷰포트 Y 를 보정 → 콘텐츠 기준 앵커.
      const anchorY = () => startY - (readScroll() - startScroll);

      function recompute() {
        const cRect = container!.getBoundingClientRect();
        const ay = anchorY();
        const x1 = Math.min(startX, lastClientX);
        const y1 = Math.min(ay, lastClientY);
        const x2 = Math.max(startX, lastClientX);
        const y2 = Math.max(ay, lastClientY);

        setRect({
          left: x1 - cRect.left,
          top: y1 - cRect.top,
          width: x2 - x1,
          height: y2 - y1,
        });

        const next = new Set(base);
        const items =
          container!.querySelectorAll<HTMLElement>("[data-drag-item-id]");
        items.forEach((el) => {
          const r = el.getBoundingClientRect();
          // 사각형이 한 점이라도 겹치면 선택 (카드 일부만 걸쳐도 OK)
          const hit = r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1;
          if (hit) {
            const id = el.getAttribute("data-drag-item-id");
            if (id) next.add(id);
          }
        });

        if (!setsEqual(next, lastSent)) {
          lastSent = next;
          onChange(next);
        }
      }

      // 포인터가 위/아래 가장자리에 있으면 매 프레임 스크롤하고 선택을 갱신한다.
      function autoScrollTick() {
        rafId = 0;
        if (!active) return;
        const top = isWindowScroll ? 0 : scrollParent!.getBoundingClientRect().top;
        const bottom = isWindowScroll
          ? window.innerHeight
          : scrollParent!.getBoundingClientRect().bottom;

        let delta = 0;
        if (lastClientY < top + EDGE_ZONE) {
          delta = -Math.min(MAX_SCROLL_SPEED, (top + EDGE_ZONE - lastClientY) / 2 + 2);
        } else if (lastClientY > bottom - EDGE_ZONE) {
          delta = Math.min(MAX_SCROLL_SPEED, (lastClientY - (bottom - EDGE_ZONE)) / 2 + 2);
        }
        if (delta === 0) return; // 가장자리를 벗어나면 루프 정지

        const before = readScroll();
        if (isWindowScroll) window.scrollBy(0, delta);
        else scrollParent!.scrollTop = before + delta;
        if (readScroll() !== before) recompute(); // 실제로 스크롤됐을 때만 갱신
        rafId = requestAnimationFrame(autoScrollTick);
      }

      function ensureAutoScroll() {
        if (!rafId) rafId = requestAnimationFrame(autoScrollTick);
      }

      function cleanup() {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        window.removeEventListener("dragstart", handleDragStart, true);
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        document.body.style.userSelect = "";
        setRect(null);
      }

      // 카드의 네이티브 드래그(폴더 이동/문제 추가 등)가 시작되면 마키를 취소한다.
      function handleDragStart() {
        cleanup();
      }

      function handleMove(ev: MouseEvent) {
        lastClientX = ev.clientX;
        lastClientY = ev.clientY;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!active && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD)
          return;
        active = true;
        ev.preventDefault();
        recompute();
        ensureAutoScroll();
      }

      function handleUp() {
        cleanup();
        if (active) {
          // 마키 직후 브라우저가 발생시키는 click이 카드 선택을 토글하지 않도록
          // 한 번만 삼킨다. (click이 없으면 타임아웃으로 리스너를 제거)
          const swallow = (ev: MouseEvent) => {
            ev.stopPropagation();
            ev.preventDefault();
          };
          window.addEventListener("click", swallow, { capture: true, once: true });
          window.setTimeout(
            () => window.removeEventListener("click", swallow, true),
            0,
          );
        }
      }

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      window.addEventListener("dragstart", handleDragStart, true);
      // 드래그 중 텍스트 선택 방지
      document.body.style.userSelect = "none";
    },
    [disabled, value, onChange],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", ...style }}
      onMouseDown={handleMouseDown}
      {...rest}
    >
      {children}
      {rect && (
        <div
          className="pointer-events-none absolute z-50 rounded-sm border border-blue-400 bg-blue-400/15"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        />
      )}
    </div>
  );
}
