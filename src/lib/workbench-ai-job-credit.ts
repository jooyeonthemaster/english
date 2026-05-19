import type { OperationType } from "@/lib/credit-costs";
import {
  deductCredits,
  type DeductResult,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";

export async function ensureWorkbenchAiJobCharged({
  jobId,
  academyId,
  staffId,
  operationType,
  metadata,
  creditCost,
}: {
  jobId: string;
  academyId: string;
  staffId: string;
  operationType: OperationType;
  metadata: Record<string, unknown>;
  creditCost: number;
}): Promise<DeductResult> {
  const job = await prisma.workbenchAiJob.findUnique({
    where: { id: jobId },
    select: { creditTxId: true },
  });

  if (job?.creditTxId) {
    const existing = await prisma.creditTransaction.findUnique({
      where: { id: job.creditTxId },
    });
    if (existing) {
      return {
        success: true,
        balanceAfter: existing.balanceAfter,
        transactionId: existing.id,
      };
    }
  }

  const metadataNeedle = `"jobId":"${jobId}"`;
  const previous = await prisma.creditTransaction.findFirst({
    where: {
      academyId,
      type: "CONSUMPTION",
      operationType,
      metadata: { contains: metadataNeedle },
    },
    orderBy: { createdAt: "desc" },
  });

  if (previous) {
    await prisma.workbenchAiJob.update({
      where: { id: jobId },
      data: { creditTxId: previous.id },
    });
    return {
      success: true,
      balanceAfter: previous.balanceAfter,
      transactionId: previous.id,
    };
  }

  const result = await deductCredits(
    academyId,
    operationType,
    staffId,
    { ...metadata, jobId },
    creditCost,
  );

  await prisma.workbenchAiJob.update({
    where: { id: jobId },
    data: { creditTxId: result.transactionId },
  });

  return result;
}
