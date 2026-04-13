import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAcademyPassageDetail } from "@/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPassageDetail } from "@/components/admin/admin-passage-detail";

interface Props {
  params: Promise<{ academyId: string; passageId: string }>;
}

async function PassageDetailContent({
  academyId,
  passageId,
}: {
  academyId: string;
  passageId: string;
}) {
  const passage = await getAcademyPassageDetail(academyId, passageId);
  if (!passage) notFound();

  return <AdminPassageDetail passage={passage} academyId={academyId} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

export default async function AdminPassageDetailPage({ params }: Props) {
  const { academyId, passageId } = await params;

  return (
    <div className="p-6 bg-[#F4F6F9] min-h-[calc(100vh-64px)]">
      <Suspense fallback={<LoadingSkeleton />}>
        <PassageDetailContent academyId={academyId} passageId={passageId} />
      </Suspense>
    </div>
  );
}
