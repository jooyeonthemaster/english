import type { Prisma } from "@prisma/client";
import type { WorkbenchQuestionFilters } from "./_types";

// 시험지 빌더 좌측 목록 서버 페이지네이션의 페이지 크기. "use server" 파일은 async
// 함수만 export 할 수 있어 상수를 이 플레인 모듈에 둔다(서버 액션·클라이언트 공용).
export const BUILDER_PAGE_SIZE = 100;

// 문제 조회 where 빌더 — 문제은행/지문별 뷰/시험지 빌더 피커가 공유한다. "use server"
// 모듈에서는 동기 헬퍼를 export 할 수 없으므로(모든 export 가 async 여야 함) 이 순수
// 모듈로 분리해 questions.ts(문제은행)와 exam-paper-builder.ts(빌더)가 함께 import 한다.
export function buildWorkbenchQuestionWhere(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
  scope: "active" | "trash" = "active",
): Prisma.QuestionWhereInput {
  const where: Prisma.QuestionWhereInput = { academyId };

  // 휴지통(soft delete) 단일 게이트 — 모든 워크벤치 문제 조회는 이 헬퍼를 거친다.
  // "active"=살아있는 문제만(deletedAt:null), "trash"=휴지통에 있는 것만.
  // 이 한 줄을 빼먹으면 삭제된 문제가 문제은행/지문별 뷰/빌더 피커에 새어나간다.
  where.deletedAt = scope === "trash" ? { not: null } : null;

  // 세트 멤버도 활성 문제은행에선 "일반 문항 카드"로 노출한다(표시 통일). 멤버는
  // 자체 passage·structuredData·options·해설을 모두 보유하므로 일반 카드로 충실히
  // 렌더된다(세트로 묶어 한 장으로 보여주던 것 → 문항당 1카드). 휴지통 목록은
  // 기존 동작을 유지해 세트 멤버를 제외한다(복원 동선 단순화).
  if (scope === "trash") where.inSet = false;

  if (filters?.type) {
    // Support comma-separated multi-type: "MULTIPLE_CHOICE,SHORT_ANSWER"
    const types = filters.type.split(",").filter(Boolean);
    where.type = types.length > 1 ? { in: types } : types[0];
  }
  if (filters?.subType) {
    // Support comma-separated multi-subtype: "BLANK_INFERENCE,GRAMMAR_ERROR"
    const subs = filters.subType.split(",").filter(Boolean);
    where.subType = subs.length > 1 ? { in: subs } : subs[0];
  }
  if (filters?.difficulty) where.difficulty = filters.difficulty;
  if (filters?.passageId) where.passageId = filters.passageId;
  if (filters?.collectionId) {
    where.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.tags) where.tags = { contains: filters.tags };
  if (filters?.aiGenerated !== undefined) where.aiGenerated = filters.aiGenerated;
  if (filters?.approved !== undefined) where.approved = filters.approved;
  if (filters?.starred !== undefined) where.starred = filters.starred;
  if (filters?.search) {
    where.questionText = { contains: filters.search, mode: "insensitive" };
  }

  return where;
}

// 빌더 피커용 where — 검색 범위를 questionText 1개에서 빌더 좌측 패널의 기존
// 클라이언트 검색과 동등하게 넓힌다(지문 제목/본문·태그·정답까지). 서버 페이지네이션
// 전환 시 "검색이 좁아지는" 유일한 기능 갭을 메우기 위함이다.
export function buildBuilderQuestionWhere(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
): Prisma.QuestionWhereInput {
  const where = buildWorkbenchQuestionWhere(academyId, filters, "active");
  const q = filters?.search?.trim();
  if (q) {
    delete where.questionText;
    where.OR = [
      { questionText: { contains: q, mode: "insensitive" } },
      { correctAnswer: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
      { passage: { title: { contains: q, mode: "insensitive" } } },
      { passage: { content: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}
