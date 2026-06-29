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
  items?: string[]; // for conditions, paragraphs, scrambled words, blanks
}

export interface QuestionBankItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date | string;
  passage: {
    id: string;
    title: string;
    content: string;
    grade?: number | null;
    semester?: string | null;
    publisher?: string | null;
    school?: { id: string; name: string } | null;
  } | null;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count: { examLinks: number };
  examLinks?: { exam: { id: string; title: string; createdAt?: Date | string } }[];
  structuredData?: unknown;
  /** 장문 세트(QuestionSet) 소속 여부 — 일반 카드로 노출되더라도 "장문" 표식으로 구분한다. */
  inSet?: boolean;
  setId?: string | null;
}
