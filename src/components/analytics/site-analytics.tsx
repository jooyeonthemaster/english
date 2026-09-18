"use client";

// ============================================================================
// 1st-party 유입 분석 트래커 마운트 — 루트 레이아웃 1회.
// usePathname 만 쓴다(useSearchParams 는 정적 페이지를 CSR 로 강등시킨다).
// 계약: docs/analytics/analytics-spec.md §3.1
// ============================================================================

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getTracker } from "@/lib/analytics/client";
import { whenTitleReady } from "./title-ready";

export function SiteAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    getTracker().start();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    // Next 는 경로 전환과 같은 틱에 metadata 를 커밋하지 않는다 — 제목이 채워진 뒤 기록한다(U8-2).
    // setTimeout(…, 0) 한 틱으로는 document.title 이 "" 인 채로 저장됐다.
    return whenTitleReady(() => getTracker().pageview(pathname));
  }, [pathname]);

  return null;
}
