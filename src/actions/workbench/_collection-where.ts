// Plain (non-"use server") shared helpers for collection(폴더) subject scoping.
// "use server" 모듈은 async 함수만 export 할 수 있어 동기 빌더/판별자는 이 플레인
// 모듈에 둔다 (_passage-where.ts / _question-where.ts 와 동일 관례) —
// collections-passage.ts · collections-question.ts · exam-paper-builder.ts ·
// 유닛테스트가 같은 규약을 공유한다.

/**
 * 폴더(컬렉션) 과목 스코프 조각 — 국어/영어 폴더 완전 분리 규약의 단일 소스.
 * passages.subject 규약을 1:1 미러한다:
 *  - "KOREAN"  → subject === 'KOREAN' 폴더만.
 *  - 미지정(기본=영어) → subject 가 null(기존 폴더 전부=영어 간주) 또는
 *    'KOREAN' 이 아닌 값. 영어 화면 어디에도 국어 폴더가 새어들지 않는다.
 * Prisma 의 `not` 은 SQL `<>` 로 내려가 NULL 행을 탈락시키므로 null 을
 * OR 로 명시해 기존(subject 미기록) 폴더가 절대 빠지지 않게 한다.
 */
export function buildCollectionSubjectScopeWhere(
  subject?: "KOREAN",
): Record<string, unknown> {
  if (subject === "KOREAN") return { subject: "KOREAN" };
  return { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] };
}

/**
 * Prisma "컬럼이 DB에 없음"(P2022) 판별자 — 우아한 강등 게이트.
 * *_collections.subject 는 로컬 schema.prisma 에만 먼저 추가되고 실제 DB 반영은
 * surgical ALTER(scripts/sql/ko-collections-subject.sql)로 별도 수행된다.
 * ALTER 이전 환경에서 subject 를 SELECT/WHERE 하면 P2022 가 나므로, 이때는
 * 레거시(과목 미분리·공유 폴더) 동작으로 강등해 502 대신 기존 UX 를 유지한다.
 */
export function isMissingColumnError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2022"
  );
}
