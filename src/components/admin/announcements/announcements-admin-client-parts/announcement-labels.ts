import type { StatusMeta, Tone } from "@/lib/admin-labels";
import {
  ALL_ANNOUNCEMENT_ROLES,
  CATEGORY_LABELS,
  ROLE_LABELS,
  SOURCE_TYPE_LABELS,
  parseAnnouncementAudiences,
  type AnnouncementCategory,
  type AnnouncementSourceType,
} from "@/lib/announcements/shared";

// 스모트 소식 목록·필터에서 쓰는 라벨·색조.
// 공지 도메인 라벨의 원본은 lib/announcements/shared 이고, 여기서는 관리자 뱃지용 색조(Tone)만 덧붙인다.

export const CATEGORY_FILTERS: ReadonlyArray<{
  key: "ALL" | AnnouncementCategory;
  label: string;
}> = [
  { key: "ALL", label: "전체" },
  { key: "UPDATE", label: CATEGORY_LABELS.UPDATE },
  { key: "MAINTENANCE", label: CATEGORY_LABELS.MAINTENANCE },
  { key: "EVENT", label: CATEGORY_LABELS.EVENT },
  { key: "GENERAL", label: CATEGORY_LABELS.GENERAL },
];

// 노출 체계: 이용자에게 보이면 "노출 중"(PUBLISHED), 아니면 "미노출"(DRAFT·ARCHIVED).
export type VisibilityFilter = "ALL" | "VISIBLE" | "HIDDEN";
export const VISIBILITY_FILTERS: ReadonlyArray<{ key: VisibilityFilter; label: string }> = [
  { key: "ALL", label: "노출 전체" },
  { key: "VISIBLE", label: "노출 중" },
  { key: "HIDDEN", label: "미노출" },
];

const CATEGORY_TONE: Record<AnnouncementCategory, Tone> = {
  UPDATE: "blue",
  MAINTENANCE: "amber",
  EVENT: "violet",
  GENERAL: "gray",
};

/** 카테고리 뱃지 — 라벨은 도메인 원본, 색조만 여기서. */
export function categoryStatus(category: string): StatusMeta {
  const key = category as AnnouncementCategory;
  return { label: CATEGORY_LABELS[key] ?? category, tone: CATEGORY_TONE[key] ?? "gray" };
}

const SOURCE_TONE: Partial<Record<AnnouncementSourceType, Tone>> = {
  RELEASE: "sky",
  AUTO: "violet",
};

/** 작성 방식 뱃지 — 직접 작성(MANUAL)은 표시하지 않는다. */
export function sourceStatus(sourceType: string): StatusMeta | null {
  if (sourceType === "MANUAL") return null;
  const key = sourceType as AnnouncementSourceType;
  return { label: SOURCE_TYPE_LABELS[key] ?? sourceType, tone: SOURCE_TONE[key] ?? "gray" };
}

/** 이용자에게 노출되는 상태인지. */
export function isVisible(status: string): boolean {
  return status === "PUBLISHED";
}

export function audienceLabel(audiences: string): string {
  const roles = parseAnnouncementAudiences(audiences);
  if (roles.length === ALL_ANNOUNCEMENT_ROLES.length) return "전체";
  return roles.map((r) => ROLE_LABELS[r]).join("·");
}

/** 공지 본문을 배너 문구용으로 정리(마크다운 기호 제거, 앞 몇 줄만). */
export function bannerBodyFromContent(content: string): string {
  return content
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s*[-*•]\s+/, "· ")
        .replace(/^#{1,6}\s+/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 4)
    .join("\n")
    .slice(0, 300);
}
