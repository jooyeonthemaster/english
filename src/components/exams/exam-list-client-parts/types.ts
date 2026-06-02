// ---------------------------------------------------------------------------
// 시험 관리 페이지 공용 타입
// ---------------------------------------------------------------------------

export interface ExamItem {
  id: string;
  title: string;
  type: string;
  status: string;
  examDate: string | Date | null;
  totalPoints: number;
  updatedAt: string | Date;
  saveCount: number;
  editCount: number;
  printCount: number;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  _count: { questions: number; submissions: number };
}

export interface ClassOption {
  id: string;
  name: string;
}
