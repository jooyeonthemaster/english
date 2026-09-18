"use client";

// /admin/activity 탭 — "분석 대시보드" + "활동 로그"(기존 피드 보존).
// 탭·분석 구역은 ?tab= · ?section= 에 보존한다(useUrlTab). 분석 페이로드가 없으면(집계 실패)
// 로그 탭은 그대로 동작 → 무회귀.

import { AdminEmptyState, AdminTabs, useUrlTab } from "@/components/admin/kit";
import { ActivityFeedClient } from "@/components/admin/activity-feed-client";
import type { ActivityAnalyticsPayload } from "@/lib/admin-analytics-types";
import type { ActivityItem } from "@/lib/admin-activity-types";
import {
  ACTIVITY_TABS,
  type ActivityTabKey,
  type AnalyticsSectionKey,
} from "./activity-tabs-config";
import { AnalyticsDashboard } from "./analytics/analytics-dashboard";

interface ActivityPageTabsProps {
  analytics: ActivityAnalyticsPayload | null;
  feed: { items: ActivityItem[]; nextBefore: string | null };
  initialTab: ActivityTabKey;
  initialSection: AnalyticsSectionKey;
}

export function ActivityPageTabs({
  analytics,
  feed,
  initialTab,
  initialSection,
}: ActivityPageTabsProps) {
  const [tab, setTab] = useUrlTab<ActivityTabKey>("tab", initialTab, {
    defaultKey: "dashboard",
  });
  // 분석 구역 상태는 탭을 오가도 유지되도록 여기서 들고 있는다.
  const [section, setSection] = useUrlTab<AnalyticsSectionKey>("section", initialSection, {
    defaultKey: "overview",
  });

  return (
    <div className="space-y-4">
      <AdminTabs tabs={ACTIVITY_TABS} value={tab} onChange={setTab} ariaLabel="활동 모니터링 화면" />

      {tab === "dashboard" &&
        (analytics ? (
          <AnalyticsDashboard
            initial={analytics}
            section={section}
            onSectionChange={setSection}
          />
        ) : (
          <div className="rounded-xl border border-gray-100 bg-white">
            <AdminEmptyState
              title="분석 데이터를 불러오지 못했습니다"
              description="잠시 후 다시 시도해 주세요."
            />
          </div>
        ))}

      {tab === "log" && <ActivityFeedClient initial={feed} />}
    </div>
  );
}
