"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAuth } from "@/lib/auth-admin";
import { adjustOneMemberCredits } from "./adjust-member-credits";
import { type ActionResult, fail } from "./_shared";

// ============================================================================
// Bulk credit adjustment — apply the SAME amount + reason to many members at
// once (선택 회원 일괄 조정). Each member runs in its own transaction via
// adjustOneMemberCredits so one failure (e.g. 차감 시 잔고 부족) doesn't roll
// back the others; per-member outcomes are aggregated and returned so the UI
// can report "N명 성공 · M명 실패" and list the failures. SUPER_ADMIN only
// (same gate as the single-member action).
// ============================================================================

// Guardrail so a runaway selection can't kick off thousands of transactions in
// one request. Admin selections are realistically in the tens; 500 is generous.
const MAX_BULK_MEMBERS = 500;

export interface BulkAdjustItemResult {
  memberId: string;
  memberName: string | null;
  success: boolean;
  balanceAfter?: number;
  error?: string;
}

export async function adjustMembersCredits(input: {
  memberIds: string[];
  amount: number;
  reason: string;
}): Promise<
  ActionResult<{
    results: BulkAdjustItemResult[];
    succeeded: number;
    failed: number;
  }>
> {
  const session = await requireAdminAuth("SUPER_ADMIN");

  // De-dupe defensively so a repeated id can't be adjusted twice.
  const memberIds = [...new Set(input.memberIds)].filter(
    (id) => typeof id === "string" && id.length > 0,
  );
  if (memberIds.length === 0) {
    return fail("선택된 회원이 없습니다.");
  }
  if (memberIds.length > MAX_BULK_MEMBERS) {
    return fail(`한 번에 최대 ${MAX_BULK_MEMBERS}명까지 조정할 수 있습니다.`);
  }

  const results: BulkAdjustItemResult[] = [];
  // Sequential: keeps within the DB connection pool and avoids serialization
  // storms on the same credit_balances rows. Selection sizes are modest.
  for (const memberId of memberIds) {
    const res = await adjustOneMemberCredits(
      { memberId, amount: input.amount, reason: input.reason },
      session.adminId,
    );
    results.push(
      res.success
        ? {
            memberId,
            memberName: res.memberName,
            success: true,
            balanceAfter: res.balanceAfter,
          }
        : { memberId, memberName: null, success: false, error: res.error },
    );
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  revalidatePath("/admin/members");

  return { success: true, results, succeeded, failed };
}
