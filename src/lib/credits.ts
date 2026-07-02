// ============================================================================
// Credit Service — Core credit management logic
// Concurrency-safe atomic operations with PostgreSQL row-level locking
// ============================================================================

import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";
import { prisma } from "@/lib/prisma";

// ─── Error Classes ───────────────────────────────────────────────────────────

export class InsufficientCreditsError extends Error {
  constructor(
    public currentBalance: number,
    public requiredCredits: number,
  ) {
    super(
      `Insufficient credits: have ${currentBalance}, need ${requiredCredits}`,
    );
    this.name = "InsufficientCreditsError";
  }
}

export class FeatureNotAvailableError extends Error {
  constructor(public feature: string) {
    super(`Feature not available on current plan: ${feature}`);
    this.name = "FeatureNotAvailableError";
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeductResult {
  success: true;
  balanceAfter: number;
  transactionId: string;
}

export interface BalanceCheck {
  balance: number;
  isLow: boolean;
  threshold: number;
  canAfford: boolean;
  cost: number;
}

export interface CreditSummary {
  balance: number;
  monthlyAllocation: number;
  bonusCredits: number;
  totalConsumed: number;
  totalAllocated: number;
  isLow: boolean;
  threshold: number;
  expiresAt: string | null;
  planName?: string;
  planTier?: string;
}

// ─── Expiry ────────────────────────────────────────────────────────────────

/**
 * Lazily expire a balance whose single `expiresAt` has passed. Idempotent and
 * race-safe: a guarded `UPDATE ... FOR UPDATE` CTE zeroes the balance and clears
 * the clock in one statement, and only the writer that actually zeroed a
 * positive balance appends the EXPIRATION ledger row.
 *
 * Called at read time (checkBalance/getCreditSummary) and before every deduction
 * so expired credits are neither spendable nor displayed. Returns the number of
 * credits expired (0 if nothing was due).
 */
export async function sweepExpiredCredits(academyId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ expired_amount: number }>>`
      WITH target AS (
        SELECT "academyId", balance AS old_balance
        FROM credit_balances
        WHERE "academyId" = ${academyId}
          AND "expiresAt" IS NOT NULL
          AND "expiresAt" <= NOW()
        FOR UPDATE
      )
      UPDATE credit_balances cb
      SET balance = 0,
          "bonusCredits" = 0,
          "expiresAt" = NULL,
          "updatedAt" = NOW()
      FROM target
      WHERE cb."academyId" = target."academyId"
      RETURNING target.old_balance AS expired_amount
    `;

    const expired = rows[0]?.expired_amount ?? 0;
    if (expired > 0) {
      await tx.creditTransaction.create({
        data: {
          academyId,
          type: "EXPIRATION",
          amount: -expired,
          balanceAfter: 0,
          description: "크레딧 소멸 (유효기간 만료)",
          referenceType: "CREDIT_EXPIRY",
        },
      });
    }
    return expired;
  });
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Deduct credits from an academy's balance.
 * CONCURRENCY SAFE: Uses atomic UPDATE with WHERE balance >= cost.
 * Call this BEFORE the AI operation. If AI fails, call refundCredits().
 */
export async function deductCredits(
  academyId: string,
  operationType: OperationType,
  staffId?: string,
  metadata?: Record<string, unknown>,
  costOverride?: number,
): Promise<DeductResult> {
  const cost = costOverride ?? CREDIT_COSTS[operationType];
  if (CREDIT_COSTS[operationType] === undefined) throw new Error(`Unknown operation type: ${operationType}`);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Invalid credit cost: ${cost}`);

  // Expire first so a lapsed balance can't be spent, then deduct.
  await sweepExpiredCredits(academyId);

  // Wrap in transaction for atomic deduction + audit log
  return await prisma.$transaction(async (tx) => {
    // Atomic decrement with guard — PostgreSQL row-level lock. The expiry
    // predicate is belt-and-suspenders against a balance that lapses between
    // the sweep above and this statement.
    const result = await tx.creditBalance.updateMany({
      where: {
        academyId,
        balance: { gte: cost },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: {
        balance: { decrement: cost },
        totalConsumed: { increment: cost },
      },
    });

    if (result.count === 0) {
      const current = await tx.creditBalance.findUnique({
        where: { academyId },
      });
      if (!current) {
        throw new Error(`Credit balance not found for academy: ${academyId}`);
      }
      throw new InsufficientCreditsError(current.balance, cost);
    }

    const updated = await tx.creditBalance.findUnique({
      where: { academyId },
    });

    const transaction = await tx.creditTransaction.create({
      data: {
        academyId,
        type: "CONSUMPTION",
        amount: -cost,
        balanceAfter: updated!.balance,
        operationType,
        staffId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return {
      success: true as const,
      balanceAfter: updated!.balance,
      transactionId: transaction.id,
    };
  });
}

/**
 * Refund credits after a failed AI operation.
 */
export async function refundCredits(
  academyId: string,
  operationType: OperationType,
  originalTransactionId: string,
  reason?: string,
  costOverride?: number,
): Promise<number> {
  if (CREDIT_COSTS[operationType] === undefined) throw new Error(`Unknown operation type: ${operationType}`);

  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM credit_transactions
      WHERE id = ${originalTransactionId}
      FOR UPDATE
    `;

    // Verify original transaction exists and belongs to this academy
    const original = await tx.creditTransaction.findUnique({
      where: { id: originalTransactionId },
    });
    if (!original || original.academyId !== academyId || original.type !== "CONSUMPTION") {
      throw new Error("Invalid refund: original transaction not found or mismatched");
    }

    const originalCost = Math.abs(original.amount);
    const requestedCost = costOverride ?? originalCost;
    if (!Number.isFinite(requestedCost) || requestedCost <= 0) {
      throw new Error(`Invalid refund cost: ${requestedCost}`);
    }

    const description = reason || `Auto-refund for failed ${operationType}`;

    // Idempotency is by refund reason, not just by the original transaction:
    // one charge can have a partial worksheet refund and later a remaining
    // full-failure refund, but repeating the same path must not add credits.
    const existingSameReason = await tx.creditTransaction.findFirst({
      where: {
        referenceId: originalTransactionId,
        referenceType: "CREDIT_TRANSACTION",
        type: "REFUND",
        description,
      },
    });
    if (existingSameReason) {
      return 0;
    }

    const refunded = await tx.creditTransaction.aggregate({
      where: {
        referenceId: originalTransactionId,
        referenceType: "CREDIT_TRANSACTION",
        type: "REFUND",
      },
      _sum: { amount: true },
    });
    const alreadyRefunded = refunded._sum.amount ?? 0;
    const remainingRefundable = Math.max(0, originalCost - alreadyRefunded);
    const refundAmount = Math.min(requestedCost, remainingRefundable);
    if (refundAmount <= 0) {
      return 0;
    }

    await tx.creditBalance.update({
      where: { academyId },
      data: {
        balance: { increment: refundAmount },
        totalConsumed: { decrement: refundAmount },
      },
    });

    const updated = await tx.creditBalance.findUnique({
      where: { academyId },
    });

    await tx.creditTransaction.create({
      data: {
        academyId,
        type: "REFUND",
        amount: refundAmount,
        balanceAfter: updated!.balance,
        operationType,
        description,
        referenceId: originalTransactionId,
        referenceType: "CREDIT_TRANSACTION",
      },
    });
    return refundAmount;
  });
}

/**
 * Check balance without deducting. For UI display and pre-flight checks.
 */
export async function checkBalance(
  academyId: string,
  operationType?: OperationType,
): Promise<BalanceCheck> {
  await sweepExpiredCredits(academyId);
  const creditBalance = await prisma.creditBalance.findUnique({
    where: { academyId },
  });

  if (!creditBalance) {
    return { balance: 0, isLow: true, threshold: 50, canAfford: false, cost: 0 };
  }

  const cost = operationType ? CREDIT_COSTS[operationType] : 0;

  return {
    balance: creditBalance.balance,
    isLow: creditBalance.balance <= creditBalance.lowCreditThreshold,
    threshold: creditBalance.lowCreditThreshold,
    canAfford: creditBalance.balance >= cost,
    cost,
  };
}

/**
 * Get full credit summary for dashboard display.
 */
export async function getCreditSummary(academyId: string): Promise<CreditSummary> {
  await sweepExpiredCredits(academyId);
  const [creditBalance, subscription] = await Promise.all([
    prisma.creditBalance.findUnique({ where: { academyId } }),
    prisma.academySubscription.findFirst({
      where: { academyId, status: { in: ["ACTIVE", "TRIAL"] } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!creditBalance) {
    return {
      balance: 0,
      monthlyAllocation: 0,
      bonusCredits: 0,
      totalConsumed: 0,
      totalAllocated: 0,
      isLow: true,
      threshold: 50,
      expiresAt: null,
    };
  }

  return {
    balance: creditBalance.balance,
    monthlyAllocation: creditBalance.monthlyAllocation,
    bonusCredits: creditBalance.bonusCredits,
    totalConsumed: creditBalance.totalConsumed,
    totalAllocated: creditBalance.totalAllocated,
    isLow: creditBalance.balance <= creditBalance.lowCreditThreshold,
    threshold: creditBalance.lowCreditThreshold,
    expiresAt: creditBalance.expiresAt?.toISOString() ?? null,
    planName: subscription?.plan.name,
    planTier: subscription?.plan.tier,
  };
}

/**
 * Get credit cost for a given operation type.
 */
export function getCreditCost(operationType: OperationType): number {
  const cost = CREDIT_COSTS[operationType];
  if (cost === undefined) throw new Error(`Unknown operation: ${operationType}`);
  return cost;
}

/**
 * Allocate credits to an academy (monthly reset, top-up, admin adjustment).
 */
export async function allocateCredits(
  academyId: string,
  amount: number,
  type: "ALLOCATION" | "TOP_UP" | "ADJUSTMENT" | "RESET" | "ROLLOVER",
  options?: {
    adminId?: string;
    staffId?: string;
    description?: string;
  },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (type === "RESET") {
      await tx.creditBalance.update({
        where: { academyId },
        data: {
          balance: amount,
          monthlyAllocation: amount,
          totalAllocated: { increment: amount },
          lastResetAt: new Date(),
        },
      });
    } else {
      await tx.creditBalance.update({
        where: { academyId },
        data: {
          balance: { increment: amount },
          totalAllocated: { increment: amount },
          ...(type === "TOP_UP" ? { bonusCredits: { increment: amount } } : {}),
        },
      });
    }

    const updated = await tx.creditBalance.findUnique({
      where: { academyId },
    });

    await tx.creditTransaction.create({
      data: {
        academyId,
        type,
        amount,
        balanceAfter: updated!.balance,
        description: options?.description,
        adminId: options?.adminId,
        staffId: options?.staffId,
      },
    });
  });
}

/**
 * Get recent credit transactions for an academy.
 */
export async function getCreditTransactions(
  academyId: string,
  options?: { limit?: number; offset?: number; type?: string },
) {
  const where: Record<string, unknown> = { academyId };
  if (options?.type) where.type = options.type;

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return { transactions, total };
}
