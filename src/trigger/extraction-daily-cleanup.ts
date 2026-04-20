// ============================================================================
// extraction-daily-cleanup — runs once a day, removes old assets.
//
// Retention windows:
//   - Source PDF:            7 days  (ORIGINAL_PDF_RETENTION_DAYS)
//   - Per-page JPGs:        30 days  (PAGE_IMAGE_RETENTION_DAYS)
//   - extractedText text:   90 days  (EXTRACTED_TEXT_RETENTION_DAYS)
//
// We never delete ExtractionJob rows — they remain for audit/metrics — but
// we null out URL fields once the underlying file is gone.
// ============================================================================

import { schedules, logger } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { removeJobAssets } from "@/lib/supabase-storage";
import {
  EXTRACTED_TEXT_RETENTION_DAYS,
  ORIGINAL_PDF_RETENTION_DAYS,
  PAGE_IMAGE_RETENTION_DAYS,
} from "@/lib/extraction/constants";

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export const extractionDailyCleanupTask = schedules.task({
  id: "extraction-daily-cleanup",
  cron: "0 18 * * *", // 18:00 UTC = 03:00 KST
  async run() {
    const pdfCutoff = daysAgo(ORIGINAL_PDF_RETENTION_DAYS);
    const imageCutoff = daysAgo(PAGE_IMAGE_RETENTION_DAYS);
    const textCutoff = daysAgo(EXTRACTED_TEXT_RETENTION_DAYS);

    // 1. Blow away Storage assets for jobs past the image retention window.
    const oldJobs = await prisma.extractionJob.findMany({
      where: {
        completedAt: { lt: imageCutoff, not: null },
        status: { in: ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] },
      },
      select: { id: true, academyId: true },
      take: 200,
    });

    let removed = 0;
    for (const job of oldJobs) {
      try {
        await removeJobAssets(job.academyId, job.id);
        removed++;
      } catch (e) {
        logger.warn("cleanup remove failed", {
          jobId: job.id,
          err: (e as Error).message,
        });
      }
    }

    // 2. Null out originalFileUrl past the PDF window (PDF blob is gone).
    const pdfCleared = await prisma.extractionJob.updateMany({
      where: {
        originalFileUrl: { not: null },
        completedAt: { lt: pdfCutoff, not: null },
      },
      data: { originalFileUrl: null },
    });

    // 3. Clear extractedText past the text retention window, but keep the
    //    row (for analytics / token-usage queries).
    const textCleared = await prisma.extractionPage.updateMany({
      where: {
        extractedText: { not: null },
        completedAt: { lt: textCutoff, not: null },
      },
      data: { extractedText: null },
    });

    logger.info("daily cleanup", {
      storageRemoved: removed,
      pdfUrlCleared: pdfCleared.count,
      textCleared: textCleared.count,
    });

    return {
      storageRemoved: removed,
      pdfUrlCleared: pdfCleared.count,
      textCleared: textCleared.count,
    };
  },
});
