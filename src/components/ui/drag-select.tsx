"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMarqueeBoundary } from "@/components/layout/marquee-boundary-context";

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
 *
 * 시작 영역을 DragSelect 바깥(예: 시험지 미리보기창 등 "완전히 다른 패널")까지 넓히려면
 * `boundaryRef` 에 더 넓은 조상 엘리먼트를 넘긴다. 그 영역 어디서든 드래그를 시작할 수
 * 있고, 선택은 여전히 boundary 안의 `data-drag-item-id` 카드에만 적용된다. 이때 선택
 * 사각형은 패널의 overflow/clip 에 잘리지 않도록 뷰포트 기준(fixed) 포털로 그린다.
 */

const DRAG_THRESHOLD = 5; // px — 이만큼 움직여야 마키 시작 (단순 클릭과 구분)

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** true 면 뷰포트 기준(fixed) 포털로 렌더 — boundaryRef 모드 */
  fixed?: boolean;
};

interface DragSelectProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 현재 선택된 id 집합 */
  value: Set<string>;
  /**
   * 새 선택 집합으로 갱신. meta 는 deferCommit 릴리스 커밋에서만 실린다 —
   * "remove"(선택된 카드에서 시작한 해제 드래그)일 때 next 는 value−히트다.
   * 기존 소비처는 인자 하나만 받아도 타입·동작 모두 무변화.
   */
  onChange: (next: Set<string>, meta?: { deferMode: "add" | "remove" }) => void;
  /** true 면 마키 선택 비활성화 */
  disabled?: boolean;
  /**
   * 드래그 "시작 영역"을 DragSelect 컨테이너 바깥의 더 넓은 조상으로 넓힌다.
   * 넘기면: ① mousedown 을 이 엘리먼트에서 받고(이 영역 어디서든 시작 가능),
   * ② 선택 사각형을 뷰포트 기준 포털로 그리며, ③ 카드 탐색 범위도 이 엘리먼트로 넓힌다.
   * `itemScopeRef` 를 함께 넘기면 시작 영역은 이 값을 쓰되 카드 탐색은 itemScopeRef 안으로
   * 제한된다.
   * 안 넘기면 기존 동작(컨테이너 자신이 시작 영역).
   */
  boundaryRef?: React.RefObject<HTMLElement | null>;
  /**
   * 선택 대상 카드 탐색 범위를 별도로 제한한다. 예: 드로어가 열려 있을 때 시작은 본문
   * 어디서든 허용하고, 선택은 드로어 카드만 대상으로 삼을 수 있다.
   */
  itemScopeRef?: React.RefObject<HTMLElement | null>;
  /**
   * true 면 카드 내부의 버튼/role=button 자식 위에서도 마키 드래그 시작을 허용한다.
   * 폼 입력, 링크, label, contenteditable, data-drag-select-ignore 는 계속 제외한다.
   */
  allowCardDescendantDragStart?: boolean;
  /**
   * true 면 드래그 중에는 onChange 를 부르지 않고(리액트 무접촉), 걸친 카드에
   * 인라인 배경 틴트만 직접 칠한 뒤 **마우스를 놓는 순간 한 번만** onChange 를
   * 부른다. 히트마다 onChange→상태 갱신→목록 전체 리렌더가 도는 페이지에서
   * 마키가 뻑뻑해지는 것을 끊는다(단어장 스튜디오 실측 2026-08-05: 드래그 중
   * 평균 16.7ms·잰크 0). 선택 카운터 등 라이브 피드백은 릴리스 시점에 갱신된다.
   */
  deferCommit?: boolean;
  children: React.ReactNode;
}

/** deferCommit 드래그 중 히트 틴트 — blue-100/55(선택 확정색보다 살짝 진하게). */
const DEFER_HIT_TINT = "rgb(219 234 254 / 0.55)";
/** 해제 드래그(선택된 카드에서 시작) 틴트 — rose-100/60, "빠질 예정" 신호. */
const DEFER_REMOVE_TINT = "rgb(254 226 226 / 0.6)";

const EDGE_ZONE = 56; // px — 이 가장자리 안으로 들어오면 자동 스크롤
const MAX_SCROLL_SPEED = 22; // px/frame
const RESIZE_OR_MOVE_CURSOR_VALUES = new Set([
  "col-resize",
  "row-resize",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
  "n-resize",
  "s-resize",
  "e-resize",
  "w-resize",
  "ne-resize",
  "nw-resize",
  "se-resize",
  "sw-resize",
  "move",
]);
const CONTROL_CURSOR_VALUES = new Set([
  "grab",
  "grabbing",
  "text",
  "not-allowed",
  "wait",
  "progress",
  "copy",
]);
const RESIZE_OR_MOVE_CURSOR_CLASS =
  /(?:^|\s)(?:[^\s:]+:)*cursor-(?:col-resize|row-resize|ew-resize|ns-resize|nesw-resize|nwse-resize|n-resize|s-resize|e-resize|w-resize|ne-resize|nw-resize|se-resize|sw-resize|move)(?=\s|$)/;
const CONTROL_CURSOR_CLASS =
  /(?:^|\s)(?:[^\s:]+:)*cursor-(?:grab|grabbing|text|not-allowed|wait|progress|copy)(?=\s|$)/;

function setsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  const ai = a.values();
  const bi = b.values();
  while (true) {
    const an = ai.next();
    const bn = bi.next();
    if (an.done || bn.done) return an.done === bn.done;
    if (an.value !== bn.value) return false;
  }
  return true;
}

function getEntryProgress(
  rect: DOMRect,
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
) {
  const dx = currentX - startX;
  const dy = currentY - startY;

  const axisProgress = (
    start: number,
    delta: number,
    min: number,
    max: number,
  ) => {
    if (delta > 0) {
      if (max <= start) return Number.POSITIVE_INFINITY;
      return min <= start ? 0 : (min - start) / delta;
    }
    if (delta < 0) {
      if (min >= start) return Number.POSITIVE_INFINITY;
      return max >= start ? 0 : (start - max) / -delta;
    }
    return min < start && max > start ? 0 : Number.POSITIVE_INFINITY;
  };

  return Math.max(
    axisProgress(startX, dx, rect.left, rect.right),
    axisProgress(startY, dy, rect.top, rect.bottom),
  );
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

function hasClassMatch(el: HTMLElement, pattern: RegExp) {
  return typeof el.className === "string" && pattern.test(el.className);
}

function blocksMarqueeStart(
  target: Element,
  root: HTMLElement,
  card: Element | null,
) {
  let el: HTMLElement | null =
    target instanceof HTMLElement ? target : target.parentElement;
  while (el) {
    if (
      el.hasAttribute("data-drag-select-ignore") ||
      el.hasAttribute("data-no-marquee")
    ) {
      return true;
    }

    if (el.getAttribute("draggable") === "true") return true;

    const isSelectableCardRoot = el === card;
    if (hasClassMatch(el, RESIZE_OR_MOVE_CURSOR_CLASS)) return true;
    if (!isSelectableCardRoot && hasClassMatch(el, CONTROL_CURSOR_CLASS)) {
      return true;
    }

    const cursor = window.getComputedStyle(el).cursor;
    if (RESIZE_OR_MOVE_CURSOR_VALUES.has(cursor)) return true;
    if (!isSelectableCardRoot && CONTROL_CURSOR_VALUES.has(cursor)) return true;

    if (el === root) break;
    el = el.parentElement;
  }

  return false;
}

export function DragSelect({
  value,
  onChange,
  disabled,
  boundaryRef,
  itemScopeRef,
  allowCardDescendantDragStart = false,
  deferCommit = false,
  className,
  style,
  children,
  ...rest
}: DragSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  // AdminShell 이 내려준 기본 경계(사이드바 제외 본문)는 itemScopeRef 만 넘긴 특수
  // 케이스(예: 드로어가 열려 있고, 시작은 본문 어디서든 허용하되 선택 대상은 드로어
  // 카드로 제한할 때)에만 쓴다. 일반 목록은 자기 컨테이너 안에서만 마키를 시작한다.
  const ctxBoundaryRef = useMarqueeBoundary();

  const handleMouseDown = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (disabled || e.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;
      // 카드 탐색·자동스크롤·사각형 기준이 되는 루트.
      //  - boundaryRef 또는 itemScopeRef 가 명시된 "스코프 인스턴스"(드로어/모달 등)는
      //    전역 마키와 섞이지 않게 격리된다.
      //  - boundaryRef 가 없으면 시작 영역은 전역(ctx) 경계를 쓴다.
      //  - itemScopeRef 가 있으면 카드 탐색은 그 안으로 제한한다.
      const isScoped = boundaryRef != null || itemScopeRef != null;
      const boundary = boundaryRef
        ? boundaryRef.current ?? container
        : itemScopeRef
          ? ctxBoundaryRef?.current ?? container
          : null;
      const root = itemScopeRef?.current ?? boundary ?? container;
      const useBoundary = boundary != null;

      const target = e.target;
      if (!(target instanceof Element)) return;
      // 전역(ctx) 인스턴스는 "스코프 영역(드로어/모달 등)" 안에서 시작된 드래그는 무시한다.
      // 그 영역은 자체 스코프 DragSelect 가 처리한다(중복/오선택 방지).
      if (!isScoped && target.closest("[data-marquee-scope]")) return;
      const card = target.closest("[data-drag-item-id]");
      if (blocksMarqueeStart(target, root, card)) return;

      // 버튼/링크/입력/체크박스 등 "중첩된" 상호작용 요소 위에서 시작하면 마키를 켜지
      // 않는다(그 클릭 동작을 우선). 단, 카드 루트 자체가 role="button" 인 경우(예: 지문
      // 카드)에는 카드 본문 위 시작을 허용해야 하므로, 상호작용 요소가 카드 루트와
      // 동일하면 통과시킨다.
      const hardInteractive = target.closest(
        [
          "a",
          "input",
          "textarea",
          "select",
          "label",
          "[contenteditable='true']",
          "[role='checkbox']",
          "[role='switch']",
          "[role='menuitem']",
          "[role='option']",
        ].join(", "),
      );
      if (hardInteractive && hardInteractive !== card) return;
      const buttonLike = target.closest("button, [role='button']");
      if (buttonLike && buttonLike !== card) {
        const canStartFromCardChild =
          allowCardDescendantDragStart &&
          card instanceof HTMLElement &&
          buttonLike instanceof HTMLElement &&
          card.contains(buttonLike);
        if (!canStartFromCardChild) return;
      }

      // 이미 draggable한 요소(예: "선택된" 카드) 위에서 시작하면 그 카드의 네이티브
      // 드래그(폴더 이동)를 우선한다 — 마키를 켜지 않는다. (미선택 카드는 draggable
      //  미등록이라 여기 걸리지 않고 아래 마키 로직으로 진행된다.)
      if (target.closest('[draggable="true"]')) return;

      // 같은 boundary 를 공유하는 DragSelect 인스턴스가 여러 개일 때(예: 지문별 그룹마다
      // 하나씩 렌더되는 경우) 한 번의 mousedown 에 모두 반응하면 중복 마키가 켜진다.
      // 같은 엘리먼트에 달린 리스너끼리는 동일한 event 객체를 공유하므로, 먼저 처리한
      // 인스턴스가 "claim" 표시를 남기고 나머지는 빠져나간다. (root 가 boundary 전체이므로
      // 어느 인스턴스가 처리하든 그룹 전체의 카드를 똑같이 선택한다.)
      const claimable = e as { __dragSelectClaimed?: boolean };
      if (claimable.__dragSelectClaimed) return;
      claimable.__dragSelectClaimed = true;

      const startX = e.clientX;
      const startY = e.clientY;
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const base = additive ? new Set(value) : new Set<string>();
      let active = false;
      let lastSent = value;
      const enteredOrder = new Map<string, number>();
      let nextEnteredIndex = 0;
      // deferCommit — 드래그 중 리액트 무접촉. 걸친 카드는 인라인 틴트로만
      // 표시하고(이전 인라인 배경을 보관·복원), 릴리스에서 한 번만 커밋한다.
      // 시작점이 이미 선택된 카드면 **해제 드래그**다 — 걸친 선택 카드를 뺀다
      // (선택된 걸 다시 드래그하면 해제 — 유저 요청 2026-08-05).
      let deferredNext: Set<string> | null = null;
      const paintedEls = new Map<string, { el: HTMLElement; prev: string }>();
      const startCardId = card?.getAttribute("data-drag-item-id") ?? null;
      const removeMode =
        deferCommit && startCardId !== null && value.has(startCardId);

      // 자동 스크롤: 시작점을 "콘텐츠 기준"으로 고정해, 스크롤되면 선택 박스가 늘어난다.
      // 스크롤 대상은 "카드가 들어있는" 스크롤 컨테이너다. DragSelect 가 스크롤 영역을
      // 통째로 감싸는 경우(시작 영역을 패널 전체로 넓힌 경우) 그 스크롤 컨테이너는
      // DragSelect 의 자손이므로, 카드에서 위로 올라가며 스크롤 조상을 찾는다. 카드가
      // 없으면 컨테이너의 스크롤 조상으로 폴백한다(기존 동작과 동일).
      const firstItem = root.querySelector<HTMLElement>("[data-drag-item-id]");
      const scrollParent =
        (firstItem && getScrollParent(firstItem)) || getScrollParent(container);
      const isWindowScroll = !scrollParent;
      const readScroll = () =>
        scrollParent ? scrollParent.scrollTop : window.scrollY;
      const startScroll = readScroll();
      // 가장 최근 포인터 위치(뷰포트 좌표). 자동 스크롤 루프에서도 사용한다.
      let lastClientX = startX;
      let lastClientY = startY;
      let rafId = 0;
      const previousBodyUserSelect = document.body.style.userSelect;

      // 스크롤로 인해 이동한 만큼 시작점의 뷰포트 Y 를 보정 → 콘텐츠 기준 앵커.
      const anchorY = () => startY - (readScroll() - startScroll);

      function recompute() {
        const ay = anchorY();
        const x1 = Math.min(startX, lastClientX);
        const y1 = Math.min(ay, lastClientY);
        const x2 = Math.max(startX, lastClientX);
        const y2 = Math.max(ay, lastClientY);

        if (useBoundary) {
          // 뷰포트 기준(fixed) — 컨테이너의 overflow/clip 에 잘리지 않고 패널을 가로질러
          // 그려진다.
          setRect({ left: x1, top: y1, width: x2 - x1, height: y2 - y1, fixed: true });
        } else {
          const cRect = container!.getBoundingClientRect();
          setRect({
            left: x1 - cRect.left,
            top: y1 - cRect.top,
            width: x2 - x1,
            height: y2 - y1,
          });
        }

        const hitItems: Array<{
          id: string;
          domIndex: number;
          entryProgress: number;
        }> = [];
        const hitEls = new Map<string, HTMLElement>();
        const items = root.querySelectorAll<HTMLElement>("[data-drag-item-id]");
        items.forEach((el, domIndex) => {
          const r = el.getBoundingClientRect();
          // 사각형이 한 점이라도 겹치면 선택 (카드 일부만 걸쳐도 OK)
          const hit = r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1;
          if (hit) {
            const id = el.getAttribute("data-drag-item-id");
            if (!id) return;
            if (deferCommit) hitEls.set(id, el);
            hitItems.push({
              id,
              domIndex,
              entryProgress: getEntryProgress(
                r,
                startX,
                ay,
                lastClientX,
                lastClientY,
              ),
            });
          }
        });

        hitItems
          .filter((item) => !enteredOrder.has(item.id))
          .sort(
            (a, b) =>
              a.entryProgress - b.entryProgress || a.domIndex - b.domIndex,
          )
          .forEach((item) => {
            enteredOrder.set(item.id, nextEnteredIndex++);
          });

        const next = new Set(base);
        hitItems
          .sort(
            (a, b) =>
              (enteredOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                (enteredOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
              a.domIndex - b.domIndex,
          )
          .forEach((item) => next.add(item.id));

        if (deferCommit) {
          // 리액트 무접촉 — 커밋은 릴리스에서.
          if (removeMode) {
            // 해제 드래그: 최종 집합 = 기존 선택 − 걸친 카드. 틴트는 "빠질
            // 예정"인 선택 카드에만(rose) — 미선택 카드는 대상이 아니다.
            const remaining = new Set(value);
            for (const id of hitEls.keys()) remaining.delete(id);
            deferredNext = remaining;
          } else {
            deferredNext = next;
          }
          for (const [id, entry] of paintedEls) {
            if (!hitEls.has(id)) {
              entry.el.style.backgroundColor = entry.prev;
              paintedEls.delete(id);
            }
          }
          for (const [id, el] of hitEls) {
            if (paintedEls.has(id)) continue;
            // 담기 모드: 미선택 카드만 파란 틴트(선택 카드는 자기 스타일 유지)
            // 해제 모드: 선택 카드만 붉은 틴트
            if (removeMode ? value.has(id) : !value.has(id)) {
              paintedEls.set(id, { el, prev: el.style.backgroundColor });
              el.style.backgroundColor = removeMode
                ? DEFER_REMOVE_TINT
                : DEFER_HIT_TINT;
            }
          }
        } else if (!setsEqual(next, lastSent)) {
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
        document.body.style.userSelect = previousBodyUserSelect;
        // deferCommit 틴트 원복 — 커밋 리렌더는 인라인 배경을 지우지 않는다.
        for (const entry of paintedEls.values()) {
          entry.el.style.backgroundColor = entry.prev;
        }
        paintedEls.clear();
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
        if (!active) {
          active = true;
          document.body.style.userSelect = "none";
        }
        ev.preventDefault();
        recompute();
        ensureAutoScroll();
      }

      function handleUp() {
        const finalSet = deferredNext;
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
        // deferCommit — 드래그가 실제로 있었을 때만, 릴리스에서 1회 커밋.
        if (deferCommit && active && finalSet && !setsEqual(finalSet, lastSent)) {
          lastSent = finalSet;
          onChange(finalSet, { deferMode: removeMode ? "remove" : "add" });
        }
      }

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      window.addEventListener("dragstart", handleDragStart, true);
    },
    [
      disabled,
      value,
      onChange,
      boundaryRef,
      itemScopeRef,
      ctxBoundaryRef,
      allowCardDescendantDragStart,
      deferCommit,
    ],
  );

  // 넓은 시작 영역에서 mousedown 을 받는다.
  //  - boundaryRef 명시: 그 경계(없으면 자기 컨테이너)에 붙는다.
  //  - itemScopeRef 만 명시: AdminShell 본문 경계에 붙고, 선택 대상은 itemScopeRef 안으로
  //    제한한다(드로어 카드 선택용).
  //  - 둘 다 없으면 일반 목록 모드이므로 자기 컨테이너의 onMouseDown 만 쓴다.
  // 이 영역의 버튼/입력/드래그/스코프 요소는 handleMouseDown 안에서 걸러진다.
  useEffect(() => {
    const isScoped = boundaryRef != null || itemScopeRef != null;
    if (!isScoped) return;
    const el = boundaryRef
      ? boundaryRef.current ?? containerRef.current
      : ctxBoundaryRef?.current ?? containerRef.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => handleMouseDown(e);
    el.addEventListener("mousedown", onDown, true);
    if (isScoped) el.setAttribute("data-marquee-scope", "1");
    return () => {
      el.removeEventListener("mousedown", onDown, true);
      if (isScoped) el.removeAttribute("data-marquee-scope");
    };
  }, [boundaryRef, itemScopeRef, ctxBoundaryRef, handleMouseDown]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", ...style }}
      // boundary 가 있으면 시작 이벤트는 위 useEffect 에서 처리한다(중복 방지).
      onMouseDown={
        boundaryRef || itemScopeRef
          ? undefined
          : handleMouseDown
      }
      {...rest}
    >
      {children}
      {rect?.fixed && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[60] rounded-sm border border-blue-400 bg-blue-400/15"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              }}
            />,
            document.body,
          )
        : null}
      {rect && !rect.fixed && (
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
