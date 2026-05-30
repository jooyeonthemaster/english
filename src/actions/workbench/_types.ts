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
  /** When true, only passages that already have a PassageAnalysis row are
   *  returned. */
  analyzedOnly?: boolean;
  /** Only meaningful together with `analyzedOnly`. When true, passages created
   *  via the direct-paste flow (`source === DIRECT_INPUT_PASSAGE_SOURCE`) are
   *  included even though they have no analysis yet, so freshly pasted material
   *  shows up in the 자료 관리 list immediately. */
  includeDirectInput?: boolean;
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
  sourceDraftId?: string;
}

export interface SaveQuestionData {
  passageId?: string;
  type: string;
  subType?: string;
  questionText: string;
  structuredData?: unknown;
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
