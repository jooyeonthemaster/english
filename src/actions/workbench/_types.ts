// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface WorkbenchPassageFilters {
  schoolId?: string;
  grade?: number;
  semester?: string;
  publisher?: string;
  search?: string;
  page?: number;
  limit?: number;
  sourceMaterialId?: string;
  collectionId?: string;
}

export interface WorkbenchQuestionFilters {
  type?: string;
  subType?: string;
  difficulty?: string;
  passageId?: string;
  collectionId?: string;
  tags?: string;
  aiGenerated?: boolean;
  approved?: boolean;
  starred?: boolean;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export type PassageAnnotationType = "vocab" | "grammar" | "syntax" | "sentence" | "examPoint";

export interface PassageAnnotationInput {
  id: string; // client-side annotation id (Tiptap mark attr)
  type: PassageAnnotationType;
  text: string;
  memo: string;
  from: number;
  to: number;
}

export interface CreatePassageData {
  title: string;
  content: string;
  schoolId?: string;
  grade?: number;
  semester?: string;
  unit?: string;
  publisher?: string;
  difficulty?: string;
  tags?: string[];
  source?: string;
  annotations?: PassageAnnotationInput[];
}

export interface SaveQuestionData {
  passageId?: string;
  type: string;
  subType?: string;
  questionText: string;
  options?: { label: string; text: string }[];
  correctAnswer: string;
  points?: number;
  difficulty: string;
  tags?: string[];
  aiGenerated: boolean;
  explanation?: string;
  keyPoints?: string[];
  wrongOptionExplanations?: Record<string, string>;
}
