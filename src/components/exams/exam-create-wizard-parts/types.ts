// ---------------------------------------------------------------------------
// 시험 생성 마법사 공용 타입
// ---------------------------------------------------------------------------

export interface ClassOption {
  id: string;
  name: string;
}

export interface SchoolOption {
  id: string;
  name: string;
}

export interface QuestionBankItem {
  id: string;
  type: string;
  subType?: string | null;
  questionText: string;
  structuredData?: unknown;
  difficulty: string;
  points: number;
  tags: string | null;
}

export interface SelectedQuestion {
  questionId: string;
  questionText: string;
  type: string;
  points: number;
  orderNum: number;
}
