"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronUp } from "lucide-react";

// ---------------------------------------------------------------------------
// 빠른 실행 바 — 시험지 생성의 CommandBar 외형/동작 복제.
// 가로 스크롤 명령 칩 + 가장자리 호버 자동 스크롤 + 하단 접기 버튼.
// ---------------------------------------------------------------------------

export type SimilarQuickCommand = {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
  run: () => void;
};

export function SimilarExamCommandBar({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: SimilarQuickCommand[];
  onClose: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollDirRef = useRef(0);

  const stopAutoScroll = useCallback(() => {
    scrollDirRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = () => {
      const el = scrollerRef.current;
      if (el && scrollDirRef.current !== 0) {
        el.scrollLeft += scrollDirRef.current * 4;
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const handleEdgeHover = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const el = scrollerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const EDGE = 48;
      const x = event.clientX - rect.left;
      if (x < EDGE) scrollDirRef.current = -1;
      else if (x > rect.width - EDGE) scrollDirRef.current = 1;
      else scrollDirRef.current = 0;
      if (scrollDirRef.current !== 0) startAutoScroll();
    },
    [startAutoScroll],
  );

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  if (!open) return null;

  return (
    <div className="relative shrink-0 border-b border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-200/40">
      <div
        ref={scrollerRef}
        onMouseMove={handleEdgeHover}
        onMouseLeave={stopAutoScroll}
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {commands.map((command) => (
          <button
            key={command.id}
            type="button"
            disabled={command.disabled}
            title={command.description}
            onClick={() => {
              command.run();
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-100 text-[9px] font-black text-slate-400">
              ⌘
            </span>
            {command.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        title="빠른 실행 닫기"
        aria-label="빠른 실행 닫기"
        className="absolute -bottom-2.5 left-1/2 z-10 flex h-5 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
