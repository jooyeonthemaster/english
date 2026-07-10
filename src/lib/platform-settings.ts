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
export const MANUAL_SECTION_VISIBILITY_KEY = "manual_section_visibility";
export const LANDING_BANNER_KEY = "landing_banner";

/** 헤더 배너 하나의 내용(편집 폼 필드). */
export interface LandingBannerConfig {
  enabled: boolean;
  text: string;
  href: string;
  ctaLabel: string;
}

/** 저장·정렬 단위. 배열 순서 = 노출 우선순위. */
export interface LandingBannerItem extends LandingBannerConfig {
  id: string;
}

/** 임의 raw 값을 헤더 배너 아이템으로 정규화. id 없으면 생성. */
function normalizeLandingBanner(v: Partial<LandingBannerItem>): LandingBannerItem {
  return {
    id: (v.id ?? "").trim() || `ban_${Math.random().toString(36).slice(2, 10)}`,
    enabled: !!v.enabled,
    text: (v.text ?? "").trim(),
    href: (v.href ?? "").trim() || "/seminar",
    ctaLabel: (v.ctaLabel ?? "").trim() || "신청하기",
  };
}

/** 배너에 실제 노출할 내용이 있는지(문구 필수). */
export function landingBannerHasContent(b: LandingBannerConfig): boolean {
  return !!b.text.trim();
}

/**
 * 랜딩 최상단 헤더 배너 전체 목록(관리자 편집용). 배열 순서 = 우선순위.
 * 구(舊) 단일 객체 저장분은 1개짜리 배열로 승계한다.
 */
export async function getLandingBanners(): Promise<LandingBannerItem[]> {
  const raw = await getPlatformSetting(LANDING_BANNER_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((v): v is Partial<LandingBannerItem> => !!v && typeof v === "object")
      .map(normalizeLandingBanner);
  } catch {
    return [];
  }
}

/** 랜딩에 실제 노출할 헤더 배너 1개(활성 + 내용 있음, 최상위 우선순위). 없으면 null. */
export async function getActiveLandingBanner(): Promise<LandingBannerItem | null> {
  const all = await getLandingBanners();
  return all.find((b) => b.enabled && landingBannerHasContent(b)) ?? null;
}

export const LANDING_POPUP_KEY = "landing_popup";

/** 팝업 하나의 내용(편집 폼 필드). */
export interface LandingPopupConfig {
  enabled: boolean;
  eyebrow: string;
  title: string;
  text: string;
  imageUrl: string;
  href: string;
  ctaLabel: string;
}

/** 저장·정렬 단위. 배열 순서 = 노출 우선순위. */
export interface LandingPopupItem extends LandingPopupConfig {
  id: string;
}

/** 임의 raw 값을 팝업 아이템으로 정규화. id 없으면 생성. */
function normalizeLandingPopup(v: Partial<LandingPopupItem>): LandingPopupItem {
  return {
    id: (v.id ?? "").trim() || `pop_${Math.random().toString(36).slice(2, 10)}`,
    enabled: !!v.enabled,
    eyebrow: (v.eyebrow ?? "").trim(),
    title: (v.title ?? "").trim(),
    text: (v.text ?? "").trim(),
    imageUrl: (v.imageUrl ?? "").trim(),
    href: (v.href ?? "").trim(),
    ctaLabel: (v.ctaLabel ?? "").trim() || "자세히 보기",
  };
}

/** 팝업에 실제 노출할 내용이 있는지(제목·문구·이미지 중 하나). */
export function landingPopupHasContent(p: LandingPopupConfig): boolean {
  return !!(p.title.trim() || p.text.trim() || p.imageUrl.trim());
}

/**
 * 랜딩 진입 팝업 배너 전체 목록(관리자 편집용). 배열 순서 = 우선순위.
 * 구(舊) 단일 객체 저장분은 1개짜리 배열로 승계한다.
 */
export async function getLandingPopups(): Promise<LandingPopupItem[]> {
  const raw = await getPlatformSetting(LANDING_POPUP_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter((v): v is Partial<LandingPopupItem> => !!v && typeof v === "object")
      .map(normalizeLandingPopup);
  } catch {
    return [];
  }
}

/** 랜딩에 실제 노출할 팝업만(활성 + 내용 있음), 우선순위 순서 유지. */
export async function getActiveLandingPopups(): Promise<LandingPopupItem[]> {
  const all = await getLandingPopups();
  return all.filter((p) => p.enabled && landingPopupHasContent(p));
}

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

export type ManualSectionVisibilityMap = Record<string, boolean>;

function normalizeManualSectionVisibility(value: unknown): ManualSectionVisibilityMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const normalized: ManualSectionVisibilityMap = {};
  for (const [slug, visible] of Object.entries(raw)) {
    if (/^[a-z0-9-]{1,80}$/i.test(slug) && typeof visible === "boolean") {
      normalized[slug] = visible;
    }
  }
  return normalized;
}

/** 정적 매뉴얼 목차별 노출 여부. 미설정 항목은 공개(true)로 취급한다. */
export async function getManualSectionVisibility(): Promise<ManualSectionVisibilityMap> {
  const raw = await getPlatformSetting(MANUAL_SECTION_VISIBILITY_KEY);
  if (!raw) return {};
  try {
    return normalizeManualSectionVisibility(JSON.parse(raw) as unknown);
  } catch {
    return {};
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
