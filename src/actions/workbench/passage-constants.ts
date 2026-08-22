// Plain (non-"use server") shared constants for workbench passage queries.
// A "use server" module may only export async functions, so report-scoping
// predicates that need to be shared across action modules live here instead.

/** `PassageReport.generationPlan` marker for the A4 분석 보고서(학습지).
 *  Mirrors PRIME_MARKER in the prime report API route. A passage "has a
 *  generated 학습지" iff it owns a non-deleted report with this plan. */
export const PRIME_REPORT_MARKER = "PRIME";

/** 국어(PRIME_KO) 분석 보고서 마커 — ko-schema.ts 의 KO_PRIME_REPORT_MARKER 미러.
 *  (이 파일은 의존성 없는 상수 모듈이라 리터럴을 복제해 둔다.) */
export const KO_PRIME_REPORT_MARKER = "PRIME_KO";

/** 원페이지 파이널 학습지 마커 — prime API 라우트의 FINAL_MARKER 미러
 *  (final-onepage-spec F3: 기본 PRIME 행과 지문당 각 1행 공존). */
export const FINAL_REPORT_MARKER = "PRIME_FINAL";

/** 학습지 보유 판정 마커 집합 — 영어 PRIME + 국어 PRIME_KO + 파이널 원페이지.
 *  파이널만 생성한 지문도 목록 카드·학생 뷰어(doc-loader)에서 학습지로 인정된다. */
export const PRIME_REPORT_MARKERS: string[] = [
  PRIME_REPORT_MARKER,
  KO_PRIME_REPORT_MARKER,
  FINAL_REPORT_MARKER,
];

/** Prisma `where` matching a passage that owns a generated 학습지 (non-deleted
 *  PRIME/PRIME_KO report). Shared so collection counts/membership can scope to
 *  the same "학습지 관리에 실제로 보이는" population the list query uses. */
export const HAS_PRIME_REPORT_WHERE = {
  reports: {
    some: { generationPlan: { in: PRIME_REPORT_MARKERS }, deletedAt: null },
  },
} as const;
