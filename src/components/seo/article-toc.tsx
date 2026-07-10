"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * 아티클 우측 레일 목차(xl 이상 전용) — 스크롤 위치에 따라 현재 섹션을 하이라이트.
 * 레일 하단에 미니 전환 카드를 상시 노출해 데스크톱에서도 CTA 가 시야에서 사라지지 않게 한다.
 */
export function ArticleToc({
  items,
}: {
  items: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    let raf = 0;
    function pick() {
      raf = 0;
      const pivot = window.innerHeight * 0.32;
      let current: string | null = items[0]?.id ?? null;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= pivot) current = item.id;
      }
      setActiveId(current);
    }
    function onScroll() {
      if (!raf) raf = window.requestAnimationFrame(pick);
    }
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [items]);

  return (
    <div className="sticky top-28">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
        <span aria-hidden className="size-1.5 bg-blue-600" />
        목차
      </p>
      <nav aria-label="목차" className="mt-4 border-l border-slate-200">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`-ml-px block border-l-2 py-1.5 pl-4 pr-2 text-[13px] leading-5 transition-colors ${
                    active
                      ? "border-blue-600 font-bold text-blue-700"
                      : "border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-600">
          SMOAT AI
        </p>
        <p className="mt-1.5 text-[13.5px] font-extrabold leading-5 text-slate-950">
          지금 읽는 유형, 지문만 넣으면 바로 문제가 됩니다
        </p>
        <Link
          href="/register"
          className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-slate-950 text-[12.5px] font-extrabold text-white transition hover:bg-blue-600"
        >
          무료로 시작하기
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
