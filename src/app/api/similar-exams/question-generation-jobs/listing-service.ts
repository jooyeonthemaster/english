import { prisma } from "@/lib/prisma";

interface ListQuestionGenerationJobsArgs {
  academyId: string;
  limitParam: string | null;
}

function normalizeLimit(raw: string | null): number {
  const limitParam = Number(raw);
  return Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 30) : 12;
}

export async function listQuestionGenerationJobs({
  academyId,
  limitParam,
}: ListQuestionGenerationJobsArgs) {
  return prisma.similarQuestionGenerationJob.findMany({
    where: { academyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: normalizeLimit(limitParam),
    select: {
      id: true,
      status: true,
      referenceCount: true,
      passageCount: true,
      totalCount: true,
      savedCount: true,
      skippedCount: true,
      skipSummary: true,
      errorMessage: true,
      gradeInfo: true,
      createdAt: true,
      completedAt: true,
    },
  });
}
