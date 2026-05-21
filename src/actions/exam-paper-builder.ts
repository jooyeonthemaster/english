"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";

export interface ExamPaperBuilderItemInput {
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
  sectionTitle?: string;
  teacherNote?: string;
  breakBefore?: "auto" | "column" | "page";
  keepWithPrev?: boolean;
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
    columns: 1 | 2;
    density: "comfortable" | "compact";
    showAnswerSpace: boolean;
    showPassageTitle: boolean;
    showQuestionMeta: boolean;
    passageStyle: "boxed" | "plain" | "underlined";
    pageNumberStyle: "center" | "outside" | "none";
  };
  header: {
    subtitle?: string;
    schoolName?: string;
    className?: string;
    studentNameLabel?: string;
    instructions?: string;
    academyLogoDataUrl?: string | null;
  };
  items: ExamPaperBuilderItemInput[];
}

export async function getExamPaperBuilderData(academyId: string) {
  const staff = await requireStaffAuth();
  if (staff.academyId !== academyId) {
    return {
      questions: [],
      collections: [],
      classes: [],
      schools: [],
    };
  }

  const [questions, collections, classes, schools] = await Promise.all([
    prisma.question.findMany({
      where: { academyId },
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
        _count: { select: { examLinks: true } },
      },
      orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
      take: 400,
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

  return { questions, collections, classes, schools };
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
      .map((item, index) => ({
        ...item,
        orderNum: index + 1,
        points: Math.max(1, Math.min(100, Number(item.points) || 1)),
        answerSpaceLines: Math.max(0, Math.min(12, Number(item.answerSpaceLines) || 0)),
        breakBefore:
          item.breakBefore === "column" || item.breakBefore === "page"
            ? item.breakBefore
            : "auto",
        keepWithPrev: Boolean(item.keepWithPrev),
      }));

    if (!input.title.trim()) {
      return { success: false as const, error: "시험지 제목을 입력해주세요." };
    }
    if (normalizedItems.length === 0) {
      return { success: false as const, error: "시험지에 넣을 문제를 선택해주세요." };
    }

    const questionIds = [...new Set(normalizedItems.map((item) => item.questionId))];
    const ownedQuestions = await prisma.question.findMany({
      where: { academyId: staff.academyId, id: { in: questionIds } },
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

    if (input.examId) {
      const existing = await prisma.exam.findFirst({
        where: { id: input.examId, academyId: staff.academyId },
        select: { id: true, status: true },
      });
      if (!existing) return { success: false as const, error: "시험지를 찾을 수 없습니다." };
      if (existing.status !== "DRAFT") {
        return { success: false as const, error: "초안 상태의 시험지만 편집할 수 있습니다." };
      }
    }

    const settings = JSON.stringify({
      source: "exam-paper-builder-v1",
      template: input.template,
      layout: input.layout,
      header: input.header,
      items: normalizedItems,
      savedAt: new Date().toISOString(),
    });

    const examData = {
      academyId: staff.academyId,
      title: input.title.trim(),
      type: input.type || "OFFLINE",
      classId: input.classId || null,
      schoolId: input.schoolId || null,
      grade: input.grade || null,
      semester: input.semester || null,
      examType: input.examType || null,
      examDate: input.examDate ? new Date(input.examDate) : null,
      duration: input.duration || null,
      totalPoints: input.totalPoints || normalizedItems.reduce((sum, item) => sum + item.points, 0),
      shuffleQuestions: false,
      shuffleOptions: false,
      showResults: true,
      status: "DRAFT",
      settings,
    };

    const exam = await prisma.$transaction(async (tx) => {
      const saved = input.examId
        ? await tx.exam.update({
            where: { id: input.examId },
            data: examData,
            select: { id: true },
          })
        : await tx.exam.create({
            data: examData,
            select: { id: true },
          });

      await tx.examQuestion.deleteMany({ where: { examId: saved.id } });
      await tx.examQuestion.createMany({
        data: normalizedItems.map((item) => ({
          examId: saved.id,
          questionId: item.questionId,
          orderNum: item.orderNum,
          points: item.points,
        })),
      });

      return saved;
    });

    revalidatePath("/director/exams");
    revalidatePath("/director/workbench/exams");
    revalidatePath(`/director/exams/${exam.id}`);
    return { success: true as const, id: exam.id };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "시험지 저장 중 오류가 발생했습니다.";
    return { success: false as const, error: message };
  }
}
