"use client";

import { useEffect, useState } from "react";
import { Expand, Minimize2 } from "lucide-react";

const DEFAULT_TARGET_SELECTOR = "[data-manual-viewer]";

interface ManualFullscreenButtonProps {
  targetSelector?: string;
}

export function ManualFullscreenButton({
  targetSelector = DEFAULT_TARGET_SELECTOR,
}: ManualFullscreenButtonProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function syncFullscreenState() {
      const fullscreenElement = document.fullscreenElement;
      setIsFullscreen(Boolean(fullscreenElement?.matches(targetSelector)));
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, [targetSelector]);

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    const target = document.querySelector<HTMLElement>(targetSelector);
    await (target ?? document.documentElement).requestFullscreen();
  }

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      aria-pressed={isFullscreen}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/70 bg-white/75 px-2.5 text-[11px] font-bold text-slate-700 shadow-sm backdrop-blur-md transition hover:border-blue-200 hover:bg-white/95 hover:text-blue-700"
    >
      {isFullscreen ? <Minimize2 className="size-3.5" /> : <Expand className="size-3.5" />}
      {isFullscreen ? "전체화면 종료" : "전체화면"}
    </button>
  );
}
