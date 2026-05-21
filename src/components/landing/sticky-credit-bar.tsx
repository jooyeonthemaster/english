"use client";

import { useEffect, useState } from "react";

export function StickyCreditBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function onScroll() {
      if (dismissed) {
        setVisible(false);
        return;
      }
      const y = window.scrollY;
      const heroH = window.innerHeight * 0.7;
      setVisible(y > heroH);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [dismissed]);

  const shown = visible && !dismissed;

  function scrollToApply(e: React.MouseEvent) {
    e.preventDefault();
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <style>{`
        @keyframes yshin-sticky-slide-up {
          from { transform: translateY(140%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes yshin-cta-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); }
          50% { transform: scale(1.025); box-shadow: 0 8px 24px rgba(37, 99, 235, 0.6); }
        }
        .yshin-cta-pulse {
          animation: yshin-cta-pulse 2s infinite ease-in-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .yshin-sticky-root { animation: none !important; }
          .yshin-cta-pulse { animation: none !important; }
        }
      `}</style>

      {shown && (
        <div className="fixed bottom-4 md:bottom-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
          <div
            className="yshin-sticky-root pointer-events-auto relative w-full max-w-[1200px] md:max-w-[1040px] bg-gradient-to-r from-[#F0F7FF] via-[#E6F0FF] to-[#EFF6FF] rounded-2xl md:rounded-full border border-blue-200/80 shadow-[0_20px_50px_rgba(59,130,246,0.16)]"
            style={{
              animation: "yshin-sticky-slide-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            {/* ─────────── MOBILE LAYOUT ─────────── */}
            <div className="md:hidden px-5 py-4.5 pr-10 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="animate-pulse flex-shrink-0 w-2.5 h-2.5 rounded-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.6)] mt-1.5" />
                <div className="space-y-0.5 min-w-0">
                  <span className="block text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">
                    [긴급] 선착순 100명 한정 캠페인
                  </span>
                  <div
                    className="text-[15px] font-black text-slate-900 tracking-tight leading-snug break-keep"
                    style={{ wordBreak: "keep-all" }}
                  >
                    지금 사전 예약 접수 중! <br />
                    남은 자리가 얼마 없습니다!
                  </div>
                </div>
              </div>
              <a
                href="#apply"
                onClick={scrollToApply}
                className="yshin-cta-pulse inline-flex items-center justify-center w-full h-11 px-6 rounded-xl bg-blue-600 text-white font-black text-[14px] shadow-[0_4px_12px_rgba(37,99,235,0.2)] transition-all hover:bg-blue-700 active:scale-[0.98] select-none"
              >
                지금 사전 예약하기 →
              </a>
              <button
                type="button"
                aria-label="배너 닫기"
                onClick={() => setDismissed(true)}
                className="absolute top-3.5 right-3.5 flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-slate-800 hover:bg-blue-100/50 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* ─────────── DESKTOP LAYOUT ─────────── */}
            <div className="hidden md:flex items-center gap-5 pl-3 pr-3 py-2.5">
              {/* Urgency badge */}
              <span className="inline-flex items-center gap-2 flex-shrink-0 h-11 pl-3 pr-4 rounded-full bg-blue-600 text-white text-[12.5px] font-black tracking-[0.14em] uppercase whitespace-nowrap shadow-[0_8px_18px_-3px_rgba(37,99,235,0.5)]">
                <span className="relative flex items-center justify-center w-2.5 h-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-70 animate-ping" />
                  <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-white" />
                </span>
                긴급 · 한정 100명
              </span>

              {/* Headline */}
              <div className="flex-1 min-w-0 text-[17px] font-black text-slate-900 tracking-[-0.012em] leading-none whitespace-nowrap overflow-hidden text-ellipsis">
                지금 사전 예약 접수 중!{" "}
                <span className="text-blue-700">남은 자리가 얼마 없습니다.</span>
              </div>

              {/* CTA */}
              <a
                href="#apply"
                onClick={scrollToApply}
                className="yshin-cta-pulse inline-flex items-center justify-center flex-shrink-0 h-12 px-7 rounded-full bg-blue-600 text-white font-black text-[15px] tracking-tight shadow-[0_8px_18px_-3px_rgba(37,99,235,0.5)] transition-all hover:bg-blue-700 active:scale-[0.98] select-none"
              >
                지금 사전 예약하기 →
              </a>

              {/* Close */}
              <button
                type="button"
                aria-label="배너 닫기"
                onClick={() => setDismissed(true)}
                className="flex items-center justify-center w-9 h-9 flex-shrink-0 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
