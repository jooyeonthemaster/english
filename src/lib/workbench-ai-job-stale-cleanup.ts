import type { Prisma } from "@prisma/client";

import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { refundCredits } from "@/lib/credits";
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

type StaleJobForRefund = {
  id: string;
  academyId: string;
  creditTxId: string | null;
};

function isOperationType(value: unknown): value is OperationType {
  return typeof value === "string" && value in CREDIT_COSTS;
}

async function refundStaleJobCharge(job: StaleJobForRefund): Promise<boolean> {
  if (!job.creditTxId) return false;

  const original = await prisma.creditTransaction.findUnique({
    where: { id: job.creditTxId },
    select: {
      academyId: true,
      type: true,
      operationType: true,
    },
  });
  if (
    !original ||
    original.academyId !== job.academyId ||
    original.type !== "CONSUMPTION" ||
    !isOperationType(original.operationType)
  ) {
    throw new Error(`Invalid stale job credit transaction: ${job.creditTxId}`);
  }

  const refundedAmount = await refundCredits(
    job.academyId,
    original.operationType,
    job.creditTxId,
    STALE_JOB_MESSAGE,
  );
  return refundedAmount > 0;
}

async function failStaleJobsWithRefund({
  where,
  data,
}: {
  where: Prisma.WorkbenchAiJobWhereInput;
  data: Prisma.WorkbenchAiJobUpdateManyMutationInput;
}) {
  const jobs = await prisma.workbenchAiJob.findMany({
    where,
    select: {
      id: true,
      academyId: true,
      creditTxId: true,
    },
  });

  let failed = 0;
  let refunded = 0;
  let refundFailed = 0;

  for (const job of jobs) {
    const updated = await prisma.workbenchAiJob.updateMany({
      where: {
        ...where,
        id: job.id,
      },
      data,
    });
    if (updated.count === 0) continue;
    failed += 1;

    try {
      if (await refundStaleJobCharge(job)) {
        refunded += 1;
      }
    } catch (error) {
      refundFailed += 1;
      console.error("[workbench-ai-job-stale-cleanup] refund failed", {
        jobId: job.id,
        creditTxId: job.creditTxId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { failed, refunded, refundFailed };
}

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

  const fastPath = await failStaleJobsWithRefund({
    where: {
      ...baseWhere,
      triggerRunId: null,
      startedAt: { lt: fastPathCutoff },
      config: { path: ["fastPath"], equals: true },
    },
    data: failData,
  });
  const triggerless = await failStaleJobsWithRefund({
    where: {
      ...baseWhere,
      triggerRunId: null,
      createdAt: { lt: triggerlessCutoff },
    },
    data: failData,
  });
  const triggerBacked = await failStaleJobsWithRefund({
    where: {
      ...baseWhere,
      triggerRunId: { not: null },
      OR: [
        { startedAt: { lt: triggerBackedCutoff } },
        { startedAt: null, createdAt: { lt: triggerBackedCutoff } },
      ],
    },
    data: failData,
  });

  return {
    failed: fastPath.failed + triggerless.failed + triggerBacked.failed,
    fastPath: fastPath.failed,
    triggerless: triggerless.failed,
    triggerBacked: triggerBacked.failed,
    refunded: fastPath.refunded + triggerless.refunded + triggerBacked.refunded,
    refundFailed:
      fastPath.refundFailed +
      triggerless.refundFailed +
      triggerBacked.refundFailed,
  };
}
