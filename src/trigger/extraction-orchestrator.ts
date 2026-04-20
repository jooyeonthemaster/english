// ============================================================================
// extraction-orchestrator — dispatches per-page tasks for a job.
//
// Responsibility:
//   - Transition job from PENDING → PROCESSING, record orchestrator run id.
//   - batchTrigger one extraction-page task per page, passing the page's
//     idempotencyKey so Trigger.dev dedupes dispatch-level retries.
//   - Return immediately. Finalization happens via extraction-page's
//     "last page" hook OR the reaper (safety net).
//
// This task does NOT await page completion. Pages run in parallel under the
// "gemini-calls" queue's concurrency ceiling, and the job progresses through
// many short DB writes rather than one long-lived orchestrator run.
//
// (P1-1) `mode` is forwarded inside the per-page payload so the page worker
// can skip the job→page SELECT join when it already has everything it needs.
// academyId / createdById are not forwarded (needed only on credit deduction
// and error refund — both low-frequency paths relative to mode reads).
// ============================================================================

import { task, logger } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import { ORCHESTRATOR_CONCURRENCY_LIMIT } from "@/lib/extraction/constants";
import type { ExtractionMode } from "@/lib/extraction/types";
import { extractionPageTask } from "./extraction-page";

type Input = { jobId: string };

export const extractionOrchestratorTask = task({
  id: "extraction-orchestrator",
  queue: {
    name: "extraction-orchestrator",
    concurrencyLimit: ORCHESTRATOR_CONCURRENCY_LIMIT,
  },
  async run(payload: Input, { ctx }) {
    const { jobId } = payload;

    const job = await prisma.extractionJob.findUnique({
      where: { id: jobId },
      include: { pages: { orderBy: { pageIndex: "asc" } } },
    });
    if (!job) throw new Error(`orchestrator: job not found ${jobId}`);

    if (job.status !== "PENDING") {
      logger.info("orchestrator skipped — job not in PENDING state", {
        jobId,
        status: job.status,
      });
      return { skipped: true as const, status: job.status };
    }

    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        triggerRunId: ctx.run.id,
      },
    });

    const mode = (job.mode as ExtractionMode) ?? "PASSAGE_ONLY";

    const items = job.pages.map((p) => ({
      payload: { jobId, pageIndex: p.pageIndex, mode },
      options: { idempotencyKey: p.idempotencyKey },
    }));

    await extractionPageTask.batchTrigger(items);

    logger.info("orchestrator dispatched", {
      jobId,
      mode,
      pageCount: items.length,
    });

    return { dispatched: items.length, jobId };
  },
});
