"use client";

import { toast } from "sonner";
import { saveExamPaperDraft } from "@/actions/exam-paper-builder";
import { shouldForceSourcePassage } from "../paper-builder/passage-policy";
import type {
  ClassOption,
  Density,
  PaperItem,
  PaperSize,
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
  paperSize: PaperSize;
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

function serializePaperBlock(item: PaperItem) {
  const includePassage = resolveSerializableIncludePassage(item);
  return {
    localId: item.localId,
    blockType: item.blockType,
    orderNum: item.orderNum,
    questionId: item.blockType === "question" ? item.questionId : undefined,
    points: item.points,
    groupId: item.groupId,
    includePassage,
    passageTitle: item.passageTitle,
    passageContent: item.passageContent,
    questionText: item.questionText,
    options: item.options,
    correctAnswer: item.correctAnswer,
    answerSpaceLines: item.answerSpaceLines,
    objectiveAnswerSlots: item.objectiveAnswerSlots,
    objectiveAnswerTexts: item.objectiveAnswerTexts,
    sectionTitle: item.sectionTitle,
    teacherNote: item.teacherNote,
    breakBefore: item.breakBefore,
    keepWithPrev: item.keepWithPrev,
    locked: item.locked,
    blockTitle: item.blockTitle,
    blockText: item.blockText,
    blockAlign: item.blockAlign,
    blockFontSize: item.blockFontSize,
    blockAccentColor: item.blockAccentColor,
    dividerStyle: item.dividerStyle,
    dividerThickness: item.dividerThickness,
    spacerHeight: item.spacerHeight,
    imageDataUrl: item.imageDataUrl,
    imageAlt: item.imageAlt,
    imageWidth: item.imageWidth,
  };
}

function resolveSerializableIncludePassage(item: PaperItem) {
  if (item.blockType !== "question") return item.includePassage;
  const passageContent = item.passageContent || item.sourceQuestion.passage?.content || "";
  return (
    item.includePassage ||
    shouldForceSourcePassage({
      ...item.sourceQuestion,
      passage: item.sourceQuestion.passage
        ? { ...item.sourceQuestion.passage, content: passageContent }
        : { content: passageContent },
    })
  );
}

export async function saveExamPaperDraftFromBuilder(input: SaveDraftInput): Promise<SaveDraftResult> {
  const questionItems = input.paperItems.filter((item) => item.blockType === "question");

  if (questionItems.length === 0) {
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
    totalPoints: input.totalPoints || questionItems.length,
    template: input.template,
    layout: {
      paperSize: input.paperSize,
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
    items: questionItems.map((item) => ({
      localId: item.localId,
      blockType: "question",
      questionId: item.questionId,
      orderNum: item.orderNum,
      points: item.points,
      groupId: item.groupId,
      includePassage: resolveSerializableIncludePassage(item),
      passageTitle: item.passageTitle,
      passageContent: item.passageContent,
      questionText: item.questionText,
      options: item.options,
      correctAnswer: item.correctAnswer,
      answerSpaceLines: item.answerSpaceLines,
      objectiveAnswerSlots: item.objectiveAnswerSlots,
      objectiveAnswerTexts: item.objectiveAnswerTexts,
      sectionTitle: item.sectionTitle,
      teacherNote: item.teacherNote,
      breakBefore: item.breakBefore,
      keepWithPrev: item.keepWithPrev,
    })),
    blocks: input.paperItems.map(serializePaperBlock),
  });

  if (!result.success) {
    toast.error(result.error || "시험지 저장 실패");
    return { success: false, id: null };
  }

  toast.success("시험지 관리에 초안으로 저장되었습니다.");
  return { success: true, id: result.id || null };
}
