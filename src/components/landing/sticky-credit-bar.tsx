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
        @keyframes nara-sticky-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes nara-red-flash {
          0%, 100% { background-color: #EF4444; color: white; transform: scale(1); }
          50% { background-color: #DC2626; color: #FEF2F2; transform: scale(1.02); }
        }
        @media (prefers-reduced-motion: reduce) {
          .nara-sticky-root { animation: none !important; }
          .nara-red-flash { animation: none !important; }
        }
      `}</style>

      {shown && (
        <div
          className="nara-sticky-root fixed bottom-0 left-0 right-0 z-50 w-full bg-[#EF4444]"
          style={{
            animation: "nara-sticky-slide-up 300ms ease-out both",
            boxShadow: "0 -10px 40px rgba(239,68,68,0.4)",
          }}
        >
          <div className="max-w-[1440px] mx-auto px-6 h-auto md:h-[88px] py-5 md:py-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start md:items-center gap-4">
              <span className="animate-pulse flex-shrink-0 w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] mt-1.5 md:mt-0" />
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-black uppercase tracking-[0.2em] text-yellow-300 drop-shadow-sm">
                    [긴급] 선착순 100명 한정 캠페인
                  </span>
                </div>
                <div className="text-[18px] md:text-[22px] font-black text-white tracking-tight leading-tight mt-1 drop-shadow-md">
                  지금 사전 예약 접수 중! 남은 자리가 얼마 없습니다!
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <a
                href="#apply"
                onClick={scrollToApply}
                className="nara-red-flash inline-flex items-center justify-center h-14 px-8 rounded-full bg-yellow-400 text-red-900 font-black text-[16px] shadow-[0_5px_15px_rgba(0,0,0,0.3)] transition-all hover:bg-yellow-300 border-2 border-yellow-300"
              >
                지금 사전 예약하기 →
              </a>
              <button
                type="button"
                aria-label="배너 닫기"
                onClick={() => setDismissed(true)}
                className="flex items-center justify-center w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-black/20 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
