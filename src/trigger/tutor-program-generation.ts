import { logger, task } from "@trigger.dev/sdk/v3";

import {
  TUTOR_PROGRAM_GENERATION_QUEUE_CONCURRENCY,
  TUTOR_PROGRAM_GENERATION_QUEUE_NAME,
  TUTOR_PROGRAM_GENERATION_TRIGGER_MAX_ATTEMPTS,
} from "@/lib/concurrency-config";
import { prisma } from "@/lib/prisma";
import {
  runTutorProgramGenerationJob,
  TUTOR_PROGRAM_GENERATION_DOMAIN,
} from "@/lib/tutor/program-generation";

type Input = { jobId: string };

export const tutorProgramGenerationTask = task({
  id: "tutor-program-generation",
  queue: {
    name: TUTOR_PROGRAM_GENERATION_QUEUE_NAME,
    concurrencyLimit: TUTOR_PROGRAM_GENERATION_QUEUE_CONCURRENCY,
  },
  retry: {
    maxAttempts: TUTOR_PROGRAM_GENERATION_TRIGGER_MAX_ATTEMPTS,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 900,
  async run(payload: Input, { ctx }) {
    const { jobId } = payload;
    const job = await prisma.workbenchAiJob.findUnique({ where: { id: jobId } });
    if (!job || job.domain !== TUTOR_PROGRAM_GENERATION_DOMAIN) {
      return { skipped: true as const, reason: "JOB_NOT_FOUND" };
    }
    if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(job.status)) {
      return { skipped: true as const, status: job.status };
    }

    await prisma.workbenchAiJob.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        startedAt: job.startedAt ?? new Date(),
        triggerRunId: ctx.run.id,
      },
    });

    try {
      const result = await runTutorProgramGenerationJob(jobId);
      logger.info("tutor program generation completed", {
        jobId,
        programId: result.programId,
        activityCount: result.activityCount,
      });
      return {
        success: true as const,
        programId: result.programId,
        activityCount: result.activityCount,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tutor program generation failed.";
      const latest = await prisma.workbenchAiJob.findUnique({
        where: { id: jobId },
        select: { result: true },
      });
      const previousResult =
        latest?.result && typeof latest.result === "object" && !Array.isArray(latest.result)
          ? (latest.result as Record<string, unknown>)
          : {};
      const previousWarnings = Array.isArray(previousResult.warnings)
        ? previousResult.warnings.filter((warning): warning is string => typeof warning === "string")
        : [];
      const failedResult = {
        ...previousResult,
        title: job.title,
        status: "FAILED",
        totalPassages: Number(previousResult.totalPassages ?? job.requestedCount),
        completedPassages: Number(previousResult.completedPassages ?? job.successCount),
        activityCount: Number(previousResult.activityCount ?? job.resultCount),
        estimatedMin: Number(previousResult.estimatedMin ?? 0),
        lessons: Array.isArray(previousResult.lessons) ? previousResult.lessons : [],
        warnings: [...previousWarnings, message],
      };

      await prisma.workbenchAiJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failedCount: 1,
          errorMessage: message,
          result: JSON.parse(JSON.stringify(failedResult)),
          completedAt: new Date(),
        },
      });

      logger.error("tutor program generation failed", { jobId, error: message });
      throw err;
    }
  },
});
