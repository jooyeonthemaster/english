"use client";

import { toast } from "sonner";
import { saveExamPaperDraft } from "@/actions/exam-paper-builder";
import type {
  ClassOption,
  Density,
  PaperItem,
  PaperTemplate,
  PassageStyle,
  SchoolOption,
} from "../paper-builder/types";

// ---------------------------------------------------------------------------
// `saveExamPaperDraft` 호출을 한 곳에 묶어두는 헬퍼.
// 메인 컴포넌트에서 상태 조각을 전달받아 단순한 결과 객체만 반환한다.
// ---------------------------------------------------------------------------

interface SaveDraftInput {
  academyId: string;
  savedExamId: string | null;
  title: string;
  classId: string;
  schoolId: string;
  grade: string;
  semester: string;
  examType: string;
  examDate: string;
  totalPoints: number;
  template: PaperTemplate;
  columns: 1 | 2;
  density: Density;
  showAnswerSpace: boolean;
  showPassageTitle: boolean;
  showQuestionMeta: boolean;
  passageStyle: PassageStyle;
  subtitle: string;
  studentNameLabel: string;
  instructions: string;
  academyLogoDataUrl: string | null;
  paperItems: PaperItem[];
  classes: ClassOption[];
  schools: SchoolOption[];
}

interface SaveDraftResult {
  success: boolean;
  id: string | null;
}

export async function saveExamPaperDraftFromBuilder(input: SaveDraftInput): Promise<SaveDraftResult> {
  if (input.paperItems.length === 0) {
    toast.error("시험지에 넣을 문제를 선택해주세요.");
    return { success: false, id: null };
  }

  const result = await saveExamPaperDraft(input.academyId, {
    examId: input.savedExamId,
    title: input.title,
    type: "OFFLINE",
    classId: input.classId || null,
    schoolId: input.schoolId || null,
    grade: input.grade ? Number(input.grade) : null,
    semester: input.semester || null,
    examType: input.examType || null,
    examDate: input.examDate || null,
    totalPoints: input.totalPoints || input.paperItems.length,
    template: input.template,
    layout: {
      columns: input.columns,
      density: input.density,
      showAnswerSpace: input.showAnswerSpace,
      showPassageTitle: input.showPassageTitle,
      showQuestionMeta: input.showQuestionMeta,
      passageStyle: input.passageStyle,
      pageNumberStyle: "center",
    },
    header: {
      subtitle: input.subtitle,
      schoolName: input.schools.find((school) => school.id === input.schoolId)?.name,
      className: input.classes.find((cls) => cls.id === input.classId)?.name,
      studentNameLabel: input.studentNameLabel,
      instructions: input.instructions,
      academyLogoDataUrl: input.academyLogoDataUrl,
    },
    items: input.paperItems.map((item) => ({
      questionId: item.questionId,
      orderNum: item.orderNum,
      points: item.points,
      groupId: item.groupId,
      includePassage: item.includePassage,
      passageTitle: item.passageTitle,
      passageContent: item.passageContent,
      questionText: item.questionText,
      options: item.options,
      correctAnswer: item.correctAnswer,
      answerSpaceLines: item.answerSpaceLines,
      sectionTitle: item.sectionTitle,
      teacherNote: item.teacherNote,
    })),
  });

  if (!result.success) {
    toast.error(result.error || "시험지 저장 실패");
    return { success: false, id: null };
  }

  toast.success("시험지 관리에 초안으로 저장되었습니다.");
  return { success: true, id: result.id || null };
}
