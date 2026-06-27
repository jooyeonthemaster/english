// Plain (non-"use server") shared constants for workbench passage queries.
// A "use server" module may only export async functions, so report-scoping
// predicates that need to be shared across action modules live here instead.

/** `PassageReport.generationPlan` marker for the A4 분석 보고서(학습지).
 *  Mirrors PRIME_MARKER in the prime report API route. A passage "has a
 *  generated 학습지" iff it owns a non-deleted report with this plan. */
export const PRIME_REPORT_MARKER = "PRIME";

/** Prisma `where` matching a passage that owns a generated 학습지 (non-deleted
 *  PRIME report). Shared so collection counts/membership can scope to the same
 *  "학습지 관리에 실제로 보이는" population the list query uses. */
export const HAS_PRIME_REPORT_WHERE = {
  reports: {
    some: { generationPlan: PRIME_REPORT_MARKER, deletedAt: null },
  },
} as const;
