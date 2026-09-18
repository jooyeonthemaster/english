"use client";

// 셀 hover 툴팁 — 히트맵·캘린더 공용.
// 셀들이 overflow-x-auto 컨테이너 안에 있어 absolute 툴팁은 잘린다 → body 포털 + position:fixed.
// 마우스는 hover, 터치는 탭으로 연다. 스크롤·리사이즈 시 닫는다.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface TipState {
  title: string;
  detail: string;
  x: number;
  y: number;
  below: boolean;
}

/** 툴팁 대략 폭의 절반 — 화면 가장자리에서 잘리지 않게 중심을 안쪽으로 민다 */
const HALF_WIDTH = 90;
const TIP_HEIGHT = 48;

export function useHoverTip() {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback((el: Element, title: string, detail: string) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const x = Math.min(vw - HALF_WIDTH - 4, Math.max(HALF_WIDTH + 4, r.left + r.width / 2));
    const below = r.top < TIP_HEIGHT + 12;
    setTip({ title, detail, x, y: below ? r.bottom : r.top, below });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    const off = () => setTip(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [tip]);

  return { tip, show, hide };
}

export function HoverTip({ tip }: { tip: TipState | null }) {
  if (!tip || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[70] whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg"
      style={{
        left: tip.x,
        top: tip.below ? tip.y + 6 : tip.y - 6,
        transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`,
      }}
    >
      <p className="text-[12px] font-semibold text-gray-700">{tip.title}</p>
      <p className="mt-0.5 text-[12px] tabular-nums text-gray-500">{tip.detail}</p>
    </div>,
    document.body,
  );
}
