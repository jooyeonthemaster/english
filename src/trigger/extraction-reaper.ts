// ============================================================================
// extraction-reaper — every 5 minutes, clean up stuck state.
//
// Three safety nets:
//   (1) Expired PROCESSING leases with retry budget left → reset to PENDING
//       so another worker can take over.
//   (2) Expired/PENDING pages with no retry budget left → DEAD, so a stuck
//       external call cannot spin forever.
//   (3) PENDING pages belonging to a PROCESSING job → re-dispatch with the
//       same idempotencyKey (no double-charge because creditTxId is reused).
//   (4) PROCESSING jobs whose every page is terminal → fire finalize.
//
// Everything is idempotent — running this twice in quick succession is safe.
// ============================================================================

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { extractionPageTask } from "./extraction-page";
import { extractionFinalizeTask } from "./extraction-finalize";

export const extractionReaperTask = schedules.task({
  id: "extraction-reaper",
  cron: "*/5 * * * *",
  async run() {
    const now = new Date();

    const expiredProcessing = await prisma.extractionPage.findMany({
      where: { status: "PROCESSING", leaseExpiresAt: { lt: now } },
      select: {
        id: true,
        jobId: true,
        pageIndex: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
      },
      take: 500,
    });
    const pendingOverBudget = await prisma.extractionPage.findMany({
      where: {
        status: "PENDING",
        job: { status: "PROCESSING" },
      },
      select: {
        id: true,
        jobId: true,
        pageIndex: true,
        status: true,
        attemptCount: true,
        maxAttempts: true,
      },
      take: 500,
    });

    const exhausted = [
      ...expiredProcessing.filter((p) => p.attemptCount >= p.maxAttempts),
      ...pendingOverBudget.filter((p) => p.attemptCount >= p.maxAttempts),
    ];
    const reclaimableIds = expiredProcessing
      .filter((p) => p.attemptCount < p.maxAttempts)
      .map((p) => p.id);

    // (1) Reclaim expired leases only while retry budget remains.
    const reclaimed = await prisma.extractionPage.updateMany({
      where: { id: { in: reclaimableIds }, status: "PROCESSING" },
      data: { status: "PENDING", leaseOwner: null, leaseExpiresAt: null },
    });

    // (2) Terminalize pages that already exhausted their retry budget.
    let exhaustedCount = 0;
    for (const page of exhausted) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.extractionPage.updateMany({
          where: {
            id: page.id,
            status: page.status,
          },
          data: {
            status: "DEAD",
            errorCode: "WORKER_ATTEMPTS_EXHAUSTED",
            errorMessage:
              "워커가 여러 번 멈춰 자동 재시도를 중단했습니다. 수동 재시도를 눌러 다시 시도해 주세요.",
            completedAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
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
        exhaustedCount += 1;
      });
    }

    // (3) Re-dispatch PENDING pages of PROCESSING jobs, but only if they
    // still have retry budget left.
    const pendingCandidates = await prisma.extractionPage.findMany({
      where: {
        status: "PENDING",
        job: { status: "PROCESSING" },
      },
      select: {
        jobId: true,
        pageIndex: true,
        idempotencyKey: true,
        attemptCount: true,
        maxAttempts: true,
      },
      take: 500,
    });
    const pending = pendingCandidates
      .filter((p) => p.attemptCount < p.maxAttempts)
      .slice(0, 200);

    for (const p of pending) {
      await extractionPageTask.trigger(
        { jobId: p.jobId, pageIndex: p.pageIndex },
        { idempotencyKey: p.idempotencyKey },
      );
    }

    // (3) Finalize PROCESSING jobs whose pages are all terminal
    const processingJobs = await prisma.extractionJob.findMany({
      where: { status: "PROCESSING", pendingPages: 0 },
      select: { id: true, successPages: true, failedPages: true },
      take: 50,
    });
    for (const job of processingJobs) {
      await extractionFinalizeTask.trigger(
        { jobId: job.id },
        {
          idempotencyKey: `finalize:${job.id}:${job.successPages}:${job.failedPages}`,
        },
      );
    }

    logger.info("reaper pass", {
      exhausted: exhaustedCount,
      reclaimed: reclaimed.count,
      redispatched: pending.length,
      finalised: processingJobs.length,
    });

    return {
      exhausted: exhaustedCount,
      reclaimed: reclaimed.count,
      redispatched: pending.length,
      finalised: processingJobs.length,
    };
  },
});
