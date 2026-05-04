import { Suspense } from "react";
import { getRegistrations, getPlans } from "@/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { RegistrationsClient } from "@/components/admin/registrations-client";

async function RegistrationsContent() {
  const [registrations, plans] = await Promise.all([
    getRegistrations(),
    getPlans(),
  ]);

  return (
    <RegistrationsClient
      initialRegistrations={registrations}
      plans={plans}
    />
  );
}

function RegistrationsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-[400px] rounded-lg" />
      <Skeleton className="h-[500px] rounded-xl" />
    </div>
  );
}

export default function RegistrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">가입 신청</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          학원 가입 신청을 검토하고 관리합니다
        </p>
      </div>

      <Suspense fallback={<RegistrationsSkeleton />}>
        <RegistrationsContent />
      </Suspense>
    </div>
  );
}
