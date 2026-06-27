import type { BlockNode } from "./types";
import type { BuilderItemResolved } from "./render/question";
import type { BuilderSettings } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
export interface BuildHwpxOptions {
  title: string;
  settings: BuilderSettings | null;
  resolvedItems: BuilderItemResolved[];
  includeAnswers: boolean;
  fullExamQuestions: ExamQuestionData[];
}

export interface ColumnUnit {
  placeKey: string | null;
  blocks: BlockNode[];
}
