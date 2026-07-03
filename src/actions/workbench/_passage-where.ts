// Plain (non-"use server") shared `where` builders for workbench passage
// queries. A "use server" module may only export async functions, so the
// builder lives here (mirrors _question-where.ts) — passages.ts(목록·전체선택)
// 와 /api/passages/list 라우트, 유닛테스트가 같은 모집단 규약을 공유한다.
import { DIRECT_INPUT_PASSAGE_SOURCE } from "@/lib/passage-source";
import { PRIME_REPORT_MARKERS } from "./passage-constants";
import type { WorkbenchPassageFilters } from "./_types";

/**
 * 과목 스코프 조각 — 국어/영어 지문 완전 분리 규약의 단일 소스.
 *  - "KOREAN"  → subject === 'KOREAN' 만.
 *  - 미지정(기본=영어) → subject 가 null(기존 지문 전부=영어 간주) 또는
 *    'KOREAN' 이 아닌 값. 영어 화면 어디에도 국어 지문이 새어들지 않는다.
 * Prisma 의 `not` 은 SQL `<>` 로 내려가 NULL 행을 탈락시키므로 null 을
 * OR 로 명시해 기존(subject 미기록) 지문이 절대 빠지지 않게 한다.
 */
export function buildPassageSubjectScopeWhere(
  subject?: "KOREAN",
): Record<string, unknown> {
  if (subject === "KOREAN") return { subject: "KOREAN" };
  return { OR: [{ subject: null }, { subject: { not: "KOREAN" } }] };
}

/** `where.AND` 에 조각을 안전하게 합류시킨다(기존 AND 배열/단일값 보존). */
function pushAnd(
  where: Record<string, unknown>,
  clause: Record<string, unknown>,
) {
  where.AND = Array.isArray(where.AND)
    ? [...where.AND, clause]
    : where.AND
      ? [where.AND, clause]
      : [clause];
}

// Shared `where` builder for the workbench passage list. Extracted so the
// paginated list (getWorkbenchPassages) and the "전체 페이지 선택" id fetch
// (getWorkbenchPassageIds) always scope to the SAME population — otherwise
// 전체 선택이 목록에 없던 지문을 잡거나 일부를 빠뜨릴 수 있다.
export function buildWorkbenchPassageWhere(
  academyId: string,
  filters?: WorkbenchPassageFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = { academyId };

  if (filters?.schoolId) where.schoolId = filters.schoolId;
  if (filters?.grade) where.grade = filters.grade;
  if (filters?.semester) where.semester = filters.semester;
  if (filters?.publisher) where.publisher = filters.publisher;
  if (filters?.sourceMaterialId) where.sourceMaterialId = filters.sourceMaterialId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.hasReport) {
    // 생성이 완료된 학습지 = PRIME 분석 보고서가 존재하는 지문(soft-delete 제외).
    where.reports = {
      some: { generationPlan: { in: PRIME_REPORT_MARKERS }, deletedAt: null },
    };
  }
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { content: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters?.analyzedOnly) {
    if (filters?.includeDirectInput) {
      // Analysis-complete passages OR direct-paste passages (which have no
      // analysis yet). Pushed onto `where.AND` so it composes correctly with
      // the `where.OR` search predicate above instead of overwriting it.
      pushAnd(where, {
        OR: [
          { analysis: { isNot: null } },
          { source: DIRECT_INPUT_PASSAGE_SOURCE },
        ],
      });
    } else {
      where.analysis = { isNot: null };
    }
  }

  // ── 과목 스코프 (항상 적용) ──
  // "KOREAN" = 국어 라우트 전용(국어 지문만) / 미지정 = 영어 기본(국어 제외).
  // 검색 OR 과 겹치지 않도록 AND 로 합류시킨다. 목록·전체선택·API 라우트가
  // 전부 이 한 조각을 공유해 population 이 절대 어긋나지 않는다.
  pushAnd(where, buildPassageSubjectScopeWhere(filters?.subject));

  return where;
}
