// ---------------------------------------------------------------------------
// Shared types for the exams server-action package.
// ---------------------------------------------------------------------------

export interface ExamFilters {
  type?: string;
  status?: string;
  classId?: string;
  collectionId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** 과목 스코프 — "KOREAN"=국어 시험지만, 미지정=영어(KO 제외, 종전 동작). */
  subject?: "KOREAN";
}

export interface ActionResult {
  success: boolean;
  error?: string;
  id?: string;
  /** Items actually inserted by an add-to-collection action (after dedup). */
  addedIds?: string[];
  /** Items actually removed by a remove-from-collection action. */
  removedIds?: string[];
}

export interface ExamCreateData {
  title: string;
  type: string; // "OFFLINE" | "ONLINE" | "VOCAB" | "MOCK"
  classId?: string | null;
  schoolId?: string | null;
  grade?: number | null;
  semester?: string | null;
  examType?: string | null;
  examDate?: string | null;
  duration?: number | null;
  totalPoints: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResults?: boolean;
  questions?: ExamQuestionInput[];
  /** 과목 — "KOREAN"=국어 라우트 생성. 미지정=null(영어, 무회귀). */
  subject?: "KOREAN";
}

export interface ExamQuestionInput {
  questionId: string;
  points: number;
  orderNum: number;
}

export interface GradeInput {
  questionId: string;
  score: number;
  feedback?: string;
}
