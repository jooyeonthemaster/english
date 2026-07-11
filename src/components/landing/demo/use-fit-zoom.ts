"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 컨테이너 폭에 맞춘 축소 배율. baseWidth(px) 콘텐츠가 컨테이너보다 넓으면
 * containerWidth/baseWidth 로 줄이고, 넓을 필요 없으면 1(min(1, ...)).
 * Step2 리포트(--par-zoom, base 794)와 Step4 시험지(previewZoom, base 760)가 공유.
 */
export function useFitZoom(baseWidth: number, minZoom = 0.4) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      setZoom(Math.max(minZoom, Math.min(1, w / baseWidth)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [baseWidth, minZoom]);

  return { containerRef, zoom };
}
