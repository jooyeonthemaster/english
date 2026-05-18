"use server";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { revalidatePath } from "next/cache";
import { type ActionResult } from "./helpers";

/**
 * Manually adjust an academy's credit balance. Positive amount adds credits,
 * negative amount subtracts credits. Creates an audit trail transaction.
 */
/**
 * Adjust an academy's credit balance with race-safe overdraft detection and
 * a guaranteed-coupled audit row. Mirrors `adjustMemberCredits` in
 * src/actions/admin-members.ts; both must move together so neither becomes
 * a TOCTOU sidedoor.
 *
 * Pre-2026-05 a naive read-then-write version of this lived here and was
 * race-vulnerable. The new path uses raw `UPDATE/INSERT ... RETURNING` so
 * `balanceAfter` is read out of the same statement that mutated the row,
 * eliminating any window where concurrent writers can produce inconsistent
 * audit snapshots.
 */
export async function adjustCredits(
  academyId: string,
  amount: number,
  description: string,
): Promise<ActionResult> {
  const admin = await requireAdminAuth("SUPER_ADMIN");

  if (!Number.isInteger(amount) || amount === 0) {
    return { success: false, error: "Adjustment amount must be a non-zero integer" };
  }
  if (Math.abs(amount) > 1_000_000) {
    return { success: false, error: "Adjustment amount exceeds 1,000,000" };
  }
  const trimmed = description.trim();
  if (trimmed.length < 5) {
    return { success: false, error: "Description must be at least 5 characters" };
  }

  // Resolve plan's monthlyCredits — needed when initializing a CreditBalance
  // row that doesn't yet exist (so the monthly reset job uses the right
  // allocation).
  const activeSub = await prisma.academySubscription.findFirst({
    where: { academyId, status: { in: ["ACTIVE", "TRIAL"] } },
    include: { plan: { select: { monthlyCredits: true } } },
    orderBy: { createdAt: "desc" },
  });
  const planMonthlyCredits = activeSub?.plan.monthlyCredits ?? 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        let newBalance: number;

        if (amount < 0) {
          const decremented = await tx.$queryRaw<Array<{ balance: number }>>`
            UPDATE credit_balances
            SET balance = balance + ${amount}, "updatedAt" = NOW()
            WHERE "academyId" = ${academyId}
              AND balance >= ${-amount}
            RETURNING balance
          `;
          if (decremented.length === 0) {
            const exists = await tx.creditBalance.findUnique({
              where: { academyId },
              select: { id: true },
            });
            if (!exists) throw new Error("balance_not_initialized");
            throw new Error("insufficient_balance");
          }
          newBalance = decremented[0].balance;
        } else {
          const upserted = await tx.$queryRaw<Array<{ balance: number }>>`
            INSERT INTO credit_balances (id, "academyId", balance, "monthlyAllocation", "updatedAt")
            VALUES (${crypto.randomUUID()}, ${academyId}, ${amount}, ${planMonthlyCredits}, NOW())
            ON CONFLICT ("academyId") DO UPDATE
              SET balance = credit_balances.balance + EXCLUDED.balance,
                  "updatedAt" = NOW()
            RETURNING balance
          `;
          if (upserted.length === 0) throw new Error("balance_upsert_failed");
          newBalance = upserted[0].balance;
        }

        await tx.creditTransaction.create({
          data: {
            academyId,
            type: "ADJUSTMENT",
            amount,
            balanceAfter: newBalance,
            description: trimmed,
            adminId: admin.adminId,
            referenceType: "ADMIN_ADJUSTMENT",
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000,
      },
    );

    revalidatePath("/admin/academies");
    revalidatePath(`/admin/academies/${academyId}`);
    revalidatePath("/admin/members");

    return { success: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    if (code === "insufficient_balance") {
      return { success: false, error: "Adjustment would result in negative balance" };
    }
    if (code === "balance_not_initialized") {
      return {
        success: false,
        error: "Credit balance not initialized; run a positive adjustment first",
      };
    }
    console.error("[adjustCredits] Error", { academyId, adminId: admin.adminId, err });
    return {
      success: false,
      error: "Failed to adjust credits. Please retry.",
    };
  }
}

/**
 * Fetch credit transactions across all academies with optional filters.
 */
export async function getCreditTransactionsAll(filters?: {
  academyId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}) {
  await requireAdminAuth();

  const where: Record<string, unknown> = {};
  if (filters?.academyId) where.academyId = filters.academyId;
  if (filters?.type) where.type = filters.type;

  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;

  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        academy: { select: { id: true, name: true, slug: true } },
        admin: { select: { id: true, name: true } },
      },
    }),
    prisma.creditTransaction.count({ where }),
  ]);

  return { transactions, total, limit, offset };
}
