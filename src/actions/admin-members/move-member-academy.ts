"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { type ActionResult, fail } from "./_shared";

// ============================================================================
// 회원(원장) 강제 재그룹핑 — staff.academyId 를 다른 학원으로 이동한다.
// SUPER_ADMIN 전용. 크레딧은 학원 단위 지갑이므로 이동 후 회원은 대상 학원의
// 지갑을 공유하게 되며, 기존에 만든 콘텐츠(지문/문제 등 academyId 스코프)는
// 원 학원에 남는다(이관하지 않음). 관리자가 의도적으로 강제 이동하는 용도.
// ============================================================================

const schema = z.object({
  memberId: z.string().min(1),
  targetAcademyId: z.string().min(1),
});

export async function moveMemberAcademy(input: {
  memberId: string;
  targetAcademyId: string;
}): Promise<
  ActionResult<{ memberName: string; fromAcademyName: string; toAcademyName: string }>
> {
  await requireAdminAuth("SUPER_ADMIN");

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { memberId, targetAcademyId } = parsed.data;

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, academyId: true, academy: { select: { name: true } } },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다.");
  if (staff.academyId === targetAcademyId) {
    return fail("이미 해당 학원에 소속되어 있습니다.");
  }

  const target = await prisma.academy.findUnique({
    where: { id: targetAcademyId },
    select: { id: true, name: true },
  });
  if (!target) return fail("이동할 학원을 찾을 수 없습니다.");

  await prisma.staff.update({
    where: { id: memberId },
    data: { academyId: targetAcademyId },
  });

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);

  return {
    success: true,
    memberName: staff.name,
    fromAcademyName: staff.academy.name,
    toAcademyName: target.name,
  };
}
