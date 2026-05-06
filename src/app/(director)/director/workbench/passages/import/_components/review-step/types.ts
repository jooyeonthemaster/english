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
  type:
    | "EXAM"
    | "TEXTBOOK"
    | "WORKBOOK"
    | "HANDOUT"
    | "MOCK"
    | "SUNEUNG"
    | "OTHER"
    | "";
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

export type ConfidenceTier =
  | "unknown"
  | "safe"
  | "suspect"
  | "danger"
  | "critical";

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

export interface M2PassageSentenceSnapshot {
  id: string;
  order: number;
  problemText: string | null;
  restoredText: string;
  status: string;
}

export interface M2QuestionDraftSnapshot {
  id: string;
  questionOrder: number;
  questionNumber: number | null;
  stem: string;
  choices: unknown;
  answer: string | null;
  explanation: string | null;
  questionType: string | null;
  confidence: number | null;
  reviewStatus: string;
}

export interface M2RestorationChangeSnapshot {
  id: string;
  sentenceOrder: number | null;
  before: string;
  after: string;
  reason: string | null;
  evidenceQuestionNumber: number | null;
  evidenceType: string | null;
  confidence: number | null;
}

export interface M2RestorationSnapshot {
  id: string;
  method: string;
  status: string;
  confidence: number | null;
  modelUsed: string | null;
  unresolvedMarkers: unknown;
  warnings: unknown;
  changes: M2RestorationChangeSnapshot[];
}

export interface M2SourceMatchSnapshot {
  id: string;
  sourceType: string;
  sourceId: string | null;
  sourceRef: string | null;
  title: string | null;
  publisher: string | null;
  unit: string | null;
  year: number | null;
  confidence: number | null;
  method: string;
  reason: string | null;
  selected: boolean;
  metadata: unknown;
}

export interface M2PassageDraftSnapshot {
  id: string;
  passageOrder: number;
  sourcePageIndex: number[];
  problemText: string;
  restoredText: string | null;
  teacherText: string | null;
  restorationStatus: string;
  verificationStatus: string;
  reviewStatus: string;
  confidence: number | null;
  warnings: unknown;
  metadata: unknown;
  confirmedAt: string | null;
  sentences: M2PassageSentenceSnapshot[];
  questions: M2QuestionDraftSnapshot[];
  restoration: M2RestorationSnapshot | null;
  sourceMatches: M2SourceMatchSnapshot[];
}
