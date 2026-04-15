// ============================================================================
// NARA Credit Service - Implementation Blueprint
// Target file: src/lib/credits.ts
// ============================================================================
// This is a reference implementation showing the exact patterns to use.
// Copy and adapt when implementing.
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

interface DeductResult {
  success: true;
  balanceAfter: number;
  transactionId: string;
}

interface BalanceCheck {
  balance: number;
  isLow: boolean;
  threshold: number;
  canAfford: boolean; // only meaningful if operationType was provided
  cost: number; // cost of the operation (0 if no operationType)
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Deduct credits from an academy's balance.
 *
 * CONCURRENCY SAFE: Uses atomic UPDATE with WHERE balance >= cost.
 * PostgreSQL row-level locking ensures no overdraft even under
 * concurrent requests from the same academy.
 *
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

  // ── Step 1: Atomic decrement with guard ──
  // This is a single SQL statement: UPDATE ... SET balance = balance - N WHERE balance >= N
  // PostgreSQL guarantees atomicity. Two concurrent calls will serialize on the row lock.
  const result = await prisma.creditBalance.updateMany({
    where: {
      academyId,
      balance: { gte: cost },
    },
    data: {
      balance: { decrement: cost },
      totalConsumed: { increment: cost },
    },
  });

  // ── Step 2: Handle insufficient balance ──
  if (result.count === 0) {
    const current = await prisma.creditBalance.findUnique({
      where: { academyId },
    });
    if (!current) {
      throw new Error(`Credit balance not found for academy: ${academyId}`);
    }
    throw new InsufficientCreditsError(current.balance, cost);
  }

  // ── Step 3: Get updated balance for audit log ──
  const updated = await prisma.creditBalance.findUnique({
    where: { academyId },
  });

  // ── Step 4: Create immutable audit log ──
  const transaction = await prisma.creditTransaction.create({
    data: {
      academyId,
      type: "CONSUMPTION",
      amount: -cost,
      balanceAfter: updated!.balance,
      operationType,
      staffId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date(),
    },
  });

  return {
    success: true,
    balanceAfter: updated!.balance,
    transactionId: transaction.id,
  };
}

/**
 * Refund credits after a failed AI operation.
 *
 * Call this when the AI call fails AFTER credits were already deducted.
 * Creates a REFUND transaction in the audit log.
 */
export async function refundCredits(
  academyId: string,
  operationType: OperationType,
  originalTransactionId: string,
  reason?: string,
): Promise<void> {
  const cost = CREDIT_COSTS[operationType];

  await prisma.$transaction(async (tx) => {
    // Increment balance back
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

    // Create refund audit log
    await tx.creditTransaction.create({
      data: {
        academyId,
        type: "REFUND",
        amount: cost, // Positive: credits returned
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
 * Check balance without deducting.
 * Useful for UI display and pre-flight checks.
 */
export async function checkBalance(
  academyId: string,
  operationType?: OperationType,
): Promise<BalanceCheck> {
  const creditBalance = await prisma.creditBalance.findUnique({
    where: { academyId },
  });

  if (!creditBalance) {
    throw new Error(`Credit balance not found for academy: ${academyId}`);
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
      // Reset balance to exact amount (monthly reset)
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
      // Add to existing balance
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

// ─── Usage Pattern in AI Route ───────────────────────────────────────────────

/**
 * EXAMPLE: How to integrate credit checking into an existing AI route.
 *
 * ```typescript
 * // In /api/ai/generate-question/route.ts
 *
 * export async function POST(request: NextRequest) {
 *   try {
 *     const session = await auth();
 *     const academyId = session.user.academyId;
 *     const staffId = session.user.id;
 *
 *     // ── 1. Deduct credits (before AI call) ──
 *     let creditResult: DeductResult;
 *     try {
 *       creditResult = await deductCredits(
 *         academyId,
 *         'QUESTION_GEN_SINGLE',
 *         staffId,
 *       );
 *     } catch (e) {
 *       if (e instanceof InsufficientCreditsError) {
 *         return NextResponse.json(
 *           { error: '크레딧이 부족합니다', balance: e.currentBalance, required: e.requiredCredits },
 *           { status: 402 },
 *         );
 *       }
 *       throw e;
 *     }
 *
 *     // ── 2. Call AI (outside of any DB transaction) ──
 *     const startTime = Date.now();
 *     try {
 *       const { object } = await generateObject({ ... });
 *
 *       // ── 3. Success: save result + update transaction metadata ──
 *       const question = await prisma.question.create({ ... });
 *
 *       await prisma.creditTransaction.update({
 *         where: { id: creditResult.transactionId },
 *         data: {
 *           referenceId: question.id,
 *           referenceType: 'QUESTION',
 *           metadata: JSON.stringify({
 *             model: 'gemini-2.0-flash',
 *             durationMs: Date.now() - startTime,
 *             questionType: body.subType,
 *           }),
 *         },
 *       });
 *
 *       return NextResponse.json({
 *         ...question,
 *         creditsRemaining: creditResult.balanceAfter,
 *       });
 *
 *     } catch (aiError) {
 *       // ── 4. AI failed: refund credits ──
 *       await refundCredits(
 *         academyId,
 *         'QUESTION_GEN_SINGLE',
 *         creditResult.transactionId,
 *         `AI generation failed: ${aiError.message}`,
 *       );
 *       throw aiError;
 *     }
 *
 *   } catch (error) {
 *     // ... error handling ...
 *   }
 * }
 * ```
 */

// ─── Credit Cost Constants ───────────────────────────────────────────────────
// Target file: src/lib/credit-costs.ts

/*
export const CREDIT_COSTS = {
  QUESTION_GEN_SINGLE: 2,    // Single MC question
  QUESTION_GEN_VOCAB: 1,     // Vocab question (simpler)
  PASSAGE_ANALYSIS: 5,       // Full 5-layer passage analysis
  AUTO_GEN_BATCH: 15,        // AI plans + generates ~10 questions
  LEARNING_QUESTION_GEN: 2,  // Naeshin/suneung learning question
  QUESTION_EXPLANATION: 1,   // Generate explanation for a question
  QUESTION_MODIFY: 1,        // AI-assisted question modification
  AI_CHAT: 1,                // Student AI chat (per message)
  TEXT_EXTRACTION: 3,         // PDF/image text extraction (OCR)
} as const;

export type OperationType = keyof typeof CREDIT_COSTS;
*/

// ─── Subscription Plan Seed Data ─────────────────────────────────────────────
// Target file: prisma/seed.ts (add to existing seed)

/*
const plans = [
  {
    name: "스타터",
    tier: "STARTER",
    monthlyPrice: 300000,
    monthlyCredits: 500,
    maxStudents: 50,
    maxStaff: 3,
    rolloverPolicy: "RESET",
    rolloverMaxRate: 0,
    sortOrder: 1,
    features: JSON.stringify({
      questionGenSingle: true,
      questionGenVocab: true,
      passageAnalysis: true,
      autoGeneration: false,
      learningSystem: false,
      parentReports: false,
      advancedAnalytics: false,
      customPrompts: true,
      examBuilder: true,
      studentApp: true,
      parentApp: false,
      apiAccess: false,
      customBranding: false,
      maxExamsPerMonth: 20,
      maxAiChatMessagesPerStudent: 30,
    }),
  },
  {
    name: "스탠다드",
    tier: "STANDARD",
    monthlyPrice: 500000,
    monthlyCredits: 1200,
    maxStudents: 150,
    maxStaff: 8,
    rolloverPolicy: "PARTIAL_ROLLOVER",
    rolloverMaxRate: 0.2,
    sortOrder: 2,
    features: JSON.stringify({
      questionGenSingle: true,
      questionGenVocab: true,
      passageAnalysis: true,
      autoGeneration: true,
      learningSystem: true,
      parentReports: false,
      advancedAnalytics: false,
      customPrompts: true,
      examBuilder: true,
      studentApp: true,
      parentApp: true,
      apiAccess: false,
      customBranding: false,
      maxExamsPerMonth: 50,
      maxAiChatMessagesPerStudent: 50,
    }),
  },
  {
    name: "프리미엄",
    tier: "PREMIUM",
    monthlyPrice: 1000000,
    monthlyCredits: 3000,
    maxStudents: 500,
    maxStaff: 20,
    rolloverPolicy: "ROLLOVER",
    rolloverMaxRate: 1.0,
    sortOrder: 3,
    features: JSON.stringify({
      questionGenSingle: true,
      questionGenVocab: true,
      passageAnalysis: true,
      autoGeneration: true,
      learningSystem: true,
      parentReports: true,
      advancedAnalytics: true,
      customPrompts: true,
      examBuilder: true,
      studentApp: true,
      parentApp: true,
      apiAccess: false,
      customBranding: true,
      maxExamsPerMonth: -1, // unlimited
      maxAiChatMessagesPerStudent: 100,
    }),
  },
  {
    name: "엔터프라이즈",
    tier: "ENTERPRISE",
    monthlyPrice: 0, // custom pricing
    monthlyCredits: 10000,
    maxStudents: 99999,
    maxStaff: 99999,
    rolloverPolicy: "ROLLOVER",
    rolloverMaxRate: 1.0,
    sortOrder: 4,
    features: JSON.stringify({
      questionGenSingle: true,
      questionGenVocab: true,
      passageAnalysis: true,
      autoGeneration: true,
      learningSystem: true,
      parentReports: true,
      advancedAnalytics: true,
      customPrompts: true,
      examBuilder: true,
      studentApp: true,
      parentApp: true,
      apiAccess: true,
      customBranding: true,
      maxExamsPerMonth: -1,
      maxAiChatMessagesPerStudent: -1,
    }),
  },
];
*/
