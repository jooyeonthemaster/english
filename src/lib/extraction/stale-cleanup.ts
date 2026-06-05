import { PAGE_LEASE_DURATION_MS } from "@/lib/extraction/constants";
import { prisma } from "@/lib/prisma";

const MISSING_LEASE_GRACE_MS = PAGE_LEASE_DURATION_MS;
const MISSING_LEASE_ERROR_CODE = "WORKER_LEASE_MISSING";
const MISSING_LEASE_ERROR_MESSAGE =
  "Processing page had no worker lease and was auto-stopped. Please retry the page.";

type CleanupStaleExtractionJobsInput = {
  academyId?: string;
  jobId?: string;
  now?: Date;
  take?: number;
};

function finalStatusForJob(job: {
  totalPages: number;
  successPages: number;
}): "COMPLETED" | "PARTIAL" | "FAILED" {
  if (job.successPages === job.totalPages) return "COMPLETED";
  if (job.successPages === 0) return "FAILED";
  return "PARTIAL";
}

export async function cleanupStaleExtractionJobs({
  academyId,
  jobId,
  now = new Date(),
  take = 500,
}: CleanupStaleExtractionJobsInput = {}) {
  const staleStartedBefore = new Date(
    now.getTime() - MISSING_LEASE_GRACE_MS,
  );

  const stalePages = await prisma.extractionPage.findMany({
    where: {
      status: "PROCESSING",
      leaseOwner: null,
      leaseExpiresAt: null,
      startedAt: { lt: staleStartedBefore },
      job: {
        status: "PROCESSING",
        deletedAt: null,
        ...(academyId ? { academyId } : {}),
        ...(jobId ? { id: jobId } : {}),
      },
    },
    select: { id: true, jobId: true },
    take,
  });

  const affectedJobIds = new Set<string>();
  let terminalizedPages = 0;

  for (const page of stalePages) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.extractionPage.updateMany({
        where: {
          id: page.id,
          status: "PROCESSING",
          leaseOwner: null,
          leaseExpiresAt: null,
        },
        data: {
          status: "DEAD",
          errorCode: MISSING_LEASE_ERROR_CODE,
          errorMessage: MISSING_LEASE_ERROR_MESSAGE,
          completedAt: now,
        },
      });
      if (updated.count === 0) return;

      const job = await tx.extractionJob.findUnique({
        where: { id: page.jobId },
        select: { pendingPages: true },
      });

      await tx.extractionJob.update({
        where: { id: page.jobId },
        data: {
          pendingPages: Math.max(0, (job?.pendingPages ?? 0) - 1),
          failedPages: { increment: 1 },
        },
      });

      affectedJobIds.add(page.jobId);
      terminalizedPages += 1;
    });
  }

  if (affectedJobIds.size === 0) {
    return { terminalizedPages: 0, finalizedJobs: 0 };
  }

  const jobsReadyToFinalize = await prisma.extractionJob.findMany({
    where: {
      id: { in: [...affectedJobIds] },
      status: "PROCESSING",
      pendingPages: 0,
      successPages: 0,
    },
    select: {
      id: true,
      totalPages: true,
      successPages: true,
      failedPages: true,
      errorSummary: true,
    },
  });

  let finalizedJobs = 0;
  for (const job of jobsReadyToFinalize) {
    await prisma.extractionJob.update({
      where: { id: job.id },
      data: {
        status: finalStatusForJob(job),
        completedAt: now,
        errorSummary: JSON.stringify({
          staleCleanup: true,
          code: MISSING_LEASE_ERROR_CODE,
          message: MISSING_LEASE_ERROR_MESSAGE,
          previousErrorSummary: job.errorSummary ?? null,
          successPages: job.successPages,
          failedPages: job.failedPages,
        }),
      },
    });
    finalizedJobs += 1;
  }

  return { terminalizedPages, finalizedJobs };
}
