"use client";

// 가로 스크롤 컨테이너 + 「더 있다」 단서 (공용).
// 모바일에서 표가 컨테이너보다 넓을 때, 단서가 없으면 관리자는 열이 원래 적은 것으로 읽는다.
// 계약 속성(게이트가 이 두 개로 찾는다):
//   data-scrollable-x : 스크롤러 · data-scroll-hint : 스크롤 가능할 때만 나타나는 캡션

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollState {
  scrollable: boolean;
  atStart: boolean;
  atEnd: boolean;
}

const INITIAL: ScrollState = { scrollable: false, atStart: true, atEnd: true };

export function ScrollableX({
  children,
  caption = "좌우로 밀어 더 보기",
  className,
  scrollerClassName,
  hintClassName,
}: {
  children: ReactNode;
  caption?: string;
  className?: string;
  scrollerClassName?: string;
  hintClassName?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ScrollState>(INITIAL);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next: ScrollState = { scrollable: max > 1, atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft >= max - 1 };
    setState((prev) =>
      prev.scrollable === next.scrollable && prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next,
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // 내용(표) 자체가 넓어지거나 행 수가 바뀌는 경우도 잡는다
    for (const child of Array.from(el.children)) ro.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure, children]);

  return (
    <div className={className}>
      <div className="relative">
        <div ref={ref} data-scrollable-x="" className={cn("overflow-x-auto", scrollerClassName)}>
          {children}
        </div>
        {state.scrollable && !state.atStart && (
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent" aria-hidden />
        )}
        {state.scrollable && !state.atEnd && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" aria-hidden />
        )}
      </div>
      {state.scrollable && (
        <p data-scroll-hint="" className={cn("py-1.5 text-[11px] text-gray-400", hintClassName)}>
          ↔ {caption}
        </p>
      )}
    </div>
  );
}
