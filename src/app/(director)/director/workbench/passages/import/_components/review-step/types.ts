// ============================================================================
// ReviewStep — shared types. Extracted from review-step.tsx during mechanical
// split (behavior preserved).
// ============================================================================

import type { ExtractionItemSnapshot } from "@/lib/extraction/types";

export interface LoadedPage {
  pageIndex: number;
  imageUrl: string | null;
  extractedText: string | null;
  status: string;
}

export type EditorTab = "passage" | "question" | "explanation" | "meta";

export interface SourceMaterialDraft {
  title: string;
  subtitle: string;
  subject: "ENGLISH" | "KOREAN" | "MATH" | "OTHER" | "";
  type: "EXAM" | "TEXTBOOK" | "WORKBOOK" | "HANDOUT" | "MOCK" | "SUNEUNG" | "OTHER" | "";
  grade: string;
  semester: "FIRST" | "SECOND" | "";
  year: string;
  round: string;
  examType:
    | "MIDTERM"
    | "FINAL"
    | "MOCK"
    | "SUNEUNG"
    | "DIAGNOSTIC"
    | "EBS"
    | "PRIVATE"
    | "";
  publisher: string;
  school: string;
}

export type ConfidenceTier = "unknown" | "safe" | "suspect" | "danger" | "critical";

export interface Stats {
  passages: number;
  questions: number;
  choices: number;
  explanations: number;
  meta: number;
  suspects: number;
}

export interface TreeNode {
  id: string;
  item: ExtractionItemSnapshot;
  children: TreeNode[];
}

export interface PageGroup {
  pageIndex: number;
  blocks: TreeNode[];
}

export interface Tree {
  pages: PageGroup[];
}
