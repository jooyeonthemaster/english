"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffAuth } from "@/lib/auth";

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
        // Which exam papers already include this question — surfaced on the
        // library card as a "사용 이력" band so teachers can see at a glance
        // whether a question has been used before (and in which papers).
        examLinks: {
          select: {
            exam: { select: { id: true, title: true, createdAt: true } },
          },
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
