// ============================================================================
// Global platform settings (key-value). Server-only — imports prisma.
//
// Currently holds the default signup credit grant, which used to be the
// hardcoded SIGNUP_CREDITS constant. The constant remains the fallback default
// so a missing/blank row behaves exactly as before.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { SIGNUP_CREDITS } from "@/lib/feedback-program";

export const SIGNUP_CREDITS_KEY = "signup_credits";
export const SEMINAR_HERO_IMAGE_KEY = "seminar_hero_image_url";
export const MANUAL_PDF_KEY = "manual_pdf_url";

/** Read a raw setting value; null when unset. */
export async function getPlatformSetting(key: string): Promise<string | null> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** 원장 사용 매뉴얼 PDF — 미설정이면 null(원장 페이지에 "준비 중" 표시). */
export async function getManualPdf(): Promise<{ url: string; updatedAt: Date } | null> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: MANUAL_PDF_KEY } });
    const url = row?.value?.trim();
    if (!url) return null;
    return { url, updatedAt: row!.updatedAt };
  } catch {
    return null;
  }
}

/** 원장 1:1 세미나 신청 히어로 커버 이미지 URL — 미설정이면 null(브랜드 플레이스홀더 표시). */
export async function getSeminarHeroImageUrl(): Promise<string | null> {
  const raw = await getPlatformSetting(SEMINAR_HERO_IMAGE_KEY);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** Default credits granted to a brand-new self-signup academy (DB-configurable). */
export async function getSignupCredits(): Promise<number> {
  const raw = await getPlatformSetting(SIGNUP_CREDITS_KEY);
  if (raw !== null) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return SIGNUP_CREDITS;
}
