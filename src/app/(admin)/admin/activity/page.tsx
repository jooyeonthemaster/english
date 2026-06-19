import { Suspense } from "react";
import { getGlobalActivity } from "@/actions/admin-activity";
import { getActivityAnalytics } from "@/actions/admin-activity/get-activity-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityPageTabs } from "@/components/admin/activity/activity-page-tabs";
import type { ActivityAnalyticsPayload } from "@/lib/admin-analytics-types";

export const dynamic = "force-dynamic";

async function ActivityContent() {
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

  return <ActivityPageTabs analytics={analytics} feed={feed} />;
}

export default function AdminActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-gray-900">활동 모니터링</h1>
        <p className="text-[12px] text-gray-500 mt-1">
          학원·회원의 사용 추세를 분석하고, 전체 활동을 시간순으로 모니터링합니다.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-[560px] rounded-xl" />}>
        <ActivityContent />
      </Suspense>
    </div>
  );
}
