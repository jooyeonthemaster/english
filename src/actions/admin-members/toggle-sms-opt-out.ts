"use server";

// ============================================================================
// 회원(=학원) SMS 발송 제외 토글.
// 이미 주기적으로 피드백을 주는 영어 선생님 등, 문자 발송 대상에서 빼고 싶은
// 회원을 관리자가 목록에서 바로 체크/해제한다. 별도 스키마 변경 없이
// academy_feature_flags(키: OUTREACH_SMS_OPT_OUT)에 upsert 한다.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { revalidatePath } from "next/cache";
import { SMS_OPT_OUT_FLAG_KEY, fail, type ActionResult } from "./_shared";

export async function toggleMemberSmsOptOut(input: {
  memberId: string;
  optOut: boolean;
}): Promise<ActionResult<{ optOut: boolean }>> {
  const session = await requireAdminAuth();

  const memberId = input.memberId?.trim();
  if (!memberId) return fail("회원 ID가 필요합니다");

  const staff = await prisma.staff.findUnique({
    where: { id: memberId },
    select: { academyId: true, role: true },
  });
  if (!staff) return fail("회원을 찾을 수 없습니다");

  await prisma.academyFeatureFlag.upsert({
    where: {
      academyId_key: { academyId: staff.academyId, key: SMS_OPT_OUT_FLAG_KEY },
    },
    create: {
      academyId: staff.academyId,
      key: SMS_OPT_OUT_FLAG_KEY,
      enabled: input.optOut,
      updatedById: session.adminId ?? null,
    },
    update: {
      enabled: input.optOut,
      updatedById: session.adminId ?? null,
    },
  });

  // 목록(검색 등)과 상세를 서버 데이터와 동기화
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);

  return { success: true, optOut: input.optOut };
}
