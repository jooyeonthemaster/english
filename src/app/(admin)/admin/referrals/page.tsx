import { Suspense } from "react";
import {
  getReferralOverview,
  getHeldReferrals,
  getMissionCatalog,
} from "@/actions/admin/referrals";
import { Skeleton } from "@/components/ui/skeleton";
import { ReferralManagementClient } from "@/components/admin/referral-management-client";

export const dynamic = "force-dynamic";

async function ReferralsContent() {
  const [overview, held, missions] = await Promise.all([
    getReferralOverview(),
    getHeldReferrals(),
    getMissionCatalog(),
  ]);
  return (
    <ReferralManagementClient
      overview={overview}
      held={held}
      missions={missions}
    />
  );
}

function ReferralsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 rounded-xl w-[420px]" />
      <Skeleton className="h-[480px] rounded-xl" />
    </div>
  );
}

export default function ReferralsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">추천 · 미션</h1>
          <p className="text-[13px] text-gray-400 mt-1">
            추천 보상을 심사하고, 미션 카탈로그와 전체 공지를 관리합니다
          </p>
        </div>
      </div>

      <Suspense fallback={<ReferralsSkeleton />}>
        <ReferralsContent />
      </Suspense>
    </div>
  );
}
