"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { type ActionResult, fail } from "./_shared";

// ============================================================================
// 6. Update member (academy) memo — internal admin notes
// ============================================================================
// The memo lives on the Academy the director belongs to, so it is shared across
// any DIRECTOR of that academy and surfaced on the 회원 관리 list + detail.

const MAX_MEMO_LENGTH = 5000;

const memoSchema = z.object({
  memberId: z.string().min(1),
  memo: z
    .string()
    .max(MAX_MEMO_LENGTH, `메모는 ${MAX_MEMO_LENGTH}자 이하로 입력해주세요.`),
});

export async function updateMemberMemo(input: {
  memberId: string;
  memo: string;
}): Promise<ActionResult> {
  await requireAdminAuth();

  const parsed = memoSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  const staff = await prisma.staff.findUnique({
    where: { id: parsed.data.memberId },
    select: { role: true, academyId: true },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다.");
  if (staff.role !== "DIRECTOR") return fail("원장 회원만 메모할 수 있습니다.");

  // Empty/whitespace-only memo is stored as NULL so the list preview cleanly
  // hides rather than rendering a blank line.
  const trimmed = parsed.data.memo.trim();

  try {
    await prisma.academy.update({
      where: { id: staff.academyId },
      data: { memo: trimmed.length > 0 ? trimmed : null },
    });
  } catch (err) {
    console.error("[updateMemberMemo] failed", {
      memberId: parsed.data.memberId,
      err,
    });
    return fail("메모 저장 중 오류가 발생했습니다.");
  }

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath(`/admin/members`);
  return { success: true };
}
