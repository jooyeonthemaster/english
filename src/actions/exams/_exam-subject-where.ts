// Plain (non-"use server") shared helpers for exam / exam-collection / question-set
// subject scoping. "use server" 모듈은 async 함수만 export 할 수 있어 동기 빌더는 이
// 플레인 모듈에 둔다 (src/actions/workbench/_collection-where.ts · _passage-where.ts ·
// _question-where.ts 와 동일 관례) — exams/crud.ts · exams/collections.ts ·
// question-sets.ts · exam-paper-builder.ts · 유닛테스트가 같은 규약을 공유한다.
//
// 판별자 일급화(P0): 기존에 exams/exam_collections/question_sets 는 subject 컬럼이
// 없어 question.subType 'KO_' 접두사 조인추론으로 국어를 갈랐다. 이 3계층에 subject
// 컬럼을 surgical ALTER(scripts/sql/ko-exam-set-subject.sql)로 심고, 스코프 판정을
// 자기 subject 컬럼으로 통일한다. subType 'KO_' 는 questions 계층의 leaf 판별자로만
// 남는다(문제은행 필터·렌더).

// P2022("컬럼이 DB에 없음") 판별자는 단일 소스를 위해 _collection-where 에서 재export.
export { isMissingColumnError } from "@/actions/workbench/_collection-where";

/**
 * 시험지(exam) 과목 스코프 조각 — 국어/영어 시험지 완전 분리 규약의 단일 소스.
 * passages.subject / *_collections.subject 규약을 1:1 미러한다:
 *  - "KOREAN"  → subject === 'KOREAN' 시험지만.
 *  - 미지정(기본=영어) → subject 가 null(기존 시험지 전부=영어 간주) 또는
 *    'KOREAN' 이 아닌 값. 영어 화면 어디에도 국어 시험지가 새어들지 않는다.
 * Prisma 의 `not` 은 SQL `<>` 로 내려가 NULL 행을 탈락시키므로 null 을 OR 로 명시해
 * 기존(subject 미기록) 시험지가 절대 빠지지 않게 한다. 백필(ko-exam-set-subject.sql)
 * 이 "살아있는 KO_ 문항 1개 이상" 시험지에 'KOREAN' 을 스탬프하므로, 영어 스코프는
 * 기존 none-clause(deletedAt null + subType KO_)와 정확한 여집합 대칭을 이룬다.
 */
export function buildExamSubjectScopeWhere(
  subject?: "KOREAN",
): Record<string, unknown> {
  if (subject === "KOREAN") return { subject: "KOREAN" };
  return { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] };
}

/**
 * 시험지 폴더(exam_collection) 과목 스코프 조각 — buildExamSubjectScopeWhere 와 동일 규약.
 * 사전 국어 exam 폴더가 없어 백필은 없으며, ALTER 직후 모든 기존 폴더는 subject=null
 * (영어 취급). 국어 exam 폴더는 국어 라우트의 createExamCollection 이 'KOREAN' 스탬프로
 * 신규 생성한다.
 */
export function buildExamCollectionSubjectScopeWhere(
  subject?: "KOREAN",
): Record<string, unknown> {
  if (subject === "KOREAN") return { subject: "KOREAN" };
  return { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] };
}

/**
 * 문제 세트(question_set) 과목 스코프 조각 — buildExamSubjectScopeWhere 와 동일 규약.
 * 백필(ko-exam-set-subject.sql)이 "KO_ 멤버 1개 이상" 세트에 'KOREAN' 을 스탬프한다
 * (listQuestionSets 의 items.some KO_ 규약과 대칭, 세트 멤버 판정은 deletedAt 무필터).
 */
export function buildQuestionSetSubjectScopeWhere(
  subject?: "KOREAN",
): Record<string, unknown> {
  if (subject === "KOREAN") return { subject: "KOREAN" };
  return { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] };
}
