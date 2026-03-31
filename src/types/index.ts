// ============================================================================
// NARA ERP — Type Definitions
// ============================================================================

// Staff / Auth types
export interface StaffSession {
  id: string;
  email: string;
  name: string;
  role: "DIRECTOR" | "TEACHER";
  academyId: string;
  academyName: string;
  academySlug: string;
}

// Schedule types
export interface ClassScheduleItem {
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string; // "14:00"
  endTime: string; // "16:00"
}

// Question option type
export interface QuestionOption {
  label: string; // "①", "②", etc.
  text: string;
  isCorrect?: boolean;
}

// Exam settings
export interface ExamSettings {
  showTimer?: boolean;
  allowReview?: boolean;
  autoSubmit?: boolean;
  passingScore?: number;
}

// Achievement condition types
export interface AchievementCondition {
  type: "STREAK" | "SCORE" | "COUNT" | "PERFECT" | "LEVEL";
  value: number;
  count?: number;
  subject?: string;
}

// Parent Report Data
export interface ParentReportData {
  period: string;
  attendance: {
    total: number;
    present: number;
    absent: number;
    late: number;
    rate: number;
  };
  grades: {
    examName: string;
    score: number;
    maxScore: number;
    rank?: number;
    totalStudents?: number;
  }[];
  vocabTests: {
    listName: string;
    score: number;
    total: number;
    percent: number;
  }[];
  strengths: string[];
  weaknesses: string[];
  teacherComment?: string;
  recommendations: string[];
}

// Student Analytics for 성적 분석
export interface InbadiData {
  overall: number;
  grammar: number;
  vocab: number;
  reading: number;
  writing: number;
  listening: number;
  level: "S" | "A" | "B" | "C" | "D";
  grammarDetail: Record<string, number>;
  weakPoints: string[];
  recentTrend: "UP" | "DOWN" | "STABLE";
  monthlyScores: { month: string; score: number }[];
}

// Dashboard KPI types
export interface DirectorKPI {
  totalStudents: number;
  activeStudents: number;
  newThisMonth: number;
  withdrawnThisMonth: number;
  monthlyRevenue: number;
  collectionRate: number;
  attendanceRate: number;
  avgScore: number;
}

// Passage Analysis (from AI)
export interface PassageAnalysisData {
  sentences: SentenceAnalysis[];
  vocabulary: VocabAnalysisItem[];
  grammarPoints: GrammarPoint[];
  structure: StructureAnalysis;
}

export interface SentenceAnalysis {
  index: number;
  english: string;
  korean: string;
}

export interface VocabAnalysisItem {
  word: string;
  meaning: string;
  partOfSpeech: string;
  pronunciation?: string;
  sentenceIndex: number;
  difficulty: "basic" | "intermediate" | "advanced";
}

export interface GrammarPoint {
  id: string;
  pattern: string;
  explanation: string;
  textFragment: string;
  sentenceIndex: number;
  examples: string[];
  level: "basic" | "intermediate" | "advanced";
}

export interface StructureAnalysis {
  mainIdea: string;
  purpose: string;
  textType: string;
  paragraphSummaries: string[];
  keyPoints: string[];
}

// Navigation types
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}
