import type { OperationType } from "@/lib/credit-costs";
import {
  InsufficientCreditsError,
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
  return prisma.$transaction(
    async (tx) => {
      const job = await tx.workbenchAiJob.findUnique({
        where: { id: jobId },
        select: { creditTxId: true },
      });

      if (job?.creditTxId) {
        const existing = await tx.creditTransaction.findUnique({
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

      const previous = await tx.creditTransaction.findFirst({
        where: {
          academyId,
          type: "CONSUMPTION",
          operationType,
          referenceId: jobId,
          referenceType: "WORKBENCH_AI_JOB",
        },
        orderBy: { createdAt: "desc" },
      });

      if (previous) {
        await tx.workbenchAiJob.update({
          where: { id: jobId },
          data: { creditTxId: previous.id },
        });
        return {
          success: true,
          balanceAfter: previous.balanceAfter,
          transactionId: previous.id,
        };
      }

      const result = await tx.creditBalance.updateMany({
        where: {
          academyId,
          balance: { gte: creditCost },
        },
        data: {
          balance: { decrement: creditCost },
          totalConsumed: { increment: creditCost },
        },
      });

      if (result.count === 0) {
        const current = await tx.creditBalance.findUnique({
          where: { academyId },
        });
        if (!current) {
          throw new Error(`Credit balance not found for academy: ${academyId}`);
        }
        throw new InsufficientCreditsError(current.balance, creditCost);
      }

      const updated = await tx.creditBalance.findUnique({
        where: { academyId },
      });
      if (!updated) {
        throw new Error(`Credit balance not found for academy: ${academyId}`);
      }

      const transaction = await tx.creditTransaction.create({
        data: {
          academyId,
          type: "CONSUMPTION",
          amount: -creditCost,
          balanceAfter: updated.balance,
          operationType,
          staffId,
          referenceId: jobId,
          referenceType: "WORKBENCH_AI_JOB",
          metadata: JSON.stringify({ ...metadata, jobId }),
        },
      });

      await tx.workbenchAiJob.update({
        where: { id: jobId },
        data: { creditTxId: transaction.id },
      });

      return {
        success: true,
        balanceAfter: updated.balance,
        transactionId: transaction.id,
      };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
