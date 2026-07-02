"use server";

import { revalidatePath } from "next/cache";
import { requireStaffAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  assertClassBelongsToAcademy,
  assertExamBelongsToAcademy,
  assertQuestionsBelongToAcademy,
} from "./_helpers";
import type {
  ActionResult,
  ExamCreateData,
  ExamFilters,
} from "./_types";
import {
  buildExamSubjectScopeWhere,
  isMissingColumnError,
} from "./_exam-subject-where";

// ---------------------------------------------------------------------------
// Exam CRUD
// ---------------------------------------------------------------------------

export async function getExams(academyId: string, filters?: ExamFilters) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) return [];

  // 비-과목 필터는 baseWhere 에 모은다(과목 스코프는 아래에서 분기 합류).
  const baseWhere: Record<string, unknown> = { academyId };

  if (filters?.type && filters.type !== "ALL") baseWhere.type = filters.type;
  if (filters?.status && filters.status !== "ALL") baseWhere.status = filters.status;
  if (filters?.classId) baseWhere.classId = filters.classId;
  if (filters?.collectionId) {
    baseWhere.collectionItems = { some: { collectionId: filters.collectionId } };
  }
  if (filters?.search) {
    baseWhere.title = { contains: filters.search, mode: "insensitive" };
  }
  if (filters?.dateFrom || filters?.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters?.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters?.dateTo) dateFilter.lte = new Date(filters.dateTo);
    baseWhere.examDate = dateFilter;
  }

  const include = {
    class: { select: { id: true, name: true } },
    school: { select: { id: true, name: true } },
    // 휴지통 가드 — 목록 카드의 "N문항" 배지는 삭제된 문제를 빼고 센다(상세/출력과 일치).
    _count: {
      select: {
        questions: { where: { question: { deletedAt: null } } },
        submissions: true,
      },
    },
  } as const;
  const orderBy = { createdAt: "desc" as const };

  // 워크스페이스 상호 격리(유저 확정) — 판별자 일급화(P0): 국어/영어 시험지 분리는
  // exams.subject 컬럼으로 판정한다. filters.subject 미지정=영어(subject null 또는
  // ≠KOREAN), "KOREAN"=국어. 백필(ko-exam-set-subject.sql)이 "살아있는 KO_ 문항 1개
  // 이상" 시험지에 'KOREAN' 을 스탬프해, 기존 none-clause(deletedAt null + KO_)와
  // 정확한 여집합 대칭을 이룬다.
  try {
    return await prisma.exam.findMany({
      where: { ...baseWhere, ...buildExamSubjectScopeWhere(filters?.subject) },
      include,
      orderBy,
    });
  } catch (error) {
    // 우아한 강등 — subject 컬럼이 아직 없으면(P2022, surgical ALTER 이전) 레거시
    // subType 'KO_' 조인추론으로 폴백한다. 영어=none(KO 제외), 국어=some(KO 포함),
    // deletedAt null 로 동일 모집단 대칭. subject 를 SELECT 하지 않게 omit 한다.
    if (!isMissingColumnError(error)) throw error;
    return await prisma.exam.findMany({
      where: {
        ...baseWhere,
        questions:
          filters?.subject === "KOREAN"
            ? { some: { question: { deletedAt: null, subType: { startsWith: "KO_" } } } }
            : { none: { question: { deletedAt: null, subType: { startsWith: "KO_" } } } },
      },
      include,
      orderBy,
      omit: { subject: true },
    });
  }
}

export async function getExam(examId: string) {
  const staff = await requireStaffAuth();

  // Scope lookup to the caller's academy so a manipulated examId can't
  // read another tenant's exam (including its full question bodies).
  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      questions: {
        // 휴지통(soft delete) 가드 — 삭제된 문제는 시험지 상세/미리보기/편집에서 제외.
        where: { question: { deletedAt: null } },
        include: {
          question: {
            include: {
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
              explanation: true,
              collectionItems: {
                select: { collectionId: true },
              },
              _count: { select: { examLinks: true } },
            },
          },
        },
        orderBy: { orderNum: "asc" },
      },
      submissions: {
        include: {
          student: { select: { id: true, name: true, studentCode: true } },
        },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  return exam;
}

// ---------------------------------------------------------------------------
// getExamPreviewData — 시험지 카드의 "첫 장 미리보기"용 경량 조회.
//   getExam 과 같은 문항/지문/설정을 가져오되, 무거운 submissions/채점 데이터는
//   제외한다. 목록 카드가 보일 때마다 examId 별로 lazy 하게 호출된다.
// ---------------------------------------------------------------------------
export async function getExamPreviewData(examId: string) {
  const staff = await requireStaffAuth();

  const exam = await prisma.exam.findFirst({
    where: { id: examId, academyId: staff.academyId },
    include: {
      class: { select: { id: true, name: true } },
      school: { select: { id: true, name: true } },
      questions: {
        // 휴지통(soft delete) 가드 — 삭제된 문제는 시험지 상세/미리보기/편집에서 제외.
        where: { question: { deletedAt: null } },
        include: {
          question: {
            include: {
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
              explanation: true,
              collectionItems: {
                select: { collectionId: true },
              },
              _count: { select: { examLinks: true } },
            },
          },
        },
        orderBy: { orderNum: "asc" },
      },
    },
  });

  if (!exam) return null;

  // 미리보기 빌더는 submissions 를 읽지 않으므로 빈 배열로 채워 ExamDetail 형태를 맞춘다.
  return { ...exam, submissions: [] };
}

export async function createExam(
  academyId: string,
  data: ExamCreateData,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0 guard: caller must not be able to forge the academyId argument.
    // The session's academyId is the source of truth.
    if (staff.academyId !== academyId) {
      return { success: false, error: "학원 정보가 일치하지 않습니다." };
    }

    // If caller passed a classId, verify it belongs to this academy.
    if (data.classId) {
      await assertClassBelongsToAcademy(data.classId, staff.academyId);
    }

    // If caller pre-populated questions, each questionId must be owned
    // by this academy — otherwise we'd let them attach another tenant's
    // question rows to our new exam.
    if (data.questions && data.questions.length > 0) {
      await assertQuestionsBelongToAcademy(
        data.questions.map((q) => q.questionId),
        staff.academyId,
      );
    }

    const exam = await prisma.exam.create({
      data: {
        academyId: staff.academyId,
        title: data.title,
        type: data.type,
        classId: data.classId || null,
        schoolId: data.schoolId || null,
        grade: data.grade || null,
        semester: data.semester || null,
        examType: data.examType || null,
        examDate: data.examDate ? new Date(data.examDate) : null,
        duration: data.duration || null,
        totalPoints: data.totalPoints,
        shuffleQuestions: data.shuffleQuestions || false,
        shuffleOptions: data.shuffleOptions || false,
        showResults: data.showResults ?? true,
        status: "DRAFT",
        // 과목 스탬핑 — 국어 라우트 생성만 'KOREAN'. 미지정이면 INSERT 에 subject 를
        // 아예 넣지 않아(조건부 spread) 컬럼 미ALTER DB(P2022)에서도 영어 생성 무회귀.
        ...(data.subject ? { subject: data.subject } : {}),
      },
    });

    if (data.questions && data.questions.length > 0) {
      await prisma.examQuestion.createMany({
        data: data.questions.map((q) => ({
          examId: exam.id,
          questionId: q.questionId,
          points: q.points,
          orderNum: q.orderNum,
        })),
      });
    }

    revalidatePath("/director/exams");
    return { success: true, id: exam.id };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 생성 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function updateExam(
  examId: string,
  data: Partial<ExamCreateData>,
): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // P0 guard: the exam must belong to the caller's academy before any
    // update touches its row. Without this, any staff of any academy
    // could overwrite this exam.
    await assertExamBelongsToAcademy(examId, staff.academyId);

    if (data.classId) {
      await assertClassBelongsToAcademy(data.classId, staff.academyId);
    }

    await prisma.exam.update({
      where: { id: examId },
      data: {
        title: data.title,
        type: data.type,
        classId: data.classId,
        schoolId: data.schoolId,
        grade: data.grade,
        semester: data.semester,
        examType: data.examType,
        examDate: data.examDate ? new Date(data.examDate) : undefined,
        duration: data.duration,
        totalPoints: data.totalPoints,
        shuffleQuestions: data.shuffleQuestions,
        shuffleOptions: data.shuffleOptions,
        showResults: data.showResults,
      },
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 수정 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

export async function deleteExam(examId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    // Scope the existence check to the caller's academy. Previously we
    // did findUnique(id) which would happily return a cross-tenant exam
    // and then delete it.
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true, status: true },
    });
    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam.status !== "DRAFT") {
      return { success: false, error: "초안 상태의 시험만 삭제할 수 있습니다." };
    }

    await prisma.exam.delete({ where: { id: examId } });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 삭제 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

// Bulk delete: scoped to caller's academy, only DRAFT exams. Returns counts so
// the UI can communicate how many were actually removed (vs cross-tenant or
// non-DRAFT ids that were silently skipped).
export async function bulkDeleteExams(examIds: string[]): Promise<{
  success: boolean;
  requested: number;
  deleted: number;
  skippedNonDraft: number;
  error?: string;
}> {
  try {
    const staff = await requireStaffAuth();
    if (examIds.length === 0) {
      return {
        success: true,
        requested: 0,
        deleted: 0,
        skippedNonDraft: 0,
      };
    }

    // Pre-filter to DRAFT exams owned by this academy so we can report a
    // skipped count for non-DRAFT items the user picked.
    const eligible = await prisma.exam.findMany({
      where: {
        id: { in: examIds },
        academyId: staff.academyId,
        status: "DRAFT",
      },
      select: { id: true },
    });
    const eligibleIds = eligible.map((e) => e.id);

    const result = eligibleIds.length
      ? await prisma.exam.deleteMany({
          where: { id: { in: eligibleIds }, academyId: staff.academyId },
        })
      : { count: 0 };

    revalidatePath("/director/exams");
    return {
      success: true,
      requested: examIds.length,
      deleted: result.count,
      skippedNonDraft: examIds.length - eligibleIds.length,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 삭제 중 오류가 발생했습니다.";
    return {
      success: false,
      requested: examIds.length,
      deleted: 0,
      skippedNonDraft: 0,
      error: message,
    };
  }
}

export async function publishExam(examId: string): Promise<ActionResult> {
  try {
    const staff = await requireStaffAuth();

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      // 휴지통 가드 — 문제가 전부 삭제(휴지통)된 시험지는 링크가 남아도 "빈 시험지"이므로
      // 배포 불가여야 한다. 살아있는 문제만 센다.
      include: {
        _count: { select: { questions: { where: { question: { deletedAt: null } } } } },
      },
    });

    if (!exam) return { success: false, error: "시험을 찾을 수 없습니다." };
    if (exam._count.questions === 0) {
      return { success: false, error: "문제가 없는 시험은 배포할 수 없습니다." };
    }

    await prisma.exam.update({
      where: { id: examId },
      data: { status: "PUBLISHED" },
    });

    revalidatePath("/director/exams");
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "시험 배포 중 오류가 발생했습니다.";
    return { success: false, error: message };
  }
}

/**
 * incrementExamPrintCount — PDF 인쇄(window.print) 시 인쇄 횟수를 +1 한다.
 * HWPX/DOCX 내보내기는 각 export 라우트에서 직접 증가시키므로, 이 액션은
 * 클라이언트에서만 일어나는 브라우저 인쇄를 집계하기 위한 보완 경로다.
 */
export async function incrementExamPrintCount(examId: string) {
  try {
    const staff = await requireStaffAuth();
    const exam = await prisma.exam.findFirst({
      where: { id: examId, academyId: staff.academyId },
      select: { id: true },
    });
    if (!exam) return { success: false as const, error: "시험을 찾을 수 없습니다." };

    await prisma.exam.update({
      where: { id: examId },
      data: { printCount: { increment: 1 } },
    });

    revalidatePath("/director/exams");
    revalidatePath("/director/workbench/exams");
    return { success: true as const };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "인쇄 집계 중 오류가 발생했습니다.";
    return { success: false as const, error: message };
  }
}
