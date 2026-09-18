"use client";

// 가로 스크롤 컨테이너 + 「더 있다」 단서.
// 세션 표는 모바일(364px)에서 990px 폭이라 오른쪽 5열이 화면 밖인데, 단서가 없으면 열이 원래 적은 것으로 읽힌다.
// 감독의 공용 <ScrollableX>(shared/)가 들어오면 이 파일을 지우고 import 만 바꾸면 된다 — 계약 속성은 동일하게 둔다.
//   data-scrollable-x : 스크롤러 · data-scroll-hint : 스크롤 가능할 때만 나타나는 캡션

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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
}: {
  children: ReactNode;
  caption?: string;
  className?: string;
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
        <div ref={ref} data-scrollable-x="" className="overflow-x-auto">
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
        <p data-scroll-hint="" className="px-5 py-1.5 text-[11px] text-gray-400">
          ↔ {caption}
        </p>
      )}
    </div>
  );
}
