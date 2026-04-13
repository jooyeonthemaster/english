import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getAcademyQuestions } from "@/actions/admin";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminQuestionsClient } from "@/components/admin/admin-questions-client";

interface Props {
  params: Promise<{ academyId: string }>;
}

async function QuestionsContent({ academyId }: { academyId: string }) {
  await requireAdminAuth();

  // Verify academy exists
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { id: true, name: true },
  });
  if (!academy) notFound();

  const questions = await getAcademyQuestions(academyId);

  return <AdminQuestionsClient questions={questions} academyId={academyId} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function AdminQuestionsPage({ params }: Props) {
  const { academyId } = await params;

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <QuestionsContent academyId={academyId} />
    </Suspense>
  );
}
