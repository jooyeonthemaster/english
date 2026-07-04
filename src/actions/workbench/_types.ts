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
  /** When true, only passages that already have a *generated* 학습지
   *  (a PRIME PassageReport, not soft-deleted) are returned. Used by the
   *  학습지 생성 페이지 하단 "학습지 목록" 패널 — 생성이 완료된 학습지만 모은다. */
  hasReport?: boolean;
  /**
   * 과목 스코프 — 국어/영어 완전 분리 규약(_passage-where.ts 참고).
   *  - "KOREAN": 국어 라우트 전용 — subject === 'KOREAN' 지문만.
   *  - 미지정(기본=영어): subject 가 null(기존 지문 전부=영어 간주) 또는
   *    'KOREAN' 이 아닌 지문만 — 영어 화면에 국어 지문이 절대 안 보인다.
   */
  subject?: "KOREAN";
}

export interface WorkbenchQuestionFilters {
  type?: string;
  subType?: string;
  /**
   * 과목 스코프 — 국어/영어 완전 분리 규약(_question-where.ts 참고).
   *  - "KOREAN": 국어 라우트 전용 — subType 이 'KO_' 로 시작하는 문항만.
   *  - 미지정(기본=영어): 'KO_' subType 문항 제외(null subType 은 영어로 간주).
   */
  subject?: "KOREAN";
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
  /**
   * When a `sourceDraftId` is linked, also flip that draft to COMMITTED(검수완료).
   * Defaults to true (explicit save/analyze = a review). Pass false when the
   * passage is materialized as a side effect of generation (동형 시험지 등) so the
   * source material keeps its 검수필요 status — generating is not human review.
   */
  markReviewed?: boolean;
  /**
   * 지문 과목 — "KOREAN"=국어 라우트에서 등록/분석한 지문(Passage.subject="KOREAN"
   * 으로 태깅해 국어 지문함에만 노출). 미지정=영어(subject 미포함, 무회귀).
   */
  subject?: "KOREAN";
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
