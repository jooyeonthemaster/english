// ============================================================================
// Credit Service — Core credit management logic
// Concurrency-safe atomic operations with PostgreSQL row-level locking
// ============================================================================

import { prisma } from "@/lib/prisma";
import { CREDIT_COSTS, type OperationType } from "@/lib/credit-costs";

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
  planName?: string;
  planTier?: string;
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
): Promise<DeductResult> {
  const cost = CREDIT_COSTS[operationType];
  if (!cost) throw new Error(`Unknown operation type: ${operationType}`);

  // Wrap in transaction for atomic deduction + audit log
  return await prisma.$transaction(async (tx) => {
    // Atomic decrement with guard — PostgreSQL row-level lock
    const result = await tx.creditBalance.updateMany({
      where: {
        academyId,
        balance: { gte: cost },
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
): Promise<void> {
  const cost = CREDIT_COSTS[operationType];
  if (!cost) throw new Error(`Unknown operation type: ${operationType}`);

  await prisma.$transaction(async (tx) => {
    // Verify original transaction exists and belongs to this academy
    const original = await tx.creditTransaction.findUnique({
      where: { id: originalTransactionId },
    });
    if (!original || original.academyId !== academyId || original.type !== "CONSUMPTION") {
      throw new Error("Invalid refund: original transaction not found or mismatched");
    }

    // Check for duplicate refund
    const existingRefund = await tx.creditTransaction.findFirst({
      where: { referenceId: originalTransactionId, type: "REFUND" },
    });
    if (existingRefund) {
      return; // Already refunded, skip silently
    }

    await tx.creditBalance.update({
      where: { academyId },
      data: {
        balance: { increment: cost },
        totalConsumed: { decrement: cost },
      },
    });

    const updated = await tx.creditBalance.findUnique({
      where: { academyId },
    });

    await tx.creditTransaction.create({
      data: {
        academyId,
        type: "REFUND",
        amount: cost,
        balanceAfter: updated!.balance,
        operationType,
        description: reason || `Auto-refund for failed ${operationType}`,
        referenceId: originalTransactionId,
        referenceType: "CREDIT_TRANSACTION",
      },
    });
  });
}

/**
 * Check balance without deducting. For UI display and pre-flight checks.
 */
export async function checkBalance(
  academyId: string,
  operationType?: OperationType,
): Promise<BalanceCheck> {
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
