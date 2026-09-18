import { Suspense } from "react";
import {
  getReferralOverview,
  getHeldReferrals,
  getMissionCatalog,
} from "@/actions/admin/referrals";
import { AdminPageSkeleton, PageHeader, resolveTab } from "@/components/admin/kit";
import { ReferralManagementClient } from "@/components/admin/referral-management-client";
import {
  DEFAULT_REFERRAL_TAB,
  REFERRAL_TAB_KEYS,
  type ReferralTabKey,
} from "@/components/admin/referral-management-client-parts/tabs";

export const dynamic = "force-dynamic";

async function ReferralsContent({ initialTab }: { initialTab: ReferralTabKey }) {
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
      initialTab={initialTab}
    />
  );
}

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = resolveTab(tab, REFERRAL_TAB_KEYS, DEFAULT_REFERRAL_TAB);

  return (
    <div className="space-y-6">
      <PageHeader
        title="추천·미션"
        description="추천 보상을 심사하고, 미션 카탈로그와 전체 공지를 관리합니다"
      />
      <Suspense fallback={<AdminPageSkeleton stats={6} rows={8} />}>
        <ReferralsContent initialTab={initialTab} />
      </Suspense>
    </div>
  );
}
