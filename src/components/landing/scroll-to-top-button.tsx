"use client";

import { useEffect, useState } from "react";
import { ArrowUpToLine } from "lucide-react";

/**
 * 랜딩 우하단 "맨 위로" 버튼.
 * 첫 화면(히어로)을 지나면 나타나고, 누르면 최상단으로 부드럽게 이동한다.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="맨 위로 올라가기"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-[18px] z-40 flex size-11 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-600 shadow-[0_14px_36px_-14px_rgba(15,23,42,0.45)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:bottom-8 sm:right-[30px] ${
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUpToLine className="size-5" strokeWidth={2.5} />
    </button>
  );
}
