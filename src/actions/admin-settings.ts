"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import { SIGNUP_CREDITS_KEY, getSignupCredits } from "@/lib/platform-settings";

type Result<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

/** Current default signup credit grant (DB value, or the built-in fallback). */
export async function getSignupCreditAmount(): Promise<number> {
  await requireAdminAuth();
  return getSignupCredits();
}

/** Update the default signup credit grant. Applies immediately to new signups. */
export async function setSignupCreditAmount(amount: number): Promise<Result<{ value: number }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return { success: false, error: "권한이 없습니다." };
  }
  if (!Number.isInteger(amount) || amount < 0 || amount > 1_000_000) {
    return { success: false, error: "0 이상 1,000,000 이하의 정수를 입력하세요." };
  }
  try {
    await prisma.platformSetting.upsert({
      where: { key: SIGNUP_CREDITS_KEY },
      create: { key: SIGNUP_CREDITS_KEY, value: String(amount) },
      update: { value: String(amount) },
    });
    revalidatePath("/admin/members");
    return { success: true, value: amount };
  } catch {
    return { success: false, error: "저장에 실패했습니다." };
  }
}
