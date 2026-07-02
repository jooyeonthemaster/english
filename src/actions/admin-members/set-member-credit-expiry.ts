"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { type ActionResult, fail } from "./_shared";

// ============================================================================
// Admin credit-expiry overrides (SUPER_ADMIN only)
//
// Two forced operations that bypass the grant flow, for existing customers:
//   • setMemberCreditExpiry  — pin an absolute 소멸 예정일 (or clear it, 무기한).
//   • wipeMemberCredits      — zero the balance immediately (강제 소멸).
//
// Both have bulk variants that apply across a member selection, aggregating
// per-member outcomes exactly like adjustMembersCredits.
// ============================================================================

const MAX_BULK_MEMBERS = 500;

const reasonSchema = z
  .string()
  .trim()
  .min(5, "사유는 5자 이상 입력해주세요.")
  .max(500, "사유는 500자 이하로 입력해주세요.");

type ResolvedStaff = { id: string; academyId: string; role: string; name: string };

async function resolveDirectorAcademy(
  memberId: string,
): Promise<{ ok: false; error: string } | { ok: true; staff: ResolvedStaff }> {
  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { id: true, academyId: true, role: true, name: true },
  });
  if (!staff) return { ok: false, error: "회원을 찾을 수 없습니다." };
  if (staff.role !== "DIRECTOR") {
    return { ok: false, error: "원장 회원만 조정 가능합니다." };
  }
  return { ok: true, staff };
}

// ─── Force-set / clear expiry ────────────────────────────────────────────────

const setExpirySchema = z.object({
  memberId: z.string().min(1),
  // 절대 소멸 예정일(ISO). 정책상 무기한(null)은 허용하지 않으며, 사실상
  // 무기한처럼 두려면 아주 먼 날짜를 지정한다.
  expiresAt: z.string().datetime(),
  reason: reasonSchema,
});

export async function setOneMemberCreditExpiry(
  input: { memberId: string; expiresAt: string; reason: string },
  adminId: string,
): Promise<ActionResult<{ memberName: string; expiresAt: string }>> {
  const parsed = setExpirySchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { memberId, expiresAt, reason } = parsed.data;

  const resolved = await resolveDirectorAcademy(memberId);
  if (!resolved.ok) return fail(resolved.error);
  const { staff } = resolved;

  try {
    await prisma.$transaction(
      async (tx) => {
        const updated = await tx.creditBalance.updateMany({
          where: { academyId: staff.academyId },
          data: { expiresAt: new Date(expiresAt) },
        });
        if (updated.count === 0) throw new Error("balance_not_initialized");

        const after = await tx.creditBalance.findUnique({
          where: { academyId: staff.academyId },
          select: { balance: true },
        });

        await tx.creditTransaction.create({
          data: {
            academyId: staff.academyId,
            type: "ADJUSTMENT",
            amount: 0,
            balanceAfter: after?.balance ?? 0,
            description: reason,
            adminId,
            referenceType: "ADMIN_EXPIRY",
            metadata: JSON.stringify({ expiresAt }),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );

    return { success: true, memberName: staff.name, expiresAt };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    if (code === "balance_not_initialized") {
      return fail("초기 잔고가 없는 회원입니다. 먼저 크레딧을 지급해주세요.");
    }
    console.error("[setMemberCreditExpiry] failed", { memberId, adminId, err });
    return fail("소멸 예정일 변경 중 오류가 발생했습니다.");
  }
}

export async function setMemberCreditExpiry(input: {
  memberId: string;
  expiresAt: string;
  reason: string;
}): Promise<ActionResult<{ expiresAt: string }>> {
  const session = await requireAdminAuth("SUPER_ADMIN");
  const res = await setOneMemberCreditExpiry(input, session.adminId);
  if (res.success) {
    revalidatePath(`/admin/members/${input.memberId}`);
    revalidatePath("/admin/members");
  }
  return res;
}

export interface BulkCreditItemResult {
  memberId: string;
  memberName: string | null;
  success: boolean;
  error?: string;
}

export async function setMembersCreditExpiry(input: {
  memberIds: string[];
  expiresAt: string;
  reason: string;
}): Promise<
  ActionResult<{ results: BulkCreditItemResult[]; succeeded: number; failed: number }>
> {
  const session = await requireAdminAuth("SUPER_ADMIN");
  const memberIds = [...new Set(input.memberIds)].filter(
    (id) => typeof id === "string" && id.length > 0,
  );
  if (memberIds.length === 0) return fail("선택된 회원이 없습니다.");
  if (memberIds.length > MAX_BULK_MEMBERS) {
    return fail(`한 번에 최대 ${MAX_BULK_MEMBERS}명까지 처리할 수 있습니다.`);
  }

  const results: BulkCreditItemResult[] = [];
  for (const memberId of memberIds) {
    const res = await setOneMemberCreditExpiry(
      { memberId, expiresAt: input.expiresAt, reason: input.reason },
      session.adminId,
    );
    results.push(
      res.success
        ? { memberId, memberName: res.memberName, success: true }
        : { memberId, memberName: null, success: false, error: res.error },
    );
  }

  const succeeded = results.filter((r) => r.success).length;
  revalidatePath("/admin/members");
  return { success: true, results, succeeded, failed: results.length - succeeded };
}

// ─── Force-wipe balance ──────────────────────────────────────────────────────

const wipeSchema = z.object({
  memberId: z.string().min(1),
  reason: reasonSchema,
});

export async function wipeOneMemberCredits(
  input: { memberId: string; reason: string },
  adminId: string,
): Promise<ActionResult<{ memberName: string; wiped: number }>> {
  const parsed = wipeSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { memberId, reason } = parsed.data;

  const resolved = await resolveDirectorAcademy(memberId);
  if (!resolved.ok) return fail(resolved.error);
  const { staff } = resolved;

  try {
    const wiped = await prisma.$transaction(
      async (tx) => {
        // Zero balance + bonus + clock in one guarded statement; RETURNING the
        // pre-wipe balance so the ledger amount is exact and race-consistent.
        const rows = await tx.$queryRaw<Array<{ old_balance: number }>>`
          WITH target AS (
            SELECT "academyId", balance AS old_balance
            FROM credit_balances
            WHERE "academyId" = ${staff.academyId}
            FOR UPDATE
          )
          UPDATE credit_balances cb
          SET balance = 0, "bonusCredits" = 0, "expiresAt" = NULL, "updatedAt" = NOW()
          FROM target
          WHERE cb."academyId" = target."academyId"
          RETURNING target.old_balance AS old_balance
        `;
        if (rows.length === 0) throw new Error("balance_not_initialized");
        const oldBalance = rows[0].old_balance;

        await tx.creditTransaction.create({
          data: {
            academyId: staff.academyId,
            type: "ADJUSTMENT",
            amount: -oldBalance,
            balanceAfter: 0,
            description: reason,
            adminId,
            referenceType: "ADMIN_WIPE",
          },
        });
        return oldBalance;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );

    return { success: true, memberName: staff.name, wiped };
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown_error";
    if (code === "balance_not_initialized") {
      return fail("초기 잔고가 없는 회원입니다.");
    }
    console.error("[wipeMemberCredits] failed", { memberId, adminId, err });
    return fail("크레딧 소멸 처리 중 오류가 발생했습니다.");
  }
}

export async function wipeMemberCredits(input: {
  memberId: string;
  reason: string;
}): Promise<ActionResult<{ wiped: number }>> {
  const session = await requireAdminAuth("SUPER_ADMIN");
  const res = await wipeOneMemberCredits(input, session.adminId);
  if (res.success) {
    revalidatePath(`/admin/members/${input.memberId}`);
    revalidatePath("/admin/members");
  }
  return res;
}

export async function wipeMembersCredits(input: {
  memberIds: string[];
  reason: string;
}): Promise<
  ActionResult<{ results: BulkCreditItemResult[]; succeeded: number; failed: number }>
> {
  const session = await requireAdminAuth("SUPER_ADMIN");
  const memberIds = [...new Set(input.memberIds)].filter(
    (id) => typeof id === "string" && id.length > 0,
  );
  if (memberIds.length === 0) return fail("선택된 회원이 없습니다.");
  if (memberIds.length > MAX_BULK_MEMBERS) {
    return fail(`한 번에 최대 ${MAX_BULK_MEMBERS}명까지 처리할 수 있습니다.`);
  }

  const results: BulkCreditItemResult[] = [];
  for (const memberId of memberIds) {
    const res = await wipeOneMemberCredits(
      { memberId, reason: input.reason },
      session.adminId,
    );
    results.push(
      res.success
        ? { memberId, memberName: res.memberName, success: true }
        : { memberId, memberName: null, success: false, error: res.error },
    );
  }

  const succeeded = results.filter((r) => r.success).length;
  revalidatePath("/admin/members");
  return { success: true, results, succeeded, failed: results.length - succeeded };
}
