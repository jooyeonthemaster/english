import { Suspense } from "react";
import type { Metadata } from "next";
import { AnalyticsNav } from "@/components/admin/analytics/shared/analytics-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "유입 분석",
};

export default function AdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">유입 분석</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          전 방문자(비로그인 포함)의 유입 경로·페이지·시간대·전환을 스모트 자체 수집기로 집계합니다 · 시간 기준 KST
        </p>
      </div>
      <Suspense fallback={<div className="h-10" />}>
        <AnalyticsNav />
      </Suspense>
      {children}
    </div>
  );
}
