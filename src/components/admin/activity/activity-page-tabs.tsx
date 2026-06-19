"use client";

// /admin/activity 탭 — "분석 대시보드"(신규) + "활동 로그"(기존 피드 보존).
// 분석 페이로드가 없으면(집계 실패) 로그 탭은 그대로 동작 → 무회귀.

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, ListTree } from "lucide-react";
import { AnalyticsDashboard } from "./analytics/analytics-dashboard";
import { ActivityFeedClient } from "@/components/admin/activity-feed-client";
import type { ActivityAnalyticsPayload } from "@/lib/admin-analytics-types";
import type { ActivityItem } from "@/lib/admin-activity-types";

interface ActivityPageTabsProps {
  analytics: ActivityAnalyticsPayload | null;
  feed: { items: ActivityItem[]; nextBefore: string | null };
}

export function ActivityPageTabs({ analytics, feed }: ActivityPageTabsProps) {
  return (
    <Tabs defaultValue="dashboard" className="gap-4">
      <TabsList className="bg-gray-100">
        <TabsTrigger value="dashboard" className="text-[13px] px-3">
          <BarChart3 className="size-3.5" strokeWidth={2} aria-hidden />
          분석 대시보드
        </TabsTrigger>
        <TabsTrigger value="log" className="text-[13px] px-3">
          <ListTree className="size-3.5" strokeWidth={2} aria-hidden />
          활동 로그
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard">
        {analytics ? (
          <AnalyticsDashboard initial={analytics} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 py-16 text-center text-[13px] text-gray-400">
            분석 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </div>
        )}
      </TabsContent>

      <TabsContent value="log">
        <ActivityFeedClient initial={feed} />
      </TabsContent>
    </Tabs>
  );
}
