import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAcademyExams } from "@/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminExamsClient } from "@/components/admin/admin-exams-client";

interface Props {
  params: Promise<{ academyId: string }>;
}

async function ExamsContent({ academyId }: { academyId: string }) {
  await requireAdminAuth();

  // Verify academy exists
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { id: true, name: true },
  });
  if (!academy) notFound();

  const exams = await getAcademyExams(academyId);

  return <AdminExamsClient exams={exams} academyId={academyId} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function AdminExamsPage({ params }: Props) {
  const { academyId } = await params;

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ExamsContent academyId={academyId} />
    </Suspense>
  );
}
