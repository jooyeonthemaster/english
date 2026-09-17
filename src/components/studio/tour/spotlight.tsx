"use client";

// ============================================================================
// 스포트라이트 계층 — 딤 + 컷아웃 + 링 + 카드/오버레이 좌표 구동
// (.tmp-studio-tour/spec.md §1.4 — 좌표 계약의 구현체)
//
// rAF 루프 1개가 프레임마다: 앵커 재조회 → 실측 rect → 지수 평활 수렴 →
// SVG path·링·카드·데모 오버레이를 **명령형** 갱신한다(React 상태 프레임당 0회).
// - 링(data-tour-ring)은 컷아웃 rect 와 항상 일치한다 — 좌표 게이트(T2)는 이
//   요소의 getBoundingClientRect 를 앵커 실측과 대조한다(파싱 불요한 계기).
// - 링은 interactive 가 아니면 홀 블로커를 겸한다(pointer-events).
// - 앵커 부재/rect 0×0/뷰포트 완전 이탈이 GRACE_MS 를 넘으면 중앙 모드로
//   강등하고, fallback === "skip" 이면 onFallbackSkip 을 1회 발화한다.
// ============================================================================

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  centerRect,
  expandRect,
  holePath,
  placeCard,
  placeOverlay,
  stepToward,
  type Rect,
} from "./geometry";
import { readTourShift } from "./storage";

const GRACE_MS = 600;
const SPRING_ALPHA = 0.28;
const DIM_FILL = "rgba(2, 6, 23, 0.62)";

export interface SpotlightProps {
  /** 스텝 전환 감지용 키(스텝 id). 스프링 자체는 이어져 부드럽게 이동한다. */
  stepKey: string;
  anchor?: string;
  fallback: "center" | "skip";
  padding: number;
  radius: number;
  interactive: boolean;
  placement: "auto" | "top" | "bottom" | "left" | "right";
  /** 오버레이 데모 앵커(있을 때만 오버레이 배치 구동) */
  overlayAnchor?: string;
  cardRef: RefObject<HTMLDivElement | null>;
  arrowRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  onDimClick: () => void;
  onFallbackSkip: () => void;
}

export function SpotlightLayer(props: SpotlightProps) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  /** 표시 중인 rect — 스텝을 넘어도 유지되어 스프링이 이어진다. */
  const curRef = useRef<Rect | null>(null);
  const skipFiredRef = useRef(false);
  /**
   * 앵커 소실 시각 — 600ms 유예의 기준점. 스텝 단위 계약이므로 스텝 전환 시
   * 반드시 리셋한다(적대검수 확정: 클로저 변수로 두면 이전 스텝의 소실이
   * 다음 스텝의 유예를 선소진해 즉시 강등·오스킵이 난다).
   */
  const lostSinceRef = useRef<number | null>(null);

  // 최신 props 를 루프가 ref 로 읽는다(루프 재구독 최소화). 렌더 중 ref 쓰기
  // 금지 규칙에 맞춰 커밋 후(deps 없는 effect) 동기화한다 — 한 프레임 지연은
  // 스프링이 자연 흡수한다.
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    skipFiredRef.current = false;
    lostSinceRef.current = null;
  }, [props.stepKey]);

  useEffect(() => {
    let raf = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // T9 음성테스트 훅(?tourShift=N, dev 전용) — 페이지 수명 동안 상수.
    const shift = readTourShift();

    const tick = () => {
      const p = propsRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let target: Rect;
      let locked = false;

      if (p.anchor) {
        const el = document.querySelector<HTMLElement>(p.anchor);
        const r = el?.getBoundingClientRect();
        const visible =
          !!r &&
          r.width > 2 &&
          r.height > 2 &&
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < vh &&
          r.left < vw;
        if (visible && r) {
          lostSinceRef.current = null;
          target = expandRect(
            { x: r.left + shift, y: r.top + shift, w: r.width, h: r.height },
            p.padding,
            vw,
            vh,
          );
          locked = true;
        } else {
          if (lostSinceRef.current === null) lostSinceRef.current = performance.now();
          if (performance.now() - lostSinceRef.current > GRACE_MS) {
            if (p.fallback === "skip" && !skipFiredRef.current) {
              skipFiredRef.current = true;
              p.onFallbackSkip();
            }
            target = centerRect(vw, vh);
          } else {
            // 유예 중에는 마지막 표시 rect 를 유지(깜빡임 방지)
            target = curRef.current ?? centerRect(vw, vh);
          }
        }
      } else {
        target = centerRect(vw, vh);
      }

      const cur =
        curRef.current === null || reduced
          ? { ...target }
          : stepToward(curRef.current, target, SPRING_ALPHA);
      curRef.current = cur;

      // ── 명령형 페인트 ────────────────────────────────────────────────
      const hasHole = cur.w >= 1 && cur.h >= 1;
      pathRef.current?.setAttribute("d", holePath(vw, vh, cur, p.radius));

      const ring = ringRef.current;
      if (ring) {
        ring.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
        ring.style.width = `${cur.w}px`;
        ring.style.height = `${cur.h}px`;
        ring.style.opacity = hasHole ? "1" : "0";
        ring.style.borderRadius = `${p.radius}px`;
        // 링 = 홀 블로커 겸직: 프레젠테이션 모드에서만 클릭을 막는다.
        ring.style.pointerEvents = hasHole && !p.interactive ? "auto" : "none";
      }

      // 카드 배치(콘텐츠 크기는 렌더가 소유 — 여기서는 위치만).
      const card = p.cardRef.current;
      if (card) {
        const place = placeCard(cur, card.offsetWidth, card.offsetHeight, vw, vh, p.placement);
        card.style.transform = `translate(${place.x}px, ${place.y}px)`;
        card.dataset.side = place.side;
        const arrow = p.arrowRef.current;
        if (arrow) {
          if (place.side === "center") {
            arrow.style.display = "none";
          } else {
            arrow.style.display = "block";
            if (place.side === "top" || place.side === "bottom") {
              arrow.style.left = `${place.arrow - 6}px`;
              arrow.style.top = place.side === "top" ? "" : "-6px";
              arrow.style.bottom = place.side === "top" ? "-6px" : "";
            } else {
              arrow.style.top = `${place.arrow - 6}px`;
              arrow.style.left = place.side === "left" ? "" : "-6px";
              arrow.style.right = place.side === "left" ? "-6px" : "";
            }
          }
        }
      }

      // 오버레이 데모 배치 — 자기 앵커(기본 = 스텝 앵커) rect 를 덮는다.
      const overlay = p.overlayRef.current;
      if (overlay) {
        const sel = p.overlayAnchor ?? p.anchor;
        const oEl = sel ? document.querySelector<HTMLElement>(sel) : null;
        const oRect = oEl?.getBoundingClientRect();
        if (oRect && oRect.width > 2 && oRect.height > 2) {
          const o = placeOverlay(
            { x: oRect.left, y: oRect.top, w: oRect.width, h: oRect.height },
            280,
            160,
            vw,
            vh,
          );
          overlay.style.transform = `translate(${o.x}px, ${o.y}px)`;
          overlay.style.width = `${o.w}px`;
          overlay.style.maxHeight = `${o.h}px`;
          overlay.style.opacity = "1";
          overlay.style.pointerEvents = "auto";
        } else {
          // 숨김은 opacity 만으로 부족하다 — 투명 div 가 히트테스트를 삼킨다.
          overlay.style.opacity = "0";
          overlay.style.pointerEvents = "none";
        }
      }

      // 계기 축(프로브 판독): locked = 앵커 실추적 중 / center = 중앙 모드.
      // anchorSel·pad 를 함께 노출해 좌표 게이트(T2)가 스텝 원장을 복제하지
      // 않고도 「지금 무엇을 비추는 중인가」를 그대로 판독하게 한다.
      const container = p.containerRef.current;
      if (container) {
        container.dataset.tourAnchor = locked ? "locked" : "center";
        container.dataset.tourAnchorSel = p.anchor ?? "";
        container.dataset.tourPad = String(p.padding);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
        <path
          ref={pathRef}
          d=""
          fill={DIM_FILL}
          fillRule="evenodd"
          style={{ pointerEvents: "auto", cursor: "default" }}
          onClick={() => propsRef.current.onDimClick()}
        />
      </svg>
      {/* 컷아웃 링 — 좌표 게이트의 계기이자 홀 블로커. */}
      <div
        ref={ringRef}
        data-tour-ring
        aria-hidden="true"
        className="absolute left-0 top-0 border-2 border-blue-400/90 shadow-[0_0_0_4px_rgba(96,165,250,0.35),0_0_24px_4px_rgba(59,130,246,0.45)]"
        style={{ opacity: 0, willChange: "transform, width, height" }}
      />
    </>
  );
}
