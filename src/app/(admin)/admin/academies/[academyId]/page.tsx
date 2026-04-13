import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAcademyDetail } from "@/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademyDetailClient } from "@/components/admin/academy-detail-client";

interface Props {
  params: Promise<{ academyId: string }>;
}

async function AcademyDetailContent({ academyId }: { academyId: string }) {
  const data = await getAcademyDetail(academyId);
  if (!data) notFound();
  return <AcademyDetailClient data={data} />;
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[120px] rounded-xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>
      <Skeleton className="h-[400px] rounded-xl" />
    </div>
  );
}

export default async function AcademyDetailPage({ params }: Props) {
  const { academyId } = await params;

  return (
    <div className="space-y-6">
      <Suspense fallback={<DetailSkeleton />}>
        <AcademyDetailContent academyId={academyId} />
      </Suspense>
    </div>
  );
}
