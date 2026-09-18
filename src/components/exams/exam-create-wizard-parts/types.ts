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
  // 어법 교정(GRAMMAR_CORRECTION) 문항은 발문을 structuredData 로 복원해야 해서
  // repairGrammarCorrectionQuestionText 가 이 둘을 읽는다. getQuestionBank 는
  // select 없이 Question 전체를 반환하므로 런타임에는 항상 실려 온다.
  subType?: string | null;
  structuredData?: unknown;
  questionText: string;
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
