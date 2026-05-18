import { prisma } from "@/lib/prisma";
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
    },
  });
  if (!job) return;
  if (job.status !== "PROCESSING") return;
  if (job.pendingPages > 0) return;

  await extractionFinalizeTask.trigger(
    { jobId },
    {
      idempotencyKey: `finalize:${jobId}:${job.successPages}:${job.failedPages}`,
    },
  );
}
