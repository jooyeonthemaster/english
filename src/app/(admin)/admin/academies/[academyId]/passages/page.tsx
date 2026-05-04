import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAcademyPassages } from "@/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPassagesClient } from "@/components/admin/admin-passages-client";

interface Props {
  params: Promise<{ academyId: string }>;
}

async function PassagesContent({ academyId }: { academyId: string }) {
  await requireAdminAuth();

  // Verify academy exists
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { id: true, name: true },
  });
  if (!academy) notFound();

  const passages = await getAcademyPassages(academyId);

  return <AdminPassagesClient passages={passages} academyId={academyId} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-10 w-full rounded-xl" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default async function AdminPassagesPage({ params }: Props) {
  const { academyId } = await params;

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <PassagesContent academyId={academyId} />
    </Suspense>
  );
}
