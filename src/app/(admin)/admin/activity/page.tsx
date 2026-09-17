import { Suspense } from "react";
import { getGlobalActivity } from "@/actions/admin-activity";
import { getActivityAnalytics } from "@/actions/admin-activity/get-activity-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, resolveTab } from "@/components/admin/kit";
import { ActivityPageTabs } from "@/components/admin/activity/activity-page-tabs";
import {
  ACTIVITY_TAB_KEYS,
  ANALYTICS_SECTION_KEYS,
  type ActivityTabKey,
  type AnalyticsSectionKey,
} from "@/components/admin/activity/activity-tabs-config";
import type { ActivityAnalyticsPayload } from "@/lib/admin-analytics-types";

export const dynamic = "force-dynamic";

async function ActivityContent({
  initialTab,
  initialSection,
}: {
  initialTab: ActivityTabKey;
  initialSection: AnalyticsSectionKey;
}) {
  // 피드는 필수, 분석은 best-effort — 집계 실패가 로그 탭을 깨뜨리지 않도록.
  const [feedResult, analytics] = await Promise.all([
    getGlobalActivity({ limit: 50 }),
    getActivityAnalytics(90).catch((err): ActivityAnalyticsPayload | null => {
      console.error("[admin/activity] analytics failed", err);
      return null;
    }),
  ]);

  const feed =
    feedResult.kind === "ok"
      ? { items: feedResult.items, nextBefore: feedResult.nextBefore }
      : { items: [], nextBefore: null };

  return (
    <ActivityPageTabs
      analytics={analytics}
      feed={feed}
      initialTab={initialTab}
      initialSection={initialSection}
    />
  );
}

type PageProps = { searchParams: Promise<{ tab?: string; section?: string }> };

export default async function AdminActivityPage({ searchParams }: PageProps) {
  // ?tab= · ?section= 은 새로고침·링크 공유 시 같은 화면이 열리도록 서버에서 읽어 넘긴다.
  const { tab, section } = await searchParams;
  const initialTab = resolveTab(tab, ACTIVITY_TAB_KEYS, "dashboard");
  const initialSection = resolveTab(section, ANALYTICS_SECTION_KEYS, "overview");

  return (
    <div className="space-y-6">
      <PageHeader
        title="활동 모니터링"
        description="학원·회원의 사용 추세를 분석하고, 전체 활동을 시간순으로 모니터링합니다."
      />

      <Suspense fallback={<Skeleton className="h-[560px] rounded-xl" />}>
        <ActivityContent initialTab={initialTab} initialSection={initialSection} />
      </Suspense>
    </div>
  );
}
