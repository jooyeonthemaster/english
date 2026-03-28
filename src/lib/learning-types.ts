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
  // 세션 진행도
  session1Done: boolean;
  session2Done: boolean;
  storiesDone: boolean;
  session3Done: boolean;
  session4Done: boolean;
  session5Done: boolean;
  masteryScore: number;
  // 잠금 상태 (Stories는 필수 세션 2개 완료 후 해제)
  storiesUnlocked: boolean;
  // 다음 해야 할 세션
  nextSession: SessionType | null;
  // 순차 잠금 상태
  isLocked: boolean;        // 이전 레슨 미완료 → true
  isCompleted: boolean;     // 필수 세션(MIX_1+MIX_2+STORIES) 모두 완료
  isCurrent: boolean;       // 첫 번째 isCompleted===false & !isLocked인 레슨
  crownLevel: 0 | 1 | 2 | 3; // 0=잠금, 1=해금(미시작), 2=진행중, 3=마스터
}

export interface SeasonInfo {
  id: string;
  name: string;
  type: "EXAM_PREP" | "REGULAR";
  startDate: string;
  endDate: string;
  dDay: number | null; // D-day (시험까지 남은 일수, 평상시면 null)
  totalLessons: number;
  completedLessons: number; // 필수 전부 완료한 레슨 수
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
  /** 지문 포함 문제인지 (includesPassage) */
  includesPassage: boolean;
  /** 수정된 지문 텍스트 (includesPassage=true일 때) */
  passageSnippet?: string;
  explanation?: {
    content: string;
    keyPoints?: string[];
  };
}

export interface SessionStartData {
  sessionType: SessionType;
  passageId: string;
  passageTitle: string;
  passageContent: string; // Stories/전체 지문 참고용
  questions: SessionQuestion[];
  seasonId?: string;
}

export interface SessionAnswer {
  questionId: string;
  givenAnswer: string;
  isCorrect: boolean;
  timeSpentMs: number;
}

export interface SessionResult {
  sessionType: SessionType;
  score: number; // 0-100
  correctCount: number;
  totalCount: number;
  xpEarned: number;
  xpMultiplier: number; // 데일리 미션 배율 적용 시
  wrongQuestions: {
    questionId: string;
    questionText: string;
    givenAnswer: string;
    correctAnswer: string;
    explanation?: string;
  }[];
  // 레슨 진행도 업데이트
  lessonProgress: {
    session1Done: boolean;
    session2Done: boolean;
    storiesDone: boolean;
    session3Done: boolean;
    session4Done: boolean;
    session5Done: boolean;
    masteryScore: number;
  };
}

// ---------------------------------------------------------------------------
// 3. Stories 모드
// ---------------------------------------------------------------------------

export interface StoriesSentence {
  index: number;
  text: string;
  translation: string;
  /** 하이라이트할 단어 목록 */
  highlightWords?: {
    word: string;
    meaning: string;
    pos: string; // part of speech
  }[];
  /** 문법 포인트 (밑줄 표시용) */
  grammarNote?: {
    target: string; // 밑줄 대상 텍스트
    explanation: string;
  };
}

export interface StoriesCheckQuestion {
  /** 몇 번째 문장 뒤에 나오는지 */
  afterSentenceIndex: number;
  questionText: string;
  options: { label: string; text: string }[];
  correctAnswer: string;
}

export interface StoriesData {
  passageId: string;
  passageTitle: string;
  sentences: StoriesSentence[];
  checkQuestions: StoriesCheckQuestion[];
}

// ---------------------------------------------------------------------------
// 4. 랭킹
// ---------------------------------------------------------------------------

export interface RankingEntry {
  rank: number;
  id: string;
  name: string;
  weeklyXp: number;
  avatarUrl?: string;
  isMe?: boolean; // 개인 랭킹에서 본인 표시
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
// 5. 데일리 미션
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
  activeMultiplier: number | null; // 현재 적용 중인 배율
  multiplierExpiresAt: string | null;
}

// ---------------------------------------------------------------------------
// 6. 학습 분석 (인바디)
// ---------------------------------------------------------------------------

export interface LearningAnalytics {
  // 영역별 점수 (레이더 차트용)
  radarScores: {
    vocab: number; // 0-100
    interpretation: number;
    grammar: number;
    comprehension: number;
  };
  // 지문별 숙달도
  passageMastery: {
    passageId: string;
    passageTitle: string;
    masteryScore: number; // 0-100
  }[];
  // 오답 패턴 (많은 순)
  weakPoints: {
    category: string;
    subCategory: string;
    wrongCount: number;
  }[];
  // 주간 추이
  weeklyTrend: {
    weekLabel: string; // "3/18 ~ 3/24"
    accuracy: number;
    sessionsCompleted: number;
    xpEarned: number;
  }[];
}
