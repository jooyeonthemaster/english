"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DEADLINE_ISO = "2026-05-31T23:59:59+09:00";

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
};

function computeRemaining(): Remaining {
  const now = Date.now();
  const target = new Date(DEADLINE_ISO).getTime();
  const diff = target - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, expired: false };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function StickyCreditBar() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    setRemaining(computeRemaining());
    const id = setInterval(() => setRemaining(computeRemaining()), 1000);
    return () => clearInterval(id);
  }, []);

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
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(253, 224, 71, 0.45); }
          50% { transform: scale(1.025); box-shadow: 0 8px 24px rgba(253, 224, 71, 0.75); }
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
            className="yshin-sticky-root pointer-events-auto relative w-full max-w-[1200px] bg-gradient-to-r from-red-500 to-[#EF4444] rounded-2xl md:rounded-full border border-white/12 shadow-[0_20px_50px_rgba(220,38,38,0.35)]"
            style={{
              animation: "yshin-sticky-slide-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            {/* Close button (Absolute on mobile, regular flex item on desktop) */}
            <button
              type="button"
              aria-label="배너 닫기"
              onClick={() => setDismissed(true)}
              className="absolute md:relative top-3.5 right-3.5 md:top-auto md:right-auto flex items-center justify-center w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-black/15 transition-colors md:order-last flex-shrink-0"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="px-5 py-4.5 md:px-8 md:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 pr-10 md:pr-4">
              {/* Left Side: Info */}
              <div className="flex items-start md:items-center gap-3">
                <span className="animate-pulse flex-shrink-0 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] mt-1.5 md:mt-0" />
                <div className="space-y-0.5 min-w-0">
                  <span className="block text-[11px] md:text-[12px] font-black uppercase tracking-[0.2em] text-yellow-300 drop-shadow-sm">
                    [긴급] 선착순 100명 한정 캠페인
                  </span>
                  <div
                    className="text-[15px] md:text-[18px] font-black text-white tracking-tight leading-snug drop-shadow-md break-keep"
                    style={{ wordBreak: "keep-all" }}
                  >
                    지금 사전 예약 접수 중! 남은 자리가 얼마 없습니다!
                  </div>
                </div>
              </div>

              {/* Right Side: CTA Button */}
              <div className="w-full md:w-auto flex-shrink-0">
                <a
                  href="#apply"
                  onClick={scrollToApply}
                  className="yshin-cta-pulse inline-flex items-center justify-center w-full md:w-auto h-11 md:h-12 px-6 md:px-8 rounded-xl md:rounded-full bg-yellow-400 text-red-950 font-black text-[14px] md:text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-all hover:bg-yellow-300 border border-yellow-300 active:scale-[0.98] select-none"
                >
                  지금 사전 예약하기 →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
