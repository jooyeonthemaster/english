// Shared types, constants, and helpers for admin-members actions.

export type ProviderFilter = "all" | "google" | "kakao" | "other";
export type ActiveFilter = "all" | "active" | "inactive";
export type MemberSortKey =
  | "createdAt"
  | "lastActiveAt"
  | "balance"
  | "name"
  | "academyName"
  | "plan"
  | "expiresAt"
  | "sms";
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
  "LEARNING_QUESTION_GEN",
  "PASSAGE_ANALYSIS",
  "GRAMMAR_ENHANCEMENT",
  "SENTENCE_RETRANSLATION",
  "QUESTION_EXPLANATION",
  "QUESTION_MODIFY",
  "AI_CHAT",
  "TEXT_EXTRACTION",
  "PASSAGE_RESTORATION",
  "WEBTOON_IMAGE",
  "WEBTOON_IMAGE_PREMIUM",
  "WEBTOON_EXAM_DOWNLOAD",
  "EXAM_GENERATION",
]);

export function isSuperAdmin(
  session: { role: string } | null | undefined,
): boolean {
  return session?.role === "SUPER_ADMIN";
}

// ============================================================================
// Outreach (문자/SMS) targeting helpers
// ============================================================================

// Per-academy flag (stored in academy_feature_flags) that excludes a member
// from SMS outreach lists/exports. Used for English teachers who already get
// periodic feedback — admin toggles it per row. Stored as a flag so no schema
// migration is required.
export const SMS_OPT_OUT_FLAG_KEY = "OUTREACH_SMS_OPT_OUT";

// Internal / test ("허수") accounts that must never appear as real outreach
// targets. Matched as a case-insensitive substring against the member name,
// the academy name, AND the email local-part. Keep this list small and
// specific to avoid excluding real customers who happen to share a surname.
export const INTERNAL_ACCOUNT_TERMS = [
  "유재영",
  "유선화",
  "김주연",
  "김제연",
  "네안데르",
  "이동주",
  "안다르",
  "악센트",
  "neander",
  "andar",
  "accent",
] as const;

/**
 * True when a member looks like an internal/test account that should be
 * excluded from outreach exports & SMS targets (not hidden from the UI list).
 */
export function isInternalAccount(input: {
  name?: string | null;
  academyName?: string | null;
  email?: string | null;
}): boolean {
  const haystacks = [
    input.name ?? "",
    input.academyName ?? "",
    // only the local-part of the email — domains like @gmail are noise
    (input.email ?? "").split("@")[0] ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return INTERNAL_ACCOUNT_TERMS.some((term) =>
    haystacks.includes(term.toLowerCase()),
  );
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
