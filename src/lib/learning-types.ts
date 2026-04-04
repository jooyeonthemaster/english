// ============================================================================
// 듀오링고 스타일 학습 서비스 — TypeScript 타입 정의
// ============================================================================

import type { SessionType, LearningCategory } from "./learning-constants";

// ---------------------------------------------------------------------------
// 1. 레슨 목록 (학생 홈 화면용)
// ---------------------------------------------------------------------------

export interface LessonItem {
  passageId: string;
  passageTitle: string;
  order: number;
  // 카테고리별 완료 세션 수 (0~5)
  categoryProgress: {
    VOCAB: number;
    INTERPRETATION: number;
    GRAMMAR: number;
    COMPREHENSION: number;
  };
  // 마스터리
  masteryUnlocked: boolean; // 4카테고리 각 ≥1 완료
  masteryPassed: boolean;
  masteryScore: number;
  masteryAttempts: number;
  // 상태
  isCompleted: boolean; // masteryPassed
  totalSessionsDone: number; // 0~21
}

export interface SeasonInfo {
  id: string;
  name: string;
  type: "EXAM_PREP" | "REGULAR";
  startDate: string;
  endDate: string;
  dDay: number | null;
  totalLessons: number;
  completedLessons: number;
}

// ---------------------------------------------------------------------------
// 2. 세션 진행
// ---------------------------------------------------------------------------

export interface SessionQuestion {
  id: string;
  type: string;
  subType: string;
  learningCategory: LearningCategory;
  questionText: string;
  options: { label: string; text: string }[] | null;
  correctAnswer: string;
  includesPassage: boolean;
  passageSnippet?: string;
  /** 특수 인터랙션용 원본 JSON 데이터 (WORD_MATCH pairs, WORD_ARRANGE correctOrder 등) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawData?: Record<string, any>;
  explanation?: {
    content: string;
    keyPoints?: string[];
  };
}

export interface SessionStartData {
  sessionType: SessionType;
  sessionSeq: number; // 카테고리 내 순번 (1~5, MASTERY는 1)
  passageId: string;
  passageTitle: string;
  passageContent: string;
  questions: SessionQuestion[];
  seasonId?: string;
  isMastery: boolean;
  masteryFailThreshold?: number; // 마스터리일 때만
  hintsEnabled: boolean; // 마스터리=false, 일반=true
}

export interface SessionAnswer {
  questionId: string;
  givenAnswer: string;
  isCorrect: boolean;
  timeSpentMs: number;
}

export interface SessionResult {
  sessionType: SessionType;
  sessionSeq: number;
  score: number; // 0-100
  correctCount: number;
  totalCount: number;
  xpEarned: number;
  xpMultiplier: number;
  wrongQuestions: {
    questionId: string;
    subType: string;
    questionText: string;
    givenAnswer: string;
    correctAnswer: string;
    explanation?: string;
  }[];
  // 카테고리별 진행도 (새 구조)
  categoryProgress: {
    VOCAB: number;
    INTERPRETATION: number;
    GRAMMAR: number;
    COMPREHENSION: number;
  };
  // 마스터리 관련
  masteryFailed?: boolean;
  masteryPassed?: boolean;
  // 퀘스트 진행도
  questUpdates?: QuestProgressUpdate[];
}

// ---------------------------------------------------------------------------
// 3. 랭킹
// ---------------------------------------------------------------------------

export interface RankingEntry {
  rank: number;
  id: string;
  name: string;
  weeklyXp: number;
  avatarUrl?: string;
  isMe?: boolean;
}

export interface SchoolRankingEntry {
  rank: number;
  schoolId: string;
  schoolName: string;
  averageXp: number;
  studentCount: number;
}

export interface AcademyRankingEntry {
  rank: number;
  academyId: string;
  academyName: string;
  averageXp: number;
  studentCount: number;
}

// ---------------------------------------------------------------------------
// 4. 데일리 미션 (레거시)
// ---------------------------------------------------------------------------

export interface DailyMissionStatus {
  date: string;
  easy: {
    label: string;
    completed: boolean;
    rewardMultiplier: number;
  };
  hard: {
    label: string;
    completed: boolean;
    rewardMultiplier: number;
    condition: { sessionsRequired: number; minAccuracy: number };
  };
  activeMultiplier: number | null;
  multiplierExpiresAt: string | null;
}

// ---------------------------------------------------------------------------
// 5. 데일리 퀘스트 (듀오링고 스타일)
// ---------------------------------------------------------------------------

export interface QuestItem {
  id: string;
  missionType: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  label: string;
  target: number;
  progress: number;
  completed: boolean;
  rewardType: "MULTIPLIER" | "BONUS_XP";
  rewardValue: number;
  rewardClaimed: boolean;
  multiplierExpiresAt: string | null;
  completedAt: string | null;
}

export interface DailyQuestStatus {
  date: string;
  quests: QuestItem[];
  activeMultiplier: number | null;
  multiplierExpiresAt: string | null;
}

export interface QuestProgressUpdate {
  questId: string;
  label: string;
  previousProgress: number;
  newProgress: number;
  target: number;
  justCompleted: boolean;
  rewardType: "MULTIPLIER" | "BONUS_XP";
  rewardValue: number;
}

// ---------------------------------------------------------------------------
// 6. 학습 분석
// ---------------------------------------------------------------------------

export interface LearningAnalytics {
  radarScores: {
    vocab: number;
    interpretation: number;
    grammar: number;
    comprehension: number;
  };
  passageMastery: {
    passageId: string;
    passageTitle: string;
    masteryScore: number;
  }[];
  weakPoints: {
    category: string;
    subCategory: string;
    wrongCount: number;
  }[];
  weeklyTrend: {
    weekLabel: string;
    accuracy: number;
    sessionsCompleted: number;
    xpEarned: number;
  }[];
}
