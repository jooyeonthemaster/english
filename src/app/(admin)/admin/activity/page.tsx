import { Suspense } from "react";
import { getGlobalActivity } from "@/actions/admin-activity";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityFeedClient } from "@/components/admin/activity-feed-client";

export const dynamic = "force-dynamic";

async function FeedContent() {
  const result = await getGlobalActivity({ limit: 50 });
  const initial =
    result.kind === "ok"
      ? { items: result.items, nextBefore: result.nextBefore }
      : { items: [], nextBefore: null };

  return <ActivityFeedClient initial={initial} />;
}

export default function AdminActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[20px] font-bold text-gray-900">활동 모니터링</h1>
        <p className="text-[12px] text-gray-500 mt-1">
          전체 회원의 페이지 이동·로그인·자료 추출·AI 생성·콘텐츠 생성·내보내기
          활동을 시간순으로 모니터링합니다.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-[560px] rounded-xl" />}>
        <FeedContent />
      </Suspense>
    </div>
  );
}
