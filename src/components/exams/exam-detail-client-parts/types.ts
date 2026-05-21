// ---------------------------------------------------------------------------
// 시험 상세 화면 공용 타입
// ---------------------------------------------------------------------------

export interface ExamQuestion {
  id: string;
  orderNum: number;
  points: number;
  question: {
    id: string;
    type: string;
    subType: string | null;
    questionText: string;
    structuredData?: unknown;
    options: string | null;
    correctAnswer: string;
    points: number;
    difficulty: string;
    tags: string | null;
    aiGenerated: boolean;
    approved: boolean;
    starred: boolean;
    createdAt: string | Date;
    passage: {
      id: string;
      title: string;
      content: string;
      grade: number | null;
      semester: string | null;
      publisher: string | null;
      school: { id: string; name: string } | null;
    } | null;
    explanation: {
      id?: string;
      content: string;
      keyPoints?: string | null;
      wrongOptionExplanations?: string | null;
    } | null;
    collectionItems: { collectionId: string }[];
    _count: { examLinks: number };
  };
}

export interface Submission {
  id: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  startedAt: string | Date;
  submittedAt: string | Date | null;
  gradedAt: string | Date | null;
  student: { id: string; name: string; studentCode: string };
}

export interface ExamDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  examDate: string | Date | null;
  duration: number | null;
  totalPoints: number;
  grade: number | null;
  semester: string | null;
  examType: string | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResults: boolean;
  settings: string | null;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
  questions: ExamQuestion[];
  submissions: Submission[];
}

export interface AnalyticsData {
  totalStudents: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  distribution: number[];
  questionAnalysis: {
    questionId: string;
    orderNum: number;
    questionText: string;
    correctRate: number;
  }[];
}
