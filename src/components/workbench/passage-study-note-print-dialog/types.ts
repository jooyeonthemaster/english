import type React from "react";

export interface StudyNotePassage {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  _count: { questions: number; notes: number };
}

export type PageCategory = "summary" | "body" | "vocab" | "grammar" | "syntax" | "exam";

export interface StudyNoteBlock {
  id: string;
  passageId: string;
  passageTitle: string;
  category: PageCategory;
  label: string;
  pointCount: number;
  forceNewPage?: boolean;
  keepWithNext?: boolean;
  node: React.ReactNode;
}

export interface PaginatedStudyPage {
  id: string;
  passageId: string;
  passageTitle: string;
  blocks: StudyNoteBlock[];
  categories: Partial<Record<PageCategory, number>>;
}

export interface ExamEntry {
  id: string;
  kind: "paraphrase" | "transform";
  sentenceIndex: number;
  title: string;
  original: string;
  detail?: string;
  alternatives?: string[];
  questionExample?: string;
  difficulty?: string;
}

export const CATEGORY_META: Record<PageCategory, { label: string; dot: string; fg: string; bg: string; border: string }> = {
  summary: { label: "요약", dot: "bg-slate-600", fg: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
  body: { label: "본문/번역", dot: "bg-emerald-500", fg: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  vocab: { label: "어휘", dot: "bg-blue-500", fg: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  grammar: { label: "어법", dot: "bg-violet-500", fg: "text-violet-700", bg: "bg-violet-50", border: "border-violet-200" },
  syntax: { label: "구문", dot: "bg-cyan-500", fg: "text-cyan-700", bg: "bg-cyan-50", border: "border-cyan-200" },
  exam: { label: "출제", dot: "bg-yellow-500", fg: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
};
