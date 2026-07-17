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
  /** 0 기초 골격(PART 0) / 1~3 판별 */
  part: 0 | 1 | 2 | 3;
  /** 수능 출제율 ★ — 기초 유닛은 판별 대상이 아니므로 null */
  frequency: number | null;
  stage: string; // LOCKED | CONCEPT | DRILL | READING | WRITTEN | TEST | MASTERED
  masteryAvg: number; // 유닛 내 개념 평균 숙달도 0~100
  attempted: number;
  /** 이 유닛에서 레슨이 저작된 개념 수(0 이면 레슨 준비 전) */
  lessonsTotal: number;
  /** 완료(completedAt) 처리된 개념 레슨 수 */
  lessonsDone: number;
}

// ── 오늘의 한 수 (홈 최상단 원포인트 CTA) ────────────────────────────────────
// 규범: docs/study-os-spec.md §4.1. 우선순위 ① 마감 임박 과제(클라이언트가
// 통합 과제 카드로 덮어쓴다) → ② 진행 중 유닛의 다음 단계 → ③ 취약 개념 복습
// → ④ 다음 유닛 개념 학습 → ⑤ 복합 세트·오늘의 드릴.
// 서버(home.ts)는 ②~⑤ 의 학습 후보를 계산하고, ① 은 홈 클라이언트가 통합 과제
// 유니온(StudentTaskCard)에서 판정한다 — 과제는 홈 페이로드 밖의 자산이다.

export type HomeNextStepKind =
  | "LESSON"
  | "DRILL"
  | "READING"
  | "WRITTEN"
  | "TEST"
  | "REVIEW"
  | "MIXED"
  | "ASSIGNMENT";

export interface HomeNextStep {
  /** 무엇을 하는가 — "개념 학습 이어서 하기" */
  label: string;
  /** 대상 — "U2 · 진짜 주어 찾기" */
  target: string;
  /** 왜 이것인가 — "3번째 블록까지 봤습니다" */
  reason: string;
  href: string;
  kind: HomeNextStepKind;
  /** 버튼 문구 */
  cta: string;
}

/** 어법 트랙 카드에 표시할 요약(LIVE 트랙만 값이 있다) */
export interface HomeGrammarSummary {
  unitsTotal: number; // 19 (기초 7 + 판별 12)
  unitsUnlocked: number;
  unitsMastered: number;
  lessonsTotal: number; // 레슨이 저작된 개념 수
  lessonsDone: number;
  /** 레슨 완료 기준 진행률 0~100 */
  progressPct: number;
  /** 지금 이어서 할 유닛(없으면 전 유닛 마스터) */
  currentUnitId: string | null;
  currentUnitTitle: string | null;
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
  /** 오늘의 한 수 — 학습 후보(과제 우선순위는 클라이언트가 얹는다) */
  nextStep: HomeNextStep;
  /** 어법 트랙 요약 */
  grammar: HomeGrammarSummary;
}
