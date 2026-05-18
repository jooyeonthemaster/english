"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { type ActionResult, fail } from "./_shared";

// ============================================================================
// 5. Toggle member active state (audit-logged, SUPER_ADMIN only)
// ============================================================================

const toggleSchema = z.object({
  memberId: z.string().min(1),
  isActive: z.boolean(),
  reason: z
    .string()
    .trim()
    .min(5, "사유는 5자 이상 입력해주세요.")
    .max(500, "사유는 500자 이하로 입력해주세요."),
});

export async function toggleMemberActive(input: {
  memberId: string;
  isActive: boolean;
  reason: string;
}): Promise<ActionResult> {
  const session = await requireAdminAuth("SUPER_ADMIN");

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  const staff = await prisma.staff.findUnique({
    where: { id: parsed.data.memberId },
    select: { id: true, role: true, isActive: true },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다.");
  if (staff.role !== "DIRECTOR") return fail("원장 회원만 조정 가능합니다.");

  // No-op guard: don't write audit rows for "set active=true on already-active".
  if (staff.isActive === parsed.data.isActive) {
    return fail(
      parsed.data.isActive
        ? "이미 활성 상태입니다."
        : "이미 비활성 상태입니다.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: staff.id },
        data: { isActive: parsed.data.isActive },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId: session.adminId,
          targetType: "MEMBER",
          targetId: staff.id,
          action: parsed.data.isActive ? "MEMBER_ACTIVATE" : "MEMBER_DEACTIVATE",
          reason: parsed.data.reason,
          beforeJson: JSON.stringify({ isActive: staff.isActive }),
          afterJson: JSON.stringify({ isActive: parsed.data.isActive }),
        },
      });
    });
  } catch (err) {
    console.error("[toggleMemberActive] failed", {
      memberId: staff.id,
      adminId: session.adminId,
      err,
    });
    return fail("상태 변경 중 오류가 발생했습니다.");
  }

  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  revalidatePath(`/admin/members`);
  return { success: true };
}
