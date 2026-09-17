"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import type { QuestionSetForRender } from "@/actions/question-sets";
import type { Anchor } from "@/lib/question-sets/types";
import type { WorkbenchQuestionFilters } from "./workbench/_types";
import {
  buildBuilderQuestionWhere,
  buildWorkbenchQuestionWhere,
  BUILDER_PAGE_SIZE,
} from "./workbench/_question-where";
import {
  buildCollectionSubjectScopeWhere,
  isMissingColumnError,
} from "./workbench/_collection-where";

export interface ExamPaperBuilderItemInput {
  localId?: string;
  blockType?: "question";
  questionId: string;
  orderNum: number;
  points: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: { label: string; text: string }[];
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
  breakBefore?: "auto" | "column" | "page";
  keepWithPrev?: boolean;
}

export interface ExamPaperBuilderBlockInput {
  localId: string;
  blockType: "question" | "text" | "section" | "divider" | "spacer" | "image";
  orderNum?: number;
  questionId?: string;
  points?: number;
  groupId?: string | null;
  includePassage?: boolean;
  passageTitle?: string;
  passageContent?: string;
  questionText?: string;
  options?: { label: string; text: string }[];
  correctAnswer?: string;
  answerSpaceLines?: number;
  objectiveAnswerSlots?: number;
  objectiveAnswerTexts?: string[];
  sectionTitle?: string;
  teacherNote?: string;
  breakBefore?: "auto" | "column" | "page";
  keepWithPrev?: boolean;
  locked?: boolean;
  blockTitle?: string;
  blockText?: string;
  blockAlign?: "left" | "center" | "right";
  blockFontSize?: "sm" | "md" | "lg";
  blockBold?: boolean;
  blockItalic?: boolean;
  blockFontPt?: number | null;
  blockAccentColor?: string;
  dividerStyle?: "solid" | "dashed" | "dotted";
  dividerThickness?: number;
  spacerHeight?: number;
  imageDataUrl?: string | null;
  imageAlt?: string;
  imageWidth?: number;
}

export interface ExamPaperBuilderSaveInput {
  examId?: string | null;
  /**
   * 과목 — "KOREAN"=국어 시험지로 저장(신규 생성 시 exams.subject='KOREAN' 스탬프).
   * 미지정=영어(subject 미포함). 재저장(examId 존재)은 subject 를 건드리지 않아
   * 무언 재분류를 막는다(혼합 시험지 스탬프 규칙: CREATE 고정·UPDATE 보존).
   */
  subject?: "KOREAN";
  title: string;
  type: string;
  classId?: string | null;
  schoolId?: string | null;
  grade?: number | null;
  semester?: string | null;
  examType?: string | null;
  examDate?: string | null;
  duration?: number | null;
  totalPoints: number;
  template: string;
  layout: {
    paperSize?: "A4" | "B4";
    columns: 1 | 2;
    density: "comfortable" | "compact";
    forceTwoPerPage: boolean;
    showAnswerSpace: boolean;
    showPassageTitle: boolean;
    showQuestionMeta: boolean;
    passageStyle: "boxed" | "plain" | "underlined";
    pageNumberStyle: "center" | "outside" | "none";
  };
  scoring?: {
    autoPointTotal?: number | null;
  };
  header: {
    subtitle?: string;
    schoolName?: string;
    className?: string;
    studentNameLabel?: string;
    instructions?: string;
    academyLogoDataUrl?: string | null;
  };
  cover?: {
    enabled: boolean;
    template: "classic" | "band" | "minimal";
    eyebrow: string;
    footnote: string;
    showLogo: boolean;
    showInfo: boolean;
  };
  items: ExamPaperBuilderItemInput[];
  blocks?: ExamPaperBuilderBlockInput[];
}

function normalizeObjectiveAnswerTexts(input: unknown, slots: number): string[] {
  if (!Array.isArray(input) || slots <= 0) return [];
  return input.slice(0, slots).map((text) => String(text ?? ""));
}

// 빌더 카드/미리보기가 필요로 하는 문항 include 형태 — 목록 로드와 id 배치 로드가
// 동일한 모양을 반환하도록 한 곳에서 공유한다(BuilderQuestion 형태와 일치).
const BUILDER_QUESTION_INCLUDE = {
  passage: {
    select: {
      id: true,
      title: true,
      content: true,
      grade: true,
      semester: true,
      publisher: true,
      school: { select: { id: true, name: true } },
    },
  },
  explanation: {
    select: {
      id: true,
      content: true,
      keyPoints: true,
      wrongOptionExplanations: true,
    },
  },
  collectionItems: {
    select: { collectionId: true },
  },
  examLinks: {
    select: {
      exam: { select: { id: true, title: true, createdAt: true } },
    },
  },
  _count: { select: { examLinks: true } },
} as const;

type BuilderQuestionSetWithItems = Prisma.QuestionSetGetPayload<{
  include: {
    items: {
      include: {
        question: {
          include: {
            explanation: true;
            passage: { select: { id: true; title: true } };
          };
        };
      };
    };
    basePassage: { select: { id: true; title: true } };
  };
}>;

type BuilderSurfaceItem = {
  kind: "question" | "set";
  id: string;
  createdAt: Date;
  starred: boolean;
  approved: boolean;
  difficultyMinRank: number;
  difficultyMaxRank: number;
  representativeQuestionId?: string;
  memberQuestionIds?: string[];
};

const DIFFICULTY_RANK: Record<string, number> = {
  BASIC: 1,
  INTERMEDIATE: 2,
  KILLER: 3,
};

function parseBuilderSetJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function mapBuilderQuestionSet(set: BuilderQuestionSetWithItems): QuestionSetForRender {
  const sharedPassage =
    set.basePassage ??
    set.items.find((item) => item.question.passage)?.question.passage ??
    null;

  return {
    id: set.id,
    status: set.status,
    structuralMode: set.structuralMode,
    setLabel: set.setLabel,
    canonicalPassage: set.canonicalPassage,
    layout: parseBuilderSetJson(set.displayedPassageLayout),
    createdAt: set.createdAt,
    passageTitle: sharedPassage?.title ?? null,
    passageId: sharedPassage?.id ?? null,
    members: set.items.map((item) => {
      const q = item.question;
      return {
        itemId: item.id,
        questionId: q.id,
        orderInSet: item.orderInSet,
        isStructural: item.isStructural,
        typeId: q.subType,
        difficulty: q.difficulty,
        questionText: q.questionText,
        options: parseBuilderSetJson(q.options),
        correctAnswer: q.correctAnswer,
        structuredData: q.structuredData,
        spans: (item.spans as unknown as Anchor[]) ?? [],
        approved: q.approved,
        explanation: q.explanation
          ? {
              id: q.explanation.id,
              content: q.explanation.content,
              keyPoints: q.explanation.keyPoints,
              wrongOptionExplanations: q.explanation.wrongOptionExplanations,
            }
          : null,
      };
    }),
  };
}

function readDifficultyRank(value: string | null | undefined): number {
  return value ? (DIFFICULTY_RANK[value] ?? 0) : 0;
}

function compareBuilderSurfaceItems(
  sort: string | undefined,
  a: BuilderSurfaceItem,
  b: BuilderSurfaceItem,
): number {
  const aTime = a.createdAt.getTime();
  const bTime = b.createdAt.getTime();
  const tie = a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind);

  switch (sort) {
    case "oldest":
      return aTime - bTime || tie;
    case "starred":
      return Number(b.starred) - Number(a.starred) || bTime - aTime || tie;
    case "difficulty_desc":
      return b.difficultyMaxRank - a.difficultyMaxRank || bTime - aTime || tie;
    case "difficulty_asc":
      return a.difficultyMinRank - b.difficultyMinRank || bTime - aTime || tie;
    case "newest":
    default:
      return bTime - aTime || tie;
  }
}

function buildBuilderStandaloneQuestionWhere(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
): Prisma.QuestionWhereInput {
  const where = buildWorkbenchQuestionWhere(academyId, filters);
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

function buildBuilderSetMemberQuestionWhere(
  academyId: string,
  filters?: WorkbenchQuestionFilters,
): Prisma.QuestionWhereInput {
  return {
    ...buildBuilderQuestionWhere(academyId, filters),
    setId: { not: null },
  };
}

function filtersWithoutApproved(
  filters?: WorkbenchQuestionFilters,
): WorkbenchQuestionFilters | undefined {
  if (!filters || filters.approved === undefined) return filters;
  return { ...filters, approved: undefined };
}

async function loadBuilderSurfaceItems(
  academyId: string,
  filters: WorkbenchQuestionFilters,
): Promise<BuilderSurfaceItem[]> {
  const setMatchFilters = filtersWithoutApproved(filters);
  const [standaloneQuestions, sets] = await Promise.all([
    prisma.question.findMany({
      where: buildBuilderStandaloneQuestionWhere(academyId, filters),
      select: {
        id: true,
        createdAt: true,
        starred: true,
        approved: true,
        difficulty: true,
      },
    }),
    prisma.questionSet.findMany({
      where: {
        academyId,
        items: {
          some: {
            question: buildBuilderSetMemberQuestionWhere(
              academyId,
              setMatchFilters,
            ),
          },
        },
      },
      select: {
        id: true,
        createdAt: true,
        items: {
          where: { question: { academyId, deletedAt: null } },
          orderBy: { orderInSet: "asc" },
          select: {
            questionId: true,
            question: {
              select: {
                approved: true,
                starred: true,
                difficulty: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const questionItems: BuilderSurfaceItem[] = standaloneQuestions.map((question) => {
    const difficultyRank = readDifficultyRank(question.difficulty);
    return {
      kind: "question",
      id: question.id,
      createdAt: question.createdAt,
      starred: question.starred,
      approved: question.approved,
      difficultyMinRank: difficultyRank,
      difficultyMaxRank: difficultyRank,
    };
  });

  const setItems: BuilderSurfaceItem[] = [];
  for (const set of sets) {
    const activeMembers = set.items.filter((item) => item.question);
    if (activeMembers.length === 0) continue;

    const approved = activeMembers.every((item) => item.question.approved);
    if (filters.approved !== undefined && approved !== filters.approved) {
      continue;
    }

    const ranks = activeMembers.map((item) =>
      readDifficultyRank(item.question.difficulty),
    );
    setItems.push({
      kind: "set",
      id: set.id,
      createdAt: set.createdAt,
      starred: activeMembers.some((item) => item.question.starred),
      approved,
      difficultyMinRank: Math.min(...ranks),
      difficultyMaxRank: Math.max(...ranks),
      representativeQuestionId: activeMembers[0]?.questionId,
      memberQuestionIds: activeMembers.map((item) => item.questionId),
    });
  }

  return [...questionItems, ...setItems].sort((a, b) =>
    compareBuilderSurfaceItems(filters.sort, a, b),
  );
}

async function loadBuilderQuestionsBySurfacePage(
  academyId: string,
  surfaceItems: BuilderSurfaceItem[],
): Promise<unknown[]> {
  const representativeIds = surfaceItems
    .map((item) =>
      item.kind === "question" ? item.id : item.representativeQuestionId,
    )
    .filter((id): id is string => Boolean(id));
  if (representativeIds.length === 0) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: representativeIds }, academyId, deletedAt: null },
    include: BUILDER_QUESTION_INCLUDE,
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  return representativeIds
    .map((id) => byId.get(id))
    .filter((question): question is NonNullable<typeof question> => Boolean(question));
}

function countBuilderSurfaceStatus(items: BuilderSurfaceItem[]) {
  const all = items.length;
  const approved = items.filter((item) => item.approved).length;
  return { all, approved, pending: all - approved };
}

async function loadBuilderSurfacePage(
  academyId: string,
  filters: WorkbenchQuestionFilters,
) {
  const limit = filters.limit || BUILDER_PAGE_SIZE;
  const page = Math.max(1, filters.page || 1);
  // 전량 스캔 1회로 통합(2026-08-14 비용 감사 — 종전 2회는 학원 전체 문항을
  // 그대로 중복 스캔했다. 실측 3,927문항 학원에서 회당 6,138행·DB→서버 1.76MB).
  // statusCounts 는 approved 필터를 뺀 모집단이어야 하고(세그먼트가 전체·미검수·
  // 검수완료 3개를 동시에 표기), 목록은 그 모집단을 approved 로 거른 것과 **비트
  // 단위로 동일**하다:
  //  · 세트 질의는 이미 filtersWithoutApproved 로 approved 를 벗겨(:325) 두
  //    호출이 애초에 같은 SQL 이었고, 세트의 approved 판정도 SQL 이 아니라
  //    메모리 사후 필터다(:388-391).
  //  · standalone 의 유일한 차이인 where.approved(_question-where.ts)는
  //    Question.approved 가 NOT NULL Boolean 이라 JS `=== ` 등가 필터로 복원된다.
  //  · 비교자가 (kind,id) 까지 내려가는 전순서라 동률이 없어 "정렬 후 필터"와
  //    "필터 후 정렬"의 결과 배열이 같다.
  const statusBaseItems = await loadBuilderSurfaceItems(academyId, {
    ...filters,
    approved: undefined,
  });
  const items =
    filters.approved === undefined
      ? statusBaseItems
      : statusBaseItems.filter((item) => item.approved === filters.approved);
  const pageItems = items.slice((page - 1) * limit, page * limit);
  const questions = await loadBuilderQuestionsBySurfacePage(academyId, pageItems);

  return {
    questions,
    total: items.length,
    page,
    totalPages: Math.max(1, Math.ceil(items.length / limit)),
    statusCounts: countBuilderSurfaceStatus(statusBaseItems),
  };
}

// 좌측 목록은 문제관리 페이지와 동일하게 서버 페이지네이션(100/page)으로 받는다.
// 초기 진입(SSR)은 1페이지 + 전체개수/총페이지/검수상태 개수만 내려주고, 이후 페이지/
// 필터 변경은 클라이언트가 getExamPaperBuilderQuestionsPage 로 가져온다. 선택/미리보기는
// ID 기반 작업세트(getExamPaperBuilderQuestionIds + ...QuestionsByIds)가 담당한다.
// NOTE(E4): 이 로더는 문제은행(academyId 스코프)만 받고 특정 exam 을 조회하지 않는다.
// 공유 QR 자기등록의 enrollToken/enrollEnabled 는 편집 페이지가 getExam 으로 받아
// initialExam 으로 넘기고(빌더가 거기서 읽어 인쇄 QR 을 만든다), 이 함수에는 exam
// 컨텍스트가 없으므로 enroll 필드를 여기서 반환하지 않는다(신규 생성 경로 무회귀).
export async function getExamPaperBuilderData(
  academyId: string,
  opts?: {
    /**
     * 과목 스코프 — "KOREAN"=국어 시험지 편집: 좌측 피커 문항·폴더를 국어
     * 전용으로 연다. 미지정=영어 기본(KO_* 문항·국어 폴더 제외, 종전과 동일).
     */
    subject?: "KOREAN";
  },
) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) {
    return {
      questions: [],
      total: 0,
      totalPages: 1,
      statusCounts: { all: 0, approved: 0, pending: 0 },
      collections: [],
      classes: [],
      schools: [],
    };
  }

  // 초기 필터 = 클라이언트 기본 상태와 일치(검색 없음, newest, 폴더/검수 전체).
  const [pageData, collections, classes, schools] =
    await Promise.all([
      // 세트=1 카드로 세는 렌더 정합 표면(codex) 위에 과목 스코프(국어/영어 분리)를
      // 얹는다. subject 는 loadBuilderSurfaceItems 의 standalone·set-member where 로
      // 흘러가 KO_* 문항/영어 문항이 서로 새지 않는다.
      loadBuilderSurfacePage(academyId, {
        page: 1,
        limit: BUILDER_PAGE_SIZE,
        sort: "newest",
        subject: opts?.subject,
      }),
      // 빌더 폴더 목록 — 과목 스코프(기본=영어: 국어 폴더 제외 / KOREAN=국어
      // 폴더만)를 이 파일에서 직접 얹는다. 클라이언트가 쓰는 필드만 명시 select
      // 해, subject 컬럼 미반영 DB 에서도 SELECT 가 컬럼을 건드리지 않게 한다
      // (P2022 는 스코프 where 에서만 가능 → 레거시 폴백).
      prisma.questionCollection
        .findMany({
          where: {
            academyId,
            ...buildCollectionSubjectScopeWhere(opts?.subject),
          },
          select: {
            id: true,
            parentId: true,
            name: true,
            color: true,
            _count: { select: { items: true, children: true } },
          },
          orderBy: { name: "asc" },
        })
        .catch((error) => {
          if (!isMissingColumnError(error)) throw error;
          return prisma.questionCollection.findMany({
            where: { academyId },
            select: {
              id: true,
              parentId: true,
              name: true,
              color: true,
              _count: { select: { items: true, children: true } },
            },
            orderBy: { name: "asc" },
          });
        }),
      prisma.class.findMany({
        where: { academyId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.school.findMany({
        where: { academyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return {
    questions: pageData.questions,
    total: pageData.total,
    totalPages: pageData.totalPages,
    statusCounts: pageData.statusCounts,
    collections,
    classes,
    schools,
  };
}

/**
 * 임베드 전용 경량 재료(2026-08-14 비용 감사 — §3.10.17-e (m)).
 *
 * 클래스 스튜디오 인-플로우 조판은 `hideQuestionLibrary` 로 좌측 문항
 * 라이브러리를 아예 렌더하지 않는데, getExamPaperBuilderData 응답 바이트의
 * 99.96% 가 바로 그 라이브러리용 문항 100건이었다(실측 976KB/회, 그걸 만들려고
 * 학원 전량 스캔). 이 액션은 **저장 폼이 실제로 쓰는 반·학교만** 읽는다.
 *
 * 반환 형태는 getExamPaperBuilderData 와 동일해 빌더 prop 계약이 바뀌지 않는다
 * (문항·폴더·카운트는 빈 값 — 소비처가 전부 QuestionLibraryPanel 서브트리라
 * hideQuestionLibrary 에서 렌더되지 않는다). 조판에 올릴 문항은 빌더가
 * syncQuestionIds → getExamPaperBuilderQuestionsByIds 로 **필요한 id 만**
 * 가져오므로 체크→조판 계약은 그대로다.
 *
 * ⚠ 기존 액션 본문은 한 글자도 건드리지 않는다 — 독립 라우트 5곳
 * (exams/create · workbench/exams/create 재수출 · korean/exams/create ·
 *  korean·workbench 의 [examId]/edit)의 SSR 바이트를 불변으로 두기 위함이고,
 * 국어 호출 리터럴은 단위 테스트(ko-isolation-scope-wiring ISO-5)가 소스
 * 문자열로 고정하고 있다.
 */
export async function getExamPaperBuilderEmbedData(academyId: string) {
  const staff = await requireStaffAuth();
  const empty = {
    questions: [] as Awaited<
      ReturnType<typeof loadBuilderQuestionsBySurfacePage>
    >,
    total: 0,
    totalPages: 1,
    statusCounts: { all: 0, approved: 0, pending: 0 },
    collections: [] as Awaited<
      ReturnType<typeof getExamPaperBuilderData>
    >["collections"],
    classes: [] as { id: string; name: string }[],
    schools: [] as { id: string; name: string }[],
  };
  if (staff.academyId !== academyId) return empty;

  const [classes, schools] = await Promise.all([
    prisma.class.findMany({
      where: { academyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.school.findMany({
      where: { academyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { ...empty, classes, schools };
}

// 현재 페이지에 없는(다른 페이지·전체선택·생성 시드) 문항을 미리보기에 올릴 때 그
// 문항 데이터만 ID 로 배치 로드한다. take 제한 없음 — 전체선택 시 수천 개도 채운다.
// 반환 형태는 목록 원소와 동일(BuilderQuestion).
export async function getExamPaperBuilderQuestionsByIds(
  academyId: string,
  ids: string[],
) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  return prisma.question.findMany({
    // 휴지통 가드 + 테넌트 가드 — 남의 학원/삭제된 문항은 절대 반환하지 않는다.
    where: { id: { in: unique }, academyId, deletedAt: null },
    include: BUILDER_QUESTION_INCLUDE,
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
  });
}

// 세트 멤버 하나를 시험지에 담을 때는 같은 QuestionSet 의 모든 멤버를 프리셋 순서대로
// 함께 담아야 한다. 렌더러는 기존 PaperItem 렌더 체인을 그대로 쓰고, 여기서는 데이터만
// "세트 단위"로 확장한다.
export async function getExamPaperBuilderSetMemberQuestionsByQuestionIds(
  academyId: string,
  ids: string[],
) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];

  const seeds = await prisma.question.findMany({
    where: {
      id: { in: unique },
      academyId,
      deletedAt: null,
      setId: { not: null },
    },
    select: { id: true, setId: true },
  });
  if (seeds.length === 0) return [];

  const setIdByQuestionId = new Map(
    seeds
      .filter((seed): seed is { id: string; setId: string } => Boolean(seed.setId))
      .map((seed) => [seed.id, seed.setId]),
  );
  const orderedSetIds: string[] = [];
  const seenSetIds = new Set<string>();
  for (const id of unique) {
    const setId = setIdByQuestionId.get(id);
    if (setId && !seenSetIds.has(setId)) {
      seenSetIds.add(setId);
      orderedSetIds.push(setId);
    }
  }
  if (orderedSetIds.length === 0) return [];

  const members = await prisma.questionSetItem.findMany({
    where: {
      setId: { in: orderedSetIds },
      question: { academyId, deletedAt: null },
    },
    include: {
      question: {
        include: BUILDER_QUESTION_INCLUDE,
      },
    },
    orderBy: [{ setId: "asc" }, { orderInSet: "asc" }],
  });

  const bySetId = new Map<string, typeof members>();
  for (const member of members) {
    const bucket = bySetId.get(member.setId) ?? [];
    bucket.push(member);
    bySetId.set(member.setId, bucket);
  }

  return orderedSetIds.flatMap((setId) =>
    (bySetId.get(setId) ?? []).map((member) => member.question),
  );
}

export async function getExamPaperBuilderQuestionSetsBySetIds(
  academyId: string,
  setIds: string[],
): Promise<QuestionSetForRender[]> {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  const orderedSetIds = Array.from(
    new Set(
      setIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  );
  if (orderedSetIds.length === 0) return [];

  const sets = await prisma.questionSet.findMany({
    where: {
      id: { in: orderedSetIds },
      academyId,
      items: { some: { question: { deletedAt: null } } },
    },
    include: {
      items: {
        where: { question: { deletedAt: null } },
        orderBy: { orderInSet: "asc" },
        include: {
          question: {
            include: {
              explanation: true,
              passage: { select: { id: true, title: true } },
            },
          },
        },
      },
      basePassage: { select: { id: true, title: true } },
    },
  });

  const bySetId = new Map(sets.map((set) => [set.id, mapBuilderQuestionSet(set)]));
  return orderedSetIds
    .map((setId) => bySetId.get(setId))
    .filter((set): set is QuestionSetForRender => Boolean(set));
}

// ─── 서버 페이지네이션 (문제관리 페이지와 동일 구조) ────────────────────────────
// 좌측 목록을 cap 까지 한 번에 받지 않고 100개/page 로 서버에서 잘라 받는다. 브라우징
// 부하를 보유 문제 수와 무관하게 일정하게 유지한다. 선택/미리보기는 ID 기반 작업세트로
// 분리돼 getExamPaperBuilderQuestionIds + getExamPaperBuilderQuestionsByIds 가 담당한다.
// (BUILDER_PAGE_SIZE 는 "use server" 제약상 ./workbench/_question-where 에 정의.)

// 목록 한 페이지 + 전체 개수/총 페이지수 + 검수상태 세그먼트 개수(statusCounts).
// statusCounts 는 approved 필터를 뺀 집합 기준이라 한 번의 groupBy 로 계산한다.
export async function getExamPaperBuilderQuestionsPage(
  academyId: string,
  filters: WorkbenchQuestionFilters,
) {
  const empty = {
    questions: [] as unknown[],
    total: 0,
    page: 1,
    totalPages: 1,
    statusCounts: { all: 0, approved: 0, pending: 0 },
  };
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return empty;

  return loadBuilderSurfacePage(academyId, filters);
}

// 전체 선택용 — 현재 필터에 매칭되는 모든 문항 ID(정렬 순). 페이지와 무관한 작업세트
// 구성에 쓴다. 풀 데이터가 아니라 ID 만 반환하므로 수천 개여도 가볍다(4000개≈100KB).
export async function getExamPaperBuilderQuestionIds(
  academyId: string,
  filters: WorkbenchQuestionFilters,
): Promise<string[]> {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];
  const items = await loadBuilderSurfaceItems(academyId, filters);
  return items.flatMap((item) =>
    item.kind === "question" ? [item.id] : (item.memberQuestionIds ?? []),
  );
}

// rank 페이지 점프용 — 현재 필터/정렬에서 특정 문항이 몇 페이지(1-base)인지. 미리보기
// 블록 클릭 시 대상 카드가 다른 페이지면 그 페이지로 점프한 뒤 글로우/스크롤한다.
export async function getExamPaperBuilderQuestionPageOf(
  academyId: string,
  questionId: string,
  filters: WorkbenchQuestionFilters,
): Promise<number | null> {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return null;
  const limit = filters.limit || BUILDER_PAGE_SIZE;
  const target = await prisma.question.findFirst({
    where: { id: questionId, academyId, deletedAt: null },
    select: { id: true, setId: true },
  });
  if (!target) return null;
  const items = await loadBuilderSurfaceItems(academyId, filters);
  const index = items.findIndex((item) =>
    target.setId
      ? item.kind === "set" && item.id === target.setId
      : item.kind === "question" && item.id === target.id,
  );
  return index >= 0 ? Math.floor(index / limit) + 1 : null;
}

export async function saveExamPaperDraft(
  academyId: string,
  input: ExamPaperBuilderSaveInput,
) {
  try {
    const staff = await requireStaffAuth();
    if (staff.academyId !== academyId) {
      return { success: false as const, error: "학원 정보가 일치하지 않습니다." };
    }

    const normalizedItems = input.items
      .filter((item) => item.questionId)
      .map((item, index) => {
        const objectiveAnswerSlots = Math.max(
          0,
          Math.min(10, Number(item.objectiveAnswerSlots) || 0),
        );
        return {
          ...item,
          blockType: "question" as const,
          orderNum: index + 1,
          points: Math.max(1, Math.min(100, Number(item.points) || 1)),
          answerSpaceLines: Math.max(0, Math.min(12, Number(item.answerSpaceLines) || 0)),
          objectiveAnswerSlots,
          objectiveAnswerTexts: normalizeObjectiveAnswerTexts(
            item.objectiveAnswerTexts,
            objectiveAnswerSlots,
          ),
          breakBefore:
            item.breakBefore === "column" || item.breakBefore === "page"
              ? item.breakBefore
              : "auto",
          keepWithPrev: Boolean(item.keepWithPrev),
        };
      });
    const rawBlocks: ExamPaperBuilderBlockInput[] = input.blocks?.length
      ? input.blocks
      : normalizedItems.map((item) => ({
          ...item,
          localId: item.localId || item.questionId,
          blockType: "question" as const,
          breakBefore: item.breakBefore as ExamPaperBuilderBlockInput["breakBefore"],
          locked: false,
          blockTitle: "",
          blockText: "",
          blockAlign: "left" as const,
          blockFontSize: "md" as const,
          blockAccentColor: "#2563EB",
          dividerStyle: "solid" as const,
          dividerThickness: 1,
          spacerHeight: 32,
          imageDataUrl: null,
          imageAlt: "",
          imageWidth: 70,
          objectiveAnswerSlots: item.objectiveAnswerSlots,
          objectiveAnswerTexts: item.objectiveAnswerTexts,
        }));
    const normalizedBlocks = rawBlocks
      .filter((block) => block.localId && block.blockType)
      .map((block, index) => {
        const objectiveAnswerSlots = Math.max(
          0,
          Math.min(10, Number(block.objectiveAnswerSlots) || 0),
        );
        return {
          ...block,
          orderNum:
            block.blockType === "question"
              ? Math.max(1, Number(block.orderNum) || index + 1)
              : 0,
          points: Math.max(0, Math.min(100, Number(block.points) || 0)),
          answerSpaceLines: Math.max(0, Math.min(12, Number(block.answerSpaceLines) || 0)),
          objectiveAnswerSlots,
          objectiveAnswerTexts: normalizeObjectiveAnswerTexts(
            block.objectiveAnswerTexts,
            objectiveAnswerSlots,
          ),
          breakBefore:
            block.breakBefore === "column" || block.breakBefore === "page"
              ? block.breakBefore
              : "auto",
          keepWithPrev: Boolean(block.keepWithPrev),
          locked: Boolean(block.locked),
          blockAlign:
            block.blockAlign === "center" || block.blockAlign === "right"
              ? block.blockAlign
              : "left",
          blockFontSize:
            block.blockFontSize === "sm" || block.blockFontSize === "lg"
              ? block.blockFontSize
              : "md",
          blockBold: Boolean(block.blockBold),
          blockItalic: Boolean(block.blockItalic),
          blockFontPt:
            typeof block.blockFontPt === "number" && Number.isFinite(block.blockFontPt)
              ? Math.min(60, Math.max(5, Math.round(block.blockFontPt)))
              : null,
          blockAccentColor:
            typeof block.blockAccentColor === "string" && block.blockAccentColor
              ? block.blockAccentColor
              : "#2563EB",
          dividerStyle:
            block.dividerStyle === "dashed" || block.dividerStyle === "dotted"
              ? block.dividerStyle
              : "solid",
          dividerThickness: Math.max(1, Math.min(8, Number(block.dividerThickness) || 1)),
          spacerHeight: Math.max(8, Math.min(160, Number(block.spacerHeight) || 32)),
          imageWidth: Math.max(20, Math.min(100, Number(block.imageWidth) || 70)),
        };
      });

    if (!input.title.trim()) {
      return { success: false as const, error: "시험지 제목을 입력해주세요." };
    }
    if (normalizedItems.length === 0) {
      return { success: false as const, error: "시험지에 넣을 문제를 선택해주세요." };
    }

    const questionIds = [...new Set(normalizedItems.map((item) => item.questionId))];
    const ownedQuestions = await prisma.question.findMany({
      // 휴지통 가드 — 삭제(휴지통)된 문제는 시험지에 새로 담아 저장할 수 없다.
      where: { academyId: staff.academyId, id: { in: questionIds }, deletedAt: null },
      select: { id: true },
    });
    if (ownedQuestions.length !== questionIds.length) {
      return { success: false as const, error: "일부 문제가 현재 학원에 속하지 않습니다." };
    }

    if (input.classId) {
      const cls = await prisma.class.findFirst({
        where: { id: input.classId, academyId: staff.academyId },
        select: { id: true },
      });
      if (!cls) return { success: false as const, error: "반을 찾을 수 없습니다." };
    }

    if (input.schoolId) {
      const school = await prisma.school.findFirst({
        where: { id: input.schoolId, academyId: staff.academyId },
        select: { id: true },
      });
      if (!school) return { success: false as const, error: "학교를 찾을 수 없습니다." };
    }

    let existingExam: {
      id: string;
      status: string;
      type: string;
      duration: number | null;
      shuffleQuestions: boolean;
      shuffleOptions: boolean;
      showResults: boolean;
    } | null = null;

    if (input.examId) {
      existingExam = await prisma.exam.findFirst({
        where: { id: input.examId, academyId: staff.academyId },
        select: {
          id: true,
          status: true,
          type: true,
          duration: true,
          shuffleQuestions: true,
          shuffleOptions: true,
          showResults: true,
        },
      });
      if (!existingExam) return { success: false as const, error: "시험지를 찾을 수 없습니다." };
      if (existingExam.status === "ARCHIVED") {
        return { success: false as const, error: "보관된 시험지는 편집할 수 없습니다." };
      }
    }

    const normalizedLayout = {
      ...input.layout,
      paperSize: input.layout.paperSize === "B4" ? "B4" : "A4",
    };
    const numericAutoPointTotal = Number(input.scoring?.autoPointTotal);
    const normalizedScoring = {
      autoPointTotal:
        Number.isFinite(numericAutoPointTotal) && numericAutoPointTotal >= 1
          ? Math.min(999, Math.round(numericAutoPointTotal))
          : null,
    };

    const settings = JSON.stringify({
      source: "exam-paper-builder-v2",
      version: 2,
      template: input.template,
      scoring: normalizedScoring,
      layout: normalizedLayout,
      header: input.header,
      cover: input.cover
        ? {
            enabled: Boolean(input.cover.enabled),
            template:
              input.cover.template === "band" || input.cover.template === "minimal"
                ? input.cover.template
                : "classic",
            eyebrow: String(input.cover.eyebrow ?? ""),
            footnote: String(input.cover.footnote ?? ""),
            showLogo: input.cover.showLogo !== false,
            showInfo: input.cover.showInfo !== false,
          }
        : undefined,
      items: normalizedItems,
      blocks: normalizedBlocks,
      savedAt: new Date().toISOString(),
    });
    const linkedQuestionIds = new Set<string>();
    const examQuestionLinks = normalizedItems
      .filter((item) => {
        if (linkedQuestionIds.has(item.questionId)) return false;
        linkedQuestionIds.add(item.questionId);
        return true;
      })
      .map((item, index) => ({
        questionId: item.questionId,
        orderNum: index + 1,
        points: item.points,
      }));

    const examData = {
      title: input.title.trim(),
      type: existingExam?.type || input.type || "OFFLINE",
      classId: input.classId || null,
      schoolId: input.schoolId || null,
      grade: input.grade || null,
      semester: input.semester || null,
      examType: input.examType || null,
      examDate: input.examDate ? new Date(input.examDate) : null,
      duration: input.duration || existingExam?.duration || null,
      totalPoints: input.totalPoints || normalizedItems.reduce((sum, item) => sum + item.points, 0),
      shuffleQuestions: existingExam?.shuffleQuestions ?? false,
      shuffleOptions: existingExam?.shuffleOptions ?? false,
      showResults: existingExam?.showResults ?? true,
      settings,
    };

    const exam = await prisma.$transaction(async (tx) => {
      const saved = input.examId
        ? await tx.exam.update({
            where: { id: input.examId },
            // 재저장(수정)이므로 저장 횟수와 수정 횟수를 모두 +1.
            data: {
              ...examData,
              saveCount: { increment: 1 },
              editCount: { increment: 1 },
            },
            select: { id: true },
          })
        : await tx.exam.create({
            data: {
              ...examData,
              academyId: staff.academyId,
              status: "DRAFT",
              // 최초 생성도 저장 1회로 집계. 수정 횟수는 0에서 시작.
              saveCount: 1,
              // 과목 스탬핑 — 신규 국어 시험지만 'KOREAN'. 미지정이면 subject 미포함
              // (조건부 spread) → 영어 저장 무회귀. 이 create 가 빌더에서 저장되는
              // 신규 시험지의 유일한 subject 스탬핑 지점이다(update 는 subject 불변).
              ...(input.subject ? { subject: input.subject } : {}),
            },
            select: { id: true },
          });

      // 휴지통 한계(의도된 동작): 빌더는 getExam 으로 살아있는 문제만 불러오므로
      // examQuestionLinks 에는 휴지통(삭제) 문제가 없다. 여기서 기존 링크를 전부 지우고
      // 다시 만들면, 이 시험지에 들어있던 "삭제된 문제"의 링크도 사라진다.
      // → 그 문제를 나중에 복원해도 이 시험지에는 자동 재배치되지 않는다(문제은행/폴더로는 복원됨).
      //   링크를 보존하려면 examQuestion @@unique([examId, orderNum]) 충돌을 피하는 재번호가
      //   필요하므로, 드문 엣지(삭제 문제를 품은 시험지를 편집 저장)에 대해선 이 동작을 수용한다.
      await tx.examQuestion.deleteMany({ where: { examId: saved.id } });
      await tx.examQuestion.createMany({
        data: examQuestionLinks.map((item) => ({
          ...item,
          examId: saved.id,
        })),
      });

      return saved;
    });

    revalidatePath("/director/exams");
    revalidatePath("/director/workbench/exams");
    revalidatePath(`/director/exams/${exam.id}`);
    revalidatePath(`/director/workbench/exams/${exam.id}/edit`);
    return { success: true as const, id: exam.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "시험지 저장 중 오류가 발생했습니다.";
    return { success: false as const, error: message };
  }
}
