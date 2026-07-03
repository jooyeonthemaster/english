"use client";

import { useEffect, useState } from "react";

// Tailwind `lg` 브레이크포인트 = 1024px. 그 미만을 모바일로 본다.
// SSR/최초 렌더는 false(=데스크톱)로 시작해 PC 렌더가 절대 바뀌지 않게 하고,
// 클라이언트에서 뷰포트가 모바일이면 true 로 승격한다.
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
