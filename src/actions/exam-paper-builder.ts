"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";
import type { WorkbenchQuestionFilters } from "./workbench/_types";
import {
  buildBuilderQuestionWhere,
  BUILDER_PAGE_SIZE,
} from "./workbench/_question-where";

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

// 좌측 목록은 문제관리 페이지와 동일하게 서버 페이지네이션(100/page)으로 받는다.
// 초기 진입(SSR)은 1페이지 + 전체개수/총페이지/검수상태 개수만 내려주고, 이후 페이지/
// 필터 변경은 클라이언트가 getExamPaperBuilderQuestionsPage 로 가져온다. 선택/미리보기는
// ID 기반 작업세트(getExamPaperBuilderQuestionIds + ...QuestionsByIds)가 담당한다.
export async function getExamPaperBuilderData(academyId: string) {
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
  const where = buildBuilderQuestionWhere(academyId, { sort: "newest" });

  const [questions, total, grouped, collections, classes, schools] =
    await Promise.all([
      prisma.question.findMany({
        where,
        include: BUILDER_QUESTION_INCLUDE,
        orderBy: builderOrderBy("newest"),
        skip: 0,
        take: BUILDER_PAGE_SIZE,
      }),
      prisma.question.count({ where }),
      prisma.question.groupBy({
        by: ["approved"],
        where,
        _count: { _all: true },
      }),
      prisma.questionCollection.findMany({
        where: { academyId },
        include: { _count: { select: { items: true, children: true } } },
        orderBy: { name: "asc" },
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

  let all = 0;
  let approved = 0;
  for (const g of grouped) {
    all += g._count._all;
    if (g.approved) approved += g._count._all;
  }

  return {
    questions,
    total,
    totalPages: Math.max(1, Math.ceil(total / BUILDER_PAGE_SIZE)),
    statusCounts: { all, approved, pending: all - approved },
    collections,
    classes,
    schools,
  };
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

// ─── 서버 페이지네이션 (문제관리 페이지와 동일 구조) ────────────────────────────
// 좌측 목록을 cap 까지 한 번에 받지 않고 100개/page 로 서버에서 잘라 받는다. 브라우징
// 부하를 보유 문제 수와 무관하게 일정하게 유지한다. 선택/미리보기는 ID 기반 작업세트로
// 분리돼 getExamPaperBuilderQuestionIds + getExamPaperBuilderQuestionsByIds 가 담당한다.
// (BUILDER_PAGE_SIZE 는 "use server" 제약상 ./workbench/_question-where 에 정의.)

// 빌더 정렬값 → Prisma orderBy. 페이지 경계가 흔들리지 않도록 항상 { id } 로 최종
// tie-break 한다(rank 페이지 계산도 이 결정적 순서를 전제로 한다). 난이도는 문자열
// BASIC<INTERMEDIATE<KILLER 가 난이도 순과 일치해 DB 정렬로 전역 정확히 처리된다.
function builderOrderBy(
  sort?: string,
): Prisma.QuestionOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "starred":
      return [{ starred: "desc" }, { createdAt: "desc" }, { id: "asc" }];
    case "difficulty_desc":
      return [{ difficulty: "desc" }, { createdAt: "desc" }, { id: "asc" }];
    case "difficulty_asc":
      return [{ difficulty: "asc" }, { createdAt: "desc" }, { id: "asc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

// 정렬 순에서 target 보다 "앞"에 오는 행을 고르는 keyset 술어(OR of AND-chains).
// rank = count(base AND before) → page = floor(rank/limit)+1. starred 는 Boolean 이라
// gt/lt 가 없으므로 "true 가 항상 앞" 으로 특수 처리한다.
function builderBeforeWhere(
  sort: string | undefined,
  t: { id: string; createdAt: Date; starred: boolean; difficulty: string },
): Prisma.QuestionWhereInput {
  const createdThenId = (
    first: Prisma.QuestionWhereInput,
  ): Prisma.QuestionWhereInput[] => [
    first,
    { createdAt: t.createdAt, id: { lt: t.id } },
  ];
  switch (sort) {
    case "oldest":
      return { OR: createdThenId({ createdAt: { lt: t.createdAt } }) };
    case "starred": {
      const or: Prisma.QuestionWhereInput[] = [];
      if (!t.starred) or.push({ starred: true }); // starred=true 가 항상 앞
      or.push({ starred: t.starred, createdAt: { gt: t.createdAt } });
      or.push({ starred: t.starred, createdAt: t.createdAt, id: { lt: t.id } });
      return { OR: or };
    }
    case "difficulty_desc":
      return {
        OR: [
          { difficulty: { gt: t.difficulty } },
          { difficulty: t.difficulty, createdAt: { gt: t.createdAt } },
          { difficulty: t.difficulty, createdAt: t.createdAt, id: { lt: t.id } },
        ],
      };
    case "difficulty_asc":
      return {
        OR: [
          { difficulty: { lt: t.difficulty } },
          { difficulty: t.difficulty, createdAt: { gt: t.createdAt } },
          { difficulty: t.difficulty, createdAt: t.createdAt, id: { lt: t.id } },
        ],
      };
    case "newest":
    default:
      return { OR: createdThenId({ createdAt: { gt: t.createdAt } }) };
  }
}

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

  const limit = filters.limit || BUILDER_PAGE_SIZE;
  const page = Math.max(1, filters.page || 1);
  const where = buildBuilderQuestionWhere(academyId, filters);
  const baseWhere = buildBuilderQuestionWhere(academyId, {
    ...filters,
    approved: undefined,
  });

  const [questions, total, grouped] = await Promise.all([
    prisma.question.findMany({
      where,
      // 100개/page 라 해설 본문 포함해도 가벼움(≈한 페이지 <1MB) → A-lite(해설 지연
      // 로드)가 불필요해진다. 풀 include 로 받아 클라이언트 병합 로직을 없앤다.
      include: BUILDER_QUESTION_INCLUDE,
      orderBy: builderOrderBy(filters.sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.question.count({ where }),
    prisma.question.groupBy({
      by: ["approved"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  let all = 0;
  let approved = 0;
  for (const g of grouped) {
    const c = g._count._all;
    all += c;
    if (g.approved) approved += c;
  }

  return {
    questions,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    statusCounts: { all, approved, pending: all - approved },
  };
}

// 전체 선택용 — 현재 필터에 매칭되는 모든 문항 ID(정렬 순). 페이지와 무관한 작업세트
// 구성에 쓴다. 풀 데이터가 아니라 ID 만 반환하므로 수천 개여도 가볍다(4000개≈100KB).
export async function getExamPaperBuilderQuestionIds(
  academyId: string,
  filters: WorkbenchQuestionFilters,
): Promise<string[]> {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];
  const rows = await prisma.question.findMany({
    where: buildBuilderQuestionWhere(academyId, filters),
    orderBy: builderOrderBy(filters.sort),
    select: { id: true },
  });
  return rows.map((r) => r.id);
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
    select: { id: true, createdAt: true, starred: true, difficulty: true },
  });
  if (!target) return null;
  const rank = await prisma.question.count({
    where: {
      AND: [
        buildBuilderQuestionWhere(academyId, filters),
        builderBeforeWhere(filters.sort, target),
      ],
    },
  });
  return Math.floor(rank / limit) + 1;
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
