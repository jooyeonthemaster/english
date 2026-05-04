import { Suspense } from "react";
import { getAcademyList } from "@/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademiesClient } from "@/components/admin/academies-client";

async function AcademiesContent() {
  const academies = await getAcademyList();
  return <AcademiesClient initialAcademies={academies} />;
}

function AcademiesSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-[300px] rounded-lg" />
      <Skeleton className="h-[600px] rounded-xl" />
    </div>
  );
}

export default function AcademiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">학원 관리</h1>
        <p className="text-[13px] text-gray-400 mt-1">
          등록된 모든 학원을 모니터링하고 관리합니다
        </p>
      </div>

      <Suspense fallback={<AcademiesSkeleton />}>
        <AcademiesContent />
      </Suspense>
    </div>
  );
}
