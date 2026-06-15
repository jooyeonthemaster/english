import { CREDIT_COSTS } from "@/lib/credit-costs";
import {
  deductCredits,
  refundCredits,
  InsufficientCreditsError,
} from "@/lib/credits";
import { prisma } from "@/lib/prisma";

export { InsufficientCreditsError };

type CreditMetadata = Record<string, unknown>;

export const RESTORATION_CREDIT_COST = CREDIT_COSTS.PASSAGE_RESTORATION;

async function findExistingRestorationCharge(params: {
  academyId: string;
  idempotencyKey: string;
}): Promise<string | null> {
  const priorCharges = await prisma.creditTransaction.findMany({
    where: {
      academyId: params.academyId,
      type: "CONSUMPTION",
      operationType: "PASSAGE_RESTORATION",
      metadata: { contains: `"idempotencyKey":"${params.idempotencyKey}"` },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (priorCharges.length === 0) return null;

  const refunded = await prisma.creditTransaction.findMany({
    where: {
      type: "REFUND",
      referenceType: "CREDIT_TRANSACTION",
      referenceId: { in: priorCharges.map((charge) => charge.id) },
    },
    select: { referenceId: true },
  });
  const refundedIds = new Set(refunded.map((tx) => tx.referenceId));
  return priorCharges.find((charge) => !refundedIds.has(charge.id))?.id ?? null;
}

export async function findOrCreateRestorationCharge(params: {
  academyId: string;
  staffId: string;
  idempotencyKey: string;
  metadata?: CreditMetadata;
}): Promise<{ transactionId: string; created: boolean }> {
  const existing = await findExistingRestorationCharge({
    academyId: params.academyId,
    idempotencyKey: params.idempotencyKey,
  });
  if (existing) return { transactionId: existing, created: false };

  const credit = await deductCredits(
    params.academyId,
    "PASSAGE_RESTORATION",
    params.staffId,
    {
      ...params.metadata,
      idempotencyKey: params.idempotencyKey,
    },
  );
  return { transactionId: credit.transactionId, created: true };
}

export async function ensureInitialDraftRestorationCharged(params: {
  academyId: string;
  staffId: string;
  jobId: string;
  draftId: string;
  passageOrder?: number;
  metadata?: CreditMetadata;
}): Promise<{ transactionId: string; attached: boolean }> {
  const current = await prisma.extractionM1PassageDraft.findFirst({
    where: {
      id: params.draftId,
      jobId: params.jobId,
      job: { academyId: params.academyId },
    },
    select: { restorationCreditTxId: true },
  });
  if (!current) {
    throw new Error(`Restoration draft not found: ${params.draftId}`);
  }
  if (current.restorationCreditTxId) {
    return { transactionId: current.restorationCreditTxId, attached: false };
  }

  const idempotencyKey = `restore:auto:${params.draftId}`;
  const charge = await findOrCreateRestorationCharge({
    academyId: params.academyId,
    staffId: params.staffId,
    idempotencyKey,
    metadata: {
      source: "M1_EXTRACTION_RESTORE",
      draftId: params.draftId,
      jobId: params.jobId,
      passageOrder: params.passageOrder,
      ...params.metadata,
    },
  });

  let attached: boolean;
  try {
    attached = await prisma.$transaction(async (tx) => {
      const updated = await tx.extractionM1PassageDraft.updateMany({
        where: {
          id: params.draftId,
          jobId: params.jobId,
          restorationCreditTxId: null,
        },
        data: { restorationCreditTxId: charge.transactionId },
      });
      if (updated.count === 0) return false;

      await tx.extractionJob.update({
        where: { id: params.jobId },
        data: { creditsConsumed: { increment: RESTORATION_CREDIT_COST } },
      });
      return true;
    });
  } catch (err) {
    if (charge.created) {
      await refundRestorationCharge({
        academyId: params.academyId,
        transactionId: charge.transactionId,
        reason: "Restoration charge could not be attached to draft",
      }).catch(() => {});
    }
    throw err;
  }

  if (!attached && charge.created) {
    await refundRestorationCharge({
      academyId: params.academyId,
      transactionId: charge.transactionId,
      reason: "Duplicate restoration charge was not attached to draft",
    });
  }

  return { transactionId: charge.transactionId, attached };
}

export async function chargeDraftRestorationAttempt(params: {
  academyId: string;
  staffId: string;
  jobId: string;
  draftId: string;
  idempotencyKey: string;
  metadata?: CreditMetadata;
}): Promise<{ transactionId: string; created: boolean }> {
  const charge = await findOrCreateRestorationCharge({
    academyId: params.academyId,
    staffId: params.staffId,
    idempotencyKey: params.idempotencyKey,
    metadata: {
      source: "M1_DRAFT_RERESTORE",
      draftId: params.draftId,
      jobId: params.jobId,
      ...params.metadata,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.extractionM1PassageDraft.update({
        where: { id: params.draftId },
        data: { restorationCreditTxId: charge.transactionId },
      });
      if (charge.created) {
        await tx.extractionJob.update({
          where: { id: params.jobId },
          data: { creditsConsumed: { increment: RESTORATION_CREDIT_COST } },
        });
      }
    });
  } catch (err) {
    if (charge.created) {
      await refundRestorationCharge({
        academyId: params.academyId,
        transactionId: charge.transactionId,
        reason: "Restoration retry charge could not be attached to draft",
      }).catch(() => {});
    }
    throw err;
  }

  return charge;
}

export async function recordJobRestorationCharge(params: {
  jobId: string;
}): Promise<void> {
  await prisma.extractionJob.update({
    where: { id: params.jobId },
    data: { creditsConsumed: { increment: RESTORATION_CREDIT_COST } },
  });
}

export async function refundRestorationCharge(params: {
  academyId: string;
  jobId?: string;
  transactionId: string;
  reason: string;
  clearDraftId?: string;
}): Promise<boolean> {
  const alreadyRefunded = await prisma.creditTransaction.findFirst({
    where: {
      referenceId: params.transactionId,
      referenceType: "CREDIT_TRANSACTION",
      type: "REFUND",
    },
    select: { id: true },
  });
  if (alreadyRefunded) return false;

  await refundCredits(
    params.academyId,
    "PASSAGE_RESTORATION",
    params.transactionId,
    params.reason,
  );

  await prisma.$transaction(async (tx) => {
    if (params.clearDraftId) {
      await tx.extractionM1PassageDraft.updateMany({
        where: {
          id: params.clearDraftId,
          restorationCreditTxId: params.transactionId,
        },
        data: { restorationCreditTxId: null },
      });
    }
    if (params.jobId) {
      await tx.extractionJob.update({
        where: { id: params.jobId },
        data: { creditsRefunded: { increment: RESTORATION_CREDIT_COST } },
      });
    }
  });

  return true;
}
