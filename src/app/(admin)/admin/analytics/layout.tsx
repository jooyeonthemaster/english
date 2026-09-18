import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyticsNav } from "@/components/admin/analytics/shared/analytics-nav";
import { PageHeader } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "유입 분석",
};

// 규약(docs/ADMIN-UI-CONVENTION.md §2·§3): 페이지 머리는 PageHeader — 제목은 사이드바 메뉴명과
// 같게("유입 분석"), 설명은 한 줄. 직접 쓴 <h1> 은 금지이고, PageHeader 가 등록한 제목은 셸 상단
// 바 브레드크럼도 채운다. 루트 간격은 space-y-6.
export default function AdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="유입 분석"
        description="전 방문자(비로그인 포함)의 유입 경로·페이지·시간대·전환을 스모트 자체 수집기로 집계합니다 · 시간 기준 KST"
      />
      <Suspense fallback={<div className="h-10" />}>
        <AnalyticsNav />
      </Suspense>
      {children}
    </div>
  );
}
