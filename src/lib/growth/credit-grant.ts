/**
 * In-transaction credit grant / clawback helpers for the growth program.
 *
 * Unlike `allocateCredits` in @/lib/credits (which returns void and uses a bare
 * `.update`), these run inside a caller-provided transaction and RETURN the
 * ledger transaction id, so the caller can persist the linkage (referral.referrerTxId,
 * academyMissionClaim.creditTxId) and enforce idempotency atomically in the same tx.
 *
 * Idempotency is the CALLER's responsibility — create the unique guard row
 * (Referral.referredAcademyId / AcademyMissionClaim composite unique) inside the
 * SAME transaction before calling grant, so a duplicate guard insert (P2002)
 * aborts the whole tx and prevents a double grant.
 */

import type { Prisma } from "@prisma/client";

export interface GrantResult {
  transactionId: string;
  balanceAfter: number;
}

export interface GrantBonusParams {
  academyId: string;
  amount: number; // positive
  description: string;
  operationType?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  staffId?: string | null;
  adminId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Atomically add bonus credits (type=TOP_UP) to an academy and append a ledger row.
 * Defensive against a missing CreditBalance row (creates it).
 */
export async function grantBonusCreditsTx(
  tx: Prisma.TransactionClient,
  params: GrantBonusParams,
): Promise<GrantResult> {
  const { academyId, amount } = params;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`grantBonusCreditsTx: invalid amount ${amount}`);
  }

  // Upsert is atomic on the academyId unique index, so a concurrent first-ever
  // grant to a brand-new academy can't lose to a P2002 create race.
  const balance = await tx.creditBalance.upsert({
    where: { academyId },
    create: {
      academyId,
      balance: amount,
      bonusCredits: amount,
      totalAllocated: amount,
    },
    update: {
      balance: { increment: amount },
      totalAllocated: { increment: amount },
      bonusCredits: { increment: amount },
    },
  });

  const transaction = await tx.creditTransaction.create({
    data: {
      academyId,
      type: "TOP_UP",
      amount,
      balanceAfter: balance.balance,
      operationType: params.operationType ?? null,
      description: params.description,
      referenceId: params.referenceId ?? null,
      referenceType: params.referenceType ?? null,
      staffId: params.staffId ?? null,
      adminId: params.adminId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });

  return { transactionId: transaction.id, balanceAfter: balance.balance };
}

export interface ClawbackParams {
  academyId: string;
  amount: number; // positive amount to reverse
  description: string;
  referenceId?: string | null;
  referenceType?: string | null;
  adminId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Reverse a previously-granted bonus (e.g. confirmed fraud). Decrements balance,
 * clamped at 0 (records any shortfall in metadata), and appends a negative
 * ADJUSTMENT ledger row. The credit ledger stays append-only (we never mutate the
 * original grant row).
 */
export async function clawbackCreditsTx(
  tx: Prisma.TransactionClient,
  params: ClawbackParams,
): Promise<GrantResult> {
  const { academyId, amount } = params;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`clawbackCreditsTx: invalid amount ${amount}`);
  }

  const current = await tx.creditBalance.findUnique({ where: { academyId } });
  if (!current) {
    throw new Error(`clawbackCreditsTx: no balance row for ${academyId}`);
  }

  const reversible = Math.min(amount, current.balance);
  const shortfall = amount - reversible;

  if (reversible > 0) {
    await tx.creditBalance.update({
      where: { academyId },
      data: {
        balance: { decrement: reversible },
        bonusCredits: { decrement: Math.min(reversible, current.bonusCredits) },
      },
    });
    // Maintain the invariant bonusCredits <= balance. These can legitimately
    // drift apart because consumption decrements balance but not bonusCredits,
    // so after a clawback bonusCredits could otherwise exceed the new balance.
    const after = await tx.creditBalance.findUnique({ where: { academyId } });
    if (after && after.bonusCredits > after.balance) {
      await tx.creditBalance.update({
        where: { academyId },
        data: { bonusCredits: Math.max(after.balance, 0) },
      });
    }
  }

  const balance = await tx.creditBalance.findUnique({ where: { academyId } });

  const transaction = await tx.creditTransaction.create({
    data: {
      academyId,
      type: "ADJUSTMENT",
      amount: -reversible,
      balanceAfter: balance!.balance,
      description: params.description,
      referenceId: params.referenceId ?? null,
      referenceType: params.referenceType ?? null,
      adminId: params.adminId ?? null,
      metadata: JSON.stringify({
        ...(params.metadata ?? {}),
        clawback: true,
        requestedAmount: amount,
        reversedAmount: reversible,
        unreversedShortfall: shortfall,
      }),
    },
  });

  return { transactionId: transaction.id, balanceAfter: balance!.balance };
}
