// ============================================================================
// extraction-reaper — every 5 minutes, clean up stuck state.
//
// Three safety nets:
//   (1) Expired PROCESSING leases → reset to PENDING so other workers can
//       take over. This handles worker crashes / timeouts.
//   (2) PENDING pages belonging to a PROCESSING job → re-dispatch with the
//       same idempotencyKey (no double-charge because creditTxId is reused).
//   (3) PROCESSING jobs whose every page is terminal → fire finalize.
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

    // (1) Reclaim expired leases
    const reclaimed = await prisma.extractionPage.updateMany({
      where: { status: "PROCESSING", leaseExpiresAt: { lt: now } },
      data: { status: "PENDING", leaseOwner: null, leaseExpiresAt: null },
    });

    // (2) Re-dispatch PENDING pages of PROCESSING jobs
    const pending = await prisma.extractionPage.findMany({
      where: {
        status: "PENDING",
        job: { status: "PROCESSING" },
      },
      select: { jobId: true, pageIndex: true, idempotencyKey: true },
      take: 200,
    });

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
      reclaimed: reclaimed.count,
      redispatched: pending.length,
      finalised: processingJobs.length,
    });

    return {
      reclaimed: reclaimed.count,
      redispatched: pending.length,
      finalised: processingJobs.length,
    };
  },
});
