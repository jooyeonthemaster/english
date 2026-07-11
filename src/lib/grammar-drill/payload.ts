// ============================================================================
// 어법 드릴 — 클라이언트 페이로드 계약 (서버·클라 공용 타입, server-only 금지)
//
// 원칙: 문항의 정답·해설·근거는 제출 전 클라이언트에 절대 내려가지 않는다.
// 채점은 서버(/api/grammar-drill/submit)가 하고, 판정과 함께 해설을 반환한다.
// ============================================================================

import type { GrammarDifficulty, GrammarItemType } from "./types";

export type DrillMode =
  | "drill" // 개념 드릴 (CHOICE+OX, 무한)
  | "concept_check" // 개념 학습 마무리 체크 (D1 CHOICE 4)
  | "reading" // 실전 독해 (MULTI_UNDERLINE+PASSAGE)
  | "written" // 서술형 (WRITE_FORM+WRITE_CORRECT)
  | "test" // 유닛 테스트 (10문항 고정 샘플)
  | "review" // 전 유닛 오답·취약 복습
  | "smart" // 오늘의 드릴 (취약 개념 자동 편성)
  | "mixed" // 누적 복합 세트 (set1|set2|final)
  | "assignment"; // 선생님 배정

export interface ClientItemBase {
  id: string;
  unitId: string;
  unitTitle: string;
  conceptId: string;
  conceptTitle: string;
  type: GrammarItemType;
  difficulty: GrammarDifficulty;
  /** 2단계 힌트 — 정답 미포함 계약(출제 매뉴얼 §4) */
  hints: [string, string];
}

export type ClientItem =
  | (ClientItemBase & { type: "CHOICE"; stem: string; options: string[] })
  | (ClientItemBase & { type: "OX"; sentence: string })
  | (ClientItemBase & {
      type: "MULTI_UNDERLINE";
      text: string;
      underlineCount: number;
    })
  | (ClientItemBase & { type: "PASSAGE"; directive: string; text: string })
  | (ClientItemBase & { type: "WRITE_FORM"; stem: string; given: string })
  | (ClientItemBase & { type: "WRITE_CORRECT"; sentence: string });

/** 학생 응답 — 유형별 직렬화 규약 */
export interface SubmitBody {
  itemId: string;
  /**
   * CHOICE: 옵션 인덱스 문자열("0"/"1"/"2")
   * OX: "O" | "X"
   * MULTI_UNDERLINE / PASSAGE: 밑줄 번호("1"~"5")
   * WRITE_FORM / WRITE_CORRECT: 서술 텍스트
   */
  answer: string;
  timeMs: number;
  hintUsed: 0 | 1 | 2;
  conceptPeeked: boolean;
  source: string;
  assignmentId?: string;
}

export interface SubmitVerdict {
  correct: boolean;
  /** 유형별 정답 공개 */
  correctAnswer: {
    index?: number; // CHOICE
    isCorrect?: boolean; // OX (밑줄이 옳았는가)
    number?: number; // MULTI_UNDERLINE / PASSAGE
    accepted?: string[]; // WRITE_*
    correction?: string; // OX(false)·MU·PASSAGE·WRITE_CORRECT 바른 형태
  };
  explanation: string;
  /** MULTI_UNDERLINE / PASSAGE — 밑줄별 근거 */
  rationales?: string[];
  translation?: string;
  gist?: string;
  mastery: { conceptId: string; score: number; streak: number; box: number };
  /** 이번 제출로 단계가 전환됐으면 통지 */
  stageAdvanced?: { unitId: string; stage: string };
}

export interface QueueResponse {
  mode: DrillMode;
  items: ClientItem[];
  /** 모드 설명 헤더(예: "u02 · 진짜 주어 찾기 — 드릴") */
  title: string;
  /** assignment 모드: 남은 문항 수 */
  assignmentRemaining?: number;
}

// ── 홈 대시보드 페이로드 ─────────────────────────────────────────────────────

export interface HomeUnitCard {
  unitId: string;
  title: string;
  subtitle: string;
  part: 1 | 2 | 3;
  frequency: number;
  stage: string; // LOCKED | CONCEPT | DRILL | READING | WRITTEN | TEST | MASTERED
  masteryAvg: number; // 유닛 내 개념 평균 숙달도 0~100
  attempted: number;
}

export interface HomePayload {
  studentName: string;
  academyName: string;
  todaySolved: number;
  todayCorrect: number;
  totalSolved: number;
  streakDays: number;
  /** 이번 주(월요일 시작) 학습 리듬 — 서울 기준, 표시 전용 파생 값 */
  week: { weekday: string; active: boolean; isToday: boolean }[];
  /** 이번 주 학습한 날 수(week 의 active 합) */
  weekActiveDays: number;
  units: HomeUnitCard[];
  weakest: { conceptId: string; title: string; unitId: string; score: number }[];
  assignments: {
    id: string;
    title: string;
    note: string | null;
    status: string;
    total: number;
    done: number;
  }[];
  mixedSets: { setId: string; title: string; unlocked: boolean; solved: number }[];
  chatRemainingToday: number;
}
