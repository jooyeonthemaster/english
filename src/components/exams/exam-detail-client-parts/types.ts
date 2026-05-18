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
    questionText: string;
    options: string | null;
    correctAnswer: string;
    difficulty: string;
    explanation: { content: string } | null;
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
