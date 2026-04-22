import { Paragraph, Table } from "docx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExamQuestionData {
  orderNum: number;
  points: number;
  question: {
    type: string;
    subType: string | null;
    questionText: string;
    options: string | null;
    correctAnswer: string;
    difficulty: string;
    passage: { title: string; content: string } | null;
    explanation: {
      content: string;
      keyPoints: string | null;
      wrongOptionExplanations: string | null;
    } | null;
  };
}

export interface ParsedOption {
  label: string;
  text: string;
}

export interface ParsedSection {
  type:
    | "direction"
    | "passage"
    | "marker"
    | "conditions"
    | "paragraphs"
    | "scrambled"
    | "hint"
    | "error"
    | "blanks"
    | "summary"
    | "target"
    | "context"
    | "matchType"
    | "fallback";
  label?: string;
  content: string;
  items?: string[];
}

export type DocChild = Paragraph | Table;
