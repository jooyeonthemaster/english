// ---------------------------------------------------------------------------
// Shared types for season-manager UI (Season, PassageDetail, StudentProgress).
// ---------------------------------------------------------------------------

export interface Season {
  id: string;
  name: string;
  type: string;
  grade: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  passageCount: number;
  passages: { id: string; title: string; order: number }[];
  totalSessions: number;
  createdAt: string;
}

export interface PassageDetail {
  passageId: string;
  passageTitle: string;
  vocabDone: number;
  interpDone: number;
  grammarDone: number;
  compDone: number;
  masteryPassed: boolean;
  masteryScore: number;
  totalDone: number;
}

export interface StudentProgress {
  studentId: string;
  name: string;
  grade: number;
  completedLessons: number;
  totalLessons: number;
  totalSessionsDone: number;
  totalMaxSessions: number;
  progressPercent: number;
  passageDetails: PassageDetail[];
}
