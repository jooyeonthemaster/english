import { Suspense } from "react";
import { getPlans } from "@/actions/admin";
import { AdminPlansClient } from "@/components/admin/plans-admin-client";
import { Skeleton } from "@/components/ui/skeleton";

async function PlansContent() {
  const plans = await getPlans({ includeInactive: true });
  const serializedPlans = plans.map((plan) => ({
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }));

  return <AdminPlansClient initialPlans={serializedPlans} />;
}

function PlansSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-[360px] rounded-xl" />
      <Skeleton className="h-[360px] rounded-xl" />
    </div>
  );
}

export default function AdminPlansPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">요금제 관리</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          구독 요금제와 프로모션 표시 정보를 관리합니다
        </p>
      </div>

      <Suspense fallback={<PlansSkeleton />}>
        <PlansContent />
      </Suspense>
    </div>
  );
}
