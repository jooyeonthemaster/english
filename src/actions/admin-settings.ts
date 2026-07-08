"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import {
  SIGNUP_CREDITS_KEY,
  SEMINAR_HERO_IMAGE_KEY,
  MANUAL_PDF_KEY,
  getSignupCredits,
  getSeminarHeroImageUrl,
  getManualPdf,
} from "@/lib/platform-settings";

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

/** 원장 1:1 세미나 신청 히어로 이미지 URL(미설정 시 null). */
export async function getSeminarHeroImage(): Promise<string | null> {
  await requireAdminAuth();
  return getSeminarHeroImageUrl();
}

/** 원장 1:1 세미나 신청 히어로 이미지 설정 — null/빈 값이면 제거(플레이스홀더로 복귀). */
export async function setSeminarHeroImage(
  url: string | null,
): Promise<Result<{ url: string | null }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return { success: false, error: "권한이 없습니다." };
  }
  const value = url?.trim() ?? "";
  if (value && !/^https?:\/\//i.test(value)) {
    return { success: false, error: "http(s) URL만 저장할 수 있습니다." };
  }
  if (value.length > 2000) {
    return { success: false, error: "URL이 너무 깁니다." };
  }
  try {
    if (value) {
      await prisma.platformSetting.upsert({
        where: { key: SEMINAR_HERO_IMAGE_KEY },
        create: { key: SEMINAR_HERO_IMAGE_KEY, value },
        update: { value },
      });
    } else {
      await prisma.platformSetting.deleteMany({
        where: { key: SEMINAR_HERO_IMAGE_KEY },
      });
    }
    revalidatePath("/director/help/seminar");
    revalidatePath("/admin/seminars");
    return { success: true, url: value || null };
  } catch {
    return { success: false, error: "저장에 실패했습니다." };
  }
}

/** 원장 사용 매뉴얼 PDF(미설정 시 null). */
export async function getManualPdfSetting(): Promise<{ url: string; updatedAt: Date } | null> {
  await requireAdminAuth();
  return getManualPdf();
}

/** 원장 사용 매뉴얼 PDF 설정 — null/빈 값이면 제거(원장 페이지에 "준비 중" 표시). */
export async function setManualPdfUrl(
  url: string | null,
): Promise<Result<{ url: string | null }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return { success: false, error: "권한이 없습니다." };
  }
  const value = url?.trim() ?? "";
  if (value && !/^https?:\/\//i.test(value)) {
    return { success: false, error: "http(s) URL만 저장할 수 있습니다." };
  }
  if (value.length > 2000) {
    return { success: false, error: "URL이 너무 깁니다." };
  }
  try {
    if (value) {
      await prisma.platformSetting.upsert({
        where: { key: MANUAL_PDF_KEY },
        create: { key: MANUAL_PDF_KEY, value },
        update: { value },
      });
    } else {
      await prisma.platformSetting.deleteMany({
        where: { key: MANUAL_PDF_KEY },
      });
    }
    revalidatePath("/director/help/manual");
    revalidatePath("/admin/manual");
    return { success: true, url: value || null };
  } catch {
    return { success: false, error: "저장에 실패했습니다." };
  }
}
