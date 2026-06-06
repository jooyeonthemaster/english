// ============================================================================
// extraction-finalize — terminal state aggregation + segmentation.
//
// Triggered by extraction-page after the last page reaches a terminal state,
// and also by the reaper (safety net) if page-level triggering missed.
// Fully idempotent — checks job.status before mutating.
//
// Mode-aware behaviour:
//   - M1 PASSAGE_ONLY : structured page OCR + passage-centric grouping. If the
//                       model fails to emit any PASSAGE_BODY blocks, finalize
//                       falls back to the legacy regex segmenter over the
//                       per-page OCR text so the review UI is never blank.
//   - M2 QUESTION_SET : ExtractionItem rows are already persisted by the page
//                       worker. finalize assigns groupId / parentItemId /
//                       global order, creates a SourceMaterial record, and
//                       emits one ExtractionResult per clustered passage for
//                       the legacy review UI.
//   - M4 FULL_EXAM    : Same as M2 plus: SourceMaterial uses EXAM_META blocks
//                       as primary signal, content hash spans every passage.
//   - M3 EXPLANATION  : Uses the legacy plain-text segmenter for now.
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import {
  EXTRACTION_FINALIZE_MAX_ATTEMPTS,
  EXTRACTION_FINALIZE_QUEUE_CONCURRENCY,
  EXTRACTION_FINALIZE_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { usesStructuredExtraction } from "@/lib/extraction/modes";
import type { ExtractionMode } from "@/lib/extraction/types";
import { prisma } from "@/lib/prisma";
import { finalizePlainText } from "./_lib/extraction-finalize/plain-text";
import { finalizeStructured } from "./_lib/extraction-finalize/structured/orchestrator";
import { TERMINAL, type JobStatus } from "./_lib/extraction-finalize/types";

type Input = { jobId: string };

export const extractionFinalizeTask = task({
  id: "extraction-finalize",
  queue: {
    name: EXTRACTION_FINALIZE_QUEUE_NAME,
    concurrencyLimit: EXTRACTION_FINALIZE_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: EXTRACTION_FINALIZE_MAX_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
    factor: 2,
    randomize: true,
  },
  async run(payload: Input) {
    const { jobId } = payload;

    const job = await prisma.extractionJob.findUnique({
      where: { id: jobId },
      include: {
        pages: { orderBy: { pageIndex: "asc" } },
        items: { orderBy: { order: "asc" } },
      },
    });
    if (!job) throw new Error(`job not found: ${jobId}`);

    if (TERMINAL.includes(job.status as JobStatus)) {
      logger.info("finalize skipped — already terminal", {
        jobId,
        status: job.status,
      });
      return { skipped: true as const, status: job.status };
    }

    const pagesTerminal = job.pages.every(
      (p) =>
        p.status === "SUCCESS" || p.status === "DEAD" || p.status === "SKIPPED",
    );
    if (!pagesTerminal || job.pages.length !== job.totalPages) {
      logger.info("finalize skipped — pages not all terminal", {
        jobId,
        pagesInDb: job.pages.length,
        expected: job.totalPages,
      });
      return { skipped: true as const };
    }

    const mode = (job.mode as ExtractionMode) ?? "PASSAGE_ONLY";
    const isStructured = usesStructuredExtraction(mode);

    // Compute status
    let finalStatus: "COMPLETED" | "PARTIAL" | "FAILED";
    if (job.successPages === job.totalPages) finalStatus = "COMPLETED";
    else if (job.successPages === 0) finalStatus = "FAILED";
    else finalStatus = "PARTIAL";

    let draftCount = 0;
    let sourceMaterialId: string | null = null;

    if (isStructured) {
      const result = await finalizeStructured({
        jobId,
        items: job.items,
        pages: job.pages,
        mode,
        outputMode: job.outputMode, // P7-D2: verbatim이면 자동복원 스킵
        slotAuthored: job.sourceType === "IMAGES", // 크롭-네이티브(이미지)면 1슬롯=1지문
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    } else {
      const result = await finalizePlainText({
        jobId,
        pages: job.pages,
        mode,
        originalFileName: job.originalFileName,
        academyId: job.academyId,
        createdById: job.createdById,
        finalStatus,
      });
      draftCount = result.draftCount;
      sourceMaterialId = result.sourceMaterialId;
    }

    logger.info("finalize done", {
      jobId,
      mode,
      status: finalStatus,
      successPages: job.successPages,
      failedPages: job.failedPages,
      draftCount,
      sourceMaterialId,
    });

    return {
      status: finalStatus,
      draftCount,
      sourceMaterialId,
      successPages: job.successPages,
      failedPages: job.failedPages,
    };
  },
});
