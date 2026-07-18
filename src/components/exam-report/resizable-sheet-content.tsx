"use client";

// ============================================================================
// 폭 조절 가능한 우측 시트 콘텐츠 — 시험지 원본·시험지 총평 시트에 붙는다.
//
// SheetContent 자체엔 리사이즈가 없어(그리고 style/className 을 forward 함), 좌측
// 가장자리 그랩바를 얹고 폭을 인라인 style 로 구동한다. 그랩바 디자인·상호작용은
// 리포의 우측 드로어 패턴(job-preview-drawer, analysis-report use-panel-widths)을
// 따른다: 얇은 pill(hover 파랑) · col-resize · 4px 드래그 임계 · 더블클릭 초기화 ·
// localStorage 폭 유지. 우측 드로어라 **왼쪽으로 끌면 넓어진다**(sign -1).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** 뷰포트 대비 최대 폭(92vw) — 클램프 상한. */
function maxWidthPx(): number {
  if (typeof window === "undefined") return 9999;
  return Math.round(window.innerWidth * 0.92);
}

export function ResizableSheetContent({
  storageKey,
  defaultWidth,
  minWidth = 360,
  className,
  children,
}: {
  /** 폭 유지용 localStorage 키(시트별로 달라야 한다) */
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const clamp = useCallback(
    (w: number) => Math.min(maxWidthPx(), Math.max(minWidth, Math.round(w))),
    [minWidth],
  );

  const [width, setWidth] = useState(defaultWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  // 저장된 폭 복원(마운트 1회).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setWidth(clamp(Number(raw)));
    } catch {
      /* 접근 불가 시 기본값 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: PointerEvent) => {
        // 우측 드로어: 왼쪽(음의 deltaX)으로 끌수록 넓어진다.
        setWidth(clamp(startWidth - (ev.clientX - startX)));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(storageKey, String(widthRef.current));
        } catch {
          /* 무시 */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clamp, storageKey],
  );

  const reset = useCallback(() => {
    setWidth(clamp(defaultWidth));
    try {
      window.localStorage.setItem(storageKey, String(clamp(defaultWidth)));
    } catch {
      /* 무시 */
    }
  }, [clamp, defaultWidth, storageKey]);

  return (
    <SheetContent
      side="right"
      // 폭·상한을 인라인으로 못박는다(arbitrary Tailwind 폭은 turbopack JIT 함정 +
      // sm:max-w-sm 클램프 회피). 스크롤은 본문에서만.
      style={{ width, maxWidth: "92vw" }}
      className={cn("overflow-hidden", className)}
    >
      {/* 좌측 가장자리 그랩바 — 전체 높이 히트 영역 + 가운데 pill(hover 파랑) */}
      <div
        role="separator"
        aria-label="패널 너비 조절"
        aria-orientation="vertical"
        title="드래그하여 너비 조절 · 더블 클릭하여 초기화"
        onPointerDown={beginResize}
        onDoubleClick={reset}
        className="group/whandle absolute inset-y-0 left-0 z-30 flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center select-none"
      >
        <div className="h-16 w-1 rounded-full bg-slate-200 transition-colors group-hover/whandle:bg-blue-400 group-active/whandle:bg-blue-500" />
      </div>

      {/* 본문 — 이 영역만 스크롤(그랩바는 고정) */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </SheetContent>
  );
}
