// Shared types, constants, and helpers for admin-members actions.

export type ProviderFilter = "all" | "google" | "kakao" | "other";
export type ActiveFilter = "all" | "active" | "inactive";
export type MemberSortKey = "createdAt" | "lastLoginAt" | "balance";
export type SortOrder = "asc" | "desc";

export interface MemberListFilters {
  provider?: ProviderFilter;
  active?: ActiveFilter;
  search?: string;
  sortKey?: MemberSortKey;
  sortOrder?: SortOrder;
  limit?: number;
}

// All admin-facing time grouping happens in Asia/Seoul so dashboards line up
// with how the operator perceives the day, regardless of Postgres or browser
// timezone. Centralized constant prevents drift across queries.
export const DISPLAY_TIMEZONE = "Asia/Seoul";

// Redaction marker for PII fields shown to non-SUPER_ADMIN sessions.
export const REDACTED = "—";

// Search query length cap — Prisma parameterizes contains so SQL injection is
// impossible, but a 10MB search string still consumes index/regex CPU.
export const MAX_SEARCH_LENGTH = 100;

// Allowlist of operationType values that may be submitted as a filter.
// MUST stay in sync with OPERATION_TYPE_LABELS in
// src/lib/admin-members-labels.ts — when adding a new op-type, update both
// places (or label will appear without the value being filterable, and the
// allowlist will reject any UI selection of it).
export const OPERATION_TYPE_ALLOWLIST = new Set([
  "QUESTION_GEN_SINGLE",
  "QUESTION_GEN_VOCAB",
  "AUTO_GEN_BATCH",
  "PASSAGE_ANALYSIS",
  "TEXT_EXTRACTION",
  "EXAM_GENERATION",
]);

export function isSuperAdmin(
  session: { role: string } | null | undefined,
): boolean {
  return session?.role === "SUPER_ADMIN";
}

// Email masking that keeps domain-level visibility (useful for triage)
// but hides the full local-part identity from SUPPORT-tier admins.
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return REDACTED;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ""}*${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}${domain}`;
}

// ============================================================================
// Result discriminated union (codebase-wide pattern for new actions)
// ============================================================================

export type ActionFail = { success: false; error: string };
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ActionResult<T extends object = {}> =
  | ({ success: true } & T)
  | ActionFail;

export function fail(error: string): ActionFail {
  return { success: false, error };
}
