import { prisma } from "@/lib/prisma";

const FAST_PATH_STALE_MS = 10 * 60 * 1000;
const TRIGGERLESS_STALE_MS = 15 * 60 * 1000;
const TRIGGER_BACKED_STALE_MS = 2 * 60 * 60 * 1000;

const STALE_JOB_MESSAGE =
  "Stale AI job auto-cleaned after timeout. Please run it again.";

type CleanupStaleWorkbenchAiJobsInput = {
  // Optional so a scheduled global reaper can clean every academy in one pass.
  // When omitted, the academyId filter is dropped from the WHERE clause.
  academyId?: string;
  domain?: string;
  passageId?: string;
  now?: Date;
};

export async function cleanupStaleWorkbenchAiJobs({
  academyId,
  domain,
  passageId,
  now = new Date(),
}: CleanupStaleWorkbenchAiJobsInput) {
  const baseWhere = {
    ...(academyId ? { academyId } : {}),
    deletedAt: null,
    status: { in: ["PENDING", "PROCESSING"] },
    ...(domain ? { domain } : {}),
    ...(passageId ? { passageId } : {}),
  };
  const failData = {
    status: "FAILED",
    failedCount: 1,
    errorMessage: STALE_JOB_MESSAGE,
    completedAt: now,
  };

  const fastPathCutoff = new Date(now.getTime() - FAST_PATH_STALE_MS);
  const triggerlessCutoff = new Date(now.getTime() - TRIGGERLESS_STALE_MS);
  const triggerBackedCutoff = new Date(
    now.getTime() - TRIGGER_BACKED_STALE_MS,
  );

  const [fastPath, triggerless, triggerBacked] = await prisma.$transaction([
    prisma.workbenchAiJob.updateMany({
      where: {
        ...baseWhere,
        triggerRunId: null,
        startedAt: { lt: fastPathCutoff },
        config: { path: ["fastPath"], equals: true },
      },
      data: failData,
    }),
    prisma.workbenchAiJob.updateMany({
      where: {
        ...baseWhere,
        triggerRunId: null,
        createdAt: { lt: triggerlessCutoff },
      },
      data: failData,
    }),
    prisma.workbenchAiJob.updateMany({
      where: {
        ...baseWhere,
        triggerRunId: { not: null },
        OR: [
          { startedAt: { lt: triggerBackedCutoff } },
          { startedAt: null, createdAt: { lt: triggerBackedCutoff } },
        ],
      },
      data: failData,
    }),
  ]);

  return {
    failed: fastPath.count + triggerless.count + triggerBacked.count,
    fastPath: fastPath.count,
    triggerless: triggerless.count,
    triggerBacked: triggerBacked.count,
  };
}
