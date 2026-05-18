// Types shared across the admin passage detail subcomponents.

export interface QuestionItem {
  id: string;
  type: string;
  subType: string | null;
  questionText: string;
  options: string | null;
  correctAnswer: string;
  points: number;
  difficulty: string;
  tags: string | null;
  aiGenerated: boolean;
  approved: boolean;
  starred: boolean;
  createdAt: Date;
  explanation: {
    id: string;
    content: string;
    keyPoints: string | null;
    wrongOptionExplanations: string | null;
  } | null;
  _count: { examLinks: number };
}

export interface NoteItem {
  id: string;
  content: string;
  noteType: string;
  highlightStart: number | null;
  highlightEnd: number | null;
  createdAt: Date;
}

export interface PassageData {
  id: string;
  title: string;
  content: string;
  source: string | null;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string } | null;
  analysis: {
    id: string;
    analysisData: string;
    version: number;
    createdAt: Date;
  } | null;
  notes: NoteItem[];
  questions: QuestionItem[];
}
