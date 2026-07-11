"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdminAuth } from "@/lib/auth-admin";
import { isSuperAdmin } from "@/actions/admin-members/_shared";
import {
  SIGNUP_CREDITS_KEY,
  SEMINAR_HERO_IMAGE_KEY,
  MANUAL_PDF_KEY,
  MANUAL_SECTION_VISIBILITY_KEY,
  LANDING_BANNER_KEY,
  LANDING_POPUP_KEY,
  getSignupCredits,
  getSeminarHeroImageUrl,
  getManualPdf,
  getManualSectionVisibility,
  getLandingBanners,
  landingBannerHasContent,
  getLandingPopups,
  landingPopupHasContent,
  type ManualSectionVisibilityMap,
  type LandingBannerItem,
  type LandingPopupItem,
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

/** 랜딩 최상단 헤더 배너 전체 목록 조회(관리자 배너 관리용). 우선순위 순서. */
export async function getLandingBannersSetting(): Promise<LandingBannerItem[]> {
  await requireAdminAuth();
  return getLandingBanners();
}

/**
 * 랜딩 최상단 헤더 배너 목록 저장(우선순위 = 배열 순서). SUPER_ADMIN 전용. 랜딩(/)에 즉시 반영.
 * 실제 노출은 활성+내용 있는 최상위 1개. 추가·수정·삭제·정렬·활성토글 모두 전체 목록을 넘겨 저장한다.
 */
export async function setLandingBanners(input: LandingBannerItem[]): Promise<Result> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return { success: false, error: "권한이 없습니다." };
  }
  if (!Array.isArray(input)) {
    return { success: false, error: "잘못된 요청입니다." };
  }
  if (input.length > 20) {
    return { success: false, error: "배너는 최대 20개까지 만들 수 있어요." };
  }
  const cleaned: LandingBannerItem[] = [];
  for (const raw of input) {
    const id = (raw.id ?? "").trim() || `ban_${Math.random().toString(36).slice(2, 10)}`;
    const text = (raw.text ?? "").trim();
    const href = (raw.href ?? "").trim() || "/seminar";
    const ctaLabel = (raw.ctaLabel ?? "").trim() || "신청하기";
    if (text.length > 200 || href.length > 1000 || ctaLabel.length > 30) {
      return { success: false, error: "입력이 너무 깁니다." };
    }
    const item: LandingBannerItem = { id, enabled: !!raw.enabled, text, href, ctaLabel };
    if (item.enabled && !landingBannerHasContent(item)) {
      return { success: false, error: "활성 배너는 문구를 입력해야 합니다." };
    }
    cleaned.push(item);
  }
  const value = JSON.stringify(cleaned);
  try {
    await prisma.platformSetting.upsert({
      where: { key: LANDING_BANNER_KEY },
      create: { key: LANDING_BANNER_KEY, value },
      update: { value },
    });
    revalidatePath("/");
    revalidatePath("/admin/banners");
    return { success: true };
  } catch {
    return { success: false, error: "저장에 실패했습니다." };
  }
}

/** 랜딩 진입 팝업 배너 전체 목록 조회(관리자 배너 관리용). 우선순위 순서. */
export async function getLandingPopupsSetting(): Promise<LandingPopupItem[]> {
  await requireAdminAuth();
  return getLandingPopups();
}

/**
 * 랜딩 진입 팝업 배너 목록 저장(우선순위 = 배열 순서). SUPER_ADMIN 전용. 랜딩(/)에 즉시 반영.
 * 추가·수정·삭제·정렬·활성토글 모두 전체 목록을 통째로 넘겨 저장한다.
 */
export async function setLandingPopups(input: LandingPopupItem[]): Promise<Result> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return { success: false, error: "권한이 없습니다." };
  }
  if (!Array.isArray(input)) {
    return { success: false, error: "잘못된 요청입니다." };
  }
  if (input.length > 20) {
    return { success: false, error: "팝업은 최대 20개까지 만들 수 있어요." };
  }
  const cleaned: LandingPopupItem[] = [];
  for (const raw of input) {
    const id = (raw.id ?? "").trim() || `pop_${Math.random().toString(36).slice(2, 10)}`;
    const eyebrow = (raw.eyebrow ?? "").trim();
    const title = (raw.title ?? "").trim();
    const text = (raw.text ?? "").trim();
    const imageUrl = (raw.imageUrl ?? "").trim();
    const href = (raw.href ?? "").trim();
    const ctaLabel = (raw.ctaLabel ?? "").trim() || "자세히 보기";
    if (
      eyebrow.length > 30 ||
      title.length > 80 ||
      text.length > 500 ||
      imageUrl.length > 2000 ||
      href.length > 1000
    ) {
      return { success: false, error: "입력이 너무 깁니다." };
    }
    const item: LandingPopupItem = { id, enabled: !!raw.enabled, eyebrow, title, text, imageUrl, href, ctaLabel };
    if (item.enabled && !landingPopupHasContent(item)) {
      return { success: false, error: "활성 팝업은 제목·문구·이미지 중 하나를 입력해야 합니다." };
    }
    cleaned.push(item);
  }
  const value = JSON.stringify(cleaned);
  try {
    await prisma.platformSetting.upsert({
      where: { key: LANDING_POPUP_KEY },
      create: { key: LANDING_POPUP_KEY, value },
      update: { value },
    });
    revalidatePath("/");
    revalidatePath("/admin/banners");
    return { success: true };
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

/** 정적 사용 매뉴얼 목차별 노출 설정 조회. 미설정 항목은 공개(true)로 취급한다. */
export async function getManualSectionVisibilitySetting(): Promise<ManualSectionVisibilityMap> {
  await requireAdminAuth();
  return getManualSectionVisibility();
}

/** 정적 사용 매뉴얼 목차별 노출 설정 저장. SUPER_ADMIN 전용. */
export async function setManualSectionVisibility(
  input: ManualSectionVisibilityMap,
): Promise<Result<{ visibility: ManualSectionVisibilityMap }>> {
  const session = await requireAdminAuth("SUPER_ADMIN").catch(() => null);
  if (!session || !isSuperAdmin(session)) {
    return { success: false, error: "권한이 없습니다." };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { success: false, error: "잘못된 요청입니다." };
  }

  const entries = Object.entries(input);
  if (entries.length > 100) {
    return { success: false, error: "저장할 항목이 너무 많습니다." };
  }

  const cleaned: ManualSectionVisibilityMap = {};
  for (const [slug, visible] of entries) {
    if (!/^[a-z0-9-]{1,80}$/i.test(slug)) {
      return { success: false, error: "잘못된 매뉴얼 항목이 포함되어 있습니다." };
    }
    if (typeof visible !== "boolean") {
      return { success: false, error: "노출 설정 값이 올바르지 않습니다." };
    }
    cleaned[slug] = visible;
  }

  try {
    const hasHiddenSection = Object.values(cleaned).some((visible) => !visible);
    if (hasHiddenSection) {
      await prisma.platformSetting.upsert({
        where: { key: MANUAL_SECTION_VISIBILITY_KEY },
        create: { key: MANUAL_SECTION_VISIBILITY_KEY, value: JSON.stringify(cleaned) },
        update: { value: JSON.stringify(cleaned) },
      });
    } else {
      await prisma.platformSetting.deleteMany({
        where: { key: MANUAL_SECTION_VISIBILITY_KEY },
      });
    }
    revalidatePath("/director/help/manual");
    revalidatePath("/admin/manual");
    return { success: true, visibility: hasHiddenSection ? cleaned : {} };
  } catch {
    return { success: false, error: "저장에 실패했습니다." };
  }
}
