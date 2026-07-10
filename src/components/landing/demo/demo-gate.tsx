"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { MobileDemoSheet } from "./mobile-demo-sheet";

/**
 * 랜딩 인터랙티브 데모 게이트.
 * - 뷰포트 근접(IntersectionObserver, rootMargin 600px) 전에는 children(무거운
 *   dynamic 아일랜드)을 마운트하지 않는다 → 청크가 접근 시에만 로드된다.
 * - minWidth="lg"면 뷰포트가 1024px 이상일 때만 데모를 켠다. 그 미만(모바일)은
 *   fallback(기존 목업)을 그대로 렌더 — 모바일 랜딩은 데모 청크를 아예 받지 않는다.
 *
 * SSR/첫 페인트는 항상 fallback → 하이드레이션 불일치 없음(데모는 클라 전용).
 */
export function DemoGate({
  children,
  fallback,
  minWidth = "lg",
  className,
  mobileDemo,
  mobileLabel = "라이브 데모 체험하기",
}: {
  children: ReactNode;
  /** 데모 비활성(모바일/접근 전) 동안 보여줄 기존 목업 또는 스켈레톤. */
  fallback: ReactNode;
  /** "lg" = 1024px 이상에서만 데모. null 이면 폭 무관(근접 게이트만). */
  minWidth?: "lg" | null;
  /** 래퍼 div 클래스 — 그리드 자식으로 쓸 때 min-w-0/order 등을 건다. */
  className?: string;
  /**
   * 모바일(<lg) 풀스크린 시트에서 렌더할 데모. 있으면 목업 아래에 "체험하기"
   * 버튼(lg:hidden)이 붙고, 탭하면 시트가 열리며 이 노드가 마운트된다(그때 청크
   * 로드). 생략하면 모바일은 목업만(현재 동작). PC 경로에는 전혀 관여하지 않는다.
   */
  mobileDemo?: ReactNode;
  /** 모바일 체험 버튼 문구. */
  mobileLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [wide, setWide] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (minWidth === null) {
      setWide(true);
      return;
    }
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [minWidth]);

  useEffect(() => {
    // 데모를 켤 수 없는 상태(좁은 화면)면 관찰도 하지 않는다.
    if (!wide || near) return;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [wide, near]);

  // PC(≥lg): 기존 경로 그대로 — 근접 시 데모, 아니면 목업.
  if (wide) {
    return (
      <div ref={hostRef} className={className}>
        {near ? children : fallback}
      </div>
    );
  }

  // 모바일(<lg): 목업 + (mobileDemo 있으면) 체험 버튼·풀스크린 시트.
  return (
    <div ref={hostRef} className={className}>
      {fallback}
      {mobileDemo ? (
        <>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="relative z-10 mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[14px] font-black text-white shadow-[0_10px_30px_-10px_rgba(37,99,235,0.6)] transition active:scale-[0.99] lg:hidden"
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {mobileLabel}
          </button>
          <MobileDemoSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
            {mobileDemo}
          </MobileDemoSheet>
        </>
      ) : null}
    </div>
  );
}
