// 단어 훈련 — 학습 엔진 상수 (서버·클라 공용, 의존 없음).
//
// 별도 파일인 이유: engine·queue·deck-progress·assignment 가 전부 이 값들을 쓰는데,
// 어느 한 모듈에 두면 그 모듈이 다른 모듈을 부를 때 순환 임포트가 생긴다.
// 값의 근거는 prisma/sql/vocab-drill-init.sql §3-2(어법 engine.ts 수식 인용).
import type { VocabItemType } from "./payload";

/** 지수가중이동평균 계수 — 어법과 동일(engine.ts:31). */
export const EWMA_ALPHA = 0.25;
/** 한 세트 문항 수. */
export const QUEUE_SIZE = 10;
/** 이 점수 미만이 "취약" — 학생 큐·디렉터 집계가 같은 기준을 쓴다. */
export const WEAK_SCORE = 60;
/** 이 점수 이상이 "완성". */
export const MASTERED_SCORE = 80;
/** 덱 시험 합격선. */
export const TEST_PASS_SCORE = 70;
/** 덱 시험 문항 수. */
export const DECK_TEST_SIZE = 12;

/**
 * 라이트너 box → 다음 복습 간격. 리포에 정본 스펙이 없어 여기가 정본이다.
 * (init.sql:579-583 은 dueAt 컬럼과 "box→간격" 원칙만 명시한다.)
 */
export const INTERVAL_BY_BOX_MS: readonly number[] = [
  10 * 60_000, // box0: 10분
  1 * 86_400_000, // box1: 1일
  3 * 86_400_000, // box2: 3일
  7 * 86_400_000, // box3: 7일
  14 * 86_400_000, // box4: 14일
  30 * 86_400_000, // box5: 30일
];

/** box → 출제 난이도 창(어법 engine.ts:439-444 그대로). */
export function difficultyWindow(box: number): [number, number] {
  if (box <= 1) return [1, 2];
  if (box <= 3) return [2, 3];
  return [3, 4];
}

/**
 * 실제로 채점되는 유형 — FLASH 는 자기평가라 여기 없다.
 * 시험 점수·단계 승급은 이 목록으로만 집계한다(적대검수 2026-08-04:
 * FLASH "알았다" 12건을 source=DECK_TEST 로 밀어넣어 100점·MASTERED 자가부여가 됐다).
 */
export const GRADED_ITEM_TYPES: VocabItemType[] = [
  "MEANING_CHOICE",
  "WORD_CHOICE",
  "CONTEXT_FILL",
  "SPELL",
  "EXAMPLE_MATCH",
  "TRAP_JUDGE",
];

/** 덱 단계 순서 — "요구 단계 이상인가"를 이걸로 판정한다. */
export const STAGE_ORDER = [
  "LEARN",
  "DRILL",
  "CONTEXT",
  "TEST",
  "MASTERED",
] as const;
export type DeckStage = (typeof STAGE_ORDER)[number];

/** 서울(UTC+9) 기준 날짜 키 — 학습일·연속일 집계의 기준 시간대. */
export function seoulDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
