"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { MAX_ADJUSTMENT_AMOUNT } from "@/lib/admin-members-labels";
import { type ActionResult, fail } from "./_shared";

// ============================================================================
// 4. Manual credit adjustment (atomic, audit-logged, SUPER_ADMIN only)
// ============================================================================

const adjustmentSchema = z.object({
  memberId: z.string().min(1),
  amount: z
    .number()
    .int({ message: "정수만 입력 가능합니다." })
    .refine((n) => n !== 0, "0이 아닌 값을 입력해주세요.")
    .refine(
      (n) => Math.abs(n) <= MAX_ADJUSTMENT_AMOUNT,
      `한 번에 ${MAX_ADJUSTMENT_AMOUNT.toLocaleString()} 크레딧을 초과할 수 없습니다.`,
    ),
  reason: z
    .string()
    .trim()
    .min(5, "사유는 5자 이상 입력해주세요.")
    .max(500, "사유는 500자 이하로 입력해주세요."),
});

export async function adjustMemberCredits(input: {
  memberId: string;
  amount: number;
  reason: string;
}): Promise<ActionResult<{ balanceAfter: number; transactionId: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN");

  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { memberId, amount, reason } = parsed.data;

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { id: true, academyId: true, role: true },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다.");
  if (staff.role !== "DIRECTOR") {
    return fail("원장 회원만 조정 가능합니다.");
  }

  // Resolve the active subscription's monthlyCredits — needed when
  // initializing a CreditBalance row that doesn't yet exist, so the monthly
  // reset/rollover job sees the correct allocation.
  const activeSub = await prisma.academySubscription.findFirst({
    where: {
      academyId: staff.academyId,
      status: { in: ["ACTIVE", "TRIAL"] },
    },
    include: { plan: { select: { monthlyCredits: true } } },
    orderBy: { createdAt: "desc" },
  });
  const planMonthlyCredits = activeSub?.plan.monthlyCredits ?? 0;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // ADJUSTMENT only moves `balance`. Lifetime metrics
        // (totalAllocated/totalConsumed/bonusCredits) are reserved for the
        // organic flows (ALLOCATION/CONSUMPTION/TOP_UP) so reports cleanly
        // separate "operational throughput" from "manual admin overrides".
        // Every adjustment is fully traceable through CreditTransaction.
        //
        // We use raw UPDATE/INSERT ... RETURNING balance so that the audit
        // row's `balanceAfter` reflects the value RIGHT AFTER our own
        // mutation, not a separately-issued findUnique that another
        // concurrent transaction could interleave against. This makes the
        // (balance change, audit row) tuple internally consistent.
        let newBalance: number;

        if (amount < 0) {
          // Atomic guarded decrement: only succeeds when current balance is
          // sufficient. Predicate runs under the row's X-lock taken by the
          // UPDATE, so two concurrent decrements cannot both pass.
          const decremented = await tx.$queryRaw<Array<{ balance: number }>>`
            UPDATE credit_balances
            SET balance = balance + ${amount}, "updatedAt" = NOW()
            WHERE "academyId" = ${staff.academyId}
              AND balance >= ${-amount}
            RETURNING balance
          `;
          if (decremented.length === 0) {
            const exists = await tx.creditBalance.findUnique({
              where: { academyId: staff.academyId },
              select: { id: true },
            });
            if (!exists) throw new Error("balance_not_initialized");
            throw new Error("insufficient_balance");
          }
          newBalance = decremented[0].balance;
        } else {
          // Positive: native Postgres UPSERT (INSERT ... ON CONFLICT DO
          // UPDATE) with RETURNING. Single statement is atomic at the row
          // level — concurrent positive adjustments serialize through the
          // unique-index conflict resolution, each receiving the truthful
          // post-write balance.
          const upserted = await tx.$queryRaw<Array<{ balance: number }>>`
            INSERT INTO credit_balances (id, "academyId", balance, "monthlyAllocation", "updatedAt")
            VALUES (${randomUUID()}, ${staff.academyId}, ${amount}, ${planMonthlyCredits}, NOW())
            ON CONFLICT ("academyId") DO UPDATE
              SET balance = credit_balances.balance + EXCLUDED.balance,
                  "updatedAt" = NOW()
            RETURNING balance
          `;
          if (upserted.length === 0) throw new Error("balance_upsert_failed");
          newBalance = upserted[0].balance;
        }

        const txnRecord = await tx.creditTransaction.create({
          data: {
            academyId: staff.academyId,
            type: "ADJUSTMENT",
            amount,
            balanceAfter: newBalance,
            description: reason,
            adminId: session.adminId,
            referenceType: "ADMIN_ADJUSTMENT",
          },
          select: { id: true, balanceAfter: true },
        });

        return {
          balanceAfter: newBalance,
          transactionId: txnRecord.id,
        };
      },
      {
        // ReadCommitted is sufficient: each guarded UPDATE/UPSERT statement
        // holds its own row X-lock, and we read `newBalance` from the same
        // statement via RETURNING — no separate read window for races.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 10_000,
      },
    );

    revalidatePath(`/admin/members/${memberId}`);
    revalidatePath(`/admin/members`);

    return {
      success: true,
      balanceAfter: result.balanceAfter,
      transactionId: result.transactionId,
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    if (code === "insufficient_balance") {
      return fail("잔고가 부족합니다.");
    }
    if (code === "balance_not_initialized") {
      return fail(
        "초기 잔고가 없는 회원입니다. 먼저 양수 크레딧으로 충전해주세요.",
      );
    }
    console.error("[adjustMemberCredits] failed", {
      memberId,
      adminId: session.adminId,
      err,
    });
    return fail("조정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
}
