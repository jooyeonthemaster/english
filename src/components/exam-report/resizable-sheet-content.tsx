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

  // 성능 계약(resizable-panels startResize 동형): 드래그 중에는 React 를 거치지
  // 않는다 — 매 pointermove 의 setState 는 시트 소비처(워크스페이스·분석 스텝)
  // 트리를 프레임마다 리렌더시킨다. 이동 중에는 [data-resizable-sheet] 요소의
  // style.width 에 rAF 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 커밋+영속한다.
  // 앵커를 못 찾으면 종전 setState 경로로 폴백(무회귀).
  const beginResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      let latest = startWidth;

      // 포인터 캡처 — 커서가 얇은 그랩바를 벗어나도 드래그가 끊기지 않는다.
      const handle = e.currentTarget as HTMLElement;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // 드래그 대상 시트 실체 — 그랩바에서 가장 가까운 [data-resizable-sheet].
      const sheetEl = handle.closest<HTMLElement>("[data-resizable-sheet]");

      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단(캡처 덕에 move 수신은 유지).
      document.body.style.pointerEvents = "none";

      // rAF 코얼레싱 — 고주사율 포인터가 프레임당 여러 번 발화해도 기록은 1회.
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (sheetEl) sheetEl.style.width = `${latest}px`;
      };

      const onMove = (ev: PointerEvent) => {
        // 우측 드로어: 왼쪽(음의 deltaX)으로 끌수록 넓어진다.
        latest = clamp(startWidth - (ev.clientX - startX));
        if (sheetEl) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          // 폴백 — 앵커를 못 찾으면 종전대로 상태 갱신.
          setWidth(latest);
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (sheetEl) sheetEl.style.width = `${latest}px`;
        // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회. 영속도 latest 로
        // (종전 widthRef 저장은 커밋 전 값을 저장하는 셈이라 한 박자 밀렸다).
        setWidth(latest);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* 무시 */
        }
        try {
          window.localStorage.setItem(storageKey, String(latest));
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
      // 드래그 고속 경로 앵커 — SheetContent 는 props 를 DOM 에 forward 한다.
      data-resizable-sheet=""
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
