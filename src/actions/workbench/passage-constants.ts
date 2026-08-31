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

/** [E30 §1-1] 실전 학습지(기본 PRIME 의 **자식 문서**) 마커 —
 *  prime API 라우트의 PRACTICE_MARKER 미러. 명명은 FINAL_REPORT_MARKER 동형이다.
 *
 *  ⚠ 이 행은 부모 PRIME 행과 **같은 passageId 를 공유**한다(E30 §1-2 D1 —
 *  parentReportId 컬럼 신설은 기각됐다. 부모 매칭 술어는 언제나
 *  `{ passageId, academyId, generationPlan: PRIME, deletedAt: null }` 하나뿐).
 *  즉 이 마커는 「기본 없이 혼자 존재할 수 없는」 유일한 마커다 —
 *  생성 경로 3층(E30 §2-4)이 그것을 강제한다. */
export const PRACTICE_REPORT_MARKER = "PRIME_PRACTICE";

/** 직독직해 분석본 학습지 마커 — prime API 라우트의 READING_MARKER 미러.
 *  명명은 FINAL_REPORT_MARKER 동형이다(docs/reading-analysis-worksheet-spec.md §5.2 A-1).
 *
 *  파이널과 같은 「자기완결 문서」 축이다: fast 라우트의 자기완결 블록이 부모 PRIME
 *  유무와 **무관하게** 지문당 1행을 upsert 한다(실전 PRIME_PRACTICE 의 「부모 필수」
 *  계약과 다르다 — reading 은 혼자 존재할 수 있다). 저장 컬럼은 **pages** 이며
 *  (result 아님 — prime 라우트 PATCH 실측), 맨몸 ReadingAnalysisDoc 가 아니라
 *  표준 AnalysisReport 봉투(meta.titleKo 필수 + sections=[reading-analysis 1개],
 *  schema.ts readingAnalysisSectionSchema)를 싣는다. templateId 는 "prime-reading".
 *  ⚠ 마커 리터럴 미러 2벌 규약: prime/[passageId]/route.ts 의 로컬 상수와 이 파일은
 *  반드시 **같은 커밋**에서 함께 바뀐다(스펙 §5.3 F-2). */
export const READING_REPORT_MARKER = "PRIME_READING";

/** 학습지 보유 판정 마커 집합 — 영어 PRIME + 국어 PRIME_KO + 파이널 원페이지
 *  + 실전 학습지(PRIME_PRACTICE, E30 §1-5) + 직독직해 분석본(PRIME_READING).
 *  파이널만 생성한 지문도 목록 카드·학생 뷰어(doc-loader)에서 학습지로 인정된다.
 *
 *  ⚠ 실전(PRIME_PRACTICE)을 넣어도 「실전만 있고 기본이 없는 지문」은 생기지 않는다 —
 *  E30 §2-4 가 서버 404 + 한 트랜잭션 두 축으로 막는다. 그래서 이 집합이 4키(현재
 *  reading 가입으로 5키)가 돼도 「학습지 보유」 모집단(_passage-where.ts:57 ·
 *  passages.ts:101 · collections-passage.ts:32 · passage-lookups.ts:70)의 판정은
 *  뒤집히지 않는다.
 *
 *  ⚠ [reading] 직독직해(PRIME_READING) 가입 근거: 미가입이면 이 집합으로 스코프하는
 *  worksheet-docs 로더에서 reading 문서가 조판 목록째 증발한다(스펙 §5.3 F-2).
 *  파이널 선례처럼 자기완결 문서라 「reading 만 있는 지문」이 성립하고, 그 지문도
 *  학습지 보유로 인정되는 것이 옳다.
 *
 *  ⚠ 순서에 의미는 없다 — 소비처 전부가 Prisma `in:` 또는 `.includes()` 다(실측 8곳).
 *  단수 마커 PRIME_REPORT_MARKER 를 쓰는 축(배포·스터디 플랜·sheet-deploy-eligibility)은
 *  이 가입으로 **열리지 않는다** — 실전 분리 문서는 인쇄 전용이다(E30 §1-5). */
export const PRIME_REPORT_MARKERS: string[] = [
  PRIME_REPORT_MARKER,
  KO_PRIME_REPORT_MARKER,
  FINAL_REPORT_MARKER,
  PRACTICE_REPORT_MARKER,
  READING_REPORT_MARKER,
];

/** Prisma `where` matching a passage that owns a generated 학습지 (non-deleted
 *  PRIME/PRIME_KO/PRIME_FINAL/PRIME_PRACTICE report). Shared so collection
 *  counts/membership can scope to the same "학습지 관리에 실제로 보이는"
 *  population the list query uses.
 *  ⚠ 파생이다 — PRIME_REPORT_MARKERS 에 마커를 더하면 여기도 자동 반영된다.
 *  리터럴 배열을 여기에 복제하지 마라(두 벌은 조용히 갈린다). */
export const HAS_PRIME_REPORT_WHERE = {
  reports: {
    some: { generationPlan: { in: PRIME_REPORT_MARKERS }, deletedAt: null },
  },
} as const;
