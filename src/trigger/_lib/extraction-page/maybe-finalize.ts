import { prisma } from "@/lib/prisma";
import {
  academyConcurrencyKey,
  EXTRACTION_FINALIZE_QUEUE_NAME,
} from "@/lib/concurrency-config";
import { extractionFinalizeTask } from "../../extraction-finalize";

/**
 * If every page is terminal, fire the finalize task.
 * `extractionFinalizeTask` is itself idempotent — double-triggering is safe.
 */
export async function maybeTriggerFinalize(jobId: string): Promise<void> {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      pendingPages: true,
      totalPages: true,
      successPages: true,
      failedPages: true,
      academyId: true,
    },
  });
  if (!job) return;
  if (job.status !== "PROCESSING") return;
  if (job.pendingPages > 0) return;

  await extractionFinalizeTask.trigger(
    { jobId },
    {
      idempotencyKey: `finalize:${jobId}:${job.successPages}:${job.failedPages}`,
      queue: EXTRACTION_FINALIZE_QUEUE_NAME,
      concurrencyKey: academyConcurrencyKey(job.academyId),
    },
  );
}
