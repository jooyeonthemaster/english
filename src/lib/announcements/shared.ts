/**
 * 스모트 소식(플랫폼 공지) 공용 메타데이터 — 서버(액션/instrumentation)와
 * 클라이언트(어드민 편집기·각 앱 리더) 양쪽에서 import 한다.
 *
 * React·서버 전용 import 를 두지 않는다(SiteBanner templates.ts 와 동일 규약).
 */

// ── 카테고리 ──────────────────────────────────────────────────────────────────

export type AnnouncementCategory = "UPDATE" | "MAINTENANCE" | "EVENT" | "GENERAL";

export const ANNOUNCEMENT_CATEGORIES: AnnouncementCategory[] = [
  "UPDATE",
  "MAINTENANCE",
  "EVENT",
  "GENERAL",
];

export const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  UPDATE: "업데이트",
  MAINTENANCE: "점검 안내",
  EVENT: "이벤트",
  GENERAL: "일반 소식",
};

/** 카테고리별 배지 색 — Tailwind 클래스(연한 배경 + 진한 글자). */
export const CATEGORY_BADGE_CLASS: Record<AnnouncementCategory, string> = {
  UPDATE: "bg-blue-50 text-blue-600",
  MAINTENANCE: "bg-amber-50 text-amber-700",
  EVENT: "bg-violet-50 text-violet-600",
  GENERAL: "bg-slate-100 text-slate-600",
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value as AnnouncementCategory] ?? value;
}

export function isAnnouncementCategory(v: string): v is AnnouncementCategory {
  return (ANNOUNCEMENT_CATEGORIES as string[]).includes(v);
}

// ── 상태 ──────────────────────────────────────────────────────────────────────

export type AnnouncementStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export const ANNOUNCEMENT_STATUSES: AnnouncementStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
];

export const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  DRAFT: "초안",
  PUBLISHED: "발행됨",
  ARCHIVED: "보관됨",
};

export function statusLabel(value: string): string {
  return STATUS_LABELS[value as AnnouncementStatus] ?? value;
}

// ── 발행 출처 ─────────────────────────────────────────────────────────────────

export type AnnouncementSourceType = "MANUAL" | "RELEASE" | "AUTO";

export const SOURCE_TYPE_LABELS: Record<AnnouncementSourceType, string> = {
  MANUAL: "직접 작성",
  RELEASE: "자동 발행",
  AUTO: "AI 초안",
};

// ── 노출 대상(audiences) ──────────────────────────────────────────────────────
// SiteBanner 와 동일하게 콤마 조인 문자열로 저장하되, 학부모까지 포함하고
// 특수값 "ALL"(전체)을 지원한다.

export type AnnouncementRole = "DIRECTOR" | "TEACHER" | "STUDENT" | "PARENT";

export const ALL_ANNOUNCEMENT_ROLES: AnnouncementRole[] = [
  "DIRECTOR",
  "TEACHER",
  "STUDENT",
  "PARENT",
];

export const ROLE_LABELS: Record<AnnouncementRole, string> = {
  DIRECTOR: "원장",
  TEACHER: "강사",
  STUDENT: "학생",
  PARENT: "학부모",
};

/**
 * audiences 컬럼 값을 역할 목록으로 파싱한다.
 * "ALL"(또는 비어 있음) → 전체 역할. 그 외에는 콤마 조인 토큰만.
 */
export function parseAnnouncementAudiences(
  value: string | null | undefined,
): AnnouncementRole[] {
  if (!value || value.trim() === "" || value.trim().toUpperCase() === "ALL") {
    return [...ALL_ANNOUNCEMENT_ROLES];
  }
  const tokens = value.split(",").map((t) => t.trim().toUpperCase());
  const picked = ALL_ANNOUNCEMENT_ROLES.filter((r) => tokens.includes(r));
  return picked.length ? picked : [...ALL_ANNOUNCEMENT_ROLES];
}

/**
 * 편집기에서 고른 역할 목록을 저장용 컬럼 값으로 직렬화한다.
 * 전체 선택(또는 빈 배열)은 "ALL" 로 압축 저장한다.
 */
export function serializeAnnouncementAudiences(list: AnnouncementRole[]): string {
  const seen = ALL_ANNOUNCEMENT_ROLES.filter((r) => list.includes(r));
  if (seen.length === 0 || seen.length === ALL_ANNOUNCEMENT_ROLES.length) {
    return "ALL";
  }
  return seen.join(",");
}

/** 특정 역할의 뷰어에게 이 공지가 노출되어야 하는지 판정. */
export function announcementMatchesRole(
  audiences: string | null | undefined,
  role: AnnouncementRole,
): boolean {
  return parseAnnouncementAudiences(audiences).includes(role);
}

/** Staff.role 문자열("DIRECTOR"|"TEACHER"|…) → 공지 뷰어 역할. */
export function staffRoleToAnnouncementRole(staffRole: string): AnnouncementRole {
  return staffRole === "DIRECTOR" ? "DIRECTOR" : "TEACHER";
}
